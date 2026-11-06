"use client";

// 느낌 고르기(11/4, 11/6 피그마 18 C1 452:56 · 모바일 453:148 · 남은 상태 488:701/803/902 · 버튼 꺼짐 453:283).
// 사용자 결정(11/4): 저절로 고르지 않는다. 고를 때까지 서버가 기다리고, 창을 닫았으면 견본이 그려졌을 때 메일로 알린다.
// 11/6: 카드는 고르기만 한다(2px 먹 테두리 + 체크 원). 처음에는 아무것도 고르지 않고(AI 추천도 미리 고르지 않음), 주 버튼 '이 느낌으로 만들기'는 아래 막대에 하나.
// 고른 뒤 한 번 더 확인한다(확인 창 D2 v2 471:3900 · 모바일 471:3980): 접수증 모양에 그릴 글자 · 받는 것 · 걸리는 시간 · 다 되면 네 줄.
// 견본은 느낌 시안일 뿐이라 최종 폰트가 똑같다고 약속하지 않는다.

import { useCallback, useEffect, useRef, useState } from "react";
import { Steps } from "@/components/fonts/Making";
import { StickyBar } from "@/components/fonts/shared";
import { ModalPortal } from "@/components/ModalPortal";
import { CheckCircle, PrimaryButton, Receipt, SecondaryButton, TextButton, TextLink } from "@/components/ds";
import { Notice, onRadioKeys, rovingTab } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import type { ChooseDirection, ProjectView } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D", "E"];
const nameOf = (d: ChooseDirection, i: number) => `${LETTERS[i] ?? i + 1} ${d.familyLabel}`;
const detailOf = (d: ChooseDirection) => `${d.familyLabel}${d.weightLabel ? ` · 굵기 ${d.weightLabel}` : ""}`;

function Card({
  d,
  index,
  selected,
  before,
  tabIndex,
  busy,
  onSelect,
  onRedraw,
}: {
  d: ChooseDirection;
  index: number;
  selected: boolean;
  /** 다른 느낌으로 다시 고를 때(again) 전에 고른 카드(488:902 '전에 고른 느낌' 외곽선 꼬리표) */
  before: boolean;
  tabIndex: number;
  busy: boolean;
  onSelect: (index: number) => void;
  onRedraw: (index: number) => void;
}) {
  const descId = `choose-why-${index}`;
  return (
    <li
      className={`relative flex min-w-0 flex-col rounded-[1.25rem] bg-bg-canvas p-[1.125rem] transition-colors duration-(--dur-fast) ${
        selected ? "border-2 border-border-active" : "border-[1.5px] border-border-default hover:border-border-strong"
      }`}
    >
      {/* 카드 전체가 고르는 칸이다. 안의 '견본 다시 그리기' 버튼과 겹치지 않게 칸을 카드 뒤에 깐다(버튼 안에 버튼을 두지 않음). */}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={tabIndex}
        aria-label={`${nameOf(d, index)}${d.weightLabel ? `, 굵기 ${d.weightLabel}` : ""}${d.recommended ? ", AI 추천" : ""}${before ? ", 전에 고른 느낌" : ""}${d.status === "drawing" ? ", 견본 그리는 중" : d.status === "failed" ? ", 견본 없음" : ""}. ${d.expression}`}
        aria-describedby={descId}
        onClick={() => onSelect(index)}
        className="absolute inset-0 rounded-[1.125rem] outline-offset-4 focus-visible:shadow-none focus-visible:outline-3 focus-visible:outline-border-active"
      />
      <div className="pointer-events-none relative flex items-start gap-2">
        {selected ? (
          <CheckCircle size={28} pop />
        ) : (
          <span aria-hidden className="h-7 w-7 shrink-0 rounded-full border-2 border-border-strong bg-bg-canvas" />
        )}
        <span aria-hidden className="-mt-1.5 font-display text-[2rem] leading-[1.2] tracking-[-0.03em]">
          {LETTERS[index] ?? index + 1}
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[1.1875rem] font-bold">{d.familyLabel}</span>
            {d.recommended && <span className="rounded-full bg-bg-inverse px-2.5 py-0.5 text-13 font-bold text-text-inverse">AI 추천</span>}
          </span>
          {/* '전에 고른 느낌'(488:902)은 이름 줄에 두면 112.5% 확대에서 'AI 추천'과 함께 줄이 넘쳐, 굵기 줄 옆에 둔다 */}
          {(d.weightLabel || before) && (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {d.weightLabel && <span className="text-13 font-bold text-text-secondary">굵기 {d.weightLabel}</span>}
              {before && <span className="rounded-full border-[1.5px] border-border-active px-2 py-px text-12 font-bold">전에 고른 느낌</span>}
            </span>
          )}
        </span>
      </div>
      <div className="pointer-events-none relative mt-4 grid aspect-[4/3] place-items-center overflow-hidden rounded-[0.875rem] bg-bg-surface-strong max-lg:aspect-[11/5]">
        {d.status === "ready" && d.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 견본 그림
          <img src={d.imageUrl} alt="" className="ds-motion absolute inset-0 h-full w-full animate-ds-enter object-contain mix-blend-multiply" />
        ) : d.status === "drawing" ? (
          <span className="flex flex-col items-center gap-3 text-15 font-bold text-text-secondary">
            <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-[3px] border-border-default border-t-border-active" />
            그리는 중
          </span>
        ) : (
          <span className="flex flex-col items-center gap-4 px-6 text-center text-13 leading-normal font-medium text-text-secondary">
            <span>
              견본을 그리지 못했어요.
              <br />이 느낌은 그림 없이도 고를 수 있어요.
            </span>
            <SecondaryButton size="sm" disabled={busy} onClick={() => onRedraw(index)} className="pointer-events-auto relative z-10">
              견본 다시 그리기
            </SecondaryButton>
          </span>
        )}
      </div>
      <p className="pointer-events-none relative mt-5 text-17 font-bold">{d.expression}</p>
      {(d.why ?? d.summary) && (
        <p id={descId} className="pointer-events-none relative mt-2 line-clamp-3 text-15 leading-normal text-text-secondary">
          {d.why ?? d.summary}
        </p>
      )}
    </li>
  );
}

/** 시작 확인 창 D2 v2: 접수증(절취선 + 양옆 홈). 데스크톱은 가운데 창, 휴대폰은 아래에서 올라오는 창. 닫아도 고른 견본은 그대로. */
function ConfirmDialog({ view, d, index, again, busy, onStart, onClose }: { view: ProjectView; d: ChooseDirection; index: number; again: boolean; busy: boolean; onStart: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const { data } = authClient.useSession();
  const mailOff = view.upload.notifyByEmail === false;
  const email = data?.user.email;

  // 닫힘은 200ms 나가는 곡선(motion.md '확인 창 닫힘'). 움직임 줄이기에서는 전역 규칙이 전환을 끄고 시간만 기다린다.
  const close = useCallback(() => {
    if (busy || closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  }, [busy, closing, onClose]);

  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const rows: { label: string; long: string; short: string }[] = [
    { label: "그릴 글자", long: "한글 약 2,350자 + 숫자·문장부호·영문 대소문자 82자", short: "한글 약 2,350자 + 82자" },
    { label: "받는 것", long: "폰트 파일(TTF·WOFF2·OTF) · 완성되면 스튜디오에서 받아요", short: "TTF·WOFF2·OTF 폰트 파일" },
    { label: "걸리는 시간", long: "만들기를 시작하면 12~17분 · 창을 닫아도 계속", short: "시작하면 12~17분 · 닫아도 계속" },
    {
      label: "다 되면",
      long: mailOff ? "내 폰트에서 받아요" : email ? `${email}으로 메일을 보내요` : "메일로 알려 드려요",
      short: mailOff ? "내 폰트에서 받아요" : email ? `${email}으로 메일` : "메일로 알려 드려요",
    },
  ];

  return (
    <ModalPortal>
      <div
        className={`fixed inset-0 z-50 flex items-end justify-center bg-black/40 transition-opacity duration-(--dur-base) ease-exit lg:items-center lg:p-4 ${closing ? "opacity-0" : "opacity-100"}`}
        onPointerDown={(e) => e.target === e.currentTarget && close()}
      >
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-confirm-title"
          tabIndex={-1}
          className={`ds-motion relative max-h-full w-full animate-ds-enter overflow-y-auto outline-none transition-[opacity,translate] duration-(--dur-base) ease-exit lg:max-w-[33.75rem] ${
            closing ? "translate-y-2 opacity-0" : ""
          }`}
        >
          <Receipt
            as="div"
            className="[filter:drop-shadow(0_12px_32px_rgba(20,20,20,.16))]"
            topClassName="px-4 pt-5 pb-5 lg:px-10 lg:pt-8 lg:pb-6"
            bottomClassName="px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] max-lg:rounded-b-none lg:px-10 lg:pt-7 lg:pb-4"
            top={
              <div className="flex flex-col">
                <h2 id="choose-confirm-title" className="-mt-2 pr-12 font-display text-[1.5rem] leading-[1.3] tracking-[-0.03em] lg:text-[1.875rem]">
                  {again ? "이 느낌으로 다시 만들까요?" : "이 느낌으로 만들까요?"}
                </h2>
                <div className="relative mt-4 grid h-[5.5rem] place-items-center overflow-hidden rounded-[0.875rem] bg-bg-surface-strong lg:h-[11.25rem]">
                  {d.status === "ready" && d.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 견본 그림
                    <img src={d.imageUrl} alt={`${d.familyLabel} 느낌으로 그린 가게 이름 견본`} className="absolute inset-0 h-full w-full object-contain mix-blend-multiply" />
                  ) : (
                    <span className="text-13 font-medium text-text-secondary">견본 그림 없이 고른 느낌이에요</span>
                  )}
                  <span className="absolute top-2 left-3 text-12 font-bold text-text-secondary lg:hidden">{detailOf(d)}</span>
                </div>
                <p className="mt-4 text-15 font-bold max-lg:hidden">
                  {LETTERS[index]} {detailOf(d)}
                </p>
                <dl className="mt-3 flex flex-col border-t border-border-default lg:mt-4">
                  {rows.map((r) => (
                    <div key={r.label} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-4 border-b border-border-default py-2.5 lg:grid-cols-[6.25rem_minmax(0,1fr)] lg:gap-x-0 lg:py-3">
                      <dt className="pt-0.5 text-13 font-medium text-text-secondary lg:text-12">{r.label}</dt>
                      <dd className="text-13 leading-normal font-medium lg:text-15">
                        <span className="max-lg:hidden">{r.long}</span>
                        <span className="lg:hidden">{r.short}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-12 leading-normal text-text-secondary">견본은 느낌을 보여 드리는 그림이라 최종 글자와 조금 다를 수 있어요.</p>
              </div>
            }
            bottom={
              <div className="flex flex-col items-center gap-1">
                <PrimaryButton block disabled={busy} onClick={onStart}>
                  {busy ? "시작하는 중" : "만들기 시작"}
                </PrimaryButton>
                <TextButton disabled={busy} onClick={() => close()}>
                  다른 느낌 보기
                </TextButton>
              </div>
            }
          />
          <button
            type="button"
            aria-label="닫기 (고른 견본은 그대로 남아요)"
            disabled={busy}
            onClick={() => close()}
            className="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-bg-surface text-text-primary transition-colors duration-(--dur-fast) hover:bg-bg-surface-strong lg:top-5 lg:right-5"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

export function Choose({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const choose = view.choose;
  const directions = choose?.directions ?? [];
  const again = !!choose?.again;
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drawing = directions.some((d) => d.status === "drawing");
  const picked = selected !== null ? directions[selected] : undefined;

  async function pick(index: number) {
    setSending(true);
    setError(null);
    try {
      await api.chooseProject(view.id, { action: "pick", index });
      setConfirming(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  async function redraw(index: number) {
    setError(null);
    try {
      await api.chooseProject(view.id, { action: "redraw", index });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const count = ["", "한", "두", "세", "네", "다섯"][directions.length || 3] ?? String(directions.length);
  const lead = again
    ? "그렸던 기준 글자 30자는 지웠어요. 다른 느낌을 고르면 그 느낌으로 다시 그려요. 견본은 그대로 남아 있어요."
    : drawing
      ? `가게 이름을 ${count} 가지 느낌으로 그리고 있어요. 다 그린 견본부터 보여 드려요. 그리는 중에도 먼저 나온 견본을 고를 수 있어요.`
      : `가게 이름을 ${count} 가지 느낌으로 그려 봤어요. 하나를 고르면 그 느낌으로 한글 약 2,350자를 그려요. 견본과 최종 글자는 조금 다를 수 있어요.`;
  const action = again ? "이 느낌으로 다시 만들기" : "이 느낌으로 만들기";

  return (
    <>
      <div className="mx-auto flex w-full max-w-[72rem] flex-1 flex-col px-5 pt-4 pb-8 lg:px-10 lg:pt-8 lg:pb-10">
        <Steps current={3} />
        <div className="ds-motion mt-6 flex animate-ds-enter flex-col gap-2 lg:mt-9">
          <span className="text-13 font-bold">{view.storeName}</span>
          <h1 className="font-display text-[1.75rem] leading-[1.25] tracking-[-0.03em] lg:text-[3.5rem]">
            {again ? (
              "다른 느낌으로 골라 볼까요?"
            ) : (
              <>
                어떤 느낌으로 <br className="lg:hidden" />
                만들까요?
              </>
            )}
          </h1>
          <p className="text-15 leading-normal font-medium text-text-secondary lg:max-w-[42rem] lg:text-17">{lead}</p>
        </div>

        <ul role="radiogroup" aria-label="서체 느낌" onKeyDown={onRadioKeys} className="ds-motion mt-6 grid animate-ds-enter gap-3 lg:mt-11 lg:grid-cols-3 lg:gap-6">
          {directions.map((d, i) => (
            <Card
              key={`${d.family}-${i}`}
              d={d}
              index={i}
              selected={selected === i}
              before={again && choose?.previous === i}
              tabIndex={rovingTab(selected === i, i === 0, selected !== null)}
              busy={sending}
              onSelect={setSelected}
              onRedraw={(index) => void redraw(index)}
            />
          ))}
        </ul>

        <p className="mt-6 text-13 leading-normal text-text-secondary lg:mt-10">창을 닫아도 돼요. 견본을 다 그리면 메일로 알려 드리고, 고를 때까지 기다려요.</p>
        <TextLink href="/fonts" className="self-start lg:hidden">
          나중에 고르기
        </TextLink>
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {picked && confirming && (
          <ConfirmDialog view={view} d={picked} index={selected!} again={again} busy={sending} onStart={() => void pick(selected!)} onClose={() => setConfirming(false)} />
        )}
      </div>

      {/* 아래 막대는 화면 폭 전체(위 선이 화면 끝까지). 본문 틀 밖에 둔다. */}
      <StickyBar className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-8">
        <div aria-live="polite" className="flex min-w-0 flex-col gap-1 lg:flex-1">
          <span className="text-13 font-bold text-text-secondary max-lg:hidden">고른 느낌</span>
          <span className="text-15 font-bold lg:text-17">
            {picked ? (
              <>
                <span className="lg:hidden">고른 느낌 · </span>
                {nameOf(picked, selected!)}
                <span className="max-lg:hidden">{picked.weightLabel ? ` · 굵기 ${picked.weightLabel}` : ""}</span>
              </>
            ) : (
              <>
                <span className="lg:hidden">느낌을 하나 골라 주세요</span>
                <span className="max-lg:hidden">아직 고르지 않았어요</span>
              </>
            )}
          </span>
        </div>
        <TextLink href="/fonts" className="max-lg:hidden">
          나중에 고르기
        </TextLink>
        <PrimaryButton block className="lg:w-auto" disabled={!picked || sending} aria-describedby={picked ? undefined : "choose-why-off"} onClick={() => setConfirming(true)}>
          {action}
        </PrimaryButton>
        {!picked && (
          <span id="choose-why-off" className="sr-only">
            느낌을 하나 골라 주세요
          </span>
        )}
      </StickyBar>
    </>
  );
}
