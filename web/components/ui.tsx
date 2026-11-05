import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from "react";

// 10/29 Claude Design 'Logoche Final'·'C States'의 기본 조각. 강조는 검정 하나.
// 비활성은 색만 흐리게 하지 않고 점선 테두리와 이유 문구로도 알린다.

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "lg" | "md" | "sm";

const BUTTON_BASE = "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors duration-150 disabled:cursor-not-allowed";
const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-bg-inverse text-text-inverse hover:bg-bg-inverse-hover disabled:bg-bg-disabled disabled:text-text-disabled",
  outline:
    "border-[1.5px] border-border-strong bg-bg-canvas text-text-primary hover:border-border-active hover:bg-bg-surface disabled:border-dashed disabled:border-border-strong disabled:bg-bg-surface disabled:text-text-disabled",
  ghost: "text-text-primary underline underline-offset-4 hover:bg-bg-surface-strong disabled:text-text-disabled disabled:no-underline",
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  lg: "h-14 px-10 text-17",
  md: "h-12 px-6 text-15",
  sm: "h-10 px-[1.125rem] text-15",
};

const buttonClass = (variant: ButtonVariant, size: ButtonSize | undefined, className = "") =>
  `${BUTTON_BASE} ${BUTTON_STYLES[variant]} ${BUTTON_SIZES[size ?? (variant === "primary" ? "lg" : "md")]} ${className}`;

export function Button({
  variant = "primary",
  size,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "outline",
  size,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

/** 칩(업종·톤·사용처). badge는 '추천'처럼 칩 안에 붙는 말. 비활성이면 점선 테두리.
 * 고른 칩은 2px 검정 테두리 + 체크(10/30 사용자 지적: 검정으로 채우면 다음 버튼과 헷갈린다. 검정 채움은 누르는 버튼에만 쓴다). */
export function Chip({
  selected,
  onClick,
  children,
  badge,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center gap-1.5 rounded-full text-15 transition-colors duration-150 ${
        selected
          ? "border-2 border-border-active bg-bg-canvas pr-4 pl-3 font-bold text-text-primary"
          : disabled
            ? "cursor-not-allowed border-[1.5px] border-dashed border-border-strong bg-bg-surface px-4 font-semibold text-text-secondary"
            : "border-[1.5px] border-border-strong bg-bg-canvas px-4 font-semibold text-text-primary hover:border-border-active hover:bg-bg-surface"
      }`}
    >
      {selected && (
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
      {badge && <span className="text-13 font-bold text-text-success">{badge}</span>}
    </button>
  );
}

/** 라디오 행(권리 확인·표현 방식). 고른 행은 2px 검정 테두리 + 채운 점.
 * role="radiogroup"(onRadioKeys를 단 묶음) 안에 두고, tabIndex는 rovingTab으로 묶음에서 하나만 0이 되게 한다. */
export function RadioRow({
  selected,
  onClick,
  children,
  aside,
  large,
  tabIndex,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  aside?: ReactNode;
  large?: boolean;
  tabIndex?: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onClick}
      className={`flex w-full items-center gap-3 text-left transition-colors duration-150 ${
        large ? "min-h-[3.875rem] rounded-[0.875rem] px-5 py-4 text-17" : "min-h-[2.875rem] rounded-[0.875rem] px-4 py-2 text-15"
      } ${selected ? "border-2 border-border-active bg-bg-surface font-bold" : "border-[1.5px] border-border-strong bg-bg-canvas font-medium hover:border-border-active hover:bg-bg-surface"} ${
        large && !selected ? "font-semibold" : ""
      }`}
    >
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full border-2 ${large ? "h-[1.375rem] w-[1.375rem]" : "h-5 w-5"} ${selected ? "border-border-active" : "border-border-strong"}`}
      >
        {selected && <span className={`rounded-full bg-bg-inverse ${large ? "h-[0.6875rem] w-[0.6875rem]" : "h-2.5 w-2.5"}`} />}
      </span>
      <span className="min-w-0">{children}</span>
      {aside && <span className="ml-auto shrink-0">{aside}</span>}
    </button>
  );
}

/** 라디오 묶음에서 Tab으로 들어오는 칸: 고른 것, 아무것도 안 골랐으면 첫 칸 */
export const rovingTab = (selected: boolean, first: boolean, anySelected: boolean) => (selected || (!anySelected && first) ? 0 : -1);

/** 라디오 묶음의 화살표 키: 옆 칸으로 옮기며 고른다(role="radiogroup"인 요소의 onKeyDown). 묶음 안 입력칸에서는 그대로 둔다. */
export function onRadioKeys(e: KeyboardEvent<HTMLElement>) {
  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  const next = radios[(at + step + radios.length) % radios.length];
  next.focus();
  next.click();
}

/** 체크 표시(글자 ✓ 대신 그린 선) */
export function CheckIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 입력칸: 48px 둥근 칸, 1.5px #8A8A8A 테두리. 포커스면 2px 검정. */
export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-12 w-full rounded-full border-[1.5px] border-border-strong bg-bg-canvas px-5 text-base font-medium text-text-primary outline-none transition-colors placeholder:text-text-secondary hover:border-border-active focus:border-2 focus:border-border-active disabled:cursor-not-allowed disabled:border-dashed disabled:bg-bg-surface ${className}`}
      {...props}
    />
  );
}

type NoticeTone = "info" | "warn" | "error" | "good";

const NOTICE_STYLES: Record<NoticeTone, string> = {
  info: "bg-bg-surface text-text-primary",
  warn: "border-[1.5px] border-border-strong bg-bg-canvas text-text-primary",
  error: "border-2 border-border-error bg-bg-canvas text-text-primary",
  good: "bg-bg-surface text-text-primary",
};

export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`rounded-[0.875rem] px-4 py-3 text-15 font-medium leading-relaxed ${NOTICE_STYLES[tone]}`}>
      {tone === "good" && <CheckIcon className="mr-1.5 inline h-3.5 w-3.5 align-[-0.125em] text-text-success" />}
      {children}
    </div>
  );
}

/** 빠진 항목 표시: 동그라미 느낌표 + 짧은 말 */
export function Missing({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[0.3125rem] text-13 font-semibold text-text-secondary">
      <span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-full border-[1.5px] border-border-strong text-10 font-bold leading-none">
        !
      </span>
      {children}
    </span>
  );
}

/** 불러오는 중 표시. role="status"라서 화면 읽기 프로그램도 알린다(11/2 다시 점검). */
export function Spinner({ label, size = 20 }: { label?: ReactNode; size?: number }) {
  return (
    <span role="status" className="inline-flex items-center gap-2.5 text-15 font-medium text-text-primary">
      <span
        aria-hidden
        className="shrink-0 animate-spin rounded-full border-[3px] border-border-default border-t-border-active"
        style={{ width: size, height: size }}
      />
      {label ?? <span className="sr-only">불러오는 중</span>}
    </span>
  );
}

/** 단계 동그라미: 끝남 ✓ · 진행 중 회전 · 남음 빈 원 */
export function StepMark({ status }: { status: "done" | "active" | "pending" | "failed" }) {
  const base = "grid h-[1.375rem] w-[1.375rem] shrink-0 place-items-center rounded-full text-xs font-bold";
  if (status === "active") return <span aria-hidden className={`${base} animate-spin border-[3px] border-border-default border-t-border-active`} />;
  if (status === "pending") return <span aria-hidden className={`${base} border-2 border-border-strong`} />;
  if (status === "failed") return <span aria-hidden className={`${base} bg-bg-error text-text-inverse`}>!</span>;
  return (
    <span aria-hidden className={`${base} bg-bg-surface-strong text-text-primary`}>
      <CheckIcon />
    </span>
  );
}

/** 화면 맨 아래 동작 막대: 왼쪽 상태 한 줄, 오른쪽 이전과 주 버튼. 화면 아래에 붙어 있다. */
export function Footer({ status, lead, children }: { status?: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-10 mt-auto border-t border-border-default bg-bg-canvas">
      {/* 위 테두리 1px + 87px = 88px(디자인). 화면 4~6은 이 높이를 빼고 남는 높이를 채운다. */}
      <div className="mx-auto flex max-w-[76rem] flex-col gap-2.5 px-5 pt-3 pb-5 lg:h-[5.4375rem] lg:flex-row lg:items-center lg:gap-3.5 lg:px-12 lg:py-0">
        {lead}
        <div className="text-sm leading-snug font-medium text-text-primary lg:text-15" aria-live="polite">
          {status}
        </div>
        {/* 휴대폰: 버튼을 한 줄에 놓고 마지막(주 버튼)을 넓힌다 */}
        <div className="flex items-center gap-2.5 [&>*:last-child]:flex-1 lg:ml-auto lg:gap-3.5 lg:[&>*:last-child]:flex-none">{children}</div>
      </div>
    </footer>
  );
}
