"use client";

// 폰트 만들기 질문 페이지(11/4 사용자 결정). 메인에서 로고와 가게 이름만 받고, 나머지는 한 화면에 한 가지씩 묻는다.
// 업종(목록을 스크롤해 고르거나 직접 입력) → 사업 내용 → 글씨 속성 네 쌍 → 로고 권리. 건너뛰기는 없다: 정해야 다음 단추가 켜진다.
// 입력은 lib/newDraft.ts에 저장해 새로 고침하거나 구글에 다녀와도 남는다. 로고 권리 단계에서 로그인하고 서버에 작업을 만든다.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { InAppNotice, useGoogleSignIn } from "@/components/GoogleSignIn";
import { Steps } from "@/components/fonts/Making";
import { Notice, RadioRow, TextField, onRadioKeys, rovingTab } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { ATTRIBUTE_PAIRS, INDUSTRIES, INDUSTRY_GROUPS, LOGO_SOURCES } from "@/lib/constants";
import { ATTRIBUTE_GLYPHS } from "@/lib/attributeGlyphs";
import { MAKE_STEPS, firstOpenStep, stepDone, type MakeStep } from "@/lib/makeSteps";
import { clearDraft, loadDraft, saveDraft, type NewDraft } from "@/lib/newDraft";
import { BUSINESS_MIN, DESIRED_FEEL_MAX, INDUSTRY_OTHER_MAX, isImitationRequest } from "@/lib/rules";
import type { StyleAttributes, UploadInput } from "@/lib/types";

const noSubscribe = () => () => {};

const TITLES: Record<MakeStep, { title: string; sub: string }> = {
  industry: { title: "어떤 일을 하세요?", sub: "업종에 맞춰 글자 느낌을 추천해 드려요. 목록에서 고르거나 직접 적어도 돼요." },
  business: { title: "어떤 가게인지 알려 주세요", sub: "사업 내용과 추구하는 가치를 적어 주세요. 글자 느낌을 정하는 데 가장 크게 쓰여요." },
  style: { title: "어떤 글씨가 좋아요?", sub: "마음에 드는 쪽을 누르세요. 네 가지를 모두 골라야 다음으로 갈 수 있어요." },
  rights: { title: "이 로고는 누가 만들었나요?", sub: "로고를 따라 글자를 그리기 때문에 권리를 확인해요." },
};

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
  const ready = stepDone(step, upload);
  const { title, sub } = TITLES[step];

  return (
    <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-7 px-5 pt-8 pb-16 lg:pt-12">
      <Steps current={step === "rights" ? 2 : 1} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">
          {upload.storeName.trim()}
          {step !== "rights" && ` · 느낌 ${index + 1}/3`}
        </span>
        <h1 className="text-26 font-extrabold lg:text-32">{title}</h1>
        <p className="text-17 leading-normal font-medium text-muted">{sub}</p>
      </div>

      {step === "industry" && <IndustryStep upload={upload} setUpload={setUpload} />}
      {step === "business" && <BusinessStep upload={upload} setUpload={setUpload} />}
      {step === "style" && <StyleStep upload={upload} setUpload={setUpload} />}
      {step === "rights" && <RightsStep upload={upload} setUpload={setUpload} onBack={() => prev && go(prev)} onCreated={() => clearDraft()} />}

      {step !== "rights" && (
        <div className="flex items-center justify-between gap-3 pt-2">
          {prev ? (
            <button type="button" onClick={() => go(prev)} className="h-12 rounded-full border-[1.5px] border-edge bg-bg px-6 text-15 font-bold transition-colors hover:border-ink hover:bg-subtle">
              이전
            </button>
          ) : (
            <button type="button" onClick={() => router.push("/")} className="h-12 rounded-full border-[1.5px] border-edge bg-bg px-6 text-15 font-bold transition-colors hover:border-ink hover:bg-subtle">
              처음으로
            </button>
          )}
          <button
            type="button"
            disabled={!ready}
            onClick={() => next && go(next)}
            className="h-12 rounded-full bg-ink px-8 text-15 font-bold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

type StepProps = { upload: UploadInput; setUpload: (patch: Partial<UploadInput>) => void };

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

  return (
    <div className="flex flex-col gap-3">
      <TextField
        aria-label="업종 검색 또는 직접 입력"
        value={query}
        maxLength={INDUSTRY_OTHER_MAX}
        placeholder="업종을 고르거나 직접 입력하세요"
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          const hit = INDUSTRIES.find((i) => i.label === v.trim() && i.value !== "other");
          if (hit) setUpload({ industry: hit.value, industryOther: "" });
          else if (v.trim()) setUpload({ industry: "other", industryOther: v.trim().slice(0, INDUSTRY_OTHER_MAX) });
          else setUpload({ industry: null, industryOther: "" });
        }}
      />
      <div role="listbox" aria-label="업종 목록" className="max-h-[19rem] overflow-y-auto overscroll-contain rounded-2xl border-[1.5px] border-line bg-bg">
        {groups.map((g) => (
          <div key={g.label} role="group" aria-label={g.label}>
            <div className="sticky top-0 z-[1] bg-subtle px-4 py-1.5 text-12 font-bold text-muted">{g.label}</div>
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
                  className={`flex min-h-12 w-full items-center justify-between gap-3 border-t border-line px-4 text-left text-16 transition-colors first:border-t-0 hover:bg-subtle ${on ? "bg-subtle font-bold" : "font-medium"}`}
                >
                  {i.label}
                  {on && <span className="text-13 font-bold text-muted">선택됨</span>}
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
            className={`flex min-h-12 w-full items-center justify-between gap-3 border-t border-line px-4 text-left text-16 hover:bg-subtle ${upload.industry === "other" ? "bg-subtle font-bold" : "font-bold"}`}
          >
            <span className="min-w-0 truncate">&lsquo;{q}&rsquo; 직접 쓰기</span>
            {upload.industry === "other" && <span className="text-13 font-bold text-muted">선택됨</span>}
          </button>
        )}
        {groups.length === 0 && !own && <p className="px-4 py-3 text-15 text-muted">맞는 업종이 없어요. 위 칸에 직접 적어 주세요.</p>}
      </div>
      <p className="text-13 text-muted">목록에 없으면 위 칸에 직접 적으세요. 최대 {INDUSTRY_OTHER_MAX}자예요.</p>
    </div>
  );
}

// ---------- 사업 내용 ----------

function BusinessStep({ upload, setUpload }: StepProps) {
  const rejected = isImitationRequest(upload.desiredFeel);
  const length = upload.desiredFeel.trim().length;
  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="make-feel" className="sr-only">
        사업 내용과 추구하는 가치
      </label>
      <div className={`flex flex-col rounded-[1.25rem] border-2 bg-bg transition-shadow focus-within:shadow-[0_0_0_4px_rgb(17_17_17/0.1)] ${rejected ? "border-bad" : "border-ink"}`}>
        <textarea
          id="make-feel"
          rows={6}
          maxLength={DESIRED_FEEL_MAX}
          value={upload.desiredFeel}
          onChange={(e) => setUpload({ desiredFeel: e.target.value })}
          placeholder="예: 고양이의 우아하고 유연한 곡선과 집사와의 따뜻한 교감, 정직하고 건강한 수제 간식의 가치를 담은 브랜드예요."
          className="w-full resize-none rounded-t-[1.125rem] bg-transparent px-5 pt-4 text-18 leading-normal font-semibold outline-none placeholder:font-medium placeholder:text-muted focus-visible:shadow-none"
        />
        <div className="flex items-center justify-between px-5 pt-2 pb-3.5 font-mono text-13 text-muted">
          <span>{length < BUSINESS_MIN ? `${BUSINESS_MIN}자 이상 적어 주세요` : "좋아요"}</span>
          <span>
            {length}/{DESIRED_FEEL_MAX}
          </span>
        </div>
      </div>
      {rejected && (
        <Notice tone="error">특정 폰트(○○체, ○○폰트 등)를 따라 하는 요청은 받지 않아요. &quot;둥글고 통통한&quot;처럼 원하는 모양을 말로 적어 주세요.</Notice>
      )}
    </div>
  );
}

// ---------- 속성 고르기 ----------

const GLYPH_KEYS: Record<string, string> = { round: "roundEdge", sharp: "sharpEdge", thin: "thin", bold: "bold", even: "even", high: "high", neat: "neat", brush: "brush" };

function GlyphMark({ id }: { id: string }) {
  const g = ATTRIBUTE_GLYPHS[GLYPH_KEYS[id]];
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="h-16 w-16 text-ink">
      <path d={g.d} transform={g.transform} fill="currentColor" />
    </svg>
  );
}

function StyleStep({ upload, setUpload }: StepProps) {
  const a = upload.attributes;
  const pick = (key: keyof StyleAttributes, value: string) => setUpload({ attributes: { ...(a ?? ({} as StyleAttributes)), [key]: value } as StyleAttributes });
  return (
    <div className="flex flex-col gap-5">
      {ATTRIBUTE_PAIRS.map((pair) => (
        <div key={pair.key} role="radiogroup" aria-label={pair.label} onKeyDown={onRadioKeys} className="flex flex-col gap-2">
          <span className="text-15 font-bold">{pair.label}</span>
          <div className="grid grid-cols-2 gap-3">
            {pair.options.map((o, i) => {
              const selected = a?.[pair.key] === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={rovingTab(selected, i === 0, !!a?.[pair.key])}
                  onClick={() => pick(pair.key, o.value)}
                  className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-3 transition-colors ${
                    selected ? "border-2 border-ink bg-subtle" : "border-[1.5px] border-edge bg-bg hover:border-ink hover:bg-subtle"
                  }`}
                >
                  <GlyphMark id={o.value} />
                  <span className={`text-15 ${selected ? "font-extrabold" : "font-semibold"}`}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-13 text-muted">그림은 모양을 설명하는 예시예요. 완성 글자는 로고와 사업 내용을 보고 새로 그려요.</p>
    </div>
  );
}

// ---------- 로고 권리와 만들기 시작 ----------

function RightsStep({ upload, setUpload, onBack, onCreated }: StepProps & { onBack: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session, isPending } = authClient.useSession();
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

  const label = submitting ? "시작하는 중" : signIn.starting ? "구글로 가는 중" : !session && !isPending ? "로그인하고 견본 만들기" : "견본 만들기";

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="로고 출처" onKeyDown={onRadioKeys} className="flex flex-col gap-2.5">
        {LOGO_SOURCES.map((s, i) => (
          <RadioRow key={s.value} large selected={upload.logoSource === s.value} tabIndex={rovingTab(upload.logoSource === s.value, i === 0, !!upload.logoSource)} onClick={() => setUpload({ logoSource: s.value })}>
            {s.label}
          </RadioRow>
        ))}
      </div>
      {upload.logoSource === "outsourced_transferred" && <Notice>외주로 만든 로고는 저작권 양도 계약서를 확인해 주세요.</Notice>}
      {upload.logoSource === "unknown" && <Notice>진행은 할 수 있어요. 폰트를 쓰기 전에 로고 권리를 확인해 주세요.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {signIn.inApp && <InAppNotice app={signIn.inApp} />}
      {signIn.problem && <Notice tone="error">{signIn.problem}</Notice>}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button type="button" onClick={onBack} disabled={submitting} className="h-12 rounded-full border-[1.5px] border-edge bg-bg px-6 text-15 font-bold transition-colors hover:border-ink hover:bg-subtle disabled:opacity-50">
          이전
        </button>
        <button
          type="button"
          disabled={!ready || submitting || signIn.starting}
          onClick={() => void submit()}
          className="h-12 rounded-full bg-ink px-8 text-15 font-bold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
        >
          {label}
        </button>
      </div>
      <p className="text-13 leading-normal text-muted">
        {!session && !isPending && "Google 계정으로 로그인하면 바로 시작해요. "}로고를 읽고 느낌 세 가지를 보여 드려요. 창을 닫아도 서버가 기다리고 메일로 알려 드려요.
      </p>
    </div>
  );
}

