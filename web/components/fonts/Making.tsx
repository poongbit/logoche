"use client";

// 만드는 중 화면(11/6 피그마 17 '추천 조합 v2' S1~S4 · 모바일 471:1021 · 남은 상태, 20 '로고 읽는 중' 466:128).
// 바탕 A 규칙: 서버가 일하는 동안이라 위쪽은 큰 민트 면, 아래 진행 내용은 흰 바탕. 만드는 중에는 할 일이 없어서 주 버튼을 두지 않는다.
// 단계: 로고 읽기(Analyzing) → 기준 글자 30자(S1) → 나머지 글자(S2) → 폰트 파일 만들기(S3 앞) → 파일 검사(S3·S4). 차례 기다림·빠진 글자 다시 그리기도 같은 틀.
// 막대·퍼센트는 그린 글자 수만 뜻하고(DESIGN 2-2 먹 길 + 민트 채움), 다 그린 뒤에는 막대 대신 체크 + 단계 줄을 둔다.

import { useState } from "react";
import { CheckCircle, CheckMark, DisplayTitle, PrimaryButton, Receipt, SecondaryButton, SecondaryLink, TextButton, TextLink, Ticket, ticketTime } from "@/components/ds";
import { GLYPH_TOTAL, GlyphTile, PendingTile, ProgressBar, agoText, useCountdown, useLastDrawnAt, useNow } from "@/components/fonts/MakingMeter";
import { InlineConfirm } from "@/components/InlineConfirm";
import { CheckIcon, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { CHECKS } from "@/lib/constants";
import type { CheckKey, ProjectView } from "@/lib/types";

// 11/4: 입력 질문 단계(가게·느낌·권리)까지 한 줄로 이어 보이게 다섯 단계로 합쳤다. 로고 읽기·견본 고르기는 견본, 30자·나머지·파일은 만들기다.
export const STEPS = ["가게", "스타일", "권리", "견본", "만들기"];

/** 단계 줄. 데스크톱은 알약 줄, 휴대폰은 'n/5 이름' + 다섯 칸 막대(피그마 453:148). 화면 읽기는 두 경우 모두 목록을 읽는다. */
export function Steps({ current }: { current: number }) {
  return (
    <>
      <div aria-hidden className="flex flex-col gap-2 lg:hidden">
        <span className="text-13 font-bold text-text-secondary">
          {Math.min(current + 1, STEPS.length)}/{STEPS.length} <span className="text-text-primary">{STEPS[Math.min(current, STEPS.length - 1)]}</span>
        </span>
        <span className="grid grid-cols-5 gap-1">
          {STEPS.map((label, i) => (
            <span key={label} className={`h-1 rounded-full ${i <= current ? "bg-bg-inverse" : "bg-bg-track"}`} />
          ))}
        </span>
      </div>
      <ol aria-label="만드는 단계" className="flex flex-wrap items-center gap-2 text-13 font-bold max-lg:sr-only">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i === current ? (
              <span aria-current="step" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-bg-brand pr-3.5 pl-1.5 text-text-on-brand">
                <span aria-hidden className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full border-2 border-text-on-brand text-12">
                  {i + 1}
                </span>
                {label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-text-secondary">
                {i < current ? (
                  <span aria-hidden className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full bg-bg-surface-strong text-text-primary">
                    <CheckIcon />
                  </span>
                ) : (
                  <span aria-hidden className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full border-2 border-border-strong text-12">
                    {i + 1}
                  </span>
                )}
                {label}
              </span>
            )}
            {i < STEPS.length - 1 && <span aria-hidden className={`h-0.5 w-6 ${i < current ? "bg-bg-inverse" : "bg-bg-track"}`} />}
          </li>
        ))}
      </ol>
    </>
  );
}

/* ---------- 공용 조각 ---------- */

/** 완성 알림 받을 곳 한 문장. 메일을 끈 작업이면 메일 말을 하지 않는다. */
export function useMailLine(view: ProjectView, done = "다 되면") {
  const { data } = authClient.useSession();
  if (view.upload.notifyByEmail === false) return "내 폰트에서 이어서 볼 수 있어요.";
  const email = data?.user.email;
  return email ? `${done} ${email}으로 알려 드려요.` : `${done} 메일로 알려 드려요.`;
}

/** 큰 제목(Black Han Sans). 두 줄로 끊어 쓴다(피그마 그대로). */
function HeroTitle({ lines }: { lines: [string, string] }) {
  return (
    <DisplayTitle className="text-[2.5rem] lg:text-[4rem]">
      <span aria-live="polite">
        {lines[0]}
        <br />
        {lines[1]}
      </span>
    </DisplayTitle>
  );
}

/** 아래 흰 바탕 묶음 머리: '진행' 작은 이름표 + 제목(Black Han Sans) + 설명 */
function SectionHead({ kicker, title, size = "lg", desc, aside }: { kicker?: string; title: string; size?: "lg" | "md"; desc?: string | null; aside?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {kicker && <span className="text-13 font-bold text-text-secondary">{kicker}</span>}
      <DisplayTitle as="h2" className={size === "lg" ? "text-[1.75rem] lg:text-[2.75rem]" : "text-[1.5rem] lg:text-[2rem]"}>
        {title}
      </DisplayTitle>
      {(desc || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          {desc && <p className="text-15 leading-normal font-medium text-text-secondary lg:text-17">{desc}</p>}
          {aside && <span className="text-17 font-extrabold tabular-nums">{aside}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- 로고 읽는 중 ---------- */

/** 로고 읽는 중(466:128 · 466:177): 민트 면 + 접수증 안에 올린 로고와 '지금 하는 일' 두 줄. 서버의 analyzing은 AI 호출 한 번이라 단계·시간을 쓰지 않는다. */
function Analyzing({ view }: { view: ProjectView }) {
  return (
    <div className="flex flex-1 flex-col bg-bg-brand">
      <div className="mx-auto grid w-full max-w-page gap-8 px-5 pt-8 pb-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,33.5rem)] lg:gap-12 lg:px-10 lg:pt-20 lg:pb-24">
        <div className="flex flex-col">
          <span className="text-15 font-bold">접수 완료 · {view.storeName}</span>
          <div className="mt-3 lg:mt-4">
            <HeroTitle lines={["로고를", "읽고 있어요"]} />
          </div>
          <p className="mt-3 text-15 leading-normal font-medium lg:mt-3 lg:max-w-[34rem] lg:text-[1.125rem]">
            <span className="max-lg:hidden">로고와 가게 이야기를 읽어 서체 방향 세 가지를 정해요. </span>곧 가게 이름 견본을 그려 보여 드려요.
            <span className="lg:hidden"> 창을 닫아도 돼요.</span>
          </p>
          <p className="mt-8 text-13 font-medium max-lg:hidden">창을 닫아도 돼요. 견본을 다 그리면 메일로 알려 드려요.</p>
          <TextLink href="/fonts" tone="primary" className="self-start max-lg:hidden">
            내 폰트로 가기
          </TextLink>
        </div>
        {/* 접수증 틀은 질문 화면에서 이어지는 물건이라 움직이지 않고, 안쪽 내용만 들어온다(motion.md '로고 권리 → 로고 읽는 중') */}
        <Receipt
          aria-label="접수증"
          top={
            <div className="ds-motion flex animate-ds-enter flex-col">
              <div className="relative h-[8.5rem] rounded-[1.25rem] bg-bg-surface-strong lg:h-[13.75rem]">
                {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 로고 */}
                <img src={view.logoUrl} alt={`${view.storeName} 로고`} className="absolute inset-0 m-auto h-[70%] w-[70%] object-contain" />
              </div>
              <p className="mt-5 text-13 font-bold lg:mt-6">지금 하는 일</p>
              <ol className="mt-3 flex flex-col gap-4 lg:mt-4">
                <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
                  <span aria-hidden className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-border-default border-t-border-active" />
                  <span className="flex flex-col gap-1">
                    <span className="text-15 font-bold">
                      로고와 가게 이야기 읽기<span className="sr-only"> (지금)</span>
                    </span>
                    <span className="text-13 leading-normal text-text-secondary">로고 모양과 가게 이야기로 서체 방향 세 가지를 정해요.</span>
                  </span>
                </li>
                <li className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
                  <span aria-hidden className="mt-2 ml-1 h-1.5 w-1.5 rounded-full bg-text-tertiary" />
                  <span className="flex flex-col gap-1">
                    <span className="text-15 font-medium text-text-secondary">
                      가게 이름 견본 세 가지 그리기<span className="sr-only"> (다음)</span>
                    </span>
                    <span className="text-13 leading-normal text-text-secondary">다음 화면에서 견본이 하나씩 나타나요.</span>
                  </span>
                </li>
              </ol>
            </div>
          }
          bottom={<p className="text-13 leading-normal text-text-secondary">{"견본을 보고 하나 고르면 그때 글자를 그리기 시작해요."}</p>}
          topClassName="px-5 pt-5 pb-8 lg:px-8 lg:pt-7 lg:pb-10"
          bottomClassName="px-5 pt-5 pb-6 lg:px-8 lg:pt-6 lg:pb-8"
        />
      </div>
    </div>
  );
}

/* ---------- 만드는 중 ---------- */

type Stage = 1 | 2 | 3 | 4;

const STAGE_INFO: Record<Stage, { title: string; label: string; desc: string }> = {
  1: { title: "기준 글자 30자", label: "기준 글자 그리기", desc: "다른 글자가 따라 할 기준 글자를 먼저 그려요." },
  2: { title: "나머지 글자", label: "나머지 글자 그리기", desc: "기준 글자와 같은 글씨로 30자씩 그리고, 기준을 통과하지 못한 글자는 다시 그려요." },
  3: { title: "폰트 파일 만들기", label: "파일 만들기", desc: "외곽선을 따서 굵기·너비·자간을 맞추고 TTF 파일로 묶어요." },
  4: { title: "검사하기", label: "파일 검사", desc: "빠진 글자·깨진 글자·파일 정보를 확인하고, 이미 있는 무료 폰트와 너무 닮지 않았는지 재요." },
};

function stageOf(view: ProjectView): Stage {
  if (view.phase === "drawing") return 1;
  const stages = view.build?.stages ?? [];
  const draw = stages.find((s) => s.key === "draw");
  if (!view.build || (draw && draw.status !== "done")) return 2;
  const next = stages.find((s) => s.key !== "draw" && s.status !== "done");
  if (!next) return 4;
  return next.key === "check" || next.key === "ocr" ? 4 : 3;
}

/** 검사 7항목을 사장님 말로(피그마 469:3521). 기준은 CHECKS(lib/constants)와 같다. */
const CHECK_PLAIN: Record<CheckKey, string> = {
  glyph_set: "한글 2,350자 + 숫자·문장부호·영문 대소문자 82자가 다 들어 있는지",
  broken_glyphs: "윤곽이 꼬이거나 열린 글자가 없는지",
  embedding: "한글·워드·PDF에 넣어도 글꼴이 같이 따라가는지",
  naming_license: "폰트 이름과 SIL OFL 1.1이 파일 안에 적혀 있는지",
  platform_render: "Windows·macOS·iOS·Chrome에서 똑같이 보이는지",
  size_legibility: "12px 안내문부터 96px 간판까지 읽히는지",
  similarity: "이미 있는 무료 폰트와 너무 닮지 않았는지",
};

/** '지금 하는 일' 네 단계 줄 표 */
function StageList({ current }: { current: Stage }) {
  return (
    <section aria-labelledby="making-stages" className="flex flex-col gap-6">
      <DisplayTitle as="h2" className="text-[1.75rem] lg:text-[2.75rem]">
        <span id="making-stages">지금 하는 일</span>
      </DisplayTitle>
      <ol className="flex flex-col border-t border-border-active">
        {([1, 2, 3, 4] as const).map((n) => {
          const info = STAGE_INFO[n];
          const state = n < current ? "done" : n === current ? "now" : "next";
          return (
            <li
              key={n}
              aria-current={state === "now" ? "step" : undefined}
              className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border-active py-4 lg:grid-cols-[5rem_minmax(0,25rem)_minmax(0,1fr)] lg:items-center lg:gap-x-0 lg:py-6"
            >
              <span className={`font-display text-[1.75rem] leading-none tracking-[-0.03em] lg:text-[2.5rem] ${state === "next" ? "text-text-tertiary" : ""}`}>
                {String(n).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-3 pt-1 lg:pt-0">
                <span className={`text-17 font-bold lg:text-[1.1875rem] ${state === "next" ? "text-text-secondary" : ""}`}>{info.title}</span>
                <StageChip state={state} className="max-lg:hidden" />
              </span>
              <StageChip state={state} className="mt-1 lg:hidden" />
              <span
                className={`col-start-2 col-end-4 text-13 leading-normal lg:col-start-3 lg:col-end-4 lg:text-15 ${
                  state === "now" ? "mt-2 font-medium text-text-primary lg:mt-0" : "text-text-secondary max-lg:hidden"
                }`}
              >
                {info.desc}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StageChip({ state, className = "" }: { state: "done" | "now" | "next"; className?: string }) {
  if (state === "now") return <span className={`inline-flex h-6 items-center rounded-full bg-bg-inverse px-2.5 text-13 font-bold text-text-inverse ${className}`}>지금</span>;
  if (state === "done")
    return (
      <span className={`inline-flex h-[1.6875rem] items-center gap-1 rounded-full border-[1.5px] border-border-active pr-3 pl-2.5 text-13 font-bold ${className}`}>
        <CheckMark className="h-3 w-3" />
        끝남
      </span>
    );
  return <span className={`inline-flex h-[1.6875rem] items-center rounded-full border-[1.5px] border-border-strong px-3 text-13 font-bold text-text-secondary ${className}`}>다음</span>;
}

/** 검사 7항목(S3 · 469:3521). 통과 · 검사 중 · 기다리는 중. 걸리면 그 항목과 이유를 그대로 보인다. */
function CheckList({ view }: { view: ProjectView }) {
  const results = view.build?.checks ?? [];
  const checkStage = view.build?.stages.find((s) => s.key === "check");
  const passed = results.filter((r) => r.status === "pass").length;
  const firstPending = CHECKS.findIndex((c) => (results.find((r) => r.key === c.key)?.status ?? "pending") === "pending");
  return (
    <section aria-labelledby="making-checks" className="flex flex-col gap-6">
      <SectionHead kicker="진행" title="검사 7항목" desc="7개를 다 통과하면 '통과' 도장이 붙고 폰트가 나와요." aside={`${passed} / ${CHECKS.length} 통과`} />
      <span id="making-checks" className="sr-only">
        검사 7항목
      </span>
      <ol className="flex flex-col border-t border-border-active">
        {CHECKS.map((c, i) => {
          const r = results.find((x) => x.key === c.key);
          const status = r?.status === "pass" ? "pass" : r?.status === "fail" ? "fail" : checkStage?.status === "active" && i === firstPending ? "active" : "wait";
          const dim = status === "wait";
          return (
            <li key={c.key} className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-2 border-b border-border-active py-4 lg:grid-cols-[5rem_17.5rem_minmax(0,1fr)_auto] lg:items-center lg:gap-x-0 lg:py-5">
              <span className={`font-display text-[1.75rem] leading-none tracking-[-0.03em] lg:text-[2.25rem] ${dim ? "text-text-tertiary" : ""}`}>{String(i + 1).padStart(2, "0")}</span>
              <span className={`pt-1 text-17 font-bold lg:pt-0 ${dim ? "text-text-secondary" : ""}`}>{c.label}</span>
              <span className="col-start-3 row-start-1 flex items-center gap-1.5 pt-1 text-13 font-bold whitespace-nowrap lg:col-start-4 lg:pt-0">
                {status === "pass" && (
                  <>
                    <CheckCircle size={22} />
                    통과
                  </>
                )}
                {status === "fail" && <span className="text-text-error">걸림</span>}
                {status === "active" && (
                  <>
                    <span aria-hidden className="h-[1.375rem] w-[1.375rem] animate-spin rounded-full border-2 border-border-default border-t-border-active" />
                    검사 중
                  </>
                )}
                {status === "wait" && <span className="font-medium text-text-secondary">기다리는 중</span>}
              </span>
              <span className={`col-start-2 col-end-4 mt-1 text-13 leading-normal lg:col-start-3 lg:col-end-4 lg:mt-0 lg:pr-6 lg:text-15 ${status === "active" ? "font-medium text-text-primary" : "text-text-secondary"}`}>
                {CHECK_PLAIN[c.key]}
                {status === "fail" && r?.detail && <span className="mt-1 block text-text-error">{r.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-13 leading-normal text-text-secondary">7개를 다 통과해야 &apos;통과&apos; 도장이 붙어요. 하나라도 걸리면 그 항목과 이유를 이 자리에 그대로 보여 드려요.</p>
    </section>
  );
}

/** 만들기 멈추기: 누르면 제자리에서 확인이 펼쳐진다(471:3559). 첫 초점은 '계속 만들기'. 그린 글자는 남는다. */
function StopConfirm({ view, drawn, onClose, onChanged }: { view: ProjectView; drawn: number; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelProject(view.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  const body = view.rebuilding
    ? "멈추면 지금 폰트로 돌아가요. 이미 받은 파일은 그대로 써도 돼요. 지금 그리고 있는 30자는 끝까지 그려질 수 있어요."
    : `지금까지 그린 글자 ${drawn.toLocaleString()}자는 남아 있어요. 나중에 내 폰트에서 이어서 만들거나 그만둘 수 있어요. 지금 그리고 있는 30자는 끝까지 그려질 수 있어요.`;
  return (
    <InlineConfirm label="멈추기 확인" className="ds-motion flex animate-ds-enter flex-col gap-4 rounded-[1.25rem] bg-bg-canvas p-5 text-text-primary lg:p-7">
      <p className="text-[1.25rem] font-bold">{view.rebuilding ? "다시 그리기를 멈출까요?" : "만들기를 멈출까요?"}</p>
      <p className="text-15 leading-relaxed text-text-secondary">{body}</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton data-autofocus disabled={busy} onClick={onClose}>
          {view.rebuilding ? "계속 그리기" : "계속 만들기"}
        </PrimaryButton>
        <SecondaryButton disabled={busy} onClick={() => void stop()}>
          {busy ? "멈추는 중" : "멈추기"}
        </SecondaryButton>
      </div>
    </InlineConfirm>
  );
}

function Working({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const stage = stageOf(view);
  const queued = !!view.build?.queued;
  const rebuilding = view.rebuilding;
  const draw = view.build?.stages.find((s) => s.key === "draw");
  const refs = view.review?.items ?? [];
  // 그린 글자 수: 서버의 drawnCount(기준 글자 + 나머지 + 직접 그린 글자). 예전 서버는 그리기 단계 개수에서 어림한다.
  const drawn =
    view.phase === "drawing"
      ? refs.filter((i) => i.status === "ready").length
      : typeof view.drawnCount === "number"
        ? view.drawnCount
        : draw
          ? Math.max(0, GLYPH_TOTAL - draw.total + draw.done)
          : 0;
  const recent = view.recent.slice(0, 30);
  const now = useNow();
  const lastAt = useLastDrawnAt(view.phase === "drawing" ? null : view.lastSheetAt, rebuilding ? (draw?.done ?? 0) : drawn);
  const left = useCountdown(view.remainingSeconds);
  const overtime = left !== null && left <= 0;
  const mail = useMailLine(view);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const info = STAGE_INFO[stage];
  const allDrawn = stage >= 3 && !rebuilding;
  const notStarted = queued && drawn === 0;

  const title: [string, string] = queued
    ? ["차례를", "기다리고 있어요"]
    : rebuilding
      ? ["빠진 글자를", "그리고 있어요"]
      : stage === 1
        ? ["기준 글자를", "그리고 있어요"]
        : stage === 2
          ? ["글자를", "그리고 있어요"]
          : stage === 3
            ? ["폰트 파일을", "만들고 있어요"]
            : ["폰트 파일을", "검사하고 있어요"];
  const body = queued
    ? `먼저 맡긴 폰트가 끝나면 바로 그리기 시작해요. 지금은 하실 일이 없어요. ${mail}`
    : rebuilding
      ? `이미 만든 폰트는 그대로예요. 빠진 글자만 같은 글씨로 그려서 폰트를 다시 만들어요. ${mail}`
      : stage >= 3 && overtime
        ? `예상한 시간보다 오래 걸리고 있어요. 글자는 다 그렸고 ${stage === 4 ? "파일 검사가" : "파일 만들기와 검사가"} 남았어요. ${mail}`
        : stage >= 3
          ? `글자는 다 그렸어요. 파일을 만들고 검사하는 중이에요. ${mail}`
          : `지금은 하실 일이 없어요. 창을 닫아도 계속 그려요. ${mail}`;
  const stageLine = `지금: 4단계 중 ${stage} · ${info.label}`;
  const percent = (n: number, total: number) => `${Math.floor((100 * n) / Math.max(1, total))}%`;

  const ticket = queued
    ? { topLine: "지금은", value: "대기 중", srValue: "대기 중", bottomLine: "차례가 오면 바로 시작해요" }
    : { topLine: "완성까지", bottomLine: view.upload.notifyByEmail === false ? "다 되면 이 화면이 바뀌어요" : "다 되면 메일로 알려 드려요", ...ticketTime(left) };

  const progress = rebuilding ? (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-15 font-bold tabular-nums">
          빠진 글자 {(draw?.done ?? 0).toLocaleString()} / {(draw?.total ?? 0).toLocaleString()}자
        </span>
        <span className="font-display text-[1.5rem] leading-none tracking-[-0.03em] tabular-nums lg:text-[1.875rem]">{percent(draw?.done ?? 0, draw?.total ?? 0)}</span>
      </div>
      <ProgressBar value={draw?.done ?? 0} max={draw?.total ?? 0} label="빠진 글자 그리기" valueText={`빠진 글자 ${draw?.total ?? 0}자 가운데 ${draw?.done ?? 0}자`} />
      <span className="text-13 font-medium">다 그리면 폰트 파일을 다시 만들고 검사해요.</span>
    </div>
  ) : allDrawn ? (
    <div className="flex flex-col gap-2.5">
      <span className="flex items-center gap-2 text-15 font-bold lg:text-17">
        <CheckCircle size={22} />
        글자 {drawn.toLocaleString()}자 {drawn >= GLYPH_TOTAL ? "다 그렸어요" : "를 그렸어요"}
      </span>
      <span className="text-13 font-bold">{stageLine}</span>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-15 font-bold tabular-nums">
          글자 {drawn.toLocaleString()} / {GLYPH_TOTAL.toLocaleString()}자
        </span>
        {!notStarted && <span className="font-display text-[1.5rem] leading-none tracking-[-0.03em] tabular-nums lg:text-[1.875rem]">{percent(drawn, GLYPH_TOTAL)}</span>}
      </div>
      <ProgressBar value={drawn} max={GLYPH_TOTAL} label="그린 글자" valueText={`${GLYPH_TOTAL.toLocaleString()}자 가운데 ${drawn.toLocaleString()}자`} />
      {notStarted ? (
        <span className="text-13 font-medium">아직 시작 전이에요. 차례가 오면 막대가 차기 시작해요.</span>
      ) : (
        <>
          <span className="text-13 font-medium max-lg:hidden">한글 2,350 + 숫자·문장부호·영문 대소문자 82</span>
          <span className="text-13 font-bold lg:hidden">{stageLine}</span>
        </>
      )}
    </div>
  );

  const last = lastAt !== null ? `마지막으로 그린 때 ${agoText(lastAt, now)}` : null;

  return (
    <div className="flex flex-1 flex-col">
      {/* 위: 큰 민트 면(서버가 일하는 중) */}
      <div className="bg-bg-brand">
        <div className="mx-auto grid w-full max-w-page gap-x-10 px-5 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,33rem)] lg:px-10 lg:pt-[4.25rem] lg:pb-14">
          <div className="flex min-w-0 flex-col">
            <span className="text-15 font-bold">
              {[view.storeName, rebuilding ? "완성한 폰트 있음" : null].filter(Boolean).join(" · ")}
            </span>
            <div className="mt-3 lg:mt-4">
              <HeroTitle lines={title} />
            </div>
            <p className="mt-3 text-15 leading-normal font-medium lg:mt-4 lg:max-w-[35rem] lg:text-[1.125rem]">{body}</p>
            <div className="-mx-1 mt-6 mb-4 flex justify-center lg:hidden">
              <Ticket width={340} rotate={6} {...ticket} />
            </div>
            <div className="mt-2 lg:mt-10 lg:max-w-[32.5rem]">{progress}</div>
            <div className="mt-7">
              {asking ? (
                <StopConfirm view={view} drawn={drawn} onClose={() => setAsking(false)} onChanged={onChanged} />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-x-10 gap-y-2">
                    <SecondaryLink href="/fonts">내 폰트로 가기</SecondaryLink>
                    <TextButton tone="primary" onClick={() => setAsking(true)}>
                      {rebuilding ? "다시 그리기 멈추기" : "만들기 멈추기"}
                    </TextButton>
                  </div>
                  <p className="text-13 font-medium">
                    {rebuilding ? (
                      "멈추면 지금 폰트로 돌아가요. 이미 받은 파일은 그대로 써도 돼요."
                    ) : (
                      <>
                        닫거나 내 폰트로 가도 계속 만들어요.<span className="max-lg:hidden"> 내 폰트에서 다시 볼 수 있어요.</span>
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="hidden items-center justify-center lg:flex">
            <Ticket width={520} rotate={6} {...ticket} />
          </div>
        </div>
      </div>

      {/* 아래: 흰 바탕 진행 내용 */}
      <div className="mx-auto flex w-full max-w-page flex-col gap-14 px-5 pt-10 pb-16 lg:gap-20 lg:px-10 lg:pt-16 lg:pb-24">
        {stage === 4 && !rebuilding ? (
          <CheckList view={view} />
        ) : (
          <>
            {stage === 1 ? (
              <section aria-label="기준 글자" className="flex flex-col gap-6">
                <SectionHead kicker="진행" title="기준 글자 30자" desc={`다른 글자가 따라 할 기준이에요.${last ? ` ${last}.` : ""}`} />
                <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-15 lg:gap-2.5">
                  {(refs.length ? refs : Array.from({ length: 30 }, () => null)).map((item, i) =>
                    item?.status === "ready" ? <GlyphTile key={`${i}-${item.char}`} char={item.char} src={item.imageUrl} /> : <PendingTile key={`wait-${i}`} />,
                  )}
                </div>
              </section>
            ) : (
              <section aria-label="방금 그린 글자" className="flex flex-col gap-6">
                <SectionHead
                  kicker="진행"
                  title={rebuilding || queued ? "방금 그린 글자" : "방금 그린 30자"}
                  desc={
                    recent.length === 0
                      ? "아직 그린 글자가 없어요. 그리기 시작하면 여기에 방금 그린 글자가 나타나요."
                      : [last, rebuilding ? `빠진 글자 ${(draw?.total ?? 0).toLocaleString()}자만 그려요.` : stage === 2 ? "기준을 통과하지 못한 글자는 저절로 다시 그려요." : null]
                          .filter(Boolean)
                          .join(" · ") || null
                  }
                />
                {recent.length > 0 && (
                  <>
                    <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-15 lg:gap-2.5">
                      {recent.map((g, i) => (
                        <GlyphTile key={g.char} char={g.char} src={g.imageUrl} className={i >= 12 && !showAll ? "max-lg:hidden" : ""} />
                      ))}
                    </div>
                    {recent.length > 12 && !showAll && (
                      <TextButton className="self-start lg:hidden" onClick={() => setShowAll(true)}>
                        {recent.length}자 모두 보기
                      </TextButton>
                    )}
                  </>
                )}
              </section>
            )}
            {!rebuilding && <StageList current={stage} />}
          </>
        )}
      </div>
    </div>
  );
}

export function Making({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  if (view.phase === "analyzing") return <Analyzing view={view} />;
  return <Working view={view} onChanged={onChanged} />;
}
