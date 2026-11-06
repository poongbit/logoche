"use client";

// 떠오르는 막대(DESIGN.md 8-2, 피그마 562:591): 글자를 하나라도 고르면 화면 아래 가운데에 뜬다. '고른 글자 섭 · 뷁' · 고르기 취소 · 흰 알약 '고른 글자 다시 그리기 (n)'.
// 그림자는 떠 있는 층에만 쓰는 값(shadow-float) 하나. 나타날 때 아래에서 올라오며 200ms(animate-ds-rise, 움직임 줄이기에서는 투명도만).
// placement: 'bar'는 아래 결정 막대(StickyBar) 위에 얹고(기준 글자 확인), 'page'는 화면 아래에서 24px 띄운다(스튜디오 다시 볼 글자).

export function SelectionBar({
  chars,
  disabled,
  onCancel,
  onRedraw,
  placement = "bar",
}: {
  chars: string[];
  disabled?: boolean;
  onCancel: () => void;
  onRedraw: () => void;
  placement?: "bar" | "page";
}) {
  if (!chars.length) return null;
  const shown = chars.slice(0, 6).join(" · ");
  return (
    <div
      role="region"
      aria-label="고른 글자"
      className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${placement === "bar" ? "bottom-[8.5rem] sm:bottom-28" : "bottom-[max(1rem,env(safe-area-inset-bottom))] lg:bottom-6"}`}
    >
      <div className="ds-motion pointer-events-auto flex max-w-full animate-ds-rise items-center gap-3 rounded-full bg-bg-inverse py-2 pr-2 pl-5 text-text-inverse shadow-float sm:min-h-[4.5rem] sm:gap-5 sm:py-3.5 sm:pr-3.5 sm:pl-7">
        <span className="min-w-0 truncate text-15 font-bold sm:text-base">
          <span className="max-sm:sr-only">고른 글자 </span>
          {shown}
          {chars.length > 6 && ` 외 ${chars.length - 6}자`}
        </span>
        <button type="button" onClick={onCancel} className="h-10 shrink-0 rounded-full px-1 text-sm text-text-inverse underline decoration-1 underline-offset-[0.25em] hover:text-text-inverse/80">
          고르기 취소
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRedraw}
          className="h-11 shrink-0 rounded-full bg-bg-canvas px-4 text-15 font-bold text-text-primary transition-[background-color,transform] duration-(--dur-fast) ease-standard hover:bg-bg-surface-strong motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 sm:px-[1.375rem]"
        >
          고른 글자 다시 그리기 ({chars.length})
        </button>
      </div>
    </div>
  );
}
