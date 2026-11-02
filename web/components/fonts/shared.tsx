"use client";

// 11/2 B안 내 폰트·스튜디오가 같이 쓰는 조각: 상태 표시, 즐겨찾기, 받기 메뉴.

import { useEffect, useId, useRef, useState, type FocusEvent } from "react";
import { api, errorMessage, type FontFormat } from "@/lib/api";
import { saveBlob } from "@/lib/files";
import { buildRecordText } from "@/lib/record";
import type { ProjectPhase, RecordEvent } from "@/lib/types";

export const RUNNING_PHASES: ProjectPhase[] = ["analyzing", "drawing", "reviewing", "building"];
export const isRunning = (phase: ProjectPhase) => RUNNING_PHASES.includes(phase);

export const PHASE_LABELS: Record<ProjectPhase, string> = {
  analyzing: "로고 읽는 중",
  drawing: "참고 글자 그리는 중",
  reviewing: "확인을 기다려요",
  building: "그리는 중",
  done: "완성",
  failed: "멈춤",
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function remainingLabel(seconds: number | null): string {
  if (seconds === null) return "";
  return seconds < 60 ? "곧 끝나요" : `약 ${Math.ceil(seconds / 60)}분 남음`;
}

export function StatusPill({ phase }: { phase: ProjectPhase }) {
  const base = "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-13 font-bold";
  if (phase === "done") return <span className={`${base} border-[1.5px] border-good text-good`}>{PHASE_LABELS.done}</span>;
  if (phase === "failed") return <span className={`${base} border-[1.5px] border-bad text-bad`}>{PHASE_LABELS.failed}</span>;
  if (phase === "reviewing") return <span className={`${base} border-[1.5px] border-ink`}>{PHASE_LABELS.reviewing}</span>;
  return (
    <span className={`${base} bg-stage`}>
      <span aria-hidden className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-track border-t-ink" />
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
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-subtle"
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

const FILES: { format: FontFormat; label: string; note: string }[] = [
  { format: "ttf", label: "TTF", note: "컴퓨터·인쇄" },
  { format: "otf", label: "OTF", note: "디자인 프로그램" },
  { format: "woff2", label: "WOFF2", note: "홈페이지" },
];

async function fetchBlob(input: string, init?: RequestInit): Promise<Blob> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.blob();
}

/** 받기 메뉴: 형식 하나씩, 또는 모두 받기(zip: 네 형식 · CSS 예시 · 라이선스 · 제작 기록). 제작 기록은 누를 때 불러온다(목록 카드).
 * 메뉴 역할(role="menu")은 화살표 키까지 갖춰야 해서, 펼침 단추 + 단추 목록으로 둔다(11/2 점검). 열면 첫 항목으로, Esc로 닫으면 '받기'로 돌아간다. */
export function DownloadMenu({
  fontId,
  fontName,
  loadRecord,
  primary = false,
  align = "left",
}: {
  fontId: string;
  fontName: string;
  loadRecord: () => Promise<RecordEvent[]>;
  primary?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const close = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  async function get(key: string, run: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await run();
      setOpen(false);
    } catch (err) {
      setError(`받지 못했어요: ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  const one = (format: FontFormat) =>
    get(format, async () => saveBlob(await fetchBlob(api.fontUrl(fontId, { download: true, format })), `${fontName}.${format}`));
  const all = () =>
    get("zip", async () => {
      const record = buildRecordText(fontName, await loadRecord());
      const blob = await fetchBlob(api.fontBundleUrl(fontId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontName, record }),
      });
      saveBlob(blob, `${fontName}.zip`);
    });

  // 키보드로 메뉴 밖 다른 칸으로 옮겨 가면 닫는다(받는 중 단추가 비활성으로 바뀌며 포커스를 잃을 때는 relatedTarget이 없어 그대로 둔다)
  const leave = (e: FocusEvent<HTMLDivElement>) => {
    if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const item = "flex h-11 w-full items-center justify-between gap-3 rounded-[0.625rem] px-3 text-left text-15 font-bold hover:bg-subtle disabled:opacity-50";
  return (
    <div ref={root} onBlur={leave} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 rounded-full font-bold transition-colors ${
          primary ? "h-12 bg-ink px-6 text-15 text-bg hover:bg-hover" : "h-10 border-[1.5px] border-edge bg-bg px-4 text-15 hover:border-ink hover:bg-subtle"
        }`}
      >
        <DownloadIcon />
        받기
      </button>
      {open && (
        <div
          id={panelId}
          className={`absolute top-full z-20 mt-2 w-[17rem] rounded-2xl border border-line bg-bg p-2 shadow-[0_12px_32px_rgba(17,17,17,0.14)] motion-safe:animate-[ds-pop_160ms_ease-out] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {FILES.map((f, i) => (
            <button key={f.format} ref={i === 0 ? first : undefined} type="button" disabled={!!busy} onClick={() => one(f.format)} className={item}>
              <span>
                {f.label} <span className="font-medium text-muted">{f.note}</span>
              </span>
              {busy === f.format && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-track border-t-ink" />}
            </button>
          ))}
          <div className="mx-1 my-1.5 h-px bg-line" />
          <button type="button" disabled={!!busy} onClick={all} className={item}>
            <span>
              모두 받기 <span className="font-medium text-muted">zip · 제작 기록</span>
            </span>
            {busy === "zip" && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-track border-t-ink" />}
          </button>
          {error && (
            <p role="alert" className="px-3 pt-2 pb-1 text-13 font-semibold text-bad">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
