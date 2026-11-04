"use client";

// 느낌 고르기(11/4). 로고를 읽은 뒤 AI가 낸 서체 방향 3개를, 가게 이름을 그 방향으로 그린 견본 그림으로 보여 주고 하나를 고르게 한다.
// 참고 글자 30자를 보여 주던 확인 단계를 대신한다: 낱글자 30개보다 "이런 느낌이구나"가 한눈에 보인다.
// 견본은 느낌 시안일 뿐이라 최종 폰트가 똑같다고 약속하지 않는다. 고르지 않아도 40초 뒤 추천 안(첫 안)으로 서버가 저절로 계속한다.
// '기다리기'를 누르면 시간이 멈춘다(WCAG 2.2.1). 키보드로 안 안에 들어와도 멈춘다.

import { useEffect, useState, type FocusEvent } from "react";
import { Steps } from "@/components/fonts/Making";
import { Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { ChooseDirection, ProjectView } from "@/lib/types";

const CHOOSE_SECONDS = 40; // lib/server/projects.ts와 같다

function Card({ d, index, busy, onPick }: { d: ChooseDirection; index: number; busy: boolean; onPick: (index: number) => void }) {
  return (
    <li className={`flex min-w-0 flex-col gap-3 rounded-[1.25rem] border-[1.5px] bg-bg p-4 ${d.recommended ? "border-ink" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className="text-17 font-extrabold">{d.familyLabel}</span>
        {d.recommended && <span className="rounded-full bg-ink px-2 py-0.5 text-[0.6875rem] font-extrabold text-bg">AI 추천</span>}
      </div>
      <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-stage">
        {d.status === "ready" && d.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 견본 그림
          <img src={d.imageUrl} alt={`${d.familyLabel} 느낌으로 그린 가게 이름 견본`} className="h-full w-full object-contain mix-blend-multiply" />
        ) : d.status === "drawing" ? (
          <span role="status" className="flex flex-col items-center gap-2 text-15 font-bold text-muted">
            <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-[3px] border-track border-t-ink" />
            그리는 중
          </span>
        ) : (
          <span className="px-4 text-center text-15 font-medium text-muted">견본을 그리지 못했어요. 이 느낌으로 만들 수는 있어요.</span>
        )}
      </div>
      <p className="text-15 font-bold">{d.expression}</p>
      {d.summary && <p className="line-clamp-3 text-14 leading-normal text-muted">{d.summary}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick(index)}
        className={`mt-auto h-12 rounded-full px-5 text-15 font-bold transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:bg-subtle disabled:text-muted ${
          d.recommended ? "bg-ink text-bg hover:bg-hover" : "border-[1.5px] border-edge bg-bg hover:border-ink hover:bg-subtle"
        }`}
      >
        이 느낌으로 만들기
      </button>
    </li>
  );
}

export function Choose({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const choose = view.choose;
  const directions = choose?.directions ?? [];
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const settled = directions.length > 0 && directions.every((d) => d.status !== "drawing");
  const continueAt = choose?.continueAt ?? null;
  const left = continueAt === null ? null : Math.max(0, Math.ceil((continueAt - now) / 1000));
  const counting = settled && left !== null;
  const held = !!choose?.held;

  async function send(body: Parameters<typeof api.chooseProject>[1]) {
    setSending(true);
    setError(null);
    try {
      await api.chooseProject(view.id, body);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function onFocus(e: FocusEvent<HTMLUListElement>) {
    if (counting && !held && e.target.matches(":focus-visible")) void send({ action: "hold" });
  }

  const status = !settled
    ? "가게 이름을 세 가지 느낌으로 그리고 있어요"
    : held
      ? "천천히 보세요. 마음에 드는 느낌을 눌러 주세요."
      : left !== null && left > 0
        ? `${left}초 뒤 AI 추천 느낌으로 만들어요`
        : "글자를 그리러 가요";
  const spoken = settled && !held && left !== null && left > 0 ? "잠시 뒤 AI 추천 느낌으로 만들어요. 더 보려면 '기다리기'를 누르세요." : status;

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-7 px-5 pt-8 lg:px-10 lg:pt-10">
      <Steps current={1} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">{view.name}</span>
        <h1 className="text-26 font-extrabold lg:text-32">{choose?.again ? "다른 느낌으로 골라 볼까요?" : "어떤 느낌의 글씨로 만들까요?"}</h1>
        <p className="text-17 leading-normal font-medium text-muted">
          {choose?.again
            ? "그렸던 30자는 지웠어요. 다른 느낌을 고르면 그 느낌으로 30자를 다시 그려 보여 드려요."
            : `가게 이름을 ${directions.length || 3}가지 느낌으로 그려 봤어요. 하나를 고르면 그 느낌으로 먼저 30자를 그려 보여 드려요. 견본과 최종 글자는 조금 다를 수 있어요.`}
        </p>
      </div>

      <ul aria-label="서체 느낌" onFocus={onFocus} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {directions.map((d, i) => (
          <Card key={`${d.family}-${i}`} d={d} index={i} busy={sending} onPick={(index) => void send({ action: "pick", index })} />
        ))}
      </ul>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-paper px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:-mx-10 lg:px-10 lg:pb-5">
        <div className="flex min-w-0 basis-full flex-col gap-2 sm:flex-1 sm:basis-auto">
          <span aria-hidden className="text-15 font-bold">
            {status}
          </span>
          <span aria-live="polite" className="sr-only">
            {spoken}
          </span>
          {counting && !held && left !== null && (
            <div aria-hidden className="h-1 w-full max-w-56 overflow-hidden rounded-sm bg-track">
              <div className="h-full bg-ink transition-[width] duration-300 ease-linear" style={{ width: `${(left / CHOOSE_SECONDS) * 100}%` }} />
            </div>
          )}
          <span className="text-13 text-muted">창을 닫아도 서버에서 계속 만들어요.</span>
        </div>
        {settled && (
          <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
            {!held ? (
              <button
                type="button"
                disabled={sending}
                onClick={() => void send({ action: "hold" })}
                className="h-12 rounded-full border-[1.5px] border-edge bg-bg px-5 text-15 font-bold transition-colors hover:border-ink hover:bg-subtle disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted"
              >
                기다리기
              </button>
            ) : (
              <button
                type="button"
                disabled={sending}
                onClick={() => void send({ action: "pick", index: 0 })}
                className="h-12 flex-1 rounded-full bg-ink px-7 text-15 font-bold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted sm:flex-none"
              >
                AI 추천 느낌으로 만들기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
