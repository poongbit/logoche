"use client";

// 폰트 만들기 질문 페이지(11/4 사용자 결정). 메인에서 로고와 가게 이름만 받고, 나머지는 한 화면에 한 가지씩 묻는다.
// 업종(목록을 스크롤해 고르거나 직접 입력) → 사업 내용 → 글씨 속성 네 쌍 → 로고 권리. 건너뛰기는 없다: 정해야 다음 단추가 켜진다.
// 입력은 lib/newDraft.ts에 저장해 새로 고침하거나 구글에 다녀와도 남는다. 로고 권리 단계에서 로그인하고 서버에 작업을 만든다.
//
// 11/6 디자인(docs/design-1106, 피그마 aODllKshLdArNTba7aQMGU): Q2 '민트 면 위 접수증'.
// - 1/4 465:72 · 491:308, 2/4 463:115 · 466:229 · 491:463(짧을 때) · 491:549(특정 폰트 요청), 3/4 552:608 · 491:351, 4/4 465:221 · 491:412.
// - 큰 민트 면(A 규칙 ① 접수) 위 흰 접수증. 왼쪽(휴대폰은 위)에 '접수 · N / 4' + 큰 제목, 접수증 위 칸에 질문, 절취선 아래 '지금까지 접수한 것'이 진행 표시라 단계 줄은 없다.
// - 모션: 단계가 바뀌면 접수증 안쪽 질문 묶음만 animate-ds-enter(6px · 200ms). 접수증 틀·머리줄·버튼 줄은 움직이지 않는다.
//   '지금까지 접수한 것'에 새로 붙은 체크만 animate-ds-check. 단계는 주소가 다른 페이지(/make/[step])라 화면 전환 API는 쓰지 않는다(motion.md).

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckMark, DisplayTitle, PrimaryButton, Receipt, SegmentedPair, SelectChip, TextButton } from "@/components/ds";
import { InAppNotice, useGoogleSignIn } from "@/components/GoogleSignIn";
import { Notice, TextField, onRadioKeys, rovingTab } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { ATTRIBUTE_PAIRS, BRAND_TONES, INDUSTRIES, INDUSTRY_GROUPS, LOGO_SOURCES, USAGE_CONTEXTS } from "@/lib/constants";
import { ATTRIBUTE_GLYPHS } from "@/lib/attributeGlyphs";
import { MAKE_STEPS, firstOpenStep, stepDone, type MakeStep } from "@/lib/makeSteps";
import { clearDraft, loadDraft, saveDraft, type NewDraft } from "@/lib/newDraft";
import { BUSINESS_MIN, DESIRED_FEEL_MAX, INDUSTRY_OTHER_MAX, isImitationRequest } from "@/lib/rules";
import type { StyleAttributes, UploadInput } from "@/lib/types";

const noSubscribe = () => () => {};

/** 가게 이야기를 이만큼 넘기면 '좋아요'. 그 아래(BUSINESS_MIN 이상)는 막지 않고 한 줄 더 권한다(screens.md 11/6 오후 피드백). */
const BUSINESS_GOOD = 30;

// 제목은 피그마처럼 두 줄로 끊는다(Black Han Sans 큰 제목). 문구는 지금 코드 그대로.
const TITLES: Record<MakeStep, { title: [string, string]; sub: string }> = {
  industry: { title: ["어떤 일을", "하세요?"], sub: "업종에 맞춰 글자 느낌을 추천해 드려요. 목록에서 고르거나 직접 적어도 돼요." },
  business: { title: ["어떤 가게인지", "알려 주세요"], sub: "사업 내용과 추구하는 가치를 적어 주세요. 글자 느낌을 정하는 데 가장 크게 쓰여요." },
  style: { title: ["어떤 글씨가", "좋아요?"], sub: "마음에 드는 쪽을 누르세요. 네 가지를 모두 골라야 다음으로 갈 수 있어요." },
  rights: { title: ["이 로고는", "누가 만들었나요?"], sub: "로고를 따라 글자를 그리기 때문에 권리를 확인해요." },
};

/** '다음: ○○' 버튼과 접수한 것 줄의 이름 */
const STEP_NAMES: Record<MakeStep, string> = { industry: "업종", business: "가게 이야기", style: "글씨 취향", rights: "로고 권리" };

const IMITATION_RULE = "특정 폰트(○○체, ○○폰트 등)를 따라 하는 요청은 받지 않아요. \"둥글고 통통한\"처럼 원하는 모양을 말로 적어 주세요.";
const GLYPH_NOTE = "그림은 모양을 설명하는 예시예요. 완성 글자는 로고와 사업 내용을 보고 새로 그려요.";
const LOGIN_NOTE = "Google 계정으로 로그인하면 바로 시작해요. ";
const AFTER_NOTE = "로고를 읽고 느낌 세 가지를 보여 드려요. 창을 닫아도 서버가 기다리고 메일로 알려 드려요.";

export function MakeWizard({ step }: { step: MakeStep }) {
  // 저장해 둔 입력은 브라우저에서만 읽을 수 있다. 서버에서는 아무것도 그리지 않는다.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!inBrowser) return null;
  return <Wizard step={step} initial={loadDraft()} />;
}

function Wizard({ step, initial }: { step: MakeStep; initial: NewDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<NewDraft>(initial);
  const upload = draft.upload;
  const setUpload = (patch: Partial<UploadInput>) => setDraft((d) => ({ ...d, upload: { ...d.upload, ...patch } }));
  const index = MAKE_STEPS.indexOf(step);
  const { data: session, isPending } = authClient.useSession();
  const loggedOut = !session && !isPending;

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // 로고와 가게 이름이 없거나 앞 단계가 비어 있으면 그 자리로 돌려보낸다
  const open = firstOpenStep(upload);
  const startMissing = !upload.logoImage || !upload.storeName.trim();
  const redirectTo = startMissing ? "/" : open && MAKE_STEPS.indexOf(open) < index ? `/make/${open}` : null;
  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);
  if (redirectTo) return null;

  const go = (s: MakeStep) => router.push(`/make/${s}`);
  const prev = index > 0 ? MAKE_STEPS[index - 1] : null;
  const next = index < MAKE_STEPS.length - 1 ? MAKE_STEPS[index + 1] : null;
  const back = () => (prev ? go(prev) : router.push("/"));
  // 특정 폰트를 따라 해 달라는 요청은 이 단계에서 막는다(11/6 확정: 예전에는 마지막에야 막혔다)
  const rejected = step === "business" && isImitationRequest(upload.desiredFeel);
  const ready = stepDone(step, upload) && !rejected;
  const { title, sub } = TITLES[step];

  // 단계마다 왼쪽(데스크톱)에 두는 안내. 휴대폰에서는 접수증 안 알맞은 자리로 옮긴다.
  const sideNote =
    step === "business" ? IMITATION_RULE : step === "style" ? GLYPH_NOTE : step === "rights" ? `${loggedOut ? LOGIN_NOTE : ""}${AFTER_NOTE}` : null;

  return (
    <div className="flex flex-1 flex-col bg-bg-brand text-text-primary">
      <div className="mx-auto grid w-full max-w-[76rem] gap-5 px-4 pt-7 pb-8 lg:grid-cols-2 lg:gap-0 lg:px-10 lg:pt-20 lg:pb-20">
        <div className="flex flex-col lg:pr-10">
          <p className="text-sm font-bold lg:text-15">
            접수&nbsp;&nbsp;·&nbsp;&nbsp;{index + 1} / {MAKE_STEPS.length}
          </p>
          <DisplayTitle className="mt-1.5 text-[2.125rem] lg:mt-2.5 lg:text-[3.5rem]">
            {title[0]}
            <br />
            {title[1]}
          </DisplayTitle>
          <p className="mt-2 max-w-[31.25rem] text-15 leading-normal font-medium lg:mt-4 lg:text-17">{sub}</p>
          {sideNote && <p className="mt-10 max-w-[31.25rem] text-15 leading-normal max-lg:hidden">{sideNote}</p>}
        </div>

        <Receipt
          aria-label="접수증"
          className="w-full lg:max-w-[37.5rem] lg:justify-self-end"
          topClassName="px-4 pt-5 pb-3 lg:px-8 lg:pt-7 lg:pb-4"
          bottomClassName="px-4 pt-[1.125rem] pb-[1.125rem] lg:px-8 lg:pt-6 lg:pb-7"
          top={
            <>
              {/* 바뀌는 건 이 묶음뿐: 들어올 때 한 번 6px 위로(움직임 줄이기에서는 투명도만) */}
              {step !== "rights" && (
                <div key={step} className="ds-motion animate-ds-enter">
                  {step === "industry" && <IndustryStep upload={upload} setUpload={setUpload} />}
                  {step === "business" && <BusinessStep upload={upload} setUpload={setUpload} rejected={rejected} />}
                  {step === "style" && <StyleStep upload={upload} setUpload={setUpload} />}
                </div>
              )}
              {step === "rights" ? (
                <RightsStep upload={upload} setUpload={setUpload} onBack={back} onCreated={() => clearDraft()} loggedOut={loggedOut} session={!!session} isPending={isPending} />
              ) : (
                <div className="mt-7 flex flex-col items-start gap-2">
                  <PrimaryButton block disabled={!ready} onClick={() => next && go(next)}>
                    다음: {next ? STEP_NAMES[next] : ""}
                  </PrimaryButton>
                  <TextButton onClick={back}>이전으로</TextButton>
                </div>
              )}
            </>
          }
          bottom={<Received upload={upload} step={step} />}
        />
      </div>
    </div>
  );
}

type StepProps = { upload: UploadInput; setUpload: (patch: Partial<UploadInput>) => void };

// ---------- 지금까지 접수한 것 ----------

// 앞 화면에서 본 '다 된 줄'. 단계마다 페이지가 새로 그려져도 남아 있어서, 새로 붙은 체크만 톡 튀게 한다(처음 들어온 화면에서는 튀지 않음).
let seenDone: Set<string> | null = null;

const shortAttr = (label: string) => label.replace(/^(고딕처럼|명조처럼) /, "");

function industryLabel(u: UploadInput) {
  if (u.industry === "other") return u.industryOther.trim();
  return INDUSTRIES.find((i) => i.value === u.industry)?.label ?? "";
}

function moreOf(labels: string[], unit: string) {
  return labels.length === 0 ? null : labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}${unit}`;
}

function Received({ upload, step }: { upload: UploadInput; step: MakeStep }) {
  const index = MAKE_STEPS.indexOf(step);
  const story = [
    `${upload.desiredFeel.trim().length}자`,
    moreOf(upload.usageContexts.map((v) => USAGE_CONTEXTS.find((c) => c.value === v)?.label ?? v), "곳"),
    moreOf(upload.brandTones.map((v) => BRAND_TONES.find((t) => t.value === v)?.label ?? v), "개"),
  ]
    .filter(Boolean)
    .join(" · ");
  const attrs = ATTRIBUTE_PAIRS.map((p) => shortAttr(p.options.find((o) => o.value === upload.attributes?.[p.key])?.label ?? "")).join(" · ");
  const values: Record<MakeStep, string> = {
    industry: industryLabel(upload),
    business: story,
    style: attrs,
    rights: LOGO_SOURCES.find((s) => s.value === upload.logoSource)?.label ?? "",
  };
  const rows: { key: string; label: string; value: string; state: "done" | "now" | "later" }[] = [
    { key: "logo", label: "로고", value: upload.logoFileName ?? (upload.sampleId ? "예시 로고" : "올린 로고"), state: "done" },
    { key: "name", label: "가게 이름", value: upload.storeName.trim(), state: "done" },
    ...MAKE_STEPS.map((s, i) => ({
      key: s,
      label: STEP_NAMES[s],
      value: values[s],
      state: (i < index ? "done" : i === index ? "now" : "later") as "done" | "now" | "later",
    })),
  ];
  const done = rows.filter((r) => r.state === "done");
  const doneKey = done.map((r) => r.key).join(",");
  const [popped] = useState(() => {
    const before = seenDone;
    return new Set(before ? done.filter((r) => !before.has(r.key)).map((r) => r.key) : []);
  });
  useEffect(() => {
    seenDone = new Set(doneKey.split(","));
  }, [doneKey]);

  const nowWord = step === "business" ? "지금 쓰는 중" : "지금 고르는 중";
  const left = rows.filter((r) => r.state !== "done");

  return (
    <>
      {/* 데스크톱: 여섯 줄 표(463:115) */}
      <h2 className="text-sm font-bold max-lg:hidden">지금까지 접수한 것</h2>
      <dl className="mt-3 grid grid-cols-[7.375rem_minmax(0,1fr)_auto] gap-y-1.5 text-sm max-lg:hidden">
        {rows.map((r) => (
          <div key={r.key} className="contents">
            <dt className="text-text-secondary">{r.label}</dt>
            <dd className={`truncate ${r.state === "done" ? "font-bold" : "text-text-tertiary"}`}>{r.state === "done" ? r.value : r.state === "now" ? nowWord : "—"}</dd>
            <dd className="flex items-center justify-end pl-3">
              {r.state === "done" && (
                <>
                  <CheckMark className={`h-3.5 w-3.5 ${popped.has(r.key) ? "ds-motion animate-ds-check" : ""}`} />
                  <span className="sr-only">접수함</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {/* 휴대폰: 한 줄 요약(466:229 · 491:412) */}
      <p className="text-13 leading-normal text-text-secondary lg:hidden">
        <span className="font-bold text-text-primary">
          접수한 것 {done.length} / {rows.length}
        </span>
        &nbsp;&nbsp;·&nbsp;&nbsp;
        {left.length === 1 ? `${left[0].label}만 남았어요` : done.map((r) => r.label).join(" · ")}
      </p>
    </>
  );
}

// ---------- 업종 ----------

function IndustryStep({ upload, setUpload }: StepProps) {
  const chosen = INDUSTRIES.find((i) => i.value === upload.industry);
  const [query, setQuery] = useState(upload.industry === "other" ? upload.industryOther : (chosen?.label ?? ""));
  const q = query.trim();
  const exact = INDUSTRIES.find((i) => i.label === q && i.value !== "other");
  const groups = INDUSTRY_GROUPS.map((g) => ({
    label: g.label,
    items: INDUSTRIES.filter((i) => g.values.includes(i.value) && i.value !== "other" && (!q || exact || i.label.includes(q))),
  })).filter((g) => g.items.length > 0);
  const own = q && !exact;
  const row = (on: boolean) =>
    `flex min-h-11 w-full items-center justify-between gap-3 rounded-[0.625rem] border-2 px-3 text-left text-15 transition-colors duration-(--dur-fast) ${
      on ? "border-border-active bg-bg-surface font-bold" : "border-transparent font-medium hover:bg-bg-surface"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <TextField
        aria-label="업종 검색 또는 직접 입력"
        value={query}
        maxLength={INDUSTRY_OTHER_MAX}
        placeholder="업종을 고르거나 직접 입력하세요"
        autoComplete="off"
        className="h-[3.25rem]!"
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          const hit = INDUSTRIES.find((i) => i.label === v.trim() && i.value !== "other");
          if (hit) setUpload({ industry: hit.value, industryOther: "" });
          else if (v.trim()) setUpload({ industry: "other", industryOther: v.trim().slice(0, INDUSTRY_OTHER_MAX) });
          else setUpload({ industry: null, industryOther: "" });
        }}
      />
      <div
        role="listbox"
        aria-label="업종 목록"
        className="max-h-80 overflow-y-auto overscroll-contain rounded-[0.875rem] border border-border-default bg-bg-canvas p-1.5 lg:rounded-[1.125rem] lg:border-[1.5px]"
      >
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className="sticky top-0 z-[1] bg-bg-canvas px-3 pt-1.5 pb-1 text-12 font-bold text-text-secondary">{g.label}</div>
            {g.items.map((i) => {
              const on = upload.industry === i.value;
              return (
                <button
                  key={i.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    setQuery(i.label);
                    setUpload({ industry: i.value, industryOther: "" });
                  }}
                  className={row(on)}
                >
                  {i.label}
                  {on && <span className="text-13 font-bold text-text-secondary">선택됨</span>}
                </button>
              );
            })}
          </div>
        ))}
        {own && (
          <button
            type="button"
            role="option"
            aria-selected={upload.industry === "other"}
            onClick={() => setUpload({ industry: "other", industryOther: q.slice(0, INDUSTRY_OTHER_MAX) })}
            className={`${row(upload.industry === "other")} font-bold`}
          >
            <span className="min-w-0 truncate">&lsquo;{q}&rsquo; 직접 쓰기</span>
            {upload.industry === "other" && <span className="shrink-0 text-13 font-bold text-text-secondary">선택됨</span>}
          </button>
        )}
        {groups.length === 0 && !own && <p className="px-3 py-3 text-15 text-text-secondary">맞는 업종이 없어요. 위 칸에 직접 적어 주세요.</p>}
      </div>
      <p className="text-13 text-text-secondary">목록에 없으면 위 칸에 직접 적으세요. 최대 {INDUSTRY_OTHER_MAX}자예요.</p>
    </div>
  );
}

// ---------- 사업 내용 ----------

function BusinessStep({ upload, setUpload, rejected }: StepProps & { rejected: boolean }) {
  const length = upload.desiredFeel.trim().length;
  // 숫자 줄: 10자 아래는 막는 이유, 10~29자는 막지 않는 권유, 30자부터 '좋아요'(491:463 · 463:115)
  const [message, tone] =
    length < BUSINESS_MIN
      ? [`${BUSINESS_MIN}자 이상 적어 주세요`, "text-text-secondary"]
      : rejected
        ? [null, "text-text-secondary"]
        : length < BUSINESS_GOOD
          ? ["어떤 가게로 기억되고 싶은지 한 줄 더 적으면 더 잘 맞아요", "text-text-secondary"]
          : ["좋아요", "text-text-success"];
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="make-feel" className="text-15 font-bold">
          가게 이야기
          <span className="sr-only"> — 사업 내용과 추구하는 가치</span>
        </label>
        <span className="text-13 text-text-secondary">{BUSINESS_MIN}자 이상</span>
      </div>
      <textarea
        id="make-feel"
        rows={5}
        maxLength={DESIRED_FEEL_MAX}
        value={upload.desiredFeel}
        aria-invalid={rejected || undefined}
        aria-describedby={rejected ? "make-feel-count make-feel-alert" : "make-feel-count"}
        onChange={(e) => setUpload({ desiredFeel: e.target.value })}
        placeholder="예: 고양이의 우아하고 유연한 곡선과 집사와의 따뜻한 교감, 정직하고 건강한 수제 간식의 가치를 담은 브랜드예요."
        className={`mt-2 h-[10.625rem] w-full resize-none rounded-[1rem] border-2 bg-bg-canvas px-3.5 py-3 text-15 leading-[1.6] font-medium outline-none transition-shadow placeholder:text-text-secondary focus-visible:shadow-[0_0_0_4px_rgb(17_17_17/0.1)] lg:h-[9.375rem] lg:rounded-[1.125rem] lg:px-[1.125rem] lg:py-3.5 lg:text-base ${
          rejected ? "border-border-error" : "border-border-active"
        }`}
      />
      <p id="make-feel-count" className={`mt-2 text-13 leading-normal font-bold ${tone}`}>
        {length} / {DESIRED_FEEL_MAX}자{message && <>&nbsp;&nbsp;·&nbsp;&nbsp;{message}</>}
      </p>
      {/* 특정 폰트 요청: 칸 바로 아래 알림 + 칸 테두리 오류색 + 이 단계 '다음' 꺼짐(491:549) */}
      {rejected && (
        <div id="make-feel-alert" role="alert" className="mt-3 rounded-[0.875rem] border-[1.5px] border-border-error bg-bg-surface px-3.5 py-2.5 text-sm leading-[1.55] font-medium">
          {IMITATION_RULE}
        </div>
      )}
      <ChipGroup
        label="어디에 쓰세요? (여러 개 골라도 돼요)"
        options={USAGE_CONTEXTS}
        picked={upload.usageContexts}
        onChange={(usageContexts) => setUpload({ usageContexts })}
      />
      <ChipGroup
        label="어떤 분위기를 원하세요? (세 개까지)"
        options={BRAND_TONES}
        picked={upload.brandTones}
        max={3}
        onChange={(brandTones) => setUpload({ brandTones })}
      />
    </div>
  );
}

// 선택 입력: 체크 칩(중간 강도). 비워도 다음으로 간다.
function ChipGroup<T extends string>({
  label,
  options,
  picked,
  max,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  picked: T[];
  max?: number;
  onChange: (next: T[]) => void;
}) {
  const full = max !== undefined && picked.length >= max;
  return (
    <fieldset className="mt-6 lg:mt-7">
      <legend className="mb-2 text-15 font-bold">{label}</legend>
      <div className="flex flex-wrap gap-1.5 lg:gap-2">
        {options.map((o) => {
          const on = picked.includes(o.value);
          return (
            <SelectChip
              key={o.value}
              selected={on}
              disabled={!on && full}
              onClick={() => onChange(on ? picked.filter((v) => v !== o.value) : [...picked, o.value])}
            >
              {o.label}
            </SelectChip>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------- 속성 고르기 ----------

const GLYPH_KEYS: Record<string, string> = { round: "roundEdge", sharp: "sharpEdge", thin: "thin", bold: "bold", even: "even", high: "high", neat: "neat", brush: "brush" };

/**
 * '우리 가게' 외곽선(lib/attributeGlyphs.ts). 모든 칸이 같은 글자 크기: 데스크톱 38px(552:608) · 휴대폰 23px(491:351, 390 폭에서 한 줄).
 * 위 여백은 잉크 위 기준 데스크톱 18 · 휴대폰 14(칸 안쪽 12에 더함). SegmentedPair가 체크 원 자리로 비워 둔 오른쪽 32px은
 * 글자가 체크 원 왼쪽에서 끝나므로(가로로 겹치지 않음) 음수 여백으로 돌려받는다.
 */
function GlyphMark({ id }: { id: string }) {
  const g = ATTRIBUTE_GLYPHS[GLYPH_KEYS[id]];
  return (
    <span className="mt-0.5 block text-[1.4375rem] lg:mt-1.5 lg:text-[2.375rem]">
      <svg aria-hidden viewBox={`0 0 ${g.w} ${g.h}`} style={{ width: `${g.w / 100}em`, height: `${g.h / 100}em` }} className="block">
        <path d={g.d} fill="currentColor" />
      </svg>
    </span>
  );
}

function StyleStep({ upload, setUpload }: StepProps) {
  const a = upload.attributes;
  const pick = (key: keyof StyleAttributes, value: string) => setUpload({ attributes: { ...(a ?? ({} as StyleAttributes)), [key]: value } as StyleAttributes });
  return (
    <div className="flex flex-col gap-[1.125rem]">
      {ATTRIBUTE_PAIRS.map((pair) => (
        <div key={pair.key} className="flex flex-col gap-2">
          <span aria-hidden className="text-15 font-bold">
            {pair.label}
          </span>
          <SegmentedPair
            label={pair.label}
            options={[
              { value: pair.options[0].value, label: pair.options[0].label, visual: <GlyphMark id={pair.options[0].value} /> },
              { value: pair.options[1].value, label: pair.options[1].label, visual: <GlyphMark id={pair.options[1].value} /> },
            ]}
            value={a?.[pair.key]}
            onChange={(v) => pick(pair.key, v)}
          />
        </div>
      ))}
      <p className="text-13 leading-normal text-text-secondary lg:hidden">{GLYPH_NOTE}</p>
    </div>
  );
}

// ---------- 로고 권리와 만들기 시작 ----------

/** 권리 고르기 한 줄(465:221): 알약 60 + 왼쪽 동그라미 24. 고르면 회색 바탕 + 2px 먹 테두리 + 먹 동그라미 안 흰 체크. */
function SourceRow({ selected, onClick, tabIndex, children }: { selected: boolean; onClick: () => void; tabIndex: number; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onClick}
      className={`flex min-h-[3.75rem] w-full items-center gap-3 rounded-full px-4 py-2 text-left text-base transition-[background-color,border-color] duration-(--dur-fast) lg:px-[1.125rem] ${
        selected ? "border-2 border-border-active bg-bg-surface font-bold" : "border-[1.5px] border-border-strong bg-bg-canvas font-medium hover:border-border-active hover:bg-bg-surface"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-6 shrink-0 place-items-center rounded-full ${selected ? "bg-bg-inverse text-text-inverse" : "border-2 border-border-strong bg-bg-canvas"}`}
      >
        {selected && <CheckMark className="ds-motion h-3 w-3 animate-ds-check" />}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  );
}

function RightsStep({
  upload,
  setUpload,
  onBack,
  onCreated,
  loggedOut,
  session,
  isPending,
}: StepProps & { onBack: () => void; onCreated: () => void; loggedOut: boolean; session: boolean; isPending: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = useGoogleSignIn();
  const continued = useRef(false);
  const ready = stepDone("rights", upload);

  async function create() {
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await api.createProject({ upload });
      onCreated();
      router.push(`/fonts/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  async function submit() {
    if (!ready || submitting || isPending) return;
    if (!session) return void signIn.start("/make/rights?continue=1");
    await create();
  }

  // 구글에서 돌아왔으면(?continue=1) 한 번만 이어서 만든다. 새로 고침해도 다시 만들지 않게 주소에서 표시를 지운다.
  useEffect(() => {
    if (continued.current || new URLSearchParams(location.search).get("continue") !== "1") return;
    continued.current = true;
    router.replace("/make/rights", { scroll: false });
    void authClient.getSession().then(({ data }) => {
      if (data && ready) void create();
    });
  });

  const label = submitting ? "시작하는 중" : signIn.starting ? "구글로 가는 중" : loggedOut ? "로그인하고 견본 만들기" : "견본 만들기";

  return (
    <>
      <div key="rights" className="ds-motion flex animate-ds-enter flex-col gap-2.5">
        <div role="radiogroup" aria-label="로고 출처" onKeyDown={onRadioKeys} className="flex flex-col gap-2.5">
          {LOGO_SOURCES.map((s, i) => (
            <SourceRow
              key={s.value}
              selected={upload.logoSource === s.value}
              tabIndex={rovingTab(upload.logoSource === s.value, i === 0, !!upload.logoSource)}
              onClick={() => setUpload({ logoSource: s.value })}
            >
              {s.label}
            </SourceRow>
          ))}
        </div>
        {upload.logoSource === "outsourced_transferred" && <Notice>외주로 만든 로고는 저작권 양도 계약서를 확인해 주세요.</Notice>}
        {upload.logoSource === "unknown" && <Notice>진행은 할 수 있어요. 폰트를 쓰기 전에 로고 권리를 확인해 주세요.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {signIn.inApp && <InAppNotice app={signIn.inApp} />}
        {signIn.problem && <Notice tone="error">{signIn.problem}</Notice>}
        {/* 휴대폰은 안내를 버튼 위에(491:412). 데스크톱은 왼쪽 제목 아래에 있다. */}
        <p className="mt-2 text-13 leading-normal text-text-secondary lg:hidden">
          {loggedOut && LOGIN_NOTE}
          {AFTER_NOTE}
        </p>
      </div>
      <div className="mt-7 flex flex-col items-start gap-2">
        <PrimaryButton block disabled={!ready || submitting || signIn.starting} onClick={() => void submit()}>
          {label}
        </PrimaryButton>
        <TextButton onClick={onBack} disabled={submitting}>
          이전으로
        </TextButton>
      </div>
    </>
  );
}
