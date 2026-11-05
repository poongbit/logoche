// 메인 화면의 민트 띠와 이어지는 화면 제목 띠(11/5): 메인에서 '내 폰트' 등으로 넘어가도 느낌이 달라지지 않게 같은 띠 위에 내용을 둔다.
// hideTitle이면 제목은 화면 읽기 프로그램에만 남기고(머리줄 밑줄이 현재 화면을 알려 준다) 띠 안에는 children(찾기·필터)을 둔다.

import type { ReactNode } from "react";

export function PageBand({
  title,
  lead,
  action,
  hideTitle,
  children,
}: {
  title: string;
  lead?: string;
  action?: ReactNode;
  hideTitle?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="bg-bg-theme-strong">
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-5 px-5 py-6 lg:px-10 lg:py-8">
        <div
          className={
            hideTitle
              ? "sr-only"
              : "flex flex-wrap items-end justify-between gap-4"
          }
        >
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-26 font-extrabold lg:text-32">{title}</h1>
            {lead && <p className="text-17 text-text-secondary">{lead}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}
