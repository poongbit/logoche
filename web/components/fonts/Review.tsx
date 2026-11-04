"use client";

// 참고 글자 30자 확인과 이어서 그리기 결정(11/4 사용자 결정). 30자를 그린 결과를 보고 나머지 글자(약 2,300자, 약 6분)를 그릴지 정한다.
// 가장 큰 비용이 나머지 글자 그리기라 저절로 계속하지 않는다(이전의 20초 자동 계속을 없앴다). 정할 때까지 서버가 기다리고, 창을 닫았으면 메일로 알린다.
// 고를 수 있는 것: 이 느낌으로 나머지 그리기 · 다른 느낌으로 다시 고르기(견본은 남아 있어 30자만 다시 그린다) · 마음에 안 드는 글자만 다시 그리기 · 나중에 정하기.

import { useState } from "react";
import Link from "next/link";
import { Steps } from "@/components/fonts/Making";
import { StickyBar } from "@/components/fonts/shared";
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

  const secondary =
    "h-12 rounded-full border-[1.5px] border-edge bg-bg px-5 text-15 font-bold transition-colors hover:border-ink hover:bg-subtle disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted disabled:hover:bg-bg";

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-7 px-5 pt-8 lg:px-10 lg:pt-10">
      <Steps current={4} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">{view.name}</span>
        <h1 className="text-26 font-extrabold lg:text-32">참고 글자 30자를 그렸어요</h1>
        <p className="text-17 leading-normal font-medium text-muted">
          이 30자의 모양을 따라 나머지 글자 2,300여 자를 그려요. 나머지를 그리는 데는 약 6분이 걸려요. 결과를 보고 이어서 그릴지 정해 주세요.
          {failed > 0 && ` 검사에 떨어진 ${failed}자는 빼고 그려요.`}
        </p>
      </div>

      <div role="group" aria-label="참고 글자" className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] sm:gap-2.5">
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
                <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="h-[78%] w-[78%] object-contain mix-blend-multiply" />
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
              {on && <span className="absolute top-1.5 right-1.5 rounded-full bg-ink px-1.5 py-0.5 text-12 font-extrabold text-bg">다시</span>}
              {item.status === "failed" && !on && <span className="absolute bottom-1.5 text-12 font-bold text-muted">떨어짐</span>}
            </button>
          );
        })}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <StickyBar className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 basis-full flex-col gap-1 sm:flex-1 sm:basis-auto">
          <span aria-live="polite" className="text-15 font-bold">
            {status}
          </span>
          <span className="text-13 text-muted">
            창을 닫아도 돼요.{" "}
            <Link href="/fonts" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
              나중에 정하기
            </Link>
          </span>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
          {picked.size > 0 && (
            <button
              type="button"
              disabled={busy.length > 0 || sending}
              onClick={() => {
                const indices = [...picked];
                setPicked(new Set());
                void send({ action: "redraw", indices });
              }}
              className={secondary}
            >
              고른 글자 다시 그리기 ({picked.size})
            </button>
          )}
          <button type="button" disabled={busy.length > 0 || sending} onClick={() => void send({ action: "restyle" })} className={secondary}>
            다른 느낌으로 다시
          </button>
          <button
            type="button"
            disabled={busy.length > 0 || sending || ready === 0}
            onClick={() => {
              setPicked(new Set());
              void send({ action: "continue" });
            }}
            className="h-12 flex-1 rounded-full bg-ink px-7 text-15 font-bold text-bg transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted sm:flex-none"
          >
            이어서 나머지 그리기
          </button>
        </div>
      </StickyBar>
    </div>
  );
}
