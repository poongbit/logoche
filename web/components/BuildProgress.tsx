import { StepMark } from "@/components/ui";
import { BUILD_STAGES } from "@/lib/constants";
import type { BuildJob, BuildStage, BuildStageKey } from "@/lib/types";

/** 초를 "2.1초", "16초", "1분 5초"로 */
export function formatSeconds(seconds: number, whole = false): string {
  if (seconds < 10 && !whole) return `${(Math.round(seconds * 10) / 10).toLocaleString()}초`;
  const s = Math.round(seconds);
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ""}`;
}

type StageRow = { key: BuildStageKey } & Omit<BuildStage, "key">;

/** 만드는 중(Claude Design 'Logoche Final' 3h): 남은 시간 어림과 단계별 진행. 지금 단계만 회색 바탕에 진행 막대를 붙인다. */
export function BuildProgress({ build, sendSeconds, sendFailed }: { build: BuildJob | null; sendSeconds: number | null; sendFailed: boolean }) {
  const send: StageRow = {
    key: "send",
    status: build ? "done" : sendFailed ? "failed" : "active",
    done: 0,
    total: 0,
    seconds: build ? sendSeconds : null,
  };
  const server: StageRow[] =
    build?.stages ??
    BUILD_STAGES.filter((s) => s.key !== "send").map((s) => ({ key: s.key, status: "pending", done: 0, total: 0, seconds: null }));
  const rows = [send, ...server];
  const remaining = build?.remainingSeconds ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline">
        <h2 className="text-lg font-bold">{build?.phase === "failed" ? "만들지 못했어요" : "만드는 중"}</h2>
        <span className="ml-auto text-15 font-bold" aria-live="polite">
          {build?.queued
            ? "앞 작업을 기다리는 중"
            : remaining === null
              ? ""
              : remaining < 1
                ? "곧 끝나요"
                : `남은 시간 약 ${formatSeconds(Math.ceil(remaining), true)}`}
        </span>
      </div>
      {build?.phase === "failed" && build.error && <p className="text-sm font-medium text-bad">{build.error}</p>}
      <ol className="flex flex-col gap-3 text-15">
        {rows.map((row) => {
          const meta = BUILD_STAGES.find((s) => s.key === row.key)!;
          const count = !meta.unit || row.total < 1 ? null : meta.live ? `${row.done.toLocaleString()} / ${row.total.toLocaleString()}${meta.unit}` : `${row.total.toLocaleString()}${meta.unit}`;
          if (row.status === "active") {
            const pct = row.total > 0 ? Math.min(100, (row.done / row.total) * 100) : null;
            return (
              <li key={row.key} aria-current="step" className="-mx-3 flex flex-col gap-2 rounded-xl bg-subtle p-3">
                <div className="flex items-center gap-2.5 font-bold">
                  <StepMark status="active" />
                  {meta.label}
                  {count && <span className="ml-auto tabular-nums">{count}</span>}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
                  {pct === null ? (
                    <div className="h-full w-2/5 rounded-full bg-ink motion-safe:animate-[ds-indeterminate_1.4s_ease-in-out_infinite]" />
                  ) : (
                    <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
                  )}
                </div>
                <p className="text-13 font-medium text-muted">{meta.description}</p>
              </li>
            );
          }
          return (
            <li key={row.key} className={`flex items-center gap-2.5 font-semibold ${row.status === "pending" ? "text-muted" : row.status === "failed" ? "text-bad" : ""}`}>
              <StepMark status={row.status} />
              {meta.label}
              {row.status === "done" && row.seconds !== null && <span className="ml-auto text-muted">{formatSeconds(row.seconds)}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
