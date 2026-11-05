"use client";

// 떠오르는 막대(DESIGN.md 8-2): 글자를 하나라도 고르면 화면 아래 가운데에 뜬다. 고른 글자 · 고르기 취소 · 흰 알약 '고른 글자 다시 그리기 (n)'.
// 그림자는 떠 있는 층에만 쓰는 값(shadow-float) 하나. 아래 결정 막대(StickyBar) 위에 얹는다.

export function SelectionBar({ chars, disabled, onCancel, onRedraw }: { chars: string[]; disabled?: boolean; onCancel: () => void; onRedraw: () => void }) {
  if (!chars.length) return null;
  const shown = chars.slice(0, 6).join(" ");
  return (
    <div role="region" aria-label="고른 글자" className="pointer-events-none fixed inset-x-0 bottom-[8.5rem] z-20 flex justify-center px-5 sm:bottom-28">
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-bg-inverse py-2 pr-2 pl-5 text-text-inverse shadow-float motion-safe:animate-[ds-rise_160ms_ease-out]">
        <span className="min-w-0 truncate text-15 font-bold">
          {shown}
          {chars.length > 6 && ` 외 ${chars.length - 6}자`}
        </span>
        <button type="button" onClick={onCancel} className="h-10 shrink-0 rounded-full px-2 text-13 font-semibold text-text-inverse/75 underline underline-offset-4 hover:text-text-inverse">
          고르기 취소
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRedraw}
          className="h-10 shrink-0 rounded-full bg-bg-canvas px-4 text-15 font-bold text-text-primary transition-colors hover:bg-bg-surface-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          고른 글자 다시 그리기 ({chars.length})
        </button>
      </div>
    </div>
  );
}
