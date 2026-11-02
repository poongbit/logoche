"use client";

// 메인 첫 칸(11/2, YoFont 메인 '이미지에서' 탭 배치를 따름): 왼쪽 로고 올리는 칸 + 팁, 오른쪽 가게 이름 · 원하는 느낌(그릴 글자 수 · 그리기 수준) ·
// 업종/브랜드 톤/주로 쓸 곳 + 넓은 주 버튼. 우리 입구는 로고 하나라 YoFont의 탭 줄은 두지 않는다.
// 로고는 화면 어디에 놓아도 받는다. 주 버튼은 채운 값으로 /new의 입력을 새로 쓰고 넘어간다(권리 확인과 만들기는 /new에서).
// 샘플 로고 고르기는 두지 않는다(11/2 사용자 결정). /new에는 남아 있다.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, Notice, TextField, onRadioKeys, rovingTab } from "@/components/ui";
import { ACCEPTED_LOGO_TYPES, BRAND_TONES, EXTRA_CHARS, INDUSTRIES, USAGE_CONTEXTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { QUALITIES, logoFromFile, saveDraft } from "@/lib/newDraft";
import { isImitationRequest } from "@/lib/rules";
import { EMPTY_UPLOAD } from "@/lib/store";
import type { BrandTone, DrawQuality, UploadInput, UsageContext } from "@/lib/types";

type Option = "industry" | "tones" | "usage";
const OPTIONS: { key: Option; label: string }[] = [
  { key: "industry", label: "업종" },
  { key: "tones", label: "브랜드 톤" },
  { key: "usage", label: "주로 쓸 곳" },
];
const TIPS = ["로고에서 글자가 있는 부분만 잘라 올려 주세요", "배경은 단순할수록 좋아요", "사진이라면 정면에서 찍은 것이 좋아요"];
const STEPS = ["로고와 가게 이름", "권리 확인", "폰트 만들기"];
const labelOf = <T extends string>(list: { value: T; label: string }[], value: T) => list.find((x) => x.value === value)?.label ?? "";

export function Hero() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, setUploadState] = useState<UploadInput>(EMPTY_UPLOAD);
  const [quality, setQuality] = useState<DrawQuality>("fine");
  const [open, setOpen] = useState<Option | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const setUpload = (patch: Partial<UploadInput>) => setUploadState((u) => ({ ...u, ...patch }));
  const feelRejected = isImitationRequest(upload.desiredFeel);
  const recommendedTones = INDUSTRIES.find((i) => i.value === upload.industry)?.tones ?? [];
  const summaries: Record<Option, string> = {
    industry: upload.industry ? labelOf(INDUSTRIES, upload.industry) : "",
    tones: upload.brandTones.map((t) => labelOf(BRAND_TONES, t)).join(" · "),
    usage: upload.usageContexts.map((x) => labelOf(USAGE_CONTEXTS, x)).join(" · "),
  };

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

  function toggleTone(tone: BrandTone) {
    setUpload({
      brandTones: upload.brandTones.includes(tone) ? upload.brandTones.filter((t) => t !== tone) : [...upload.brandTones, tone],
    });
  }

  function toggleUsage(usage: UsageContext) {
    setUpload({
      usageContexts: upload.usageContexts.includes(usage) ? upload.usageContexts.filter((x) => x !== usage) : [...upload.usageContexts, usage],
    });
  }

  function start() {
    if (feelRejected) return;
    // 아무것도 채우지 않았으면 /new에 남아 있던 입력을 지우지 않는다
    const touched =
      !!upload.logoImage ||
      !!upload.storeName.trim() ||
      !!upload.desiredFeel.trim() ||
      !!upload.industry ||
      upload.brandTones.length > 0 ||
      upload.usageContexts.length > 0;
    if (touched || quality !== "fine") saveDraft({ upload, quality });
    router.push("/new");
  }

  return (
    <div className="rounded-[1.75rem] border border-line bg-bg shadow-[0_1px_2px_rgb(17_17_17/0.04),0_18px_40px_-20px_rgb(17_17_17/0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-6 pt-5 font-mono text-13 lg:px-8 lg:pt-6">
        <span className="font-semibold text-accent">로고에서 한글 폰트로</span>
        <ol aria-label="만드는 순서" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden>→</span>}
              <span>
                {i + 1} · {step}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-7 p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8 lg:p-8">
        <div className="flex min-w-0 flex-col gap-5">
          <div
            role="button"
            tabIndex={0}
            aria-label={upload.logoImage ? "다른 로고 파일로 바꾸기" : "로고 파일 올리기"}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault(); // 스페이스로 화면이 내려가지 않게
              inputRef.current?.click();
            }}
            className={`flex min-h-[15rem] cursor-pointer flex-col items-center lg:min-h-[22rem] justify-center gap-3 rounded-[1.25rem] border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragging ? "border-ink bg-subtle" : "border-track hover:border-ink"
            }`}
          >
            {upload.logoImage ? (
              <>
                <span className="grid h-32 w-full max-w-[18rem] place-items-center rounded-[0.875rem] bg-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL */}
                  <img src={upload.logoImage} alt="올린 로고" className="max-h-24 max-w-[85%] object-contain" />
                </span>
                <span className="max-w-full truncate text-15 font-bold">{upload.logoFileName}</span>
                <span className="text-13 font-medium text-muted">눌러서 다른 파일로 바꾸기</span>
              </>
            ) : (
              <>
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-[0.875rem] bg-ink text-bg">
                  <ImageIcon />
                </span>
                <span className="text-18 font-extrabold">로고 이미지를 놓으세요</span>
                <span className="text-13 leading-normal font-medium text-muted">끌어다 놓거나 눌러서 고르기 · PNG·SVG·JPG·WEBP, 10MB 이하</span>
              </>
            )}
          </div>
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
          {fileError && <Notice tone="error">{fileError}</Notice>}
          <ul className="flex flex-col gap-2.5 text-15 leading-normal text-muted">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-3">
                <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <label htmlFor="hero-store" className="text-17 font-extrabold">
              가게 이름
            </label>
            <TextField id="hero-store" value={upload.storeName} onChange={(e) => setUpload({ storeName: e.target.value })} placeholder="예: 달콤한집" />
          </div>

          <div className="flex flex-col gap-2.5">
            <label htmlFor="hero-feel" className="flex items-baseline gap-2 text-17 font-extrabold">
              원하는 느낌
              <span className="text-13 font-medium text-muted">비워도 돼요</span>
            </label>
            <div
              className={`flex flex-col rounded-[1.25rem] border-2 bg-bg transition-shadow focus-within:shadow-[0_0_0_4px_rgb(17_17_17/0.1)] ${
                feelRejected ? "border-bad" : "border-ink"
              }`}
            >
              <textarea
                id="hero-feel"
                rows={3}
                value={upload.desiredFeel}
                onChange={(e) => setUpload({ desiredFeel: e.target.value })}
                placeholder="예: 따뜻하고 손맛 있는 분식집 간판 글씨"
                className="w-full resize-none rounded-t-[1.125rem] bg-transparent px-5 pt-4 text-18 leading-normal font-semibold outline-none placeholder:font-medium placeholder:text-muted focus-visible:shadow-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-2 pb-3.5">
                <span className="pl-1 font-mono text-13 text-muted">
                  한글 {KSX1001_HANGUL.size.toLocaleString()}자 + 숫자·부호 {EXTRA_CHARS.length}자
                </span>
                <div role="radiogroup" aria-label="그리기 수준" onKeyDown={onRadioKeys} className="flex gap-1 rounded-full bg-subtle p-1">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.value}
                      type="button"
                      role="radio"
                      aria-checked={quality === q.value}
                      tabIndex={rovingTab(quality === q.value, false, true)}
                      onClick={() => setQuality(q.value)}
                      className={`h-9 rounded-full px-4 text-15 font-bold transition-colors ${quality === q.value ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {feelRejected ? (
              <Notice tone="error">
                특정 폰트(○○체, ○○폰트 등)를 따라 하는 요청은 받지 않아요. &quot;둥글고 통통한&quot;처럼 원하는 모양을 말로 적어 주세요.
              </Notice>
            ) : (
              <p className="text-13 text-muted">{QUALITIES.find((q) => q.value === quality)?.note}</p>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="grid gap-2 sm:grid-cols-3">
              {OPTIONS.map((o) => {
                const on = open === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    aria-expanded={on}
                    aria-controls="hero-options"
                    onClick={() => setOpen(on ? null : o.key)}
                    className={`flex h-12 min-w-0 items-center gap-2 rounded-xl border-2 border-ink px-4 text-15 transition-colors ${on ? "bg-subtle" : "bg-bg hover:bg-subtle"}`}
                  >
                    <span className="shrink-0 font-bold">{o.label}</span>
                    <span className="min-w-0 truncate text-13 font-semibold text-muted">{summaries[o.key]}</span>
                    <svg aria-hidden viewBox="0 0 16 16" className={`ml-auto h-4 w-4 shrink-0 transition-transform ${on ? "rotate-180" : ""}`}>
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </div>
            {open && (
              <div
                id="hero-options"
                role="group"
                aria-label={OPTIONS.find((o) => o.key === open)?.label}
                className="flex flex-wrap gap-2 rounded-2xl bg-subtle p-4 motion-safe:animate-[ds-rise_160ms_ease-out]"
              >
                {open === "industry" &&
                  INDUSTRIES.map((i) => (
                    <Chip
                      key={i.value}
                      selected={upload.industry === i.value}
                      onClick={() =>
                        setUpload({
                          industry: upload.industry === i.value ? null : i.value,
                        })
                      }
                    >
                      {i.label}
                    </Chip>
                  ))}
                {open === "tones" && (
                  <>
                    {BRAND_TONES.map((t) => {
                      const selected = upload.brandTones.includes(t.value);
                      return (
                        <Chip
                          key={t.value}
                          selected={selected}
                          disabled={!selected && upload.brandTones.length >= 3}
                          badge={recommendedTones.includes(t.value) ? "추천" : undefined}
                          onClick={() => toggleTone(t.value)}
                        >
                          {t.label}
                        </Chip>
                      );
                    })}
                    <p className="w-full text-13 text-muted">3개까지 · 고르지 않으면 로고에서 읽어요</p>
                  </>
                )}
                {open === "usage" &&
                  USAGE_CONTEXTS.map((x) => (
                    <Chip key={x.value} selected={upload.usageContexts.includes(x.value)} onClick={() => toggleUsage(x.value)}>
                      {x.label}
                    </Chip>
                  ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={feelRejected}
              onClick={start}
              className="flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl bg-ink text-18 font-extrabold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            >
              <PencilIcon />
              {upload.logoImage ? "이 로고로 폰트 만들기" : "폰트 만들기"}
            </button>
            <p className="text-center text-13 text-muted">다음 화면에서 로고 권리를 확인하면 바로 만들어요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5">
      <path d="M12.8 4.2l3 3L7.5 15.5 4 16l.5-3.5 8.3-8.3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11 6l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
