"use client";

import type { ReactNode } from "react";
import { onRadioKeys, rovingTab } from "@/components/ui";
import { CheckCircle } from "./Check";

// 11/6 양쪽 고르기(3/4 글씨 취향 B안, 피그마 552:608 '양쪽 고르기').
// 반대말 두 칸을 한 줄로 붙이고, 고른 쪽만 중간 강도(회색 바탕 + 2px 먹 테두리) + 오른쪽 위 체크 원. 글자·이름은 왼쪽 정렬.
// 접근성은 지금 코드 그대로: 쌍마다 role="radiogroup", 화살표 키로 옮기며 고르기, Tab은 고른 칸(없으면 첫 칸)으로.

export type PairOption<V extends string> = {
  value: V;
  /** 칸 아래 이름(14) — '둥글게' */
  label: ReactNode;
  /** 칸 위 그림 자리 — 3/4에서는 '우리 가게' 외곽선 그림 */
  visual?: ReactNode;
};

export function SegmentedPair<V extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: {
  /** 묶음 이름(화면 읽기용 aria-label). 눈에 보이는 제목은 화면이 따로 둔다. */
  label: string;
  options: readonly [PairOption<V>, PairOption<V>];
  value: V | undefined | null;
  onChange: (value: V) => void;
  className?: string;
}) {
  const any = options.some((o) => o.value === value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onRadioKeys}
      className={`relative grid grid-cols-2 rounded-[1.125rem] border-[1.5px] border-border-strong bg-bg-canvas ${className}`}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const left = i === 0;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={rovingTab(selected, left, any)}
            onClick={() => onChange(o.value)}
            className={`group relative flex min-h-[6.5rem] min-w-0 flex-col items-start justify-between gap-2 px-6 pt-3 pb-3.5 text-left transition-colors duration-(--dur-fast) ${
              left ? "rounded-l-[1rem] border-r-[1.5px] border-border-strong" : "rounded-r-[1rem]"
            } ${selected ? "bg-bg-surface-strong" : "hover:bg-bg-surface"}`}
          >
            {/* 고른 쪽 2px 먹 테두리: 바깥 1.5px 테두리와 가운데 줄 위에 겹쳐 그린다 */}
            {selected && (
              <span
                aria-hidden
                className={`pointer-events-none absolute -inset-[1.5px] z-10 border-2 border-border-active ${left ? "rounded-l-[1.125rem]" : "rounded-r-[1.125rem]"}`}
              />
            )}
            <span className="min-w-0 pr-8 text-text-primary">{o.visual}</span>
            <span className={`text-sm text-text-primary ${selected ? "font-bold" : "font-medium"}`}>{o.label}</span>
            {selected && <CheckCircle pop className="absolute top-4 right-4 z-10" />}
          </button>
        );
      })}
    </div>
  );
}
