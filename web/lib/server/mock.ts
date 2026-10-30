// 모의 응답. LOGOCHE_MOCK=1이면 라우트가 AI·엔진 대신 이 값을 돌려준다(키 없이 화면 확인, 오프라인 시연 준비).
// 화면의 모든 상태(다시 그리기, 유사도 초과 등)를 볼 수 있게 일부러 만든 값이다.

import { CHECKS, FREQUENT_CHARS, REFERENCE_CHARS, TOTAL_GLYPHS } from "@/lib/constants";
import { buildStyleCard, type MeasuredAxes } from "./style";
import type {
  AnalyzeStyleRequest,
  BuildJob,
  BuildStage,
  CheckResult,
  GlyphItem,
  GlyphJob,
  SimilarityResult,
  StartBuildJobRequest,
  StyleCard,
} from "@/lib/types";

const MOCK_MODELS = ["모의 응답 (API 연결 전)"];

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 로고에서 잰 값 대신 쓰는 고정값 (기획서 2-4 ② '말랑곰' 예시)
const MOCK_MEASURED: MeasuredAxes = {
  weight: { value: 750, reason: "선이 로고 높이의 11%" },
  roundness: { value: 0.9, reason: "모서리 반지름이 선 굵기의 90%" },
  width: { value: 108, reason: "가로세로비 1.1" },
  contrast: { value: 0.97, reason: "선 굵기가 거의 일정" },
  slant: { value: 0, reason: "기울지 않음" },
};


export function mockStyleCard({ upload }: AnalyzeStyleRequest): StyleCard {
  const tones = upload.brandTones;
  return buildStyleCard(
    upload,
    MOCK_MEASURED,
    {
      strokeEnd: "획 끝을 둥글게 맺음 (예시)",
      signature: "심볼의 둥근 얼굴 → ㅇ 자리 (예시)",
      toneMismatch: tones.includes("premium") ? "로고는 '따뜻한' 느낌으로도 읽혀요. (예시)" : null,
      expressions: ["풍선처럼 부풀린 획 (예시)", "녹아 흐르는 획 (예시)", "물결치는 획 (예시)"],
    },
    ["#F26B3A", "#3B2A1E", "#FFF5E8"],
    MOCK_MODELS,
  );
}

const SHEET_MS = 1500; // 글자표 한 장
const REDRAW_MS = 900;

/** 글자표가 한 번에 그려지고, 몇 자는 검사에 걸려 다시 그려지는 흐름을 흉내 낸다. */
export function mockGlyphJob(jobId: string, elapsedMs: number): GlyphJob {
  const items: GlyphItem[] = [...REFERENCE_CHARS].map((char, i) => {
    const redraws = i % 11 === 4;
    const readyAt = SHEET_MS + (redraws ? REDRAW_MS : 0);
    let status: GlyphItem["status"] = "drawing";
    if (elapsedMs >= readyAt) status = "ready";
    else if (redraws && elapsedMs >= SHEET_MS) status = "redrawing";
    return { id: String(i), char, status, imageUrl: null, problem: null };
  });
  const done = items.every((i) => i.status === "ready");
  return { jobId, status: done ? "done" : "running", items, models: MOCK_MODELS, edits: [] };
}

// 모의 진행 단계와 단계마다 걸리는 시간(ms). 실제 엔진과 같은 순서다.
const MS_PER_CHECK = 350;
const MOCK_STAGES: { key: BuildStage["key"]; ms: number; total: number }[] = [
  { key: "draw", ms: 3000, total: TOTAL_GLYPHS - REFERENCE_CHARS.length },
  { key: "trace", ms: 1200, total: TOTAL_GLYPHS },
  { key: "save", ms: 300, total: 1 },
  { key: "check", ms: CHECKS.length * MS_PER_CHECK, total: CHECKS.length },
  { key: "ocr", ms: 1500, total: FREQUENT_CHARS.length },
];

/** 나머지 글자 그리기 → 외곽선 → 7항목 검사 → OCR 순서로 진행한다. 가게 이름에 "상용테스트"가 들어가면 상용 폰트 유사도 초과를 흉내 낸다. */
export function mockBuildJob(jobId: string, elapsedMs: number, input: StartBuildJobRequest): BuildJob {
  const commercialHit = input.storeName.includes("상용테스트");
  const similarity: SimilarityResult = commercialHit
    ? { score: 0.86, threshold: 0.85, nearestFont: "상용 폰트 (예시)", nearestKind: "commercial", passed: false, compared: { free: 69, commercial: 1 } }
    : { score: 0.31, threshold: 0.85, nearestFont: "무료 고딕 (예시)", nearestKind: "free", passed: true, compared: { free: 69, commercial: 0 } };

  let start = 0;
  const stages: BuildStage[] = MOCK_STAGES.map(({ key, ms, total }) => {
    const spent = Math.min(ms, Math.max(0, elapsedMs - start));
    start += ms;
    const status = spent >= ms ? "done" : spent > 0 ? "active" : "pending";
    return { key, status, done: Math.floor((total * spent) / ms), total, seconds: spent > 0 ? spent / 1000 : null };
  });
  const stage = (key: BuildStage["key"]) => stages.find((s) => s.key === key)!;
  const totalMs = start;

  const checkedCount = stage("check").done;
  const checks: CheckResult[] = CHECKS.map((c, i) => {
    if (i >= checkedCount) return { key: c.key, status: "pending", detail: "" };
    if (c.key === "similarity") {
      return {
        key: c.key,
        status: similarity.passed ? "pass" : "fail",
        detail: `${similarity.score.toFixed(2)} (기준 ${similarity.threshold.toFixed(2)})`,
      };
    }
    return { key: c.key, status: "pass", detail: "통과 (모의)" };
  });

  const done = stage("ocr").status === "done";
  return {
    jobId,
    phase: done ? "done" : stage("check").status === "pending" ? "composing" : "checking",
    stages,
    queued: false,
    elapsedSeconds: Math.min(elapsedMs, totalMs) / 1000,
    remainingSeconds: Math.max(0, totalMs - elapsedMs) / 1000,
    builtGlyphs: stage("trace").done,
    totalGlyphs: TOTAL_GLYPHS,
    checks,
    ocrPassed: done ? true : null,
    misreads: done
      ? [
          { char: "아", read: "이" },
          { char: "버", read: "비" },
          { char: "호", read: "?" },
        ]
      : [],
    similarity: stage("check").status === "done" ? similarity : null,
    fontId: done && similarity.passed ? jobId : null,
    models: MOCK_MODELS,
    error: null,
  };
}
