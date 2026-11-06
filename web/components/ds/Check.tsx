// 11/6 체크 표시 두 가지.
// - CheckMark: 선만 있는 체크(칩 안, '지금까지 접수한 것' 줄).
// - CheckCircle: 먹 동그라미 + 흰 체크(고른 카드·3/4 칸·다시 볼 글자 오른쪽 위, 상태 줄 앞). 피그마 552:608 '고른 표시' 22px.

export function CheckMark({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 먹 체크 원. size는 px(16px 기준 rem으로 바꿔 그린다). pop이면 나타날 때 150ms 톡(움직임 줄이기에서는 투명도만). */
export function CheckCircle({ size = 22, pop = false, className = "" }: { size?: number; pop?: boolean; className?: string }) {
  const rem = `${size / 16}rem`;
  return (
    <span
      aria-hidden
      style={{ width: rem, height: rem }}
      className={`grid shrink-0 place-items-center rounded-full bg-bg-inverse text-text-inverse ${pop ? "ds-motion animate-ds-check" : ""} ${className}`}
    >
      <svg viewBox="0 0 16 16" className="h-[62%] w-[62%]">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
