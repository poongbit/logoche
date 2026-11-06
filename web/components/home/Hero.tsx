"use client";

// 메인 첫 칸(11/4 사용자 결정): 로고와 가게 이름만 받고 주 버튼을 누르면 질문 페이지(/make/...)로 간다.
// 11/6 R1·B3(피그마 427:9 · 428:123): 민트 면 위 흰 접수증. 위 칸 = 로고 올리는 칸 · 가게 이름 · 주 버튼 B3 · 도움말, 먹 절취선 아래 = 다음에 일어날 일.
// 모바일은 '로고만 주세요!' 말풍선을 접수증 오른쪽 위 모서리에 붙인다(데스크톱은 왼쪽 제목 아래, app/page.tsx).
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
import { PrimaryButton, Receipt, SpeechBubble } from "@/components/ds";
import { Missing, Notice } from "@/components/ui";
import { ACCEPTED_LOGO_TYPES } from "@/lib/constants";
import { firstOpenStep, type MakeStep } from "@/lib/makeSteps";
import {
  EMPTY_DRAFT,
  loadDraft,
  logoFromFile,
  saveDraft,
  type NewDraft,
} from "@/lib/newDraft";
import type { UploadInput } from "@/lib/types";

const noSubscribe = () => () => {};

// 주 버튼 이름: 다음에 열릴 질문(처음에는 업종)
const NEXT_LABEL: Record<MakeStep, string> = {
  industry: "다음: 업종 고르기",
  business: "다음: 가게 이야기",
  style: "다음: 글씨 취향 고르기",
  rights: "다음: 로고 권리 확인",
};

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
  const buttonRef = useRef<HTMLButtonElement>(null);
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
      if (!upload.logoImage) buttonRef.current?.focus();
      else document.getElementById("hero-store")?.focus();
      return;
    }
    saveDraft(draft);
    router.push(`/make/${firstOpenStep(upload) ?? "rights"}`);
  }

  const [helpOpen, setHelpOpen] = useState(false);
  const next = firstOpenStep(upload) ?? "rights";

  return (
    <div id="make" className="relative w-full scroll-mt-24">
      {/* 모바일 말풍선: 접수증 오른쪽 위 모서리(피그마 428:132, 148px · 6°) */}
      <div aria-hidden className="pointer-events-none absolute -top-7 -right-3.5 z-10 lg:hidden">
        <SpeechBubble width={148} rotate={6} />
      </div>
      <Receipt
        as="div"
        label={null}
        perforation="ink"
        topClassName="px-4 pt-6 pb-6 lg:px-8 lg:pt-7 lg:pb-[2.125rem]"
        bottomClassName="px-4 pt-5 pb-7 lg:px-8 lg:pt-[1.625rem] lg:pb-[2.125rem]"
        top={
          <form
            aria-label="접수증"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col"
          >
            <p className="mb-2 hidden text-sm font-bold text-text-secondary lg:block">접수증</p>
            <button
              ref={buttonRef}
              type="button"
              aria-label={upload.logoImage ? `로고 바꾸기: ${upload.logoFileName}` : "로고 올리기"}
              aria-describedby="hero-logo-hint"
              onClick={() => inputRef.current?.click()}
              className={`group grid h-[11.875rem] w-full place-items-center rounded-[0.875rem] border-2 border-dashed px-6 text-center transition-colors lg:h-[15.625rem] lg:rounded-[1.125rem] ${
                dragging
                  ? "border-border-active bg-bg-surface-strong"
                  : tried && !upload.logoImage
                    ? "border-border-error bg-bg-canvas"
                    : "border-border-active bg-bg-canvas hover:bg-bg-surface"
              }`}
            >
              {upload.logoImage ? (
                <span className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 py-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL */}
                  <img src={upload.logoImage} alt="올린 로고" className="min-h-0 flex-1 object-contain" />
                  <span id="hero-logo-hint" className="max-w-full truncate text-13 font-semibold text-text-secondary lg:text-sm">
                    {upload.logoFileName} · 눌러서 바꾸기
                  </span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-3 lg:gap-4">
                  {/* 보이는 '로고 올리기' 알약은 이 칸 전체 버튼의 일부(따로 누르는 버튼이 아님) */}
                  <span
                    aria-hidden
                    className="inline-flex h-[2.875rem] w-[9.25rem] items-center justify-center rounded-full bg-bg-inverse text-15 font-bold text-text-inverse transition-colors group-hover:bg-bg-inverse-strong lg:h-[3.25rem] lg:w-44 lg:text-17"
                  >
                    로고 올리기
                  </span>
                  <span id="hero-logo-hint" className="text-13 text-text-secondary lg:text-sm">
                    또는 끌어다 놓기 · PNG·JPG·SVG
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
            <label htmlFor="hero-store" className="mt-[1.125rem] text-sm font-bold lg:mt-6">
              가게 이름
            </label>
            <input
              id="hero-store"
              value={upload.storeName}
              maxLength={20}
              onChange={(e) => setUpload({ storeName: e.target.value })}
              placeholder="가게 이름을 적어 주세요"
              autoComplete="off"
              className={`mt-2 h-[3.25rem] w-full rounded-full border-2 bg-bg-canvas px-5 text-base font-bold outline-none placeholder:font-normal placeholder:text-text-secondary lg:h-14 ${
                tried && !upload.storeName.trim() ? "border-border-error placeholder:text-text-error" : "border-border-active"
              }`}
            />
            <PrimaryButton type="submit" block labelAlign="center" className="mt-2.5 lg:mt-[1.125rem]">
              {NEXT_LABEL[next]}
            </PrimaryButton>
            <div role="status" className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1.5 empty:hidden">
              {tried && missing.map((m) => <Missing key={m}>{m}</Missing>)}
            </div>
            {fileError && (
              <div className="mt-3">
                <Notice tone="error">{fileError}</Notice>
              </div>
            )}
            <p className="mt-3 text-center text-xs text-text-secondary lg:text-13">
              <button
                type="button"
                aria-expanded={helpOpen}
                aria-controls="hero-help"
                onClick={() => setHelpOpen((v) => !v)}
                className="underline-offset-4 hover:text-text-primary hover:underline aria-expanded:underline"
              >
                어떤 이미지면 되나요?
              </button>
              <span aria-hidden className="mx-2">
                ·
              </span>
              영문 대소문자도 함께 그려요
            </p>
            {helpOpen && (
              <p id="hero-help" className="ds-motion animate-ds-enter mt-2 text-center text-13 leading-relaxed text-text-secondary">
                PNG·JPG·SVG·WEBP 파일, 10MB까지 받아요. 로고 글자를 그대로 옮기지 않고 모양과 느낌을 참고해 그려요.
              </p>
            )}
          </form>
        }
        bottom={
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold lg:text-15">가게 이름 견본 세 가지를 먼저 보여 드려요</p>
            <p className="text-13 text-text-secondary lg:text-sm">하나 고르면 약 15분 · 창을 닫아도 계속</p>
          </div>
        }
      />
    </div>
  );
}
