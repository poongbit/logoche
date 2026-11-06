"use client";

// 기준 글자 30자 확인(11/6 피그마 17 '기준 글자 확인' 486:6439, 흰 바탕). 지금은 '기준 글자를 그리다 멈춘 뒤 이어서 만들기'를 누를 때만 거친다(드묾).
// 30자를 그린 결과를 보고 나머지 글자를 그릴지 정한다. 가장 큰 비용이 나머지 글자 그리기라 저절로 계속하지 않는다. 정할 때까지 서버가 기다리고, 창을 닫았으면 메일로 알린다.
// 고를 수 있는 것: 이어서 나머지 그리기 · 고른 글자만 다시 그리기 · 다른 느낌으로 다시 고르기(견본은 남아 있어 30자만 다시 그린다) · 나중에 정하기.
// 11/6: 이름 '참고 글자' → '기준 글자', 근거 없는 '약 6분' 문구 삭제, 고른 칸 표시를 '다시' 꼬리표 → 오른쪽 위 먹 체크 원.

import { useState } from "react";
import { CheckCircle, PrimaryButton, SecondaryButton, TextButton, TextLink } from "@/components/ds";
import { Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import type { ProjectView } from "@/lib/types";

/** 목적격 조사: 마지막 글자에 받침이 있으면 '을', 없으면 '를' */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "을" : "를";
}

export function Review({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const items = view.review?.items ?? [];
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = items.filter((i) => i.status === "drawing" || i.status === "redrawing");
  const failed = items.filter((i) => i.status === "failed").length;
  const ready = items.filter((i) => i.status === "ready").length;
  const locked = busy.length > 0 || sending;

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

  function toggle(index: number) {
    const next = new Set(picked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setPicked(next);
  }

  const busyChars = busy.map((i) => `'${i.char}'`).join(", ");
  const status = busy.length
    ? `${busyChars}${objectParticle(busy[busy.length - 1].char)} 다시 그리고 있어요`
    : picked.size
      ? `${picked.size}자를 골랐어요. 다시 그리거나 그대로 두고 이어서 그릴 수 있어요.`
      : "결과를 보고 정해 주세요. 정할 때까지 기다려요.";

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-1 flex-col px-5 pt-8 pb-14 lg:px-10 lg:pt-16 lg:pb-20">
      <div className="ds-motion flex animate-ds-enter flex-col gap-2">
        <span className="text-13 font-bold text-text-secondary">{view.storeName}</span>
        <h1 className="font-display text-[1.75rem] leading-[1.25] tracking-[-0.03em] lg:text-[2.75rem]">기준 글자 30자를 그렸어요</h1>
        <p className="text-15 leading-normal font-medium lg:text-17">
          이 30자의 모양을 따라 나머지 글자를 그려요. 보고 이어서 그릴지 정해 주세요. 정할 때까지 기다려요.
          <br className="max-lg:hidden" /> 마음에 안 드는 글자는 눌러서 다시 그릴 수 있어요.
          {failed > 0 ? ` 검사에 떨어진 ${failed}자는 빼고 그려요.` : ""}
        </p>
      </div>

      <div role="group" aria-label="기준 글자" className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-6 lg:mt-10 lg:grid-cols-10 lg:gap-3">
        {items.map((item, index) => {
          const on = picked.has(index);
          const drawing = item.status === "drawing" || item.status === "redrawing";
          const spent = (item.redrawsLeft ?? 1) === 0;
          const fell = item.status === "failed";
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              disabled={drawing || spent || sending}
              title={spent ? "다시 그리기를 다 썼어요" : undefined}
              onClick={() => toggle(index)}
              aria-label={`${item.char}${fell ? " · 검사에 떨어짐" : ""}${on ? " · 다시 그릴 글자로 골랐어요" : ""}`}
              className={`relative grid aspect-square place-items-center rounded-[0.875rem] bg-bg-canvas transition-[border-color,transform] duration-(--dur-fast) ease-standard motion-safe:active:scale-[0.97] disabled:cursor-default disabled:active:scale-100 ${
                on ? "border-2 border-border-active" : "border-[1.5px] border-border-default hover:border-border-strong"
              }`}
            >
              {item.status === "ready" && item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 글자 그림
                <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="h-[70%] w-[70%] object-contain mix-blend-multiply" />
              ) : (
                <span className={`text-3xl ${fell ? "text-text-disabled" : "text-text-secondary"}`} style={{ fontFamily: GLYPH_FONT_STACK }}>
                  {item.char}
                </span>
              )}
              {drawing && (
                <span aria-hidden className="absolute inset-0 grid place-items-center rounded-[0.875rem] bg-bg-canvas/70">
                  <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-border-default border-t-border-active" />
                </span>
              )}
              {on && <CheckCircle size={22} pop className="absolute top-1.5 right-1.5" />}
              {fell && !on && <span className="absolute bottom-1.5 text-12 font-bold text-text-secondary">떨어짐</span>}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="mt-6 text-13 font-medium text-text-secondary lg:mt-8">
        {status}
      </p>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4">
        <PrimaryButton
          block
          className="lg:w-auto"
          disabled={locked || ready === 0}
          onClick={() => {
            setPicked(new Set());
            void send({ action: "continue" });
          }}
        >
          이어서 나머지 그리기
        </PrimaryButton>
        {picked.size > 0 && (
          <SecondaryButton
            className="ds-motion animate-ds-enter max-lg:w-full"
            disabled={locked}
            onClick={() => {
              const indices = [...picked];
              setPicked(new Set());
              void send({ action: "redraw", indices });
            }}
          >
            고른 {picked.size}자 다시 그리기
          </SecondaryButton>
        )}
        <div className="flex flex-wrap items-center gap-x-6 lg:ml-2">
          <TextButton disabled={locked} onClick={() => void send({ action: "restyle" })}>
            다른 느낌으로 다시 고르기
          </TextButton>
          <TextLink href="/fonts">나중에 정하기</TextLink>
        </div>
      </div>
    </div>
  );
}
