"use client";

// 개발용 목업(11/5 · 11/6): 서버 없이 폰트 화면의 상태를 하나씩 띄운다. 주소의 ?state=로 고른다(위 버튼과 같다).
// flow는 시간이 흐르는 가짜 진행(기준 글자 → 나머지 글자 → 파일 · 검사). 글자 그림은 글자를 쓴 SVG로 대신한다.

import { useMemo, useState, useSyncExternalStore } from "react";
import { Stopped } from "@/app/fonts/[id]/FontView";
import { Choose } from "@/components/fonts/Choose";
import { Making } from "@/components/fonts/Making";
import { GLYPH_ORDER, useNow } from "@/components/fonts/MakingMeter";
import { Review } from "@/components/fonts/Review";
import { CHECKS } from "@/lib/constants";
import { HANGUL_BY_FREQUENCY } from "@/lib/hangulOrder";
import type { BuildJob, BuildStage, ChooseDirection, GlyphItem, ProjectView } from "@/lib/types";

const STATES = [
  "flow",
  "analyzing",
  "s1",
  "s2",
  "s3",
  "s4",
  "queued",
  "rebuild",
  "stopped-user",
  "stopped-error",
  "analysis-failed",
  "choose",
  "choose-drawing",
  "choose-failed",
  "choose-again",
  "review",
] as const;
type State = (typeof STATES)[number];

const glyphSvg = (char: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="72" font-size="64" font-weight="700" text-anchor="middle" font-family="sans-serif">${char}</text></svg>`)}`;
const sampleSvg = (text: string, weight: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><text x="200" y="175" font-size="80" font-weight="${weight}" text-anchor="middle" font-family="sans-serif">${text}</text></svg>`)}`;
const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><circle cx="75" cy="75" r="72" fill="#141414"/><circle cx="75" cy="75" r="62" fill="none" stroke="#fff" stroke-width="2"/><text x="75" y="80" font-size="34" font-weight="800" fill="#fff" text-anchor="middle" font-family="sans-serif">한결</text><text x="75" y="112" font-size="16" fill="#fff" text-anchor="middle" font-family="sans-serif">국 수</text></svg>')}`;

/** 서버처럼 자주 쓰는 글자부터 그렸다고 보고 drawnMap을 만든다(lib/server/projects.ts drawnBits와 같은 방식) */
function drawnMapOf(n: number, extras = 0): { bits: string; recent: string[] } {
  const order = [...HANGUL_BY_FREQUENCY].slice(0, n);
  const set = new Set([...order, ...GLYPH_ORDER.slice(2350, 2350 + extras)]);
  const bytes = new Uint8Array(Math.ceil(GLYPH_ORDER.length / 8));
  GLYPH_ORDER.forEach((c, i) => {
    if (set.has(c)) bytes[i >> 3] |= 0x80 >> (i & 7);
  });
  return { bits: btoa(String.fromCharCode(...bytes)), recent: order.slice(-60).reverse() };
}

function baseView(): ProjectView {
  return {
    id: "mock",
    name: "한결국수체",
    storeName: "한결국수",
    desiredFeel: "",
    favorite: false,
    phase: "building",
    quality: "fine",
    createdAt: "2026-11-06T09:00:00.000Z",
    logoUrl: LOGO,
    fontId: null,
    glyphCount: null,
    extraCount: null,
    progress: null,
    remainingSeconds: 540,
    error: null,
    upload: {
      logoFileName: "한결국수_로고.png",
      logoHash: "x",
      inputPath: "upload",
      sampleId: null,
      storeName: "한결국수",
      industry: "snack_korean",
      industryOther: "",
      brandTones: [],
      usageContexts: [],
      desiredFeel: "매일 아침 손으로 직접 뽑는 면으로 칼국수와 수제비를 내는 동네 국숫집이에요. 오래 다녀도 질리지 않는 맛을 지키고 싶어요. 따뜻한 국물처럼 편한 가게예요.",
      logoSource: "unknown",
      logoFont: null,
      logoFontName: "",
      attributes: { edge: "round", weight: "bold", contrast: "even", hand: "neat" },
    },
    colors: [],
    review: null,
    choose: null,
    build: null,
    recent: [],
    missing: [],
    extras: [],
    recheck: [],
    tweaks: {},
    edited: [],
    rebuilding: false,
    revision: 1,
    slogans: [],
    record: [],
  };
}

function build(stages: BuildStage[], extra: Partial<BuildJob> = {}): BuildJob {
  return {
    jobId: "j",
    phase: "composing",
    stages,
    queued: false,
    elapsedSeconds: 300,
    remainingSeconds: 540,
    builtGlyphs: 0,
    totalGlyphs: 2402,
    checks: CHECKS.map((c) => ({ key: c.key, status: "pending", detail: "" })),
    ocrPassed: null,
    misreads: [],
    similarity: null,
    fontId: null,
    models: [],
    ...extra,
  };
}

const stage = (key: BuildStage["key"], status: BuildStage["status"], done = 0, total = 1): BuildStage => ({ key, status, done, total, seconds: null });

const REF_CHARS = "한결국수가나다라마바사아자차카타파하을를이에서고";
function refs(ready: number): GlyphItem[] {
  return Array.from({ length: 30 }, (_, i) => {
    const char = [...REF_CHARS][i % REF_CHARS.length] ?? "가";
    const ok = i < ready;
    return { id: String(i), char, status: ok ? "ready" : "drawing", imageUrl: ok ? glyphSvg(char) : null, problem: null };
  });
}

function directions(states: ChooseDirection["status"][]): ChooseDirection[] {
  const base: Omit<ChooseDirection, "status" | "imageUrl" | "recommended">[] = [
    { family: "gothic", familyLabel: "각진 고딕", expression: "멀리서도 또렷하게", weightLabel: "굵게", why: "로고의 곧은 획을 살려 간판이 멀리서도 잘 읽혀요.", summary: null },
    { family: "rounded", familyLabel: "둥근 손글씨", expression: "손으로 빚은 듯 따뜻하게", weightLabel: "보통", why: "로고 글자 끝이 둥글고, 가게 이야기에 '손으로 직접 뽑는 면'이 있어 가장 잘 맞아요.", summary: null },
    { family: "brush", familyLabel: "붓글씨", expression: "오래 이어 온 노포처럼", weightLabel: "보통", why: "붓 획의 굵기 변화로 오래된 국숫집의 손맛을 내요.", summary: null },
  ];
  return base.map((d, i) => ({ ...d, status: states[i], imageUrl: states[i] === "ready" ? sampleSvg("한결국수", [800, 600, 300][i]) : null, recommended: i === 1 }));
}

function viewFor(state: State, t: number, now: number): ProjectView {
  const v = baseView();
  const withDrawn = (n: number, extras = 0, lastAgo = 12) => {
    const m = drawnMapOf(n, extras);
    v.drawnMap = m.bits;
    v.lastSheetAt = now - lastAgo * 1000;
    v.recent = m.recent.map((char) => ({ char, imageUrl: glyphSvg(char) }));
  };
  switch (state) {
    case "flow": {
      if (t < 40) {
        const ready = Math.floor((t / 40) * 30);
        return { ...v, phase: "drawing", progress: { done: ready, total: 30 }, remainingSeconds: 300 - t, review: { held: false, continueAt: null, items: refs(ready) } };
      }
      const drawDone = Math.min(2320, Math.floor(((t - 40) / 210) * 2320));
      const eng = Math.min(1, Math.max(0, (t - 250) / 50));
      withDrawn(Math.min(2350, 30 + drawDone), Math.max(0, drawDone - 2268), 3);
      v.build = build([
        stage("draw", drawDone >= 2320 ? "done" : "active", drawDone, 2402),
        stage("trace", t < 250 ? "pending" : eng < 0.4 ? "active" : "done", 0, 2432),
        stage("save", eng < 0.4 ? "pending" : eng < 0.55 ? "active" : "done"),
        stage("check", eng < 0.55 ? "pending" : eng < 0.85 ? "active" : "done", Math.floor(Math.max(0, (eng - 0.55) / 0.3) * 7), 7),
        stage("ocr", eng < 0.85 ? "pending" : "active"),
      ]);
      v.build.checks = CHECKS.map((c, i) => ({ key: c.key, status: i < Math.floor(Math.max(0, (eng - 0.55) / 0.3) * 7) ? "pass" : "pending", detail: "" }));
      v.remainingSeconds = Math.max(0, 300 - t);
      return v;
    }
    case "analyzing":
      return { ...v, phase: "analyzing", remainingSeconds: null };
    case "s1":
      return { ...v, phase: "drawing", remainingSeconds: 900, review: { held: false, continueAt: null, items: refs(12) } };
    case "s2":
      withDrawn(1154);
      v.build = build([stage("draw", "active", 1154, 2402), stage("trace", "pending", 0, 2432), stage("save", "pending"), stage("check", "pending", 0, 7), stage("ocr", "pending")]);
      return v;
    case "s3":
    case "s4": {
      withDrawn(2350, 82, 90);
      v.build = build([stage("draw", "done", 2402, 2402), stage("trace", "done", 2432, 2432), stage("save", "done"), stage("check", "active", 4, 7), stage("ocr", "pending")]);
      v.build.checks = CHECKS.map((c, i) => ({ key: c.key, status: i < 4 ? "pass" : "pending", detail: "" }));
      v.remainingSeconds = state === "s3" ? 60 : 0;
      return v;
    }
    case "queued":
      v.build = build([stage("draw", "active", 0, 2402), stage("trace", "pending", 0, 2432), stage("save", "pending"), stage("check", "pending", 0, 7), stage("ocr", "pending")], { queued: true });
      v.drawnMap = drawnMapOf(0).bits;
      v.remainingSeconds = null;
      return v;
    case "rebuild":
      withDrawn(2304, 82, 8);
      v.rebuilding = true;
      v.fontId = "f";
      v.remainingSeconds = 240;
      v.build = build([stage("draw", "active", 18, 46), stage("trace", "pending", 0, 2432), stage("save", "pending"), stage("check", "pending", 0, 7), stage("ocr", "pending")]);
      return v;
    case "stopped-user":
    case "stopped-error":
      withDrawn(1154);
      return {
        ...v,
        phase: "failed",
        remainingSeconds: null,
        error: state === "stopped-user" ? "직접 멈췄어요. 그린 글자는 남아 있어요. 이어서 만들거나 그만둘 수 있어요." : "서버에서 문제가 생겨 멈췄어요.",
      };
    case "analysis-failed":
      return { ...v, phase: "failed", remainingSeconds: null, drawnMap: null, error: "로고에서 서체 느낌을 정하지 못했어요. 잠시 뒤 다시 만들어 주세요." };
    case "choose":
      return { ...v, phase: "choosing", remainingSeconds: null, choose: { directions: directions(["ready", "ready", "ready"]), again: false } };
    case "choose-drawing":
      return { ...v, phase: "choosing", remainingSeconds: null, choose: { directions: directions(["ready", "drawing", "drawing"]), again: false } };
    case "choose-failed":
      return { ...v, phase: "choosing", remainingSeconds: null, choose: { directions: directions(["ready", "ready", "failed"]), again: false } };
    case "choose-again":
      return { ...v, phase: "choosing", remainingSeconds: null, choose: { directions: directions(["ready", "ready", "ready"]), again: true, previous: 1 } };
    case "review": {
      const items = refs(30);
      items[6] = { ...items[6], status: "failed", imageUrl: null, problem: "검사 탈락" };
      items[17] = { ...items[17], status: "failed", imageUrl: null, problem: "검사 탈락" };
      return { ...v, phase: "reviewing", remainingSeconds: null, review: { held: true, continueAt: null, items } };
    }
  }
}

const subscribeUrl = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
function useUrlState(): State {
  const raw = useSyncExternalStore(
    subscribeUrl,
    () => new URLSearchParams(window.location.search).get("state") ?? "flow",
    () => "flow",
  );
  return (STATES as readonly string[]).includes(raw) ? (raw as State) : "flow";
}

const SPEEDS = [1, 10, 30];

export function MakingPreview() {
  const state = useUrlState();
  const [speed, setSpeed] = useState(10);
  const now = useNow();
  const [start, setStart] = useState<number | null>(null);
  // 흐르는 진행: 처음 렌더의 시각을 기준점으로 삼는다(렌더 중 Date.now()를 부르지 않는다)
  if (start === null) setStart(now);
  const t = state === "flow" && start !== null ? Math.min(300, ((now - start) / 1000) * speed) : 0;
  const tick = Math.floor(t);
  // 서버가 1.5초마다 새 값을 주듯 1초마다 새 값을 만든다
  const view = useMemo(() => viewFor(state, tick, now), [state, tick, now]);

  const go = (s: State) => {
    window.history.pushState(null, "", `?state=${s}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-page flex-wrap items-center gap-2 px-5 py-3 text-13 font-bold lg:px-10" data-preview-bar>
        <span className="rounded-full bg-bg-inverse px-3 py-1 text-text-inverse">목업</span>
        {STATES.map((s) => (
          <button key={s} type="button" onClick={() => go(s)} className={`h-8 rounded-full px-3 ${state === s ? "bg-bg-inverse text-text-inverse" : "border-[1.5px] border-border-strong"}`}>
            {s}
          </button>
        ))}
        {state === "flow" && (
          <>
            <span className="ml-2">가짜 진행 {tick} / 300초</span>
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => setSpeed(s)} className={`h-8 rounded-full px-3 ${speed === s ? "bg-bg-inverse text-text-inverse" : "border-[1.5px] border-border-strong"}`}>
                {s}배
              </button>
            ))}
            <button type="button" onClick={() => setStart(now)} className="h-8 rounded-full border-[1.5px] border-border-strong px-3">
              처음부터
            </button>
          </>
        )}
      </div>
      <Screen key={state} view={view} />
    </>
  );
}

function Screen({ view }: { view: ProjectView }) {
  const noop = () => {};
  if (view.phase === "choosing") return <Choose view={view} onChanged={noop} />;
  if (view.phase === "reviewing") return <Review view={view} onChanged={noop} />;
  if (view.phase === "failed") return <Stopped view={view} onChanged={noop} />;
  return <Making view={view} onChanged={noop} />;
}
