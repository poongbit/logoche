import type { ReactNode } from "react";

// 11/6 접수증(메인 427:9 첫 화면, 질문 463:115·552:608, 확인 창 D2 v2).
// 흰 종이(모서리 22) + 절취선 + 절취선 양쪽 반원 홈(지름 36). 홈은 실제로 뚫려 있어서 뒤 바탕(민트 면)이 비친다.
// 위 칸(top)과 아래 칸(bottom) 두 자리. bottom이 없으면 절취선·홈 없이 한 장.
// 질문 단계가 바뀌어도 이 틀은 움직이지 않는다 — 안쪽만 animate-ds-enter로(motion.md '화면 전환').

export function Receipt({
  top,
  bottom,
  label = "접수증",
  perforation = "muted",
  as: Tag = "section",
  className = "",
  topClassName = "px-5 pt-6 pb-6 lg:px-8 lg:pt-7",
  bottomClassName = "px-5 pt-6 pb-7 lg:px-8 lg:pb-8",
  "aria-label": ariaLabel,
}: {
  top: ReactNode;
  bottom?: ReactNode;
  /** 위 칸 맨 위 작은 이름표(14 굵게, 보조 글자색). 없애려면 null */
  label?: ReactNode;
  /** 절취선 색: muted = border/strong 회색 점선 8·6(질문 화면), ink = 먹 점선 6·6(메인 첫 화면) */
  perforation?: "muted" | "ink";
  as?: "section" | "div" | "aside";
  className?: string;
  topClassName?: string;
  bottomClassName?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag aria-label={ariaLabel} className={`flex flex-col ${className}`}>
      <div className={`rounded-t-[1.375rem] bg-bg-canvas ${bottom ? "ds-notch-bottom" : "rounded-b-[1.375rem]"} ${topClassName}`}>
        {label != null && <p className="mb-4 text-sm font-bold text-text-secondary">{label}</p>}
        {top}
      </div>
      {bottom && (
        <div className={`ds-notch-top relative rounded-b-[1.375rem] bg-bg-canvas ${bottomClassName}`}>
          {/* 절취선: 양쪽 끝은 홈에서 6px 떨어진다(안쪽 24px) */}
          <div
            aria-hidden
            className={`ds-perforation absolute inset-x-6 -top-px ${perforation === "ink" ? "text-border-active [--dash:6px] [--gap:6px]" : "text-border-strong"}`}
          />
          {bottom}
        </div>
      )}
    </Tag>
  );
}
