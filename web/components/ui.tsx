import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// 10/29 Claude Design 'Logoche Final'·'C States'의 기본 조각. 강조는 검정 하나.
// 비활성은 색만 흐리게 하지 않고 점선 테두리와 이유 문구로도 알린다.

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "lg" | "md" | "sm";

const BUTTON_BASE = "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors duration-150 disabled:cursor-not-allowed";
const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-ink text-bg hover:bg-hover disabled:bg-line disabled:text-muted",
  outline:
    "border-[1.5px] border-edge bg-bg text-ink hover:border-ink hover:bg-subtle disabled:border-dashed disabled:border-edge disabled:bg-subtle disabled:text-muted",
  ghost: "text-ink underline underline-offset-4 hover:bg-stage disabled:text-muted disabled:no-underline",
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
          ? "border-2 border-ink bg-bg pr-4 pl-3 font-bold text-ink"
          : disabled
            ? "cursor-not-allowed border-[1.5px] border-dashed border-edge bg-subtle px-4 font-semibold text-muted"
            : "border-[1.5px] border-edge bg-bg px-4 font-semibold text-ink hover:border-ink hover:bg-subtle"
      }`}
    >
      {selected && (
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
      {badge && <span className="text-13 font-bold text-good">{badge}</span>}
    </button>
  );
}

/** 라디오 행(권리 확인·표현 방식). 고른 행은 2px 검정 테두리 + 채운 점. */
export function RadioRow({
  selected,
  onClick,
  children,
  aside,
  large,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  aside?: ReactNode;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-3 text-left transition-colors duration-150 ${
        large ? "min-h-[3.875rem] rounded-[0.875rem] px-5 py-4 text-18" : "min-h-[2.875rem] rounded-xl px-4 py-2 text-15"
      } ${selected ? "border-2 border-ink bg-subtle font-bold" : "border-[1.5px] border-edge bg-bg font-medium hover:border-ink hover:bg-subtle"} ${
        large && !selected ? "font-semibold" : ""
      }`}
    >
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full border-2 ${large ? "h-[1.375rem] w-[1.375rem]" : "h-5 w-5"} ${selected ? "border-ink" : "border-edge"}`}
      >
        {selected && <span className={`rounded-full bg-ink ${large ? "h-[0.6875rem] w-[0.6875rem]" : "h-2.5 w-2.5"}`} />}
      </span>
      <span className="min-w-0">{children}</span>
      {aside && <span className="ml-auto shrink-0">{aside}</span>}
    </button>
  );
}

/** 입력칸: 48px 둥근 칸, 1.5px #8A8A8A 테두리. 포커스면 2px 검정. */
export function TextField({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-12 w-full rounded-full border-[1.5px] border-edge bg-bg px-5 text-base font-medium text-ink outline-none transition-colors placeholder:text-muted hover:border-ink focus:border-2 focus:border-ink disabled:cursor-not-allowed disabled:border-dashed disabled:bg-subtle ${className}`}
      {...props}
    />
  );
}

type NoticeTone = "info" | "warn" | "error" | "good";

const NOTICE_STYLES: Record<NoticeTone, string> = {
  info: "bg-subtle text-ink",
  warn: "border-[1.5px] border-edge bg-bg text-ink",
  error: "border-2 border-bad bg-bg text-ink",
  good: "bg-subtle text-ink",
};

export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`rounded-xl px-4 py-3 text-15 font-medium leading-relaxed ${NOTICE_STYLES[tone]}`}>
      {tone === "good" && <span className="mr-1.5 font-bold text-good">✓</span>}
      {children}
    </div>
  );
}

/** 빠진 항목 표시: 동그라미 느낌표 + 짧은 말 */
export function Missing({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[0.3125rem] text-13 font-semibold text-muted">
      <span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-full border-[1.5px] border-muted text-10 font-bold leading-none">
        !
      </span>
      {children}
    </span>
  );
}

export function Spinner({ label, size = 20 }: { label?: ReactNode; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-15 font-medium text-ink">
      <span
        aria-hidden
        className="shrink-0 animate-spin rounded-full border-[3px] border-track border-t-ink"
        style={{ width: size, height: size }}
      />
      {label}
    </span>
  );
}

/** 단계 동그라미: 끝남 ✓ · 진행 중 회전 · 남음 빈 원 */
export function StepMark({ status }: { status: "done" | "active" | "pending" | "failed" }) {
  const base = "grid h-[1.375rem] w-[1.375rem] shrink-0 place-items-center rounded-full text-xs font-bold";
  if (status === "active") return <span aria-hidden className={`${base} animate-spin border-[3px] border-track border-t-ink`} />;
  if (status === "pending") return <span aria-hidden className={`${base} border-2 border-edge`} />;
  if (status === "failed") return <span aria-hidden className={`${base} bg-bad text-bg`}>!</span>;
  return (
    <span aria-hidden className={`${base} bg-stage text-ink`}>
      ✓
    </span>
  );
}

/** 화면 맨 아래 동작 막대: 왼쪽 상태 한 줄, 오른쪽 이전과 주 버튼. 화면 아래에 붙어 있다. */
export function Footer({ status, lead, children }: { status?: ReactNode; lead?: ReactNode; children: ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-10 mt-auto border-t border-line bg-bg">
      {/* 위 테두리 1px + 87px = 88px(디자인). 화면 4~6은 이 높이를 빼고 남는 높이를 채운다. */}
      <div className="mx-auto flex max-w-[90rem] flex-col gap-2.5 px-5 pt-3 pb-5 lg:h-[5.4375rem] lg:flex-row lg:items-center lg:gap-3.5 lg:px-12 lg:py-0">
        {lead}
        <div className="text-sm leading-snug font-medium text-ink lg:text-15" aria-live="polite">
          {status}
        </div>
        {/* 휴대폰: 버튼을 한 줄에 놓고 마지막(주 버튼)을 넓힌다 */}
        <div className="flex items-center gap-2.5 [&>*:last-child]:flex-1 lg:ml-auto lg:gap-3.5 lg:[&>*:last-child]:flex-none">{children}</div>
      </div>
    </footer>
  );
}
