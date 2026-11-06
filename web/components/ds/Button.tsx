import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

// 11/6 공통 버튼(피그마 '로고체 디자인' 17 페이지 공용 부품 441:35 · 441:40 · 441:47, 메인 427:9).
// 누름은 0.97배 100ms(움직임 줄이기에서는 끔). 마우스를 올렸을 때 효과는 Tailwind hover가 (hover: hover) 기기에서만 건다.

/** 오른쪽 화살표(B3 동그라미 안). 피그마 441:39 선 2.5. */
export function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3 8.5h10.5M9 13l4.5-4.5L9 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 키보드 초점: 3px 먹 테두리를 2px 띄워서(피그마 B3 설명). 전역 초점(민트 고리)보다 이 부품의 규칙이 이긴다.
const FOCUS_INK = "focus-visible:shadow-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-border-active";
const PRESS =
  "transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-standard motion-safe:active:scale-[0.97] disabled:active:scale-100";

/* ---------- 주 버튼 B3 '체 태그' ---------- */

type PrimaryLayout = {
  /** 폭 전체(모바일). 글자는 왼쪽, 동그라미는 오른쪽 끝(피그마 '양 끝 정렬'). */
  block?: boolean;
  /** 폭 전체일 때 글자 위치. 메인 데스크톱 접수증 버튼은 'center'. */
  labelAlign?: "start" | "center";
  children: ReactNode;
};

const primaryClass = (block: boolean | undefined, className = "") =>
  `group inline-flex h-14 shrink-0 items-center gap-5 rounded-full border-[1.5px] pr-1.5 pl-6 text-left text-17 font-bold ${PRESS} ${FOCUS_INK} ${
    block ? "w-full" : ""
  } border-transparent bg-bg-inverse text-text-inverse hover:bg-bg-inverse-strong disabled:cursor-not-allowed disabled:border-dashed disabled:border-border-strong disabled:bg-bg-disabled disabled:text-text-disabled ${className}`;

function PrimaryInner({ block, labelAlign = "start", children }: PrimaryLayout) {
  return (
    <>
      <span className={`min-w-0 ${block ? `flex-1 ${labelAlign === "center" ? "text-center" : ""}` : ""}`}>{children}</span>
      {/* 체 태그 동그라미 44px: 민트 + 먹 화살표. 꺼진 버튼은 회색 동그라미(피그마 453:288). */}
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full bg-bg-brand text-text-on-brand group-disabled:bg-bg-disabled group-aria-disabled:bg-bg-disabled"
      >
        <ArrowIcon className="h-4 w-4 transition-transform duration-(--dur-fast) ease-standard motion-safe:group-hover:translate-x-0.5 group-disabled:translate-x-0" />
      </span>
    </>
  );
}

/** 주 버튼(B3). 화면마다 하나. 꺼짐은 점선 테두리 + 회색(이유 문구는 화면이 옆에 둔다). */
export function PrimaryButton({
  block,
  labelAlign,
  className,
  type = "button",
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & PrimaryLayout & { className?: string }) {
  return (
    <button type={type} className={primaryClass(block, className)} {...props}>
      <PrimaryInner block={block} labelAlign={labelAlign}>
        {children}
      </PrimaryInner>
    </button>
  );
}

/** 주 버튼(B3) 모양의 링크(Next Link). 꺼진 상태는 없다 — 갈 수 없으면 PrimaryButton disabled를 쓴다. */
export function PrimaryLink({
  block,
  labelAlign,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "children" | "className"> & PrimaryLayout & { className?: string }) {
  return (
    <Link className={primaryClass(block, className)} {...props}>
      <PrimaryInner block={block} labelAlign={labelAlign}>
        {children}
      </PrimaryInner>
    </Link>
  );
}

/* ---------- 보조 버튼(외곽선 알약) ---------- */

type SecondarySize = "md" | "sm";

// md: 높이 52 · 글자 16(441:40). sm: 높이 40 · 글자 14(screens.md 오후 3차 '작은 보조 버튼', 목록 줄·받기 줄).
const SECONDARY_SIZES: Record<SecondarySize, string> = {
  md: "h-[3.25rem] px-6 text-base",
  sm: "h-10 px-[1.125rem] text-sm",
};

const secondaryClass = (size: SecondarySize, block: boolean | undefined, className = "") =>
  `inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-2 border-border-active bg-bg-canvas font-bold text-text-primary ${PRESS} ${FOCUS_INK} hover:bg-bg-surface disabled:cursor-not-allowed disabled:border-[1.5px] disabled:border-dashed disabled:border-border-strong disabled:bg-bg-surface disabled:text-text-disabled ${
    SECONDARY_SIZES[size]
  } ${block ? "w-full" : ""} ${className}`;

export function SecondaryButton({
  size = "md",
  block,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: SecondarySize; block?: boolean }) {
  return <button type={type} className={secondaryClass(size, block, className)} {...props} />;
}

export function SecondaryLink({
  size = "md",
  block,
  className,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & { size?: SecondarySize; block?: boolean; className?: string }) {
  return <Link className={secondaryClass(size, block, className)} {...props} />;
}

/* ---------- 글자 링크(밑줄) ---------- */

// 피그마 441:47: 15 굵게, 보조 글자색, 밑줄. 위아래 12px 여백으로 누르는 높이 42px.
const textLinkClass = (tone: "secondary" | "primary", className = "") =>
  `inline-flex items-center py-3 text-15 font-bold underline decoration-1 underline-offset-[0.25em] transition-colors duration-(--dur-fast) ${
    tone === "primary" ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
  } disabled:cursor-not-allowed disabled:text-text-disabled disabled:no-underline ${className}`;

type TextLinkTone = { tone?: "secondary" | "primary" };

/** 글자 링크 — 버튼으로(onClick). 이동은 TextLink. */
export function TextButton({ tone = "secondary", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & TextLinkTone) {
  return <button type={type} className={textLinkClass(tone, className)} {...props} />;
}

/** 글자 링크 — 이동(Next Link). */
export function TextLink({ tone = "secondary", className, ...props }: Omit<ComponentProps<typeof Link>, "className"> & TextLinkTone & { className?: string }) {
  return <Link className={textLinkClass(tone, className)} {...props} />;
}
