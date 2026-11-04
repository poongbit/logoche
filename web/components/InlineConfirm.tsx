"use client";

// 페이지 안에서 펼치는 확인 상자(11/4 접근성 점검). 모달이 아니므로 role="group"으로 이름만 붙이고, 열리면 data-autofocus 단추로 포커스를 옮긴다
// (되돌릴 수 없는 일의 확인에서는 안전한 쪽, 곧 취소·계속 단추에 둔다). 이전에는 role="alertdialog"를 달고 포커스는 옮기지 않아 화면 읽기 프로그램이 대화상자로 안내하는데 포커스는 뒤에 있었다.

import { useEffect, useRef, type ReactNode } from "react";

export function InlineConfirm({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <div ref={ref} role="group" aria-label={label} className={className}>
      {children}
    </div>
  );
}
