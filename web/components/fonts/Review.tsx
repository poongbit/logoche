"use client";

// 참고 글자 확인(11/2 B안). YoFont에는 없는 단계다: 이 30자의 모양을 나머지 2,320자가 따라가므로, 그리기 전에 한 번 보여 준다.
// 20초가 지나면 서버가 저절로 계속한다(원클릭 느낌). 글자를 눌러 고르면 기다리고(hold), 고른 글자를 다시 그리거나 그대로 계속한다.
// 11/2 점검: 남은 시간과 버튼은 화면 아래에 붙여 늘 보이게 하고, '기다리기'로 시간을 멈출 수 있게 했다(WCAG 2.2.1).
// 키보드로 글자 칸에 들어와도 기다린다(30칸을 지나 버튼에 닿기 전에 시간이 끝나지 않게).

import { useEffect, useState, type FocusEvent } from "react";
import { Steps } from "@/components/fonts/Making";
import { Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import type { ProjectView } from "@/lib/types";

const REVIEW_SECONDS = 20; // lib/server/projects.ts와 같다

/** 목적격 조사: 마지막 글자에 받침이 있으면 '을', 없으면 '를' */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "을" : "를";
}

export function Review({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const items = view.review?.items ?? [];
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [waiting, setWaiting] = useState(false); // '기다리기'를 눌렀거나 키보드로 글자 칸에 들어왔다
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const busy = items.filter((i) => i.status === "drawing" || i.status === "redrawing");
  const continueAt = view.review?.continueAt ?? null;
  const left = continueAt === null ? null : Math.max(0, Math.ceil((continueAt - now) / 1000));
  const counting = left !== null && !picked.size && !busy.length;
  const failed = items.filter((i) => i.status === "failed").length;

  async function send(body: Parameters<typeof api.reviewProject>[1]) {
    setSending(true);
    setError(null);
    try {
      await api.reviewProject(view.id, body);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function wait() {
    setWaiting(true);
    if (!view.review?.held) void send({ action: "hold" });
  }

  function toggle(index: number) {
    const next = new Set(picked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setPicked(next);
    if (picked.size === 0 && next.size > 0 && !view.review?.held) void send({ action: "hold" });
    if (picked.size > 0 && next.size === 0 && busy.length === 0 && !waiting) void send({ action: "release" });
  }

  function onGridFocus(e: FocusEvent<HTMLDivElement>) {
    if (!waiting && continueAt !== null && e.target.matches(":focus-visible")) wait();
  }

  async function redraw() {
    const indices = [...picked];
    setPicked(new Set());
    await send({ action: "redraw", indices });
  }

  const busyChars = busy.map((i) => `'${i.char}'`).join(", ");
  const status = busy.length
    ? `${busyChars}${objectParticle(busy[busy.length - 1].char)} 다시 그리고 있어요`
    : picked.size
      ? `${picked.size}자를 골랐어요. 다시 그리거나 그대로 계속하세요.`
      : view.review?.held
        ? waiting
          ? "기다리고 있어요. 다 보셨으면 '이대로 계속'을 눌러 주세요."
          : "다시 그린 글자를 보고 '이대로 계속'을 눌러 주세요."
        : left !== null && left > 0
          ? `${left}초 뒤 이대로 나머지 글자를 그려요`
          : "나머지 글자를 그리러 가요";
  // 화면 읽기 프로그램에는 초를 빼고 상태가 바뀔 때만 알린다(초가 바뀔 때마다 다시 읽지 않게, 11/2 다시 점검)
  const ticking = !busy.length && !picked.size && !view.review?.held && left !== null && left > 0;
  const spoken = ticking ? "잠시 뒤 이대로 나머지 글자를 그려요. 더 보려면 '기다리기'를 누르세요." : status;

  const secondary =
    "h-12 rounded-full border-[1.5px] border-edge bg-bg px-5 text-15 font-bold transition-colors hover:border-ink hover:bg-subtle disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted disabled:hover:bg-bg";

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-7 px-5 pt-8 lg:px-10 lg:pt-10">
      <Steps current={2} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">{view.name}</span>
        <h1 className="text-26 font-extrabold lg:text-32">참고 글자 30자를 그렸어요</h1>
        <p className="text-17 leading-normal font-medium text-muted">
          이 30자의 모양을 따라 나머지 글자를 그려요. 마음에 안 드는 글자가 있으면 눌러서 골라 주세요.
          {failed > 0 && ` 검사에 떨어진 ${failed}자는 빼고 그려요.`}
        </p>
      </div>

      <div
        role="group"
        aria-label="참고 글자"
        onFocus={onGridFocus}
        className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] sm:gap-2.5"
      >
        {items.map((item, index) => {
          const on = picked.has(index);
          const drawing = item.status === "drawing" || item.status === "redrawing";
          const spent = (item.redrawsLeft ?? 1) === 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              disabled={drawing || spent || sending}
              title={spent ? "다시 그리기를 다 썼어요" : undefined}
              onClick={() => toggle(index)}
              aria-label={`${item.char}${item.status === "failed" ? " · 검사에 떨어짐" : ""}${on ? " · 다시 그릴 글자로 골랐어요" : ""}`}
              className={`relative grid aspect-square place-items-center rounded-2xl transition-colors disabled:cursor-default ${
                on ? "border-2 border-ink bg-subtle" : item.status === "failed" ? "border-[1.5px] border-dashed border-edge bg-subtle" : "border-[1.5px] border-line bg-stage hover:border-ink"
              }`}
            >
              {item.status === "ready" && item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 글자 그림
                <img src={item.imageUrl} alt="" className="h-[78%] w-[78%] object-contain mix-blend-multiply" />
              ) : (
                <span className="text-3xl text-muted" style={{ fontFamily: GLYPH_FONT_STACK }}>
                  {item.char}
                </span>
              )}
              {drawing && (
                <span aria-hidden className="absolute inset-0 grid place-items-center rounded-2xl bg-bg/70">
                  <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-track border-t-ink" />
                </span>
              )}
              {on && <span className="absolute top-1.5 right-1.5 rounded-full bg-ink px-1.5 py-0.5 text-[0.6875rem] font-extrabold text-bg">다시</span>}
              {item.status === "failed" && !on && <span className="absolute bottom-1.5 text-[0.6875rem] font-bold text-muted">떨어짐</span>}
            </button>
          );
        })}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {/* 남은 시간과 버튼은 화면 아래에 붙인다(휴대폰에서 30칸이 길어 아래로 밀려도 보이게) */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-paper px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:-mx-10 lg:px-10 lg:pb-5">
        <div className="flex min-w-0 basis-full flex-col gap-2 sm:flex-1 sm:basis-auto">
          <span aria-hidden className="text-15 font-bold">
            {status}
          </span>
          <span aria-live="polite" className="sr-only">
            {spoken}
          </span>
          {counting && (
            <div aria-hidden className="h-1 w-full max-w-56 overflow-hidden rounded-sm bg-track">
              <div className="h-full bg-ink transition-[width] duration-300 ease-linear" style={{ width: `${(left / REVIEW_SECONDS) * 100}%` }} />
            </div>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
          {counting ? (
            <button type="button" disabled={sending} onClick={wait} className={secondary}>
              기다리기
            </button>
          ) : (
            <button type="button" disabled={picked.size === 0 || busy.length > 0 || sending} onClick={redraw} className={secondary}>
              고른 글자 다시 그리기{picked.size ? ` (${picked.size})` : ""}
            </button>
          )}
          <button
            type="button"
            disabled={busy.length > 0 || sending}
            onClick={() => {
              setPicked(new Set());
              void send({ action: "continue" });
            }}
            className="h-12 flex-1 rounded-full bg-ink px-7 text-15 font-bold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted sm:flex-none"
          >
            {picked.size ? "고른 글자는 두고 계속" : "이대로 계속"}
          </button>
        </div>
      </div>
    </div>
  );
}
