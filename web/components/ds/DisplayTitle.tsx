import type { ReactNode } from "react";

// 11/6 큰 제목(Black Han Sans) + 흰 형광펜. 메인 첫 화면 '한글 서체', 스튜디오 완성 '한결국수체가' 한 곳씩에만 쓴다.
// 형광펜은 핵심어 하나의 글자 아래쪽 절반(줄 높이의 51~84%) 뒤에 깔리는 흰 띠, 살짝(−1°) 기울었다(피그마 432:45 · 549:581).
// 상태 줄·작은 제목에는 쓰지 않는다(screens.md 오후 2차: 장치가 흔해지면 제목과 다툼).

type HeadingTag = "h1" | "h2" | "p";

/** Black Han Sans 제목. 크기는 className으로(기본: 휴대폰 30 · lg 64, 줄 간격 1.25, 자간 −3%). */
export function DisplayTitle({ as: Tag = "h1", className = "text-[1.875rem] lg:text-[4rem]", children }: { as?: HeadingTag; className?: string; children: ReactNode }) {
  return <Tag className={`font-display leading-[1.25] font-normal tracking-[-0.03em] text-text-primary ${className}`}>{children}</Tag>;
}

/** 형광펜: 제목 안 핵심어를 감싼다. tone=brand는 민트 형광펜(말풍선 스티커 안). */
export function Highlight({ children, tone = "white", tilt = -1 }: { children: ReactNode; tone?: "white" | "brand"; tilt?: number }) {
  return (
    <span className="relative isolate inline-block">
      <span
        aria-hidden
        style={{ transform: `rotate(${tilt}deg)` }}
        className={`absolute -inset-x-[0.08em] top-[51%] bottom-[16%] -z-10 ${tone === "brand" ? "rounded-[0.08em] bg-bg-brand" : "bg-bg-canvas"}`}
      />
      {children}
    </span>
  );
}
