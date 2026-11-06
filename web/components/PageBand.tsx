// 목록 화면 머리(11/6 피그마 550:471 · 494:340 · 494:371): 흰 바탕 위 Black Han Sans 제목 + 한 줄 설명 + 오른쪽 주 버튼.
// 11/5의 민트 띠는 거뒀다(DESIGN.md 2-4 A 규칙: 내 폰트는 흰 바탕). action은 데스크톱에서만 제목 오른쪽에 두고, 휴대폰에서 같은 일을 할 곳은 화면이 정한다.

import type { ReactNode } from "react";

export function PageBand({
  title,
  lead,
  action,
  children,
}: {
  title: string;
  lead?: string;
  /** 제목 오른쪽(데스크톱). 휴대폰에서는 숨긴다. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col px-4 pt-6 lg:px-10 lg:pt-10">
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2">
          <h1 className="font-display text-[2.5rem] leading-[1.25] font-normal tracking-[-0.03em] lg:text-[3.5rem]">
            {title}
          </h1>
          {lead && <p className="text-sm text-text-secondary lg:text-17">{lead}</p>}
        </div>
        {action && <div className="hidden shrink-0 lg:block">{action}</div>}
      </div>
      {children}
    </div>
  );
}
