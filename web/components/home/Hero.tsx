"use client";

// 메인 첫 칸(11/4 사용자 결정): 로고와 가게 이름만 받고 '폰트 만들기'를 누르면 질문 페이지(/make/...)로 간다.
// 업종·사업 내용·글씨 속성·로고 권리는 거기서 한 가지씩 묻는다(components/make/MakeWizard.tsx). 메인에서 한꺼번에 눌러야 할 것이 많다는 지적이 있었다.
// 로고는 화면 어디에 놓아도 받는다. 입력은 탭 단위로 저장해(lib/newDraft.ts) 새로 고침해도 남는다.

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Missing, Notice } from "@/components/ui";
import { ACCEPTED_LOGO_TYPES } from "@/lib/constants";
import { firstOpenStep } from "@/lib/makeSteps";
import { EMPTY_DRAFT, loadDraft, logoFromFile, saveDraft, type NewDraft } from "@/lib/newDraft";
import type { UploadInput } from "@/lib/types";

const noSubscribe = () => () => {};

export function Hero() {
  // 저장해 둔 입력은 브라우저에서만 읽을 수 있다. 서버는 빈 입력으로 그리고, 브라우저에서 저장한 입력으로 한 번 다시 그린다.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  return <HeroForm key={inBrowser ? "browser" : "server"} initial={inBrowser ? loadDraft() : EMPTY_DRAFT} inBrowser={inBrowser} />;
}

function HeroForm({ initial, inBrowser }: { initial: NewDraft; inBrowser: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<NewDraft>(initial);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  // 서버에서 그린 빈 입력으로 저장해 둔 입력을 덮어쓰지 않게, 브라우저에서 다시 그린 뒤부터 저장한다
  useEffect(() => {
    if (inBrowser) saveDraft(draft);
  }, [inBrowser, draft]);

  const upload = draft.upload;
  const setUpload = (patch: Partial<UploadInput>) => setDraft((d) => ({ ...d, upload: { ...d.upload, ...patch } }));
  const missing = [!upload.logoImage && "로고", !upload.storeName.trim() && "가게 이름"].filter((x): x is string => !!x);

  async function acceptFile(file: File) {
    const result = await logoFromFile(file);
    if ("error" in result) return setFileError(result.error);
    setFileError(null);
    setUpload(result.patch);
  }

  // 화면 어디에 놓아도 로고로 받는다. 끌고 오는 동안 올리는 칸을 강조한다.
  const onDropFile = useEffectEvent((file: File) => void acceptFile(file));
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false); // 창 밖으로 나감
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) onDropFile(file);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  // 빠진 것이 있으면 버튼을 막지 않고, 눌렀을 때 빠진 것을 보인다(첫 화면의 주 버튼이 회색으로 꺼져 있지 않게)
  function submit() {
    if (missing.length) {
      setTried(true);
      if (!upload.logoImage) inputRef.current?.focus();
      else document.getElementById("hero-store")?.focus();
      return;
    }
    saveDraft(draft);
    router.push(`/make/${firstOpenStep(upload) ?? "rights"}`);
  }

  return (
    <div id="make" className="mx-auto flex w-full max-w-[44rem] scroll-mt-6 flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`flex flex-col gap-3 rounded-[1.75rem] border-2 bg-bg p-3 transition-colors sm:flex-row sm:items-center sm:rounded-full sm:py-2 sm:pr-2 sm:pl-2.5 ${
          dragging ? "border-ink bg-subtle" : "border-ink"
        }`}
      >
        <button
          type="button"
          aria-label={upload.logoImage ? "다른 로고 파일로 바꾸기" : "로고 파일 올리기"}
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-[3.25rem] items-center gap-3 rounded-full pr-4 text-left transition-colors hover:bg-subtle sm:shrink-0 ${tried && !upload.logoImage ? "ring-2 ring-bad" : ""}`}
        >
          <span className="grid h-[3.25rem] w-[3.25rem] shrink-0 place-items-center overflow-hidden rounded-full border-[1.5px] border-dashed border-edge bg-stage">
            {upload.logoImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL
              <img src={upload.logoImage} alt="올린 로고" className="h-full w-full object-contain p-1" />
            ) : (
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 text-muted">
                <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                <path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-15 font-extrabold">{upload.logoImage ? "로고 바꾸기" : "로고 올리기"}</span>
            <span className="max-w-[10rem] truncate text-13 font-medium text-muted">{upload.logoImage ? upload.logoFileName : "끌어다 놓아도 돼요"}</span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_LOGO_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void acceptFile(file);
            e.target.value = "";
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col px-3 sm:border-l sm:border-line sm:pl-5">
          <label htmlFor="hero-store" className="text-12 font-bold text-muted">
            가게 이름
          </label>
          <input
            id="hero-store"
            value={upload.storeName}
            maxLength={20}
            onChange={(e) => setUpload({ storeName: e.target.value })}
            placeholder="예: 달콤한집"
            autoComplete="off"
            className={`h-8 w-full bg-transparent text-17 font-bold outline-none focus-visible:shadow-none placeholder:font-medium placeholder:text-muted ${tried && !upload.storeName.trim() ? "placeholder:text-bad" : ""}`}
          />
        </div>
        <button type="submit" className="h-14 shrink-0 rounded-full bg-ink px-8 text-17 font-extrabold text-bg transition-colors hover:bg-hover">
          폰트 만들기
        </button>
      </form>
      <div role="status" className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 empty:hidden">
        {tried && missing.map((m) => <Missing key={m}>{m}</Missing>)}
      </div>
      {fileError && <Notice tone="error">{fileError}</Notice>}
      <p className="text-center text-13 leading-normal text-muted">로고에서 글자가 있는 부분만 잘라 올리면 좋아요. 이어서 업종과 사업 내용, 원하는 글씨 모양을 차례로 물어봐요.</p>
    </div>
  );
}
