"use client";

// 내 폰트 목록 — 11/6 L2 v2(피그마 550:471 데스크톱 · 550:541 모바일), 빈 목록(494:340 · 494:408), 로그인 전(494:371).
// 흰 바탕(A 규칙). 줄마다 1px 먹 선으로 나누고, 줄 하나 = 견본 칸(가게 이름을 그 폰트로) + '폰트 이름 | 상태' + 한 줄 설명 + 그 상태에서 할 일 하나(작은 보조 버튼).
// 상태 글자는 이름보다 작게, 기준선을 맞춘다. 멈춤은 오류색 글자. 만드는 중이면 진행 막대(먹 길 + 민트 채움, DESIGN.md 2-2)와 서버가 준 실제 남은 시간.
// 번호표 스티커는 v2에서 뺐다(screens.md 'L2 다듬기'). 필터는 밑줄 탭, 찾기 칸은 데스크톱에만(피그마 그대로).
// 만드는 중인 폰트가 있으면 3초마다 진행을 새로 받는다(결정을 기다리는 폰트는 받지 않는다).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { PageBand } from "@/components/PageBand";
import { DownloadMenu, isRunning, isWorking } from "@/components/fonts/shared";
import { useGoogleSignIn, InAppNotice } from "@/components/GoogleSignIn";
import { PrimaryButton, PrimaryLink, SecondaryButton, SecondaryLink, TextLink, UnderlineTabs } from "@/components/ds";
import { Notice, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useGeneratedFont } from "@/lib/font";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import type { ProjectPhase, ProjectSummary } from "@/lib/types";

const LEAD = "만든 폰트는 구글 계정에 저장돼서 나만 볼 수 있어요.";
const NEW_FONT_HREF = "/#make";

type Filter = "all" | "done" | "making" | "choosing" | "failed" | "fav";
const FILTERS: { key: Filter; label: (n: number) => ReactNode; test: (f: ProjectSummary) => boolean }[] = [
  { key: "all", label: (n) => `전체 ${n}`, test: () => true },
  { key: "done", label: (n) => `완성 ${n}`, test: (f) => f.phase === "done" },
  // 기준 글자 확인(reviewing)은 드물고 '만드는 중' 흐름 안이라 여기에 넣는다
  { key: "making", label: (n) => `만드는 중 ${n}`, test: (f) => isRunning(f.phase) && f.phase !== "choosing" },
  {
    key: "choosing",
    label: (n) => (
      <>
        <span className="hidden lg:inline">견본 </span>고를 차례 {n}
      </>
    ),
    test: (f) => f.phase === "choosing",
  },
  { key: "failed", label: (n) => `멈춤 ${n}`, test: (f) => f.phase === "failed" },
  { key: "fav", label: (n) => `즐겨찾기 ${n}`, test: (f) => f.favorite },
];

/** '11월 6일' */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 서버 남은 시간 → 글자. 0 이하면 '남은 시간 확인 중'(번호표와 같은 규칙). 값이 없으면 빈 글자. */
function remainingText(seconds: number | null): string {
  if (seconds == null) return "";
  if (!Number.isFinite(seconds) || seconds <= 0) return "남은 시간 확인 중";
  return `약 ${Math.ceil(seconds / 60)}분 남았어요`;
}

export function FontList() {
  const [fonts, setFonts] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    api
      .listProjects()
      .then((list) => {
        setFonts(list);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return setSignedOut(true);
        setError(errorMessage(err));
      });
  }, []);

  useEffect(load, [load]);
  const running = !!fonts?.some((f) => isWorking(f.phase)); // 결정을 기다리는 폰트는 새로 받지 않는다(11/4)
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);

  const shown = useMemo(() => {
    if (!fonts) return [];
    const q = query.trim();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return fonts.filter((f) => test(f) && (!q || `${f.name} ${f.storeName} ${f.desiredFeel}`.includes(q)));
  }, [fonts, filter, query]);

  if (signedOut) return <SignedOut />;

  if (!fonts) {
    return (
      <>
        <PageBand title="내 폰트" lead={LEAD} />
        <div className="mx-auto w-full max-w-page px-4 py-10 lg:px-10">
          {error ? <Notice tone="error">내 폰트를 불러오지 못했어요: {error}</Notice> : <Spinner label="불러오는 중" />}
        </div>
      </>
    );
  }

  if (fonts.length === 0) return <Empty />;

  // 즐겨찾기 탭은 즐겨찾기한 폰트가 있을 때만(피그마 v2에는 없는 탭)
  const tabs = FILTERS.filter((f) => f.key !== "fav" || fonts.some(f.test)).map((f) => ({
    value: f.key,
    label: f.label(fonts.filter(f.test).length),
  }));

  return (
    <>
      <PageBand title="내 폰트" lead={LEAD} action={<PrimaryLink href={NEW_FONT_HREF}>새 폰트 만들기</PrimaryLink>}>
        <div className="mt-8 flex items-center justify-between gap-6 lg:mt-12">
          <UnderlineTabs
            tabs={tabs}
            value={filter}
            onChange={setFilter}
            label="상태로 거르기"
            hasPanels={false}
            className="gap-x-5! text-15 lg:gap-x-8! [&_[role=tab]]:text-15 lg:[&_[role=tab]]:text-base"
          />
          <label className="relative hidden w-[17.5rem] shrink-0 lg:block">
            <span className="sr-only">폰트 찾기</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="폰트 이름 · 가게 이름 찾기"
              className="h-11 w-full rounded-full border-[1.5px] border-border-strong bg-bg-canvas px-[1.125rem] text-sm font-medium outline-none placeholder:text-text-secondary hover:border-border-active focus:border-2 focus:border-border-active"
            />
          </label>
        </div>
      </PageBand>

      <div className="mx-auto flex w-full max-w-page flex-col px-4 pt-5 pb-16 lg:px-10 lg:pt-6 lg:pb-24">
        {error && (
          <div className="mb-4">
            <Notice tone="warn">진행 상황을 새로 받지 못했어요: {error}</Notice>
          </div>
        )}
        <ul aria-label="내 폰트" className="border-t border-border-active">
          {shown.length === 0 ? (
            <li className="border-b border-border-active py-10 text-15 text-text-secondary">찾는 폰트가 없어요.</li>
          ) : (
            shown.map((f) => <FontRow key={f.id} font={f} onChanged={load} />)
          )}
        </ul>
        {/* 휴대폰: 새 폰트 만들기는 목록 맨 아래 폭 전체(피그마 550:541) */}
        <PrimaryLink href={NEW_FONT_HREF} block className="mt-7 lg:hidden">
          새 폰트 만들기
        </PrimaryLink>
      </div>
    </>
  );
}

/* ---------- 줄 하나 ---------- */

const STATUS: Record<ProjectPhase, { label: string; tone: "quiet" | "turn" | "error" }> = {
  done: { label: "완성", tone: "quiet" },
  analyzing: { label: "로고 읽는 중", tone: "quiet" },
  drawing: { label: "만드는 중", tone: "quiet" },
  building: { label: "만드는 중", tone: "quiet" },
  choosing: { label: "견본 고를 차례", tone: "turn" },
  reviewing: { label: "기준 글자 확인할 차례", tone: "turn" },
  failed: { label: "멈춤", tone: "error" },
};

function describe(font: ProjectSummary): string {
  const p = font.progress;
  switch (font.phase) {
    case "done":
      // 피그마 550:471: '느낌 · 날짜 완성'. 11/6 밤: 글자 수는 쓰지 않는다 — 느낌 이름이 없는 예전 작업은 '11월 6일 완성'만.
      return [font.feelName, `${shortDate(font.createdAt)} 완성`].filter(Boolean).join(" · ");
    case "analyzing":
      return "로고와 가게 이야기를 읽고 있어요";
    case "choosing":
      return "가게 이름 견본 세 가지 중 하나를 골라 주세요";
    case "reviewing":
      return "기준 글자 30자를 그렸어요 · 보고 정해 주세요";
    case "drawing":
    case "building": {
      // 11/6 밤: 그리는 중에는 아래 진행 막대가 그린 양을 보여 주므로 '글자 n / 2,432자'를 겹쳐 쓰지 않는다(숫자는 막대의 aria-valuetext로).
      // 막대가 없는 때(다 그렸거나 아직 시작 전)만 상태 문장을 둔다. 남은 시간은 늘 둔다.
      const count = !p ? "글자를 그리기 시작했어요" : p.done < p.total ? "" : "글자를 다 그렸어요 · 파일을 만들고 검사하는 중";
      return [font.feelName, count, remainingText(font.remainingSeconds)].filter(Boolean).join(" · ") || "글자를 그리고 있어요";
    }
    case "failed":
      return p && p.done > 0 ? "글자를 그리다 멈췄어요 · 그린 글자는 남아 있어요" : font.error || "만들다가 멈췄어요";
  }
}

function FontRow({ font, onChanged }: { font: ProjectSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const { state, fontFamily } = useGeneratedFont(font.phase === "done" ? font.fontId : null);
  const href = `/fonts/${font.id}`;
  const status = STATUS[font.phase];
  const drawing = (font.phase === "drawing" || font.phase === "building") && font.progress && font.progress.done < font.progress.total;
  const error = status.tone === "error";

  function resume() {
    setBusy(true);
    setResumeError(null);
    api
      .rebuildProject(font.id)
      .then(onChanged)
      .catch((err) => setResumeError(`다시 시작하지 못했어요: ${errorMessage(err)}`))
      .finally(() => setBusy(false));
  }

  const action =
    font.phase === "done" && font.fontId ? (
      <DownloadMenu fontId={font.fontId} fontName={font.name} align="right" loadRecord={async () => (await api.getProject(font.id)).record} />
    ) : font.phase === "failed" ? (
      <SecondaryButton size="sm" disabled={busy} onClick={resume}>
        {busy ? "다시 시작하는 중" : "이어서 만들기"}
      </SecondaryButton>
    ) : (
      <SecondaryLink size="sm" href={href}>
        {font.phase === "choosing" ? "느낌 고르기" : font.phase === "reviewing" ? "기준 글자 확인" : "진행 보기"}
      </SecondaryLink>
    );

  // 완성 폰트는 그 폰트로, 아직이면 기본 고딕으로 가게 이름을 그린다. 폰트를 받기 전에는 글자를 숨겨 기본 글꼴이 번쩍이지 않게.
  const sampleFont = font.phase === "done" ? (fontFamily ?? GLYPH_FONT_STACK) : GLYPH_FONT_STACK;
  const hideSample = font.phase === "done" && state === "loading";

  return (
    <li className="grid grid-cols-1 gap-x-8 border-b border-border-active pt-5 pb-10 lg:grid-cols-[18.75rem_minmax(0,1fr)_auto] lg:items-center lg:py-6">
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="flex h-[6.5rem] items-center justify-center overflow-hidden rounded-2xl bg-bg-surface-strong px-4 lg:h-28"
      >
        <span
          className={`truncate text-[2.5rem] leading-[1.25] text-text-primary lg:text-[2.75rem] ${hideSample ? "invisible" : ""}`}
          style={{ fontFamily: sampleFont }}
        >
          {font.storeName}
        </span>
      </Link>
      <div className="flex min-w-0 flex-col px-2 pt-4 lg:px-0 lg:pt-0">
        <h2 className="flex min-w-0 items-baseline gap-2.5">
          <Link href={href} className="min-w-0 truncate text-17 font-bold hover:underline lg:text-xl">
            {font.name}
          </Link>
          {/* '|' 구분선(1.5 × 13, border/strong) + 작은 상태 글자. 기준선은 이름과 같다. */}
          <span aria-hidden className="h-3 w-[1.5px] shrink-0 self-center bg-border-strong lg:h-[0.8125rem]" />
          <span
            className={`shrink-0 text-sm lg:text-15 ${
              error ? "font-bold text-text-error" : status.tone === "turn" ? "font-bold text-text-primary" : "font-medium text-text-secondary"
            }`}
          >
            <span className="sr-only">상태: </span>
            {status.label}
          </span>
        </h2>
        <p className={`mt-1 text-sm leading-normal lg:mt-1.5 lg:text-15 ${error ? "text-text-error" : "text-text-secondary"}`}>{describe(font)}</p>
        {drawing && font.progress && (
          <div
            role="progressbar"
            aria-label={`${font.name} 그린 글자`}
            aria-valuemin={0}
            aria-valuemax={font.progress.total}
            aria-valuenow={font.progress.done}
            aria-valuetext={`글자 ${font.progress.done.toLocaleString()} / ${font.progress.total.toLocaleString()}자`}
            className="mt-3 h-3 w-full overflow-hidden rounded-full bg-bg-inverse p-0.5 lg:w-[22.5rem]"
          >
            <div
              className="h-full origin-left rounded-full bg-bg-brand transition-transform duration-(--dur-move) ease-standard"
              style={{ transform: `scaleX(${font.progress.done / Math.max(1, font.progress.total)})` }}
            />
          </div>
        )}
        {resumeError && (
          <p role="alert" className="mt-2 text-13 font-semibold text-text-error">
            {resumeError}
          </p>
        )}
      </div>
      <div className="mt-4 px-2 lg:mt-0 lg:px-0">{action}</div>
    </li>
  );
}

/* ---------- 빈 목록 ---------- */

function Empty() {
  return (
    <>
      <PageBand title="내 폰트" lead={LEAD} />
      <div className="mx-auto flex w-full max-w-page flex-col px-4 pt-6 pb-16 lg:px-10 lg:pt-[3.25rem] lg:pb-24">
        {/* 만든 폰트가 쌓일 자리를 목록 줄과 같은 먹 선 사이에 미리 보여 준다(점선 견본 칸 + 빈 줄 두 개) */}
        <div aria-hidden className="flex items-center gap-5 border-y border-border-active py-5">
          <div className="grid h-14 w-[9.375rem] shrink-0 place-items-center rounded-[0.875rem] border-[1.5px] border-dashed border-border-strong text-15 font-medium text-text-tertiary lg:h-[6.9375rem] lg:w-[18.75rem] lg:rounded-xl">
            가게 이름
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <span className="h-3.5 w-[7.5rem] max-w-full rounded-full bg-bg-surface-strong lg:w-[12.5rem]" />
            <span className="h-2.5 w-[10.625rem] max-w-full rounded-full bg-bg-surface-strong lg:w-[18.75rem]" />
          </div>
        </div>
        <h2 className="mt-9 font-display text-[1.625rem] leading-[1.25] font-normal tracking-[-0.03em] lg:mt-12 lg:text-[2rem]">아직 만든 폰트가 없어요</h2>
        <div className="mt-3 max-w-[47.5rem] text-15 leading-[1.6] lg:text-17">
          <p>
            로고 한 장으로 첫 폰트를 만들어 보세요. <br className="lg:hidden" />
            만든 폰트는 위처럼 한 줄씩 쌓여요.
          </p>
          <p className="hidden lg:block">질문에 답하고 견본을 고르면, 느낌을 고른 뒤 12~17분이면 폰트가 나와요.</p>
        </div>
        <div className="mt-6 lg:mt-8">
          <PrimaryLink href={NEW_FONT_HREF} block className="lg:w-auto">
            새 폰트 만들기
          </PrimaryLink>
        </div>
      </div>
    </>
  );
}

/* ---------- 로그인 전 ---------- */

function SignedOut() {
  const { start, starting, problem, inApp } = useGoogleSignIn();
  return (
    <>
      <PageBand title="내 폰트" lead={LEAD} />
      <div className="mx-auto flex w-full max-w-page flex-col px-4 pt-6 pb-16 lg:px-10 lg:pt-[3.25rem] lg:pb-24">
        <section aria-labelledby="signin-title" className="flex flex-col border-y border-border-active pt-9 pb-10 lg:pt-12 lg:pb-11">
          <h2 id="signin-title" className="font-display text-[1.625rem] leading-[1.25] font-normal tracking-[-0.03em] lg:text-[2rem]">
            로그인하면 내 폰트가 보여요
          </h2>
          <p className="mt-3 max-w-[47.5rem] text-15 leading-[1.6] lg:text-17">로그인한 뒤 만든 폰트를 이어서 볼 수 있어요. 만들던 폰트도 그대로 있어요.</p>
          <div className="mt-6 flex flex-col items-start gap-x-6 gap-y-2 sm:flex-row sm:items-center lg:mt-8">
            <PrimaryButton disabled={starting} onClick={() => void start("/fonts")}>
              {starting ? "로그인하는 중" : "Google로 로그인"}
            </PrimaryButton>
            <TextLink href={NEW_FONT_HREF}>처음이라면 새 폰트 만들기</TextLink>
          </div>
          {(inApp || problem) && (
            <div className="mt-4 max-w-[30rem]">{inApp ? <InAppNotice app={inApp} /> : <Notice tone="error">{problem}</Notice>}</div>
          )}
        </section>
      </div>
    </>
  );
}
