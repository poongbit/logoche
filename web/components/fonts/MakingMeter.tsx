"use client";

// 만드는 중 화면의 진행 표시(11/6 피그마 17 '추천 조합 v2', docs/design-1106/screens.md '만드는 중').
// - 진행 막대는 DESIGN 2-2 그대로(먹 길 + 민트 채움). 막대와 퍼센트는 '그린 글자 / 2,432자'만 뜻한다(옛 overallPercent의 0~100% 이어 붙이기는 버렸다).
// - 시계는 1초마다 한 번 도는 공용 시계(useNow) 하나로 센다. 렌더 중에 Date.now()를 부르지 않는다(react-hooks/purity).

import { useState, useSyncExternalStore } from "react";
import { EXTRA_CHARS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";

/* ---------- 공용 시계 ---------- */

let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const l of clockListeners) l();
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (!clockListeners.size && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** 지금 시각(ms). 1초마다 바뀐다. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => clockNow, () => clockNow);
}

/** 서버가 준 남은 시간(초)에서 1초마다 줄어드는 값. 서버 값이 바뀌면 거기서 다시 센다. 0 이하로도 내려간다(번호표가 '확인 중'으로 바꾼다). */
export function useCountdown(serverSeconds: number | null): number | null {
  const now = useNow();
  const [anchor, setAnchor] = useState<{ value: number | null; at: number }>({ value: serverSeconds, at: now });
  // 서버 값이 바뀐 렌더에서 기준점을 옮긴다(React '이전 값 기억' 방식)
  const current = anchor.value === serverSeconds ? anchor : { value: serverSeconds, at: now };
  if (current !== anchor) setAnchor(current);
  if (current.value === null) return null;
  return current.value - Math.floor((now - current.at) / 1000);
}

/**
 * '마지막으로 그린 때'. 서버 값(lastSheetAt)이 있으면 그것을, 없으면(기준 글자 30자·예전 서버) 이 화면에서 그린 개수가 늘어난 순간을 쓴다.
 * 화면에서 센 값은 처음 들어온 직후에는 없어서(null) 다음 글자가 나올 때까지 그 줄을 숨긴다(screens.md '코드 확인' 방법 1).
 */
export function useLastDrawnAt(serverAt: number | null | undefined, count: number): number | null {
  const now = useNow();
  const [seen, setSeen] = useState<{ count: number; at: number | null }>({ count, at: null });
  if (seen.count !== count) setSeen({ count, at: count > seen.count ? now : seen.at });
  return serverAt ?? seen.at;
}

/** 'N초 전' */
export function agoText(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 5) return "방금";
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

/* ---------- 전체 글자 수 ---------- */

/** 폰트에 들어가는 글자 수: 한글 2,350자(KS X 1001) + 숫자·문장부호·영문 82자 */
export const GLYPH_TOTAL = KSX1001_HANGUL.size + EXTRA_CHARS.length;

/* ---------- 진행 막대 ---------- */

/**
 * 진행 막대(DESIGN 2-2): 먹 길(16px) 안쪽 2px에 민트 채움. 채움은 너비 대신 clip-path로 300ms(motion.md '막대 너비', 둥근 끝이 찌그러지지 않게).
 * 움직임 줄이기에서는 전역 규칙이 전환을 끈다.
 */
export function ProgressBar({ value, max, label, valueText }: { value: number; max: number; label: string; valueText?: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className="h-4 w-full rounded-full bg-bg-inverse p-0.5"
    >
      <div
        className="h-full w-full rounded-full bg-bg-brand transition-[clip-path] duration-(--dur-move) ease-standard"
        style={{ clipPath: `inset(0 ${((1 - ratio) * 100).toFixed(2)}% 0 0 round 999px)` }}
      />
    </div>
  );
}

/* ---------- 글자 칸(보기 전용) ---------- */

/** 그린 글자 한 칸: 테두리 없는 회색 칸(screens.md '방금 그린 글자' — 누르는 칸이 아니다). pop이면 나타날 때 ds-pop 한 번. */
export function GlyphTile({ char, src, className = "" }: { char: string; src: string | null; className?: string }) {
  return (
    <span className={`ds-motion grid aspect-square animate-ds-pop-glyph place-items-center overflow-hidden rounded-[0.75rem] bg-bg-surface-strong ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 글자 그림
        <img src={src} alt={char} loading="lazy" decoding="async" className="h-[76%] w-[76%] object-contain mix-blend-multiply" />
      ) : (
        <span className="text-17 font-bold text-text-secondary">{char}</span>
      )}
    </span>
  );
}

/** 아직 그리지 않은 칸(점선) */
export function PendingTile() {
  return <span aria-hidden className="aspect-square rounded-[0.75rem] border-[1.5px] border-dashed border-border-strong" />;
}
