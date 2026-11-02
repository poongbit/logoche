"use client";

// 새 폰트 만들기(11/2 B안, YoFont '폰트 만들기' 한 페이지 입력을 따름). 예전 화면 1~2의 입력을 한 화면에 모았다.
// 로고 · 가게 이름 · 원하는 느낌(프롬프트 자리) · 업종과 분위기(접힘, 고르지 않으면 AI가 로고에서 읽은 톤) · 그리기 수준 · 권리 확인.
// '폰트 만들기'를 누르면 서버가 로고 읽기부터 폰트 파일까지 이어서 돌리고(lib/server/projects.ts), 이 폰트의 화면(/fonts/[id])으로 간다.
// 숫자·문장부호 30자는 늘 함께 그린다(11/2 사용자 결정). 화면 2의 견본 고르기는 없다(표현 방식은 AI가 낸 첫 안).
// 입력은 탭 단위로 저장해 새로 고침해도 남는다(lib/newDraft.ts). 메인 첫 칸에서 넘어오면 거기서 채운 값으로 시작한다.
// 11/2 구글 로그인: 입력은 로그인 없이 하고, 로그인 전이면 버튼이 '로그인하고 폰트 만들기'가 된다. 구글에 다녀오면 /new?continue=1로
// 돌아와 저장해 둔 입력으로 바로 만들기 시작한다(입력이 다 차 있을 때만).

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@/components/AppHeader";
import { InAppNotice, useGoogleSignIn } from "@/components/GoogleSignIn";
import { Chip, Missing, Notice, RadioRow, Spinner, TextField, onRadioKeys, rovingTab } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { ACCEPTED_LOGO_TYPES, BRAND_TONES, EXTRA_CHARS, INDUSTRIES, LOGO_FONTS, LOGO_SOURCES, SAMPLE_LOGOS, USAGE_CONTEXTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { QUALITIES, clearDraft, loadDraft, logoFromFile, logoFromSample, saveDraft, type NewDraft } from "@/lib/newDraft";
import { isImitationRequest } from "@/lib/rules";
import type { BrandTone, UploadInput, UsageContext } from "@/lib/types";

const IDEAS = ["둥글고 귀여운", "굵고 힘 있는", "단정한 손글씨", "레트로 간판", "붓으로 쓴 듯한"];
const labelOf = <T extends string>(list: { value: T; label: string }[], value: T | null) => list.find((x) => x.value === value)?.label ?? "";

const noSubscribe = () => () => {};

export default function NewFontPage() {
  // 저장해 둔 입력은 브라우저에서만 읽을 수 있다. 서버에서 그릴 때는 불러오는 중으로 둔다.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className="mx-auto w-full max-w-[90rem] px-5 py-10 lg:px-10">
        <Spinner label="불러오는 중" />
      </div>
    );
  }
  return <NewFontForm />;
}

function NewFontForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<NewDraft>(loadDraft);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signIn = useGoogleSignIn();
  const continued = useRef(false);

  useEffect(() => saveDraft(draft), [draft]);

  const u = draft.upload;
  const setUpload = (patch: Partial<UploadInput>) => setDraft((d) => ({ ...d, upload: { ...d.upload, ...patch } }));
  const feelRejected = isImitationRequest(u.desiredFeel);
  const recommendedTones = INDUSTRIES.find((i) => i.value === u.industry)?.tones ?? [];
  const missing = [
    !u.logoImage && "로고",
    !u.storeName.trim() && "가게 이름",
    feelRejected && "원하는 느낌 고치기",
    !u.logoSource && "로고 권리",
    !u.logoFont && "로고 글자",
  ].filter((x): x is string => !!x);
  const moreSummary = [
    labelOf(INDUSTRIES, u.industry),
    u.brandTones.map((t) => labelOf(BRAND_TONES, t)).join(" · "),
    u.usageContexts.map((x) => labelOf(USAGE_CONTEXTS, x)).join(" · "),
  ]
    .filter(Boolean)
    .join(" · ");

  async function acceptFile(file: File) {
    const result = await logoFromFile(file);
    if ("error" in result) return setFileError(result.error);
    setFileError(null);
    setUpload(result.patch);
  }

  async function pickSample(sample: (typeof SAMPLE_LOGOS)[number]) {
    const patch = await logoFromSample(sample);
    setFileError(null);
    setUpload(patch);
  }

  function toggleTone(tone: BrandTone) {
    setUpload({ brandTones: u.brandTones.includes(tone) ? u.brandTones.filter((t) => t !== tone) : [...u.brandTones, tone] });
  }

  function toggleUsage(usage: UsageContext) {
    setUpload({ usageContexts: u.usageContexts.includes(usage) ? u.usageContexts.filter((x) => x !== usage) : [...u.usageContexts, usage] });
  }

  function addIdea(idea: string) {
    const feel = u.desiredFeel.trim();
    setUpload({ desiredFeel: feel ? `${feel}, ${idea}` : idea });
  }

  async function submit() {
    if (missing.length || submitting || sessionPending) return;
    if (!session) {
      saveDraft(draft);
      return signIn.start("/new?continue=1");
    }
    await create();
  }

  async function create() {
    setSubmitting(true);
    setError(null);
    try {
      const { id } = await api.createProject({ upload: u, quality: draft.quality });
      clearDraft();
      router.push(`/fonts/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  // 구글에서 돌아왔으면(?continue=1) 한 번만 이어서 만든다. 새로 고침해도 다시 만들지 않게 주소에서 표시를 지운다.
  useEffect(() => {
    if (continued.current || new URLSearchParams(location.search).get("continue") !== "1") return;
    continued.current = true;
    router.replace("/new");
    void authClient.getSession().then(({ data }) => {
      if (data && missing.length === 0) void create();
    });
  });

  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-5 pt-8 pb-16 lg:px-10 lg:pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-28 font-extrabold lg:text-32">새 폰트 만들기</h1>
        <p className="text-17 font-medium text-muted">로고 한 장과 원하는 느낌만 있으면 돼요.</p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <Section title="로고">
            <div
              role="button"
              tabIndex={0}
              aria-label={u.logoImage ? "다른 로고 파일로 바꾸기" : "로고 파일 올리기"}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault(); // 스페이스로 화면이 내려가지 않게
                inputRef.current?.click();
              }}
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
              className={`flex cursor-pointer items-center gap-5 rounded-[1.25rem] border-2 border-dashed p-4 transition-colors ${
                dragging ? "border-ink bg-subtle" : u.logoImage ? "border-line hover:border-ink" : "border-edge-stage bg-stage hover:border-ink"
              }`}
            >
              {u.logoImage ? (
                <>
                  <span className="grid h-24 w-48 shrink-0 place-items-center rounded-[0.875rem] bg-stage">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL */}
                    <img src={u.logoImage} alt="올린 로고" className="max-h-20 max-w-40 object-contain" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-15 font-bold">
                      {u.inputPath === "sample" ? `샘플 · ${SAMPLE_LOGOS.find((s) => s.id === u.sampleId)?.name ?? ""}` : u.logoFileName}
                    </span>
                    <span className="text-13 text-muted">로고 글자는 그대로 쓰지 않고, 느낌만 참고해요</span>
                  </span>
                  <span className="ml-auto hidden shrink-0 rounded-full border-[1.5px] border-edge px-4 py-2 text-15 font-bold sm:inline">바꾸기</span>
                </>
              ) : (
                <span className="flex w-full flex-col items-center gap-2 py-8 text-center">
                  <PlusIcon className="h-6 w-6" />
                  <span className="text-17 font-bold">로고 파일 올리기</span>
                  <span className="text-13 font-medium text-muted">끌어다 놓거나 눌러서 고르기 · PNG·SVG·JPG, 10MB 이하</span>
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-15 font-bold text-muted">샘플 로고로 해 보기</span>
              {SAMPLE_LOGOS.map((sample) => (
                <Chip key={sample.id} selected={u.sampleId === sample.id} onClick={() => void pickSample(sample)}>
                  {sample.name}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="가게 이름" htmlFor="store">
            <TextField id="store" value={u.storeName} onChange={(e) => setUpload({ storeName: e.target.value })} placeholder="예: 달콤한집" className="max-w-[26rem]" />
            <p className="text-13 text-muted">가게 이름부터 먼저 그려요. 폰트 이름은 다 만든 뒤 바꿀 수 있어요.</p>
          </Section>

          <Section title="원하는 느낌" htmlFor="feel" note="비워도 돼요">
            <textarea
              id="feel"
              value={u.desiredFeel}
              onChange={(e) => setUpload({ desiredFeel: e.target.value })}
              placeholder="예: 따뜻하고 손맛 있는 분식집 간판 글씨"
              rows={3}
              className="w-full resize-y rounded-[1.25rem] border-[1.5px] border-edge bg-bg px-5 py-4 text-18 leading-normal font-semibold outline-none placeholder:font-medium placeholder:text-muted hover:border-ink focus:border-2 focus:border-ink"
            />
            <div className="flex flex-wrap gap-2">
              {IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => addIdea(idea)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border-[1.5px] border-edge px-4 text-15 font-semibold transition-colors hover:border-ink hover:bg-subtle"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  {idea}
                </button>
              ))}
            </div>
            {feelRejected ? (
              <Notice tone="error">특정 폰트(○○체, ○○폰트 등)를 따라 하는 요청은 받지 않아요. &quot;둥글고 통통한&quot;처럼 원하는 모양을 말로 적어 주세요.</Notice>
            ) : (
              <p className="text-13 text-muted">&quot;○○체처럼&quot; 같은 다른 폰트 이름은 빼고 써 주세요.</p>
            )}
          </Section>

          <section className="rounded-[1.25rem] border border-line bg-bg">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex min-h-[3.75rem] w-full items-center gap-4 px-5 text-left"
            >
              <span className="shrink-0 text-17 font-extrabold">업종과 분위기</span>
              <span className="min-w-0 truncate text-15 text-muted">{moreSummary || "고르면 더 잘 맞아요 (선택)"}</span>
              <svg aria-hidden viewBox="0 0 16 16" className={`ml-auto h-4 w-4 shrink-0 transition-transform ${moreOpen ? "rotate-180" : ""}`}>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {moreOpen && (
              <div className="flex flex-col gap-6 border-t border-line p-5">
                <Group label="업종">
                  {INDUSTRIES.map((i) => (
                    <Chip key={i.value} selected={u.industry === i.value} onClick={() => setUpload({ industry: u.industry === i.value ? null : i.value })}>
                      {i.label}
                    </Chip>
                  ))}
                </Group>
                <Group label="브랜드 톤" note={`3개까지 · 고르지 않으면 로고에서 읽어요`}>
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
                </Group>
                <Group label="주로 쓸 곳" note="간판·메뉴판을 고르면 멀리서도 읽히게 굵기를 지켜요">
                  {USAGE_CONTEXTS.map((x) => (
                    <Chip key={x.value} selected={u.usageContexts.includes(x.value)} onClick={() => toggleUsage(x.value)}>
                      {x.label}
                    </Chip>
                  ))}
                </Group>
              </div>
            )}
          </section>

          <Section title="그리기 수준">
            <div role="radiogroup" aria-label="그리기 수준" onKeyDown={onRadioKeys} className="grid gap-3 sm:grid-cols-2">
              {QUALITIES.map((q) => (
                <RadioRow
                  key={q.value}
                  large
                  selected={draft.quality === q.value}
                  tabIndex={rovingTab(draft.quality === q.value, false, true)}
                  onClick={() => setDraft({ ...draft, quality: q.value })}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="font-extrabold">{q.label}</span>
                    <span className="text-13 font-medium text-muted">{q.note}</span>
                  </span>
                </RadioRow>
              ))}
            </div>
          </Section>

          <Section title="권리 확인">
            <div className="grid gap-6 xl:grid-cols-2">
              <Group label="이 로고의 권리가 나에게 있나요?" column radio>
                {LOGO_SOURCES.map((s, i) => (
                  <RadioRow
                    key={s.value}
                    selected={u.logoSource === s.value}
                    tabIndex={rovingTab(u.logoSource === s.value, i === 0, !!u.logoSource)}
                    onClick={() => setUpload({ logoSource: s.value })}
                  >
                    {s.label}
                  </RadioRow>
                ))}
                {u.logoSource === "outsourced_transferred" && <p className="text-15 font-medium">외주로 만든 로고는 저작권 양도 계약서를 확인해 주세요.</p>}
                {u.logoSource === "unknown" && <p className="text-15 font-medium">진행은 할 수 있어요. 폰트를 쓰기 전에 로고 권리를 확인해 주세요.</p>}
              </Group>
              <Group label="로고 글자는 어떻게 만들었나요?" column radio>
                {LOGO_FONTS.map((f, i) => (
                  <RadioRow
                    key={f.value}
                    selected={u.logoFont === f.value}
                    tabIndex={rovingTab(u.logoFont === f.value, i === 0, !!u.logoFont)}
                    onClick={() => setUpload({ logoFont: f.value })}
                  >
                    {f.label}
                  </RadioRow>
                ))}
                {(u.logoFont === "free_font" || u.logoFont === "commercial_font") && (
                  <TextField
                    value={u.logoFontName}
                    onChange={(e) => setUpload({ logoFontName: e.target.value })}
                    placeholder="폰트 이름(알면) · 예: G마켓 산스"
                    aria-label="로고에 쓴 폰트 이름"
                  />
                )}
                {u.logoFont === "free_font" && <p className="text-15 font-medium">무료 폰트도 로고에 써도 되는지는 폰트마다 달라요. 그 폰트의 라이선스를 한 번 확인해 주세요.</p>}
                {u.logoFont === "commercial_font" && (
                  <p className="text-15 font-medium">로고에 쓴 상용 폰트의 라이선스는 직접 확인해 주세요. 로고체는 무료 폰트와만 닮았는지 검사해요.</p>
                )}
                {u.logoFont === "unknown" && <p className="text-15 font-medium">로고를 만든 분께 어떤 폰트를 썼는지 물어봐 주세요.</p>}
              </Group>
            </div>
          </Section>
        </div>

        <aside className="flex flex-col gap-5 rounded-[1.25rem] border border-line bg-bg p-6 lg:sticky lg:top-6 lg:w-[22rem] lg:shrink-0">
          <h2 className="text-19 font-extrabold">만들 폰트</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-15">
            <dt className="text-muted">그릴 글자</dt>
            <dd className="text-right font-bold">
              한글 {KSX1001_HANGUL.size.toLocaleString()}자 + 숫자·부호 {EXTRA_CHARS.length}자
            </dd>
            <dt className="text-muted">그리기 수준</dt>
            <dd className="text-right font-bold">{QUALITIES.find((q) => q.value === draft.quality)?.label}</dd>
            <dt className="text-muted">걸리는 시간</dt>
            <dd className="text-right font-bold">약 5분</dd>
          </dl>
          {missing.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {missing.map((m) => (
                <Missing key={m}>{m}</Missing>
              ))}
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {signIn.inApp && <InAppNotice app={signIn.inApp} />}
          {signIn.problem && <Notice tone="error">{signIn.problem}</Notice>}
          <button
            type="button"
            disabled={missing.length > 0 || submitting || sessionPending || signIn.starting}
            onClick={submit}
            className="flex h-14 items-center justify-center gap-2.5 rounded-full bg-ink text-17 font-bold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            {submitting && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />}
            {submitting ? "시작하는 중" : signIn.starting ? "구글로 가는 중" : session || sessionPending ? "폰트 만들기" : "로그인하고 폰트 만들기"}
          </button>
          <ul className="flex flex-col gap-2 text-13 leading-normal text-muted">
            {!session && !sessionPending && <li>Google 계정으로 로그인하면 바로 만들기 시작해요. 만든 폰트는 내 계정에만 저장돼요.</li>}
            <li>참고 글자 30자가 나오면 한 번 보여 드려요. 마음에 안 드는 글자는 그때 다시 그려요.</li>
            <li>만드는 동안 창을 닫아도 돼요. 내 폰트에서 이어서 볼 수 있어요.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, htmlFor, note, children }: { title: string; htmlFor?: string; note?: string; children: ReactNode }) {
  const Title = htmlFor ? "label" : "h2";
  return (
    <section className="flex flex-col gap-3">
      <Title {...(htmlFor ? { htmlFor } : {})} className="flex items-baseline gap-2 text-17 font-extrabold">
        {title}
        {note && <span className="text-13 font-medium text-muted">{note}</span>}
      </Title>
      {children}
    </section>
  );
}

/** radio: 라디오 행 묶음이면 radiogroup으로 알리고 화살표 키로 옮긴다 */
function Group({ label, note, column, radio, children }: { label: string; note?: string; column?: boolean; radio?: boolean; children: ReactNode }) {
  return (
    <div role={radio ? "radiogroup" : "group"} aria-label={label} onKeyDown={radio ? onRadioKeys : undefined} className="flex flex-col gap-2.5">
      <span className="flex flex-wrap items-baseline gap-x-2 text-15 font-bold">
        {label}
        {note && <span className="text-13 font-medium text-muted">{note}</span>}
      </span>
      <div className={column ? "flex flex-col gap-2" : "flex flex-wrap gap-2"}>{children}</div>
    </div>
  );
}
