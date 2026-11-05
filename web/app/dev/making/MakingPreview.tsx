"use client";

import { useEffect, useMemo, useState } from "react";
import { Making } from "@/components/fonts/Making";
import type { BuildStage, ProjectView } from "@/lib/types";

const TOTAL = 300; // 가짜 전체 시간(초)
const SPEEDS = [1, 10, 30];

function viewAt(t: number): ProjectView {
  const remaining = Math.max(0, TOTAL - t);
  const base = {
    id: "mock", name: "우리가게체", storeName: "우리가게", desiredFeel: "", favorite: false, quality: "fine" as const, createdAt: new Date().toISOString(),
    logoUrl: "/logo.png", fontId: null, glyphCount: null, extraCount: null, error: null,
    upload: { logoFileName: "logo.png", logoHash: "x", inputPath: "upload" as const, sampleId: null, storeName: "우리가게", industry: "bakery" as const, industryOther: "", brandTones: [], usageContexts: [], desiredFeel: "", logoSource: null, logoFont: null, logoFontName: "" },
    colors: [], review: null, choose: null, build: null, recent: [], missing: [], extras: [], recheck: [], tweaks: {}, edited: [], rebuilding: false, revision: 1, slogans: [], record: [],
  };
  if (t < 40) {
    const ready = Math.floor((t / 40) * 30);
    return { ...base, phase: "drawing", progress: { done: ready, total: 30 }, remainingSeconds: remaining,
      review: { held: false, continueAt: null, items: Array.from({ length: 30 }, (_, i) => ({ id: String(i), char: "가", status: i < ready ? "ready" : "drawing", imageUrl: null, problem: null })) } as ProjectView["review"] };
  }
  const drawDone = Math.min(2298, Math.floor(((t - 40) / 210) * 2298));
  const eng = Math.min(1, Math.max(0, (t - 250) / 50));
  const stages: BuildStage[] = [
    { key: "draw", status: drawDone >= 2298 ? "done" : "active", done: drawDone, total: 2298, seconds: null },
    { key: "trace", status: t < 250 ? "pending" : eng < 0.4 ? "active" : "done", done: Math.floor(Math.min(1, eng / 0.4) * 2298), total: 2298, seconds: null },
    { key: "save", status: eng < 0.4 ? "pending" : eng < 0.55 ? "active" : "done", done: 0, total: 1, seconds: null },
    { key: "check", status: eng < 0.55 ? "pending" : eng < 0.85 ? "active" : "done", done: Math.floor(Math.max(0, (eng - 0.55) / 0.3) * 7), total: 7, seconds: null },
    { key: "ocr", status: eng < 0.85 ? "pending" : eng < 1 ? "active" : "done", done: 0, total: 1, seconds: null },
  ];
  return { ...base, phase: "building", progress: { done: drawDone, total: 2298 }, remainingSeconds: remaining,
    build: { jobId: "j", phase: "composing", stages, queued: false, elapsedSeconds: t, remainingSeconds: remaining, builtGlyphs: drawDone, totalGlyphs: 2298, checks: [], ocrPassed: null, misreads: [], similarity: null, fontId: null, models: [] } };
}

export function MakingPreview() {
  const [speed, setSpeed] = useState(10);
  const [t, setT] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setT((v) => Math.min(TOTAL, v + speed)), [tick, speed]);
  // 서버처럼 1.5초마다 값을 주는 척하지 않고, 1초마다 새 값을 준다(번호표가 서버 값으로 다시 맞춘다)
  const view = useMemo(() => viewAt(t), [t]);
  return (
    <>
      <div className="mx-auto flex w-full max-w-[72rem] items-center gap-3 px-5 pt-4 text-13 font-bold lg:px-10">
        <span className="rounded-full bg-bg-inverse px-3 py-1 text-text-inverse">목업</span>
        <span>가짜 진행 {Math.floor(t)} / {TOTAL}초</span>
        {SPEEDS.map((s) => (
          <button key={s} type="button" onClick={() => setSpeed(s)} className={`h-8 rounded-full px-3 ${speed === s ? "bg-bg-inverse text-text-inverse" : "border-[1.5px] border-border-strong"}`}>
            {s}배
          </button>
        ))}
        <button type="button" onClick={() => setT(0)} className="h-8 rounded-full border-[1.5px] border-border-strong px-3">
          처음부터
        </button>
      </div>
      <Making view={view} onChanged={() => {}} />
    </>
  );
}
