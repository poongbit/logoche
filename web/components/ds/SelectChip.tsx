"use client";

import type { ReactNode } from "react";
import { CheckMark } from "./Check";

// 11/6 고르는 칩 '중간 강도'(README 1-3, screens.md 오후 2차, 피그마 463:115).
// 고른 칩: 회색 바탕(bg/surface-strong) + 2px 먹 테두리 + 체크 + 굵은 글자. 먹 채움은 누르는 버튼에만 쓴다.
// 안 고른 칩: 옅은 테두리(border/default) + 보통 굵기. 꺼진 칩: 점선 테두리.
// 2/4 칩, 3/4, 글자 다듬기 프리셋 칩이 같은 모양이다.

export type SelectChipProps = {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** 칩 안에 붙는 짧은 말('추천' 등) */
  badge?: string;
  disabled?: boolean;
  /**
   * toggle: 여러 개 고르기(aria-pressed). 기본.
   * radio: 하나만 고르기(role="radio" + aria-checked). role="radiogroup" + onKeyDown={onRadioKeys}인 묶음 안에 두고
   * tabIndex={rovingTab(selected, i === 0, anySelected)}를 넘긴다(components/ui.tsx).
   */
  mode?: "toggle" | "radio";
  tabIndex?: number;
  /**
   * md 42px(질문 칩) · sm 36px 글자 13(글자 다듬기 프리셋, 563:590). sm은 데스크톱에서 좌우 10·체크 간격 4로 줄여
   * 서랍(560) 안에 프리셋 일곱 개가 한 줄로 들어간다(screens.md 오후 8차, 사용자 요청: 넘침·줄바꿈 없이 한 줄).
   */
  size?: "md" | "sm";
  className?: string;
};

export function SelectChip({ selected, onClick, children, badge, disabled, mode = "toggle", tabIndex, size = "md", className = "" }: SelectChipProps) {
  const a11y = mode === "radio" ? ({ role: "radio", "aria-checked": selected } as const) : ({ "aria-pressed": selected } as const);
  const pad = size === "sm" ? (selected ? "pr-3 pl-2.5 lg:pr-2.5 lg:pl-2" : "px-3 lg:px-2.5") : selected ? "pr-4 pl-3" : "px-4";
  return (
    <button
      type="button"
      {...a11y}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center rounded-full transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-standard motion-safe:active:scale-[0.97] disabled:active:scale-100 ${
        size === "sm" ? "h-9 gap-1.5 text-13 lg:gap-1" : "h-[2.625rem] gap-1.5 text-15"
      } ${pad} ${
        selected
          ? "border-2 border-border-active bg-bg-surface-strong font-bold text-text-primary"
          : disabled
            ? "cursor-not-allowed border-[1.5px] border-dashed border-border-strong bg-bg-surface font-medium text-text-secondary"
            : "border-[1.5px] border-border-default bg-bg-canvas font-medium text-text-primary hover:border-border-strong hover:bg-bg-surface"
      } ${className}`}
    >
      {selected && <CheckMark className="ds-motion h-3.5 w-3.5 animate-ds-check" />}
      {children}
      {badge && <span className="text-13 font-bold text-text-success">{badge}</span>}
    </button>
  );
}
