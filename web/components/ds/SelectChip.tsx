"use client";

import type { ReactNode } from "react";

// 11/6 고르는 칩 '중간 강도'(README 1-3, screens.md 오후 2차, 피그마 463:115).
// 고른 칩: 회색 바탕(bg/surface-strong) + 2px 먹 테두리 + 굵은 글자. 먹 채움은 누르는 버튼에만 쓴다.
// 안 고른 칩: 옅은 테두리(border/default) + 보통 굵기. 꺼진 칩: 점선 테두리.
// 2/4 칩, 3/4, 글자 다듬기 프리셋 칩이 같은 모양이다.
// 11/6 밤: 고르면 칩 폭이 바뀌어 옆 칩이 밀리던 것 → 체크를 빼고(고름 = 회색 바탕 + 2px 먹 테두리 + 굵게, aria-pressed/aria-checked는 그대로),
// 테두리는 늘 1.5px로 두고 2px 먹 테두리는 위에 겹쳐 그리며(SelectedRing), 굵은 글자 폭을 미리 잡아 둔다(ReserveBold).

/**
 * 굵기가 바뀌어도 폭이 그대로인 글자. 안 보이는 굵은 글자가 같은 칸에 겹쳐 폭을 정한다(글자가 고르기 전후로 같은 폭).
 * 줄 안에서 쓰는 inline-grid라 칩·줄·칸 어디에나 넣는다. 화면 읽기는 보이는 쪽만 읽는다.
 */
export function ReserveBold({ bold, children, className = "" }: { bold: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-grid min-w-0 ${className}`}>
      <span className={`col-start-1 row-start-1 min-w-0 ${bold ? "font-bold" : ""}`}>{children}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1 min-w-0 font-bold">
        {children}
      </span>
    </span>
  );
}

/**
 * 고른 표시 2px 먹 테두리. 자리를 차지하지 않게 바깥 1.5px 테두리 위에 겹쳐 그린다(부모는 relative + border-[1.5px]).
 * 테두리 굵기를 1.5 → 2로 바꾸면 상자가 1px 커져 옆이 밀린다. radius는 부모와 같은 값을 넘긴다.
 */
export function SelectedRing({ className = "rounded-full" }: { className?: string }) {
  return <span aria-hidden className={`pointer-events-none absolute -inset-[1.5px] border-2 border-border-active ${className}`} />;
}

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
   * md 42px(질문 칩) · sm 36px 글자 13(글자 다듬기 프리셋, 563:590). sm은 데스크톱에서 좌우 10으로 줄여
   * 서랍(560) 안에 프리셋 일곱 개가 한 줄로 들어간다(screens.md 오후 8차, 사용자 요청: 넘침·줄바꿈 없이 한 줄).
   */
  size?: "md" | "sm";
  className?: string;
};

export function SelectChip({ selected, onClick, children, badge, disabled, mode = "toggle", tabIndex, size = "md", className = "" }: SelectChipProps) {
  const a11y = mode === "radio" ? ({ role: "radio", "aria-checked": selected } as const) : ({ "aria-pressed": selected } as const);
  return (
    <button
      type="button"
      {...a11y}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full border-[1.5px] font-medium transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-standard motion-safe:active:scale-[0.97] disabled:active:scale-100 ${
        size === "sm" ? "h-9 px-3 text-13 lg:px-2.5" : "h-[2.625rem] px-4 text-15"
      } ${
        selected
          ? "border-border-active bg-bg-surface-strong text-text-primary"
          : disabled
            ? "cursor-not-allowed border-dashed border-border-strong bg-bg-surface text-text-secondary"
            : "border-border-default bg-bg-canvas text-text-primary hover:border-border-strong hover:bg-bg-surface"
      } ${className}`}
    >
      {selected && <SelectedRing />}
      <ReserveBold bold={selected}>{children}</ReserveBold>
      {badge && <span className="text-13 font-bold text-text-success">{badge}</span>}
    </button>
  );
}
