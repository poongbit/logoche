"use client";

// 화면 1 로고 업로드(Claude Design 'Logoche Final' 4a·4c, 10/29 확정).
// 왼쪽은 로고와 샘플, 오른쪽은 묶음 셋(가게 정보 → 분위기 → 권리 확인)을 한 페이지 안에서 차례로 연다.
// 끝낸 묶음은 한 줄 요약으로 접힌다. 접힌 줄은 어디를 눌러도 그 묶음이 열린다(아직 안 연 묶음도). 샘플 로고를 고르면 가게 정보·분위기가 채워지고 권리 확인이 열린다.
// 10/30 사용자 요청: 묶음을 넘기는 '다음'을 열린 묶음 안 오른쪽 아래에 둔다(입력하고 화면 아래 막대까지 오가지 않게).
// 마지막 묶음과, 세 묶음을 다 채운 뒤 다시 연 묶음에서는 그 자리가 '분석하기'다. 그래서 화면 1에는 아래 막대가 없다(같은 버튼이 두 번 보여서 뺐다).
// 10/29 사용자 요청: 묶음을 옮길 때 모핑. 브라우저의 화면 전환(View Transitions)으로 묶음마다 크기·자리를 잇는다(app/globals.css).
// 지원하지 않는 브라우저와 '동작 줄이기'에서는 바로 바뀐다.

import { Fragment, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Chip, Missing, Notice, RadioRow, Spinner, TextField } from "@/components/ui";
import {
  ACCEPTED_LOGO_TYPES,
  BRAND_TONES,
  INDUSTRIES,
  LOGO_FONTS,
  LOGO_SOURCES,
  MAX_LOGO_BYTES,
  SAMPLE_LOGOS,
  USAGE_CONTEXTS,
} from "@/lib/constants";
import { sha256Hex, toLogoDataUrl } from "@/lib/files";
import { isImitationRequest } from "@/lib/rules";
import { useApp } from "@/lib/store";
import type { BrandTone, UsageContext } from "@/lib/types";

const labelOf = <T extends string>(list: { value: T; label: string }[], value: T | null) =>
  list.find((x) => x.value === value)?.label ?? "";

const GROUPS = ["가게 정보", "분위기", "권리 확인"] as const;
const GROUP_HINTS = ["가게 이름 · 업종", "브랜드 톤 · 주 사용처 · 원하는 느낌", "로고 권리 · 로고 글자를 만든 방법"];
/** 받침이 있으면 '이에요', 없으면 '예요' */

export default function UploadPage() {
  const { hydrated } = useApp();
  // 저장해 둔 입력을 읽은 뒤에 연다. 처음 열 묶음을 그 입력으로 정하기 때문이다.
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[90rem] px-5 py-10 lg:px-12">
        <Spinner label="불러오는 중" />
      </div>
    );
  }
  return <UploadScreen />;
}

function UploadScreen() {
  const { state, dispatch, record } = useApp();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const u = state.upload;
  const feelRejected = isImitationRequest(u.desiredFeel);
  const recommendedTones = INDUSTRIES.find((i) => i.value === u.industry)?.tones ?? [];

  const done = [
    !!u.storeName.trim() && !!u.industry,
    u.brandTones.length >= 2 && u.usageContexts.length >= 1 && !feelRejected,
    !!u.logoSource && !!u.logoFont,
  ];
  const missing = [
    [!u.storeName.trim() && "가게 이름", !u.industry && "업종"],
    [
      u.brandTones.length < 2 && `브랜드 톤 ${2 - u.brandTones.length}개 더`,
      !u.usageContexts.length && "주 사용처",
      feelRejected && "원하는 느낌 고치기",
    ],
    [!u.logoSource && "로고 권리", !u.logoFont && "로고 글자"],
  ].map((list) => list.filter((x): x is string => !!x));
  // 열린 묶음은 묶음 안 '다음'이나 접힌 줄을 눌러야 바뀐다(다 채웠다고 저절로 넘어가지 않는다). 처음에는 아직 덜 채운 첫 묶음.
  const [g, setGroup] = useState(() => (done.every(Boolean) ? GROUPS.length - 1 : Math.max(0, done.indexOf(false))));

  /** 묶음을 연다. 열린 묶음이 요약으로 줄고 고른 묶음이 펼쳐지는 모핑을 건다. */
  function setOpenGroup(next: number) {
    if (next === g) return;
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGroup(next);
      return;
    }
    document.startViewTransition(() => flushSync(() => setGroup(next)));
  }
  const allDone = done.every(Boolean) && !!u.logoImage;
  const last = g === GROUPS.length - 1;

  async function acceptFile(file: File) {
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      setFileError("PNG·SVG·JPG·WEBP 파일만 받을 수 있어요.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFileError("10MB 이하 파일만 받을 수 있어요.");
      return;
    }
    setFileError(null);
    const [logoImage, logoHash] = await Promise.all([toLogoDataUrl(file), sha256Hex(file)]);
    dispatch({ type: "setUpload", patch: { logoImage, logoHash, logoFileName: file.name, inputPath: "upload", sampleId: null } });
  }

  async function pickSample(sample: (typeof SAMPLE_LOGOS)[number]) {
    const blob = await (await fetch(sample.src)).blob();
    const [logoImage, logoHash] = await Promise.all([toLogoDataUrl(blob), sha256Hex(blob)]);
    setFileError(null);
    dispatch({
      type: "setUpload",
      patch: { logoImage, logoHash, logoFileName: `${sample.id}.svg`, inputPath: "sample", sampleId: sample.id, ...sample.prefill },
    });
    setOpenGroup(2); // 가게 정보·분위기가 채워졌으니 권리 확인으로
  }

  function toggleTone(tone: BrandTone) {
    const tones = u.brandTones.includes(tone) ? u.brandTones.filter((t) => t !== tone) : [...u.brandTones, tone];
    dispatch({ type: "setUpload", patch: { brandTones: tones } });
  }

  function toggleUsage(usage: UsageContext) {
    const list = u.usageContexts.includes(usage) ? u.usageContexts.filter((x) => x !== usage) : [...u.usageContexts, usage];
    dispatch({ type: "setUpload", patch: { usageContexts: list } });
  }

  function submit() {
    const tones = u.brandTones.map((t) => labelOf(BRAND_TONES, t)).join(", ");
    const usages = u.usageContexts.map((x) => labelOf(USAGE_CONTEXTS, x)).join(", ");
    record("selection", `로고 원본: ${u.logoFileName} (${u.inputPath === "sample" ? "샘플" : "업로드"}) · 해시 ${u.logoHash?.slice(0, 8)}`);
    record("selection", `로고 출처 답변: ${labelOf(LOGO_SOURCES, u.logoSource)}`);
    const fontName = u.logoFont === "free_font" || u.logoFont === "commercial_font" ? u.logoFontName.trim() : "";
    record("selection", `로고 글자 폰트 답변: ${labelOf(LOGO_FONTS, u.logoFont)}${fontName ? ` (${fontName})` : ""}`);
    record("creative_intent", `업종 ${labelOf(INDUSTRIES, u.industry)} · 브랜드 톤 ${tones} · 주 사용처 ${usages}`);
    if (u.desiredFeel.trim()) record("creative_intent", `원하는 느낌: ${u.desiredFeel.trim()}`);
    dispatch({ type: "reachStep", step: 1 });
    router.push("/style");
  }

  const summaries = [
    `${u.storeName.trim() || "이름 미정"} · ${labelOf(INDUSTRIES, u.industry) || "업종 미정"}`,
    `${u.brandTones.map((t) => labelOf(BRAND_TONES, t)).join(", ") || "톤 미정"} · ${u.usageContexts.map((x) => labelOf(USAGE_CONTEXTS, x)).join(", ") || "사용처 미정"}`,
    `${labelOf(LOGO_SOURCES, u.logoSource) || "—"} · ${labelOf(LOGO_FONTS, u.logoFont) || "—"}`,
  ];

  // 열린 묶음의 버튼: 마지막 묶음이거나 다 채웠으면 '분석하기', 아니면 '다음: 다음 묶음'
  const finish = last || allDone;
  /** 그 버튼을 누르려면 더 채울 것. '분석하기'면 화면 전체 기준 */
  const left = finish ? [!u.logoImage && "로고", ...missing.flatMap((m, k) => (done[k] ? [] : m))].filter((x): x is string => !!x) : missing[g];

  const groupBody: ReactNode[] = [
    <Fragment key="info">
      <Field label="가게 이름">
        <TextField
          value={u.storeName}
          onChange={(e) => dispatch({ type: "setUpload", patch: { storeName: e.target.value } })}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && done[0] && setOpenGroup(1)}
          placeholder="예: 달콤한집"
          className="max-w-[26.25rem]"
        />
      </Field>
      <Field label="업종" missing={!u.industry ? "골라 주세요" : undefined}>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((i) => (
            <Chip key={i.value} selected={u.industry === i.value} onClick={() => dispatch({ type: "setUpload", patch: { industry: i.value } })}>
              {i.label}
            </Chip>
          ))}
        </div>
      </Field>
    </Fragment>,
    <Fragment key="mood">
      <Field
        label="브랜드 톤"
        note={`2~3개 · ${u.brandTones.length}/3`}
        missing={u.brandTones.length < 2 ? "골라 주세요" : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {BRAND_TONES.map((t) => {
            const selected = u.brandTones.includes(t.value);
            return (
              <Chip
                key={t.value}
                selected={selected}
                disabled={!selected && u.brandTones.length >= 3}
                badge={recommendedTones.includes(t.value) ? "추천" : undefined}
                onClick={() => toggleTone(t.value)}
              >
                {t.label}
              </Chip>
            );
          })}
        </div>
      </Field>
      <Field label="주 사용처" note="1개 이상" missing={!u.usageContexts.length ? "골라 주세요" : undefined}>
        <div className="flex flex-wrap gap-2">
          {USAGE_CONTEXTS.map((x) => (
            <Chip key={x.value} selected={u.usageContexts.includes(x.value)} onClick={() => toggleUsage(x.value)}>
              {x.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="원하는 느낌 한 줄" note="비워도 돼요 · 창작 의도로 기록돼요">
        <TextField
          value={u.desiredFeel}
          onChange={(e) => dispatch({ type: "setUpload", patch: { desiredFeel: e.target.value } })}
          placeholder="예: 따뜻하고 손맛 있는"
          className="max-w-[32.5rem]"
        />
        {feelRejected && (
          <Notice tone="error">특정 폰트(○○체, ○○폰트 등)를 따라 하는 요청은 받지 않아요. &quot;둥글고 통통한&quot;처럼 원하는 모양을 말로 적어 주세요.</Notice>
        )}
      </Field>
    </Fragment>,
    <div key="rights" className="grid gap-5 xl:grid-cols-2">
      <Field label="이 로고의 권리가 나에게 있나요?">
        <div role="radiogroup" className="flex flex-col gap-2">
          {LOGO_SOURCES.map((s) => (
            <RadioRow key={s.value} selected={u.logoSource === s.value} onClick={() => dispatch({ type: "setUpload", patch: { logoSource: s.value } })}>
              {s.label}
            </RadioRow>
          ))}
        </div>
        {u.logoSource === "outsourced_transferred" && <p className="text-sm leading-normal font-medium">외주로 만든 로고는 저작권 양도 계약서를 확인해 주세요.</p>}
        {u.logoSource === "unknown" && <p className="text-sm leading-normal font-medium">진행은 할 수 있어요. 폰트를 쓰기 전에 로고 권리를 확인해 주세요.</p>}
      </Field>
      <Field label="로고 글자는 어떻게 만들었나요?">
        <div role="radiogroup" className="flex flex-col gap-2">
          {LOGO_FONTS.map((f) => (
            <RadioRow key={f.value} selected={u.logoFont === f.value} onClick={() => dispatch({ type: "setUpload", patch: { logoFont: f.value } })}>
              {f.label}
            </RadioRow>
          ))}
        </div>
        {(u.logoFont === "free_font" || u.logoFont === "commercial_font") && (
          <TextField
            value={u.logoFontName}
            onChange={(e) => dispatch({ type: "setUpload", patch: { logoFontName: e.target.value } })}
            placeholder="폰트 이름(알면) · 예: G마켓 산스"
            aria-label="로고에 쓴 폰트 이름"
          />
        )}
        {u.logoFont === "free_font" && <p className="text-sm leading-normal font-medium">무료 폰트도 로고에 써도 되는지는 폰트마다 달라요. 그 폰트의 라이선스를 한 번 확인해 주세요.</p>}
        {u.logoFont === "commercial_font" && (
          <p className="text-sm leading-normal font-medium">
            로고에 쓴 상용 폰트의 라이선스는 직접 확인해 주세요. 로고체는 무료 폰트와만 닮았는지 검사하고, 상용 폰트와는 비교하지 않아요.
          </p>
        )}
        {u.logoFont === "unknown" && <p className="text-sm leading-normal font-medium">로고를 만든 분께 어떤 폰트를 썼는지 물어봐 주세요. 상용 폰트였다면 그 라이선스도 확인이 필요해요.</p>}
      </Field>
    </div>,
  ];

  return (
    <>
      <div className="mx-auto grid w-full max-w-[90rem] flex-1 gap-8 px-5 pt-5 pb-10 lg:grid-cols-[26.25rem_minmax(0,1fr)] lg:gap-12 lg:px-12 lg:pb-14">
        {/* 로고 */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-26 font-extrabold tracking-[-0.02em] lg:text-30">로고를 올려 주세요</h1>
            <p className="text-15 leading-normal font-medium text-muted">로고 글자는 잘라 쓰지 않고, 재고 참고하는 데만 써요.</p>
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label={u.logoImage ? "다른 로고 파일로 바꾸기" : "로고 파일 올리기"}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void acceptFile(file);
            }}
            className={`flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-dashed bg-stage p-3 transition-colors lg:h-[18.75rem] lg:flex-col lg:justify-center lg:gap-3 lg:rounded-[1.25rem] lg:p-5 ${
              dragging ? "border-ink" : "border-edge-stage hover:border-ink"
            }`}
          >
            {u.logoImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL */}
                <img src={u.logoImage} alt="올린 로고" className="max-h-[12.5rem] w-[7.5rem] rounded-lg object-contain lg:w-auto lg:max-w-[20rem] lg:rounded-xl" />
                <span className="flex flex-col gap-1 text-sm font-medium text-muted lg:items-center">
                  <span className="font-bold text-ink lg:font-medium lg:text-muted">
                    {u.inputPath === "sample" ? `샘플 · ${SAMPLE_LOGOS.find((s) => s.id === u.sampleId)?.name ?? ""}` : u.logoFileName}
                  </span>
                  <span className="font-bold text-ink underline lg:font-medium lg:text-muted lg:no-underline">다른 파일로 바꾸기</span>
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="text-3xl font-light">+</span>
                <span className="text-base font-bold">로고 파일 올리기</span>
                <span className="text-sm font-medium text-muted">끌어다 놓거나 눌러서 고르기 · PNG·SVG·JPG, 10MB 이하</span>
              </span>
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
          <div className="flex flex-col gap-2.5 pt-1">
            <span className="text-15 font-bold">
              샘플 로고로 체험 <span className="hidden font-medium text-muted lg:inline">고르면 가게 정보와 분위기가 채워져요</span>
            </span>
            <div className="grid grid-cols-3 gap-2 lg:gap-2.5">
              {SAMPLE_LOGOS.map((sample) => {
                const selected = u.sampleId === sample.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => void pickSample(sample)}
                    className={`flex flex-col gap-1.5 rounded-xl p-2 text-13 transition-colors ${
                      selected ? "border-2 border-ink bg-subtle font-bold" : "border-[1.5px] border-edge bg-bg font-semibold hover:border-ink hover:bg-subtle"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- public의 작은 SVG */}
                    <img src={sample.src} alt="" className="w-full rounded-md" />
                    {sample.name}
                    {selected && " ✓"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 묶음 셋 */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline gap-3.5 pb-1">
            <h2 className="text-xl font-extrabold lg:text-22">가게에 대해 알려 주세요</h2>
            <span className="text-sm font-bold lg:text-15">{done.filter(Boolean).length}/3 끝</span>
            <span className="ml-auto hidden w-[7.5rem] gap-1 lg:flex" aria-hidden>
              {done.map((d, i) => (
                <span key={i} className="h-1 flex-1 overflow-hidden rounded-sm bg-track">
                  <span
                    className="block h-full origin-left bg-ink transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                    style={{ transform: `scaleX(${d ? 1 : 0})` }}
                  />
                </span>
              ))}
            </span>
          </div>
          {GROUPS.map((name, i) => {
            if (i === g) {
              return (
                <section key={name} style={{ viewTransitionName: `group-${i}` }} className="flex flex-col gap-4 rounded-2xl bg-subtle px-4 py-4 lg:px-[1.375rem] lg:py-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-[1.625rem] w-[1.625rem] place-items-center rounded-full bg-ink text-13 font-bold text-bg">{i + 1}</span>
                    <h3 className="text-17 font-bold lg:text-lg">{name}</h3>
                    {i === 2 && <span className="text-sm font-medium text-muted">제작 기록에 남아요</span>}
                  </div>
                  {groupBody[i]}
                  {/* 10/30 사용자 지적: 고른 항목과 떨어뜨려 오른쪽 아래에. 남은 항목은 같은 줄 왼쪽 */}
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2 border-t border-line pt-4">
                    <span className="mr-auto" aria-live="polite">
                      {left.length > 0 && <Missing>남은 항목: {left.join(", ")}</Missing>}
                    </span>
                    {finish ? (
                      <Button size="md" disabled={!allDone} onClick={submit}>
                        분석하기
                      </Button>
                    ) : (
                      <Button size="md" disabled={!done[i]} onClick={() => done[i] && setOpenGroup(i + 1)}>
                        다음: {GROUPS[i + 1]}
                        <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5">
                          <path d="M4 10h11m-4.5-4.5L15 10l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Button>
                    )}
                  </div>
                </section>
              );
            }
            const reached = done[i] || i < g;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setOpenGroup(i)}
                aria-expanded={false}
                style={{ viewTransitionName: `group-${i}` }}
                className={`flex min-h-[3.75rem] w-full items-center gap-3.5 rounded-2xl border-[1.5px] border-edge py-1.5 pr-4 pl-[1.125rem] text-left transition-colors hover:bg-subtle ${reached ? "" : "border-dashed"}`}
              >
                {done[i] ? (
                  <span className="grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-full bg-stage text-13 font-bold">✓</span>
                ) : (
                  <span className={`grid h-[1.625rem] w-[1.625rem] shrink-0 place-items-center rounded-full border-2 border-edge text-13 ${reached ? "" : "text-muted"}`}>
                    {i + 1}
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-0.5 lg:flex-row lg:items-baseline lg:gap-3.5">
                  <span className={`text-15 font-bold lg:text-base ${reached ? "" : "text-muted"}`}>{name}</span>
                  {done[i] ? (
                    <span className="truncate text-sm font-medium text-muted lg:text-15">{summaries[i]}</span>
                  ) : reached ? (
                    <Missing>{missing[i].join(", ")}</Missing>
                  ) : (
                    <span className="text-13 font-medium text-muted lg:text-sm">{GROUP_HINTS[i]}</span>
                  )}
                </span>
                <span className="sr-only">{done[i] ? "바꾸기" : "열기"}</span>
                <svg aria-hidden viewBox="0 0 20 20" className="ml-auto h-5 w-5 shrink-0 text-muted">
                  <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Field({ label, note, missing, children }: { label: string; note?: string; missing?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-15 font-bold">
        {label}
        {note && <span className="font-medium text-muted">{note}</span>}
        {missing && <Missing>{missing}</Missing>}
      </span>
      {children}
    </div>
  );
}
