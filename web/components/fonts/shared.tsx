"use client";

// 11/2 B안 내 폰트·스튜디오가 같이 쓰는 조각: 상태 표시, 즐겨찾기, 받기 메뉴.
// 11/6(피그마 564:1015 · 458:276): 받기 메뉴는 쓸 곳 세 줄 + 형식 꼬리표. 데스크톱은 버튼 아래 떠 있는 메뉴, 휴대폰은 아래에서 올라오는 창.
// 서랍·아래 창의 열고 닫는 모션(usePresence · sheetMotion)도 여기 둔다(motion.md: 열림 300ms ease-enter, 닫힘 200ms ease-exit).

import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type FocusEvent, type ReactNode, type Ref } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ds";
import { api, errorMessage, type FontFormat } from "@/lib/api";
import { saveBlob } from "@/lib/files";
import { buildRecordText } from "@/lib/record";
import type { ProjectPhase, RecordEvent } from "@/lib/types";

export const RUNNING_PHASES: ProjectPhase[] = ["analyzing", "choosing", "drawing", "reviewing", "building"];
export const isRunning = (phase: ProjectPhase) => RUNNING_PHASES.includes(phase);
/** 서버가 지금 일을 하는 단계. 느낌 고르기·30자 결정은 사용자의 결정을 기다리는 단계라 일을 하지 않는다. */
export const isWorking = (phase: ProjectPhase) => phase === "analyzing" || phase === "drawing" || phase === "building";

export const PHASE_LABELS: Record<ProjectPhase, string> = {
  analyzing: "로고 읽는 중",
  choosing: "느낌을 골라 주세요",
  drawing: "기준 글자 그리는 중",
  reviewing: "이어서 그릴지 골라 주세요",
  building: "그리는 중",
  done: "완성",
  failed: "멈춤",
};

/**
 * 화면 아래에 붙는 막대(느낌 고르기). 휴대폰에서 내용이 길어 아래로 밀려도 결정 단추가 늘 보이게 한다.
 * 바탕과 위 선은 화면 폭 전체(피그마 452:56 · 453:148), 안쪽 내용은 화면 본문과 같은 폭(max-w-page)에 맞춘다.
 * 그래서 본문 틀(mx-auto max-w) 안이 아니라 그 바깥, main의 바로 아래 자식으로 둔다. 안쪽 배치는 className으로 정한다.
 */
export function StickyBar({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 mt-auto border-t border-border-default bg-bg-canvas">
      <div className={`mx-auto w-full max-w-page px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-10 lg:pb-5 ${className}`}>{children}</div>
    </div>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function remainingLabel(seconds: number | null): string {
  if (seconds === null) return "";
  return seconds < 60 ? "곧 끝나요" : `약 ${Math.ceil(seconds / 60)}분 남음`;
}

export function StatusPill({ phase }: { phase: ProjectPhase }) {
  const base = "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-13 font-bold";
  if (phase === "done") return <span className={`${base} border-[1.5px] border-border-success text-text-success`}>{PHASE_LABELS.done}</span>;
  if (phase === "failed") return <span className={`${base} border-[1.5px] border-border-error text-text-error`}>{PHASE_LABELS.failed}</span>;
  if (phase === "reviewing" || phase === "choosing") return <span className={`${base} border-[1.5px] border-border-active`}>{PHASE_LABELS[phase]}</span>;
  return (
    <span className={`${base} bg-bg-surface-strong`}>
      <span aria-hidden className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-border-default border-t-border-active" />
      {PHASE_LABELS[phase]}
    </span>
  );
}

/** label: 어느 폰트의 즐겨찾기인지(목록에서 단추마다 이름이 달라야 화면 읽기 프로그램이 구분한다) */
export function HeartButton({ label, on, onToggle, size = 18 }: { label: string; on: boolean; onToggle: () => void; size?: number }) {
  return (
    <button
      type="button"
      aria-label={`${label} 즐겨찾기`}
      aria-pressed={on}
      onClick={onToggle}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-bg-surface"
    >
      <svg aria-hidden viewBox="0 0 20 20" style={{ width: size, height: size }}>
        <path
          d="M10 16.5S3.5 12.6 3.5 8A3.2 3.2 0 0 1 10 6.3 3.2 3.2 0 0 1 16.5 8c0 4.6-6.5 8.5-6.5 8.5z"
          fill={on ? "var(--ink)" : "none"}
          stroke={on ? "var(--ink)" : "var(--muted)"}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function DownloadIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5">
      <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** X 닫기(서랍·아래 창·그림판 머리). 40px 회색 동그라미. */
export function CloseButton({ onClick, label = "닫기", className = "" }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-surface-strong transition-colors duration-(--dur-fast) hover:bg-bg-disabled ${className}`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/* ---------- 열고 닫는 모션 ---------- */

/** open이 꺼져도 닫히는 모션(exitMs) 동안은 그려 둔다. shown은 그린 다음 프레임에 켜져 transition이 시작된다. */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const t = setTimeout(() => {
      setMounted(false);
      setShown(false);
    }, exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return { mounted: mounted || open, shown: open && shown };
}

/**
 * 서랍·아래 창 전환 클래스. 열림 300ms 들어오는 곡선, 닫힘 200ms 나가는 곡선.
 * edge="bottom": 아래에서 올라온다. edge="drawer": 휴대폰은 아래에서, 데스크톱(lg)은 오른쪽에서.
 * 움직임 줄이기에서는 옮기지 않고 투명도만 바뀐다(ds-motion이라 시간은 남는다).
 */
export function sheetMotion(shown: boolean, edge: "bottom" | "drawer" | "phone-bottom") {
  const time = shown ? "duration-(--dur-move) ease-enter" : "duration-(--dur-base) ease-exit";
  // Tailwind가 찾을 수 있게 클래스 이름을 통째로 쓴다(조합하지 않는다)
  const away = {
    bottom: "translate-y-full motion-reduce:translate-y-0 motion-reduce:opacity-0",
    drawer: "max-lg:translate-y-full lg:translate-x-full motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:opacity-0",
    "phone-bottom": "max-lg:translate-y-full max-lg:motion-reduce:translate-y-0 max-lg:motion-reduce:opacity-0",
  }[edge];
  return `ds-motion transition-[translate,opacity] ${time} ${shown ? "translate-x-0 translate-y-0 opacity-100" : away}`;
}
/** 뒤를 어둡게 덮는 층: 투명도만 */
export const backdropMotion = (shown: boolean) =>
  `ds-motion transition-opacity ${shown ? "opacity-100 duration-(--dur-move) ease-enter" : "opacity-0 duration-(--dur-base) ease-exit"}`;

/* ---------- 받기 ---------- */

export const FONT_FILES: { format: FontFormat; label: string; note: string }[] = [
  { format: "ttf", label: "TTF", note: "컴퓨터·인쇄" },
  { format: "otf", label: "OTF", note: "디자인 프로그램" },
  { format: "woff2", label: "WOFF2", note: "홈페이지" },
  { format: "woff", label: "WOFF", note: "오래된 브라우저" },
];

async function fetchBlob(input: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.blob();
}

export function Spin() {
  return <span aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-border-default border-t-border-active" />;
}

export const fontCss = (fontName: string) => `@font-face {\n  font-family: "${fontName}";\n  src: url("${fontName}.woff2") format("woff2");\n  font-display: swap;\n}`;

/** 받기 동작 묶음(받기 메뉴와 스튜디오 '받기' 줄이 같이 쓴다). busy는 받는 중인 열쇠(형식 이름·"zip"). 성공하면 true. */
export function useFontDownloads(fontId: string, fontName: string, loadRecord: () => Promise<RecordEvent[]>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const get = useCallback(async (key: string, run: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await run();
      return true;
    } catch (err) {
      setError(`받지 못했어요: ${errorMessage(err)}`);
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const one = useCallback(
    (format: FontFormat) => get(format, async () => saveBlob(await fetchBlob(api.fontUrl(fontId, { download: true, format })), `${fontName}.${format}`)),
    [fontId, fontName, get],
  );
  const all = useCallback(
    () =>
      get("zip", async () => {
        const record = buildRecordText(fontName, await loadRecord());
        const blob = await fetchBlob(api.fontBundleUrl(fontId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fontName, record }),
        });
        saveBlob(blob, `${fontName}.zip`);
      }),
    [fontId, fontName, get, loadRecord],
  );
  /** 클립보드 쓰기는 누른 직후(사용자 동작 안)에 먼저 한다 */
  const copyCss = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(fontCss(fontName));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      setError("CSS를 복사하지 못했어요. 브라우저가 막았을 수 있어요.");
      return false;
    }
  }, [fontName]);

  return { busy, error, copied, one, all, copyCss };
}

/** 쓸 곳 한 줄: 굵은 이름 + 설명 + 오른쪽 형식 꼬리표(피그마 564:1164) */
function UseRow({
  title,
  note,
  tag,
  busy,
  ref,
  ...props
}: { title: string; note: string; tag: string; busy?: boolean; ref?: Ref<HTMLButtonElement> } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">) {
  return (
    <button
      ref={ref}
      type="button"
      className="flex w-full shrink-0 items-center gap-3 rounded-[0.625rem] p-3.5 text-left transition-colors duration-(--dur-fast) outline-none hover:bg-bg-surface focus-visible:bg-bg-surface focus-visible:shadow-[inset_0_0_0_2px_var(--ink)] disabled:opacity-50"
      {...props}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-bold">{title}</span>
        <span className="text-13 text-text-secondary">{note}</span>
      </span>
      {busy ? <Spin /> : <span className="shrink-0 rounded-full border-[1.5px] border-border-active px-2.5 py-1 text-xs leading-none font-bold">{tag}</span>}
    </button>
  );
}

/** 받기 메뉴: 쓸 곳 세 가지(설치 TTF · 홈페이지 WOFF2와 CSS 복사 · 업체 zip) + '파일 형식 골라 받기'.
 * 데스크톱은 버튼 아래 떠 있는 메뉴(animate-ds-pop-menu 200ms), 휴대폰은 아래에서 올라오는 창(열림 300ms · 닫힘 200ms).
 * 메뉴 역할(role="menu")은 화살표 키까지 갖춰야 해서, 펼침 단추 + 단추 목록으로 둔다(11/2 점검). 열면 첫 항목으로, Esc로 닫으면 연 버튼으로 돌아간다. */
export function DownloadMenu({
  fontId,
  fontName,
  loadRecord,
  primary = false,
  align = "left",
  label,
  block = false,
}: {
  fontId: string;
  fontName: string;
  loadRecord: () => Promise<RecordEvent[]>;
  /** 주 버튼(B3) '폰트 받기'. 아니면 작은 보조 버튼 '받기'(목록 줄) */
  primary?: boolean;
  align?: "left" | "right";
  label?: string;
  /** 휴대폰에서 폭 전체(주 버튼일 때). 데스크톱은 글자 폭. */
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { mounted, shown } = usePresence(open);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [formats, setFormats] = useState(false);
  const dl = useFontDownloads(fontId, fontName, loadRecord);
  const focusTrigger = () => root.current?.querySelector<HTMLButtonElement>("[data-download-trigger]")?.focus();

  useEffect(() => {
    if (!open) return;
    first.current?.focus({ preventScroll: true });
    const close = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>("[data-download-trigger]")?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function run(job: () => Promise<boolean>) {
    if (await job()) {
      setOpen(false);
      focusTrigger();
    }
  }

  // 키보드로 메뉴 밖 다른 칸으로 옮겨 가면 닫는다(받는 중 단추가 비활성으로 바뀌며 포커스를 잃을 때는 relatedTarget이 없어 그대로 둔다)
  const leave = (e: FocusEvent<HTMLDivElement>) => {
    if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const busy = !!dl.busy;
  const triggerProps = { "data-download-trigger": true, "aria-expanded": open, "aria-controls": open ? panelId : undefined, onClick: () => setOpen(!open) };
  return (
    <div ref={root} onBlur={leave} className={`relative ${block ? "w-full lg:w-auto" : ""}`}>
      {primary ? (
        <PrimaryButton block={block} className={block ? "lg:w-auto" : ""} {...triggerProps}>
          {label ?? "폰트 받기"}
        </PrimaryButton>
      ) : (
        <SecondaryButton size="sm" {...triggerProps}>
          <DownloadIcon />
          {label ?? "받기"}
        </SecondaryButton>
      )}
      {mounted && (
        <>
          {/* 휴대폰: 뒤를 어둡게 덮고, 누르면 닫는다 */}
          <div aria-hidden className={`fixed inset-0 z-40 bg-black/40 lg:hidden ${backdropMotion(shown)}`} onClick={() => setOpen(false)} />
          <div
            id={panelId}
            role="group"
            aria-label="받기"
            className={`z-50 flex flex-col bg-bg-canvas text-text-primary shadow-float max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[85dvh] max-lg:overflow-y-auto max-lg:rounded-t-[1.25rem] max-lg:px-3 max-lg:pt-3 max-lg:pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:absolute lg:top-full lg:mt-2.5 lg:w-[23.75rem] lg:rounded-[1.25rem] lg:p-2.5 ${
              align === "right" ? "lg:right-0" : "lg:left-0"
            } ${open ? "lg:animate-ds-pop-menu" : "lg:invisible"} ${sheetMotion(shown, "phone-bottom")}`}
          >
            <span aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-sm bg-border-default lg:hidden" onClick={() => setOpen(false)} />
            <p className="pb-2 pl-3 font-display text-2xl leading-normal lg:hidden">어디에 쓰세요?</p>
            <UseRow ref={first} title="내 컴퓨터에 설치" note="워드·한글·포토샵·캔바에서" tag="TTF" busy={dl.busy === "ttf"} disabled={busy} onClick={() => void run(() => dl.one("ttf"))} />
            <UseRow
              title="홈페이지에 쓰기"
              note={dl.copied ? "CSS를 복사했어요" : "파일 받기와 CSS 복사"}
              tag="WOFF2"
              busy={dl.busy === "woff2"}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await dl.copyCss();
                  return dl.one("woff2");
                })
              }
            />
            <UseRow title="간판·인쇄 업체에 보내기" note="OTF·TTF·라이선스 묶음" tag="ZIP" busy={dl.busy === "zip"} disabled={busy} onClick={() => void run(dl.all)} />
            <div className="h-px shrink-0 bg-border-default" />
            <button
              type="button"
              aria-expanded={formats}
              onClick={() => setFormats(!formats)}
              className="self-start pt-3.5 pb-2.5 pl-3.5 text-15 font-bold text-text-secondary underline decoration-1 underline-offset-[0.25em] hover:text-text-primary"
            >
              파일 형식 골라 받기
            </button>
            {formats && (
              <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
                {FONT_FILES.map((f) => (
                  <SecondaryButton key={f.format} size="sm" disabled={busy} onClick={() => void run(() => dl.one(f.format))} title={f.note}>
                    {dl.busy === f.format && <Spin />}
                    {f.label}
                  </SecondaryButton>
                ))}
              </div>
            )}
            {dl.error && (
              <p role="alert" className="px-3.5 pt-2 pb-1 text-13 font-semibold text-text-error">
                {dl.error}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
