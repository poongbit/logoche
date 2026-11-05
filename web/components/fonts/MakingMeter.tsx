"use client";

// 만드는 중 화면의 진행 표시(11/5 디자인 팩 '만드는 중'·'5분 번호표'): 알약 진행 막대(이름 + 퍼센트)와, 남은 시간이 흘러가는 번호표.
// 퍼센트는 하나로 이어진다: 참고 글자 30자 0~10% · 나머지 글자 10~85% · 폰트 파일·검사 85~100%.

import { useEffect, useState } from "react";
import type { ProjectView } from "@/lib/types";

export function overallPercent(view: ProjectView): number | null {
  if (view.phase === "analyzing") return null;
  if (view.phase === "drawing" || view.phase === "reviewing") {
    const items = view.review?.items ?? [];
    const ready = items.length ? items.filter((i) => i.status === "ready").length : (view.progress?.done ?? 0);
    const total = items.length || view.progress?.total || 30;
    return Math.min(10, (10 * ready) / Math.max(1, total));
  }
  if (view.phase === "done") return 100;
  const stages = view.build?.stages ?? [];
  const draw = stages.find((s) => s.key === "draw");
  if (draw && draw.status !== "done") return 10 + (75 * draw.done) / Math.max(1, draw.total);
  const engine = stages.filter((s) => s.key !== "draw");
  if (!engine.length) return 85;
  // 진행 중인 단계는 개수가 하나뿐이면(저장·판독) 얼마나 됐는지 모르므로 절반으로 센다. 끝나기 전에는 99%를 넘기지 않는다(11/5 비평 P0).
  const done = engine.reduce((a, s) => a + (s.status === "done" ? 1 : s.status === "active" ? (s.total > 1 ? s.done / s.total : 0.5) : 0), 0);
  return Math.min(99, 85 + (15 * done) / engine.length);
}

/** 서버가 준 남은 시간(초)에서 1초마다 줄어드는 값. 서버 값이 바뀌면 거기서 다시 센다. */
export function useCountdown(serverSeconds: number | null): number | null {
  const [anchor, setAnchor] = useState<{ value: number | null; at: number }>({ value: serverSeconds, at: Date.now() });
  const [now, setNow] = useState(Date.now());
  useEffect(() => setAnchor({ value: serverSeconds, at: Date.now() }), [serverSeconds]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (anchor.value === null) return null;
  return Math.max(0, anchor.value - Math.floor((now - anchor.at) / 1000));
}

/** 진행 막대(11/5 비평 반영): 얇은 막대 하나. 위에 이름과 퍼센트, 아래에 그린 글자 수. 값을 모르면(로고 읽는 중) 퍼센트 없이 오가는 막대를 보인다. */
export function ProgressPill({ name, percent, detail }: { name: string; percent: number | null; detail?: string }) {
  const p = percent === null ? null : Math.floor(percent);
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 truncate text-17 font-extrabold">{name} 만드는 중…</span>
        <span className="text-17 font-extrabold tabular-nums">{p === null ? "" : `${p}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label="만드는 진행"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p ?? undefined}
        className="relative h-3 w-full overflow-hidden rounded-full bg-bg-track"
      >
        {p === null ? (
          <div className="h-full w-1/3 rounded-full bg-bg-inverse motion-safe:animate-[ds-indeterminate_1.4s_ease-in-out_infinite]" />
        ) : (
          <div className="h-full rounded-full bg-bg-inverse transition-[width] duration-700 ease-out" style={{ width: `${p}%` }} />
        )}
      </div>
      {detail && <span className="text-13 text-text-secondary">{detail}</span>}
    </div>
  );
}

/** 번호표(11/5 비평 반영): 흰 바탕에 얇은 테두리, 민트는 남은 시간 칸 하나에만. 분 단위로만 보이고 '약 N분'이 줄어든다. */
export function WaitTicket({ remainingSeconds }: { remainingSeconds: number | null }) {
  const left = useCountdown(remainingSeconds);
  const minutes = left === null ? null : Math.ceil(left / 60);
  const nearly = left !== null && left <= 0; // 아직 일하는 중인데 어림 시간이 다 됐다
  const label = left === null ? "남은 시간을 계산하는 중이에요" : nearly ? "거의 다 됐어요" : `남은 시간은 약 ${minutes}분이에요`;
  return (
    <div role="timer" aria-label={label} className="flex w-full overflow-hidden rounded-[1.25rem] border-[1.5px] border-border-strong bg-bg-canvas">
      <div className="flex w-[6.5rem] shrink-0 flex-col items-center justify-center gap-0.5 bg-bg-brand px-2 py-4 text-text-primary">
        <span className="text-13 font-bold">{nearly ? "마무리" : "약"}</span>
        <span className="flex items-baseline gap-0.5">
          <span className="text-36 leading-none font-extrabold tabular-nums">{minutes === null ? "…" : nearly ? "" : minutes}</span>
          {minutes !== null && !nearly && <span className="text-15 font-extrabold">분</span>}
        </span>
      </div>
      <span aria-hidden className="my-3 border-l-2 border-dashed border-border-strong" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-4">
        <span className="text-15 font-extrabold">폰트 나오는 데 걸리는 시간</span>
        <span className="text-13 leading-normal text-text-secondary">다 되면 이 화면이 바뀌어요.</span>
      </div>
    </div>
  );
}
