"use client";

// 메인 첫 칸(11/4 사용자 결정): 로고와 가게 이름만 받고 '폰트 만들기'를 누르면 질문 페이지(/make/...)로 간다.
// 업종·사업 내용·글씨 속성·로고 권리는 거기서 한 가지씩 묻는다(components/make/MakeWizard.tsx). 메인에서 한꺼번에 눌러야 할 것이 많다는 지적이 있었다.
// 로고는 화면 어디에 놓아도 받는다. 입력은 탭 단위로 저장해(lib/newDraft.ts) 새로 고침해도 남는다.

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { Missing, Notice } from "@/components/ui";
import { ACCEPTED_LOGO_TYPES } from "@/lib/constants";
import { firstOpenStep } from "@/lib/makeSteps";
import {
  EMPTY_DRAFT,
  loadDraft,
  logoFromFile,
  saveDraft,
  type NewDraft,
} from "@/lib/newDraft";
import type { UploadInput } from "@/lib/types";

const noSubscribe = () => () => {};

export function Hero() {
  // 저장해 둔 입력은 브라우저에서만 읽을 수 있다. 서버는 빈 입력으로 그리고, 브라우저에서 저장한 입력으로 한 번 다시 그린다.
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return (
    <HeroForm
      key={inBrowser ? "browser" : "server"}
      initial={inBrowser ? loadDraft() : EMPTY_DRAFT}
      inBrowser={inBrowser}
    />
  );
}

function HeroForm({
  initial,
  inBrowser,
}: {
  initial: NewDraft;
  inBrowser: boolean;
}) {
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
  const setUpload = (patch: Partial<UploadInput>) =>
    setDraft((d) => ({ ...d, upload: { ...d.upload, ...patch } }));
  const missing = [
    !upload.logoImage && "로고",
    !upload.storeName.trim() && "가게 이름",
  ].filter((x): x is string => !!x);

  async function acceptFile(file: File) {
    const result = await logoFromFile(file);
    if ("error" in result) return setFileError(result.error);
    setFileError(null);
    setUpload(result.patch);
  }

  // 화면 어디에 놓아도 로고로 받는다. 끌고 오는 동안 올리는 칸을 강조한다.
  const onDropFile = useEffectEvent((file: File) => void acceptFile(file));
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer?.types.includes("Files");
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
    <div id="make" className="flex w-full scroll-mt-6 flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <button
          type="button"
          aria-label={upload.logoImage ? "다른 로고 파일로 바꾸기" : undefined}
          onClick={() => inputRef.current?.click()}
          className={`grid h-32 w-full place-items-center rounded-[1.25rem] border-dashed px-6 text-center transition-colors lg:h-28 ${
            dragging
              ? "border-[1.5px] border-border-active bg-bg-surface-strong"
              : tried && !upload.logoImage
                ? "border-2 border-border-error bg-bg-canvas"
                : "border-[1.5px] border-border-strong bg-bg-canvas hover:border-border-active"
          }`}
        >
          {upload.logoImage ? (
            <span className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL */}
              <img
                src={upload.logoImage}
                alt="올린 로고"
                className="min-h-0 flex-1 object-contain"
              />
              <span className="max-w-full truncate text-13 font-semibold text-text-secondary">
                {upload.logoFileName} · 눌러서 바꾸기
              </span>
            </span>
          ) : (
            <span className="flex flex-col gap-1">
              <span className="text-15 font-extrabold">
                로고 이미지를 여기에 놓으세요
              </span>
              <span className="text-13 text-text-secondary">
                또는{" "}
                <u className="font-semibold text-text-primary underline-offset-4">
                  파일 고르기
                </u>{" "}
                · PNG·JPG·SVG
              </span>
            </span>
          )}
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hero-store" className="text-13 font-bold">
            가게 이름
          </label>
          <input
            id="hero-store"
            value={upload.storeName}
            maxLength={20}
            onChange={(e) => setUpload({ storeName: e.target.value })}
            placeholder="예: 달콤한집"
            autoComplete="off"
            className={`h-12 w-full rounded-full border-[1.5px] bg-bg-canvas px-5 text-17 font-bold outline-none placeholder:font-medium placeholder:text-text-secondary focus:border-border-active ${
              tried && !upload.storeName.trim()
                ? "border-border-error placeholder:text-text-error"
                : "border-border-strong"
            }`}
          />
        </div>
        <button
          type="submit"
          className="h-14 w-full rounded-full bg-bg-inverse text-17 font-extrabold text-text-inverse transition-colors hover:bg-bg-inverse-hover"
        >
          폰트 만들기
        </button>
      </form>
      <div
        role="status"
        className="flex flex-wrap gap-x-3 gap-y-1.5 empty:hidden"
      >
        {tried && missing.map((m) => <Missing key={m}>{m}</Missing>)}
      </div>
      {fileError && <Notice tone="error">{fileError}</Notice>}
    </div>
  );
}
