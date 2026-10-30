// 화면 4 생성·빌드(10/30: MX-Font를 뺐다). 먼저 이미지 모델이 나머지 글자를 그리고(rest.ts), 다 그리면 엔진이 참고 글자와 함께
// 외곽선·TTF·구조 검사를 한다. OCR 판독은 TTF가 나온 뒤 여기서 Claude로 한다.
// 같은 참고 글자 작업으로 다시 만들면(다듬기 반영 등) 그린 글자는 그대로 쓰고 바로 엔진으로 간다.
// OCR은 화면이 진행 상황을 물어볼 때 한 번만 시작한다(엔진 작업이 끝나기를 서버에서 따로 기다리지 않는다).

import { z } from "zod";
import { CHECKS, FREQUENT_CHARS, PANGRAM, RIGHTS } from "@/lib/constants";
import type { AxisKey, BuildJob, BuildStage, OcrMisread, StartBuildJobRequest, StyleAxis } from "@/lib/types";
import { engine, type EngineAxes } from "./engine";
import { MODELS, RouteError, modelLabel } from "./env";
import { generateJson } from "./anthropic";
import { readEdits } from "./edits";
import { glyphDrawWeight, glyphModels, readyRefs } from "./glyphs";
import { imagePart } from "./parts";
import { ensureRest, readRestGlyphs, restRemaining, type RestRun } from "./rest";

const OCR_MAX_MISREAD_RATIO = 0.1; // 판독 글자의 10%까지 잘못 읽어도 통과(임시 값)
// OCR 시간 어림(초) = 기본 + 글자당. 임시 값이고, 판독이 끝날 때마다 실제로 걸린 시간으로 비율을 맞춘다.
const OCR_BASE_SECONDS = 4;
const OCR_SECONDS_PER_CHAR = 0.15;

interface OcrState {
  chars: string; // 판독할 글자(서체에 있는 것만)
  state: "idle" | "running" | "done" | "failed";
  passed: boolean | null;
  misreads: OcrMisread[];
  error: string | null;
  model: string | null;
  startedAt: number | null; // Date.now()
  seconds: number | null; // 끝난 뒤 걸린 시간
}

/** 나머지 글자를 그리는 동안의 빌드. 엔진에 넘기면 engineStarted가 켜진다. */
interface DrawState {
  rest: RestRun;
  engineStarted: boolean;
  error: string | null;
}

const globalBuilds = globalThis as unknown as {
  __logocheBuilds?: Map<string, OcrState>;
  __logocheOcrRatios?: number[];
  __logocheDraws?: Map<string, DrawState>;
};
const ocrStates: Map<string, OcrState> = (globalBuilds.__logocheBuilds ??= new Map());
const drawStates: Map<string, DrawState> = (globalBuilds.__logocheDraws ??= new Map());
const ENGINE_SECONDS = 25; // 나머지 글자를 그리는 동안 보여 줄 엔진 단계 어림(2,350자 외곽선·TTF·검사)
const ocrRatios: number[] = (globalBuilds.__logocheOcrRatios ??= []); // 최근 판독 5번의 실제 시간 / 기본 어림

const ocrBaseSeconds = (chars: number) => OCR_BASE_SECONDS + chars * OCR_SECONDS_PER_CHAR;

function ocrEstimate(chars: number): number {
  const ratio = ocrRatios.length ? ocrRatios.reduce((a, b) => a + b, 0) / ocrRatios.length : 1;
  return ocrBaseSeconds(chars) * ratio;
}

const newOcr = (chars: string): OcrState => ({
  chars,
  state: "idle",
  passed: null,
  misreads: [],
  error: null,
  model: null,
  startedAt: null,
  seconds: null,
});

/** 서체 이름 정보(설명)에 넣는 권리 요약. 라이선스 칸에는 엔진이 OFL 고지를 넣는다. */
function licenseText(): string {
  return [
    `${RIGHTS.expression} (${RIGHTS.license}).`,
    `할 수 있어요: ${RIGHTS.allowed.join(" / ")}.`,
    `할 수 없어요: ${RIGHTS.notAllowed.join(" / ")}.`,
  ].join(" ");
}

/** OCR로 읽을 글자: 자주 쓰는 글자와 팬그램(나머지 글자를 그릴 때 이 글자들을 먼저 그린다) */
const OCR_CHARS = [...new Set([...FREQUENT_CHARS, ...PANGRAM.replace(/ /g, "")])].join("");

/** 조절값 중 엔진이 외곽선을 딸 때 쓰는 축. drawnWeight는 참고 글자를 그릴 때의 굵기(굵기 조정 기준). */
export function engineAxes(axes: StyleAxis[], drawnWeight: number | null = null): EngineAxes {
  const value = (key: AxisKey, fallback: number) => axes.find((a) => a.key === key)?.value ?? fallback;
  return {
    weight: value("weight", 400),
    roundness: value("roundness", 0.5),
    width: value("width", 100),
    slant: value("slant", 0),
    tracking: value("tracking", 0),
    drawnWeight,
  };
}

export async function startBuild(req: StartBuildJobRequest): Promise<string> {
  if (!req.glyphJobId) throw new RouteError(400, "참고 글자 작업이 없어요. 화면 3에서 참고 글자를 먼저 그려 주세요.");
  const glyphJobId = req.glyphJobId;
  if ((await readyRefs(glyphJobId)).length === 0) throw new RouteError(400, "검사를 통과한 참고 글자가 없어요. 화면 3에서 다시 그려 주세요.");
  const buildId = crypto.randomUUID().replace(/-/g, "");
  const draw: DrawState = { rest: await ensureRest(glyphJobId, req), engineStarted: false, error: null };
  drawStates.set(buildId, draw);
  ocrStates.set(buildId, newOcr(OCR_CHARS));
  void (async () => {
    try {
      await draw.rest.promise;
      if (draw.rest.error) throw new Error(draw.rest.error);
      await engine.startBuild({
        buildId,
        storeName: req.storeName,
        logoHash: req.logoHash,
        axes: engineAxes(req.axes, await glyphDrawWeight(glyphJobId)),
        refs: await readyRefs(glyphJobId),
        glyphs: await readRestGlyphs(glyphJobId),
        models: glyphModels(glyphJobId),
        licenseText: licenseText(),
        aiNotice: RIGHTS.aiNotice,
        edits: await readEdits(glyphJobId),
      });
      draw.engineStarted = true;
    } catch (err) {
      draw.error = err instanceof Error ? err.message : String(err);
      console.error("[logoche] 빌드 시작 실패", err);
    }
  })();
  return buildId;
}

/** 나머지 글자 그리기 단계 */
function drawStage(draw: DrawState): BuildStage {
  const { rest } = draw;
  const finished = rest.finishedAt !== null;
  return {
    key: "draw",
    status: draw.error && !draw.engineStarted ? "failed" : finished ? "done" : "active",
    done: rest.done,
    total: rest.total,
    seconds: ((rest.finishedAt ?? Date.now()) - rest.startedAt) / 1000,
  };
}

/** 나머지 글자를 그리는 동안(엔진에 넘기기 전) 화면에 보일 상태 */
function drawingJob(buildId: string, draw: DrawState): BuildJob {
  const pending = (key: BuildStage["key"], total: number): BuildStage => ({ key, status: "pending", done: 0, total, seconds: null });
  const failed = !!draw.error;
  return {
    jobId: buildId,
    phase: failed ? "failed" : "composing",
    stages: [drawStage(draw), pending("trace", 0), pending("save", 1), pending("check", CHECKS.length), pending("ocr", OCR_CHARS.length)],
    queued: false,
    elapsedSeconds: (Date.now() - draw.rest.startedAt) / 1000,
    remainingSeconds: failed ? null : restRemaining(draw.rest) + ENGINE_SECONDS + ocrEstimate(OCR_CHARS.length),
    builtGlyphs: 0,
    totalGlyphs: 0,
    checks: CHECKS.map((c) => ({ key: c.key, status: "pending", detail: "" })),
    ocrPassed: null,
    misreads: [],
    similarity: null,
    fontId: null,
    models: [],
    error: failed ? `나머지 글자 그리기 실패: ${draw.error}` : null,
  };
}

const OcrSchema = z.object({ reads: z.array(z.object({ index: z.number().int(), char: z.string() })) });

async function runOcr(buildId: string, ocr: OcrState) {
  try {
    const sheet = await engine.ocrSheet(buildId, ocr.chars);
    ocr.chars = sheet.chars; // 그리지 못해 서체에 없는 글자는 빼고 읽는다
    const prompt = [
      `그림에 번호가 붙은 칸 ${ocr.chars.length}개가 있고, 칸마다 한글 한 글자가 있습니다.`,
      "칸마다 보이는 글자를 그대로 읽으세요. 문맥이나 맞춤법으로 고치지 말고, 알아볼 수 없으면 '?'로 쓰세요.",
      "모든 번호에 대해 답하세요.",
    ].join("\n");
    const { value, model } = await generateJson(MODELS.ocr, [{ text: prompt }, imagePart(sheet.image)], OcrSchema, "low");
    ocr.model = model;
    const reads = new Map(value.reads.map((r) => [r.index, r.char.trim()]));
    // 무엇으로 읽었는지도 남긴다. 화면 4가 '헌 → 현'처럼 보여 준다.
    ocr.misreads = [...ocr.chars].flatMap((char, i) => {
      const read = reads.get(i + 1) ?? "";
      return read === char ? [] : [{ char, read }];
    });
    ocr.passed = ocr.misreads.length <= Math.max(1, Math.floor(ocr.chars.length * OCR_MAX_MISREAD_RATIO));
    ocr.seconds = (Date.now() - (ocr.startedAt ?? Date.now())) / 1000;
    ocrRatios.push(ocr.seconds / ocrBaseSeconds(ocr.chars.length));
    if (ocrRatios.length > 5) ocrRatios.shift();
    ocr.state = "done";
  } catch (err) {
    ocr.error = err instanceof Error ? err.message : String(err);
    ocr.seconds = (Date.now() - (ocr.startedAt ?? Date.now())) / 1000;
    ocr.passed = false;
    ocr.state = "failed";
  }
}

export async function getBuild(buildId: string): Promise<BuildJob> {
  if (!/^[0-9a-f]{32}$/.test(buildId)) throw new RouteError(404, "작업을 찾을 수 없어요");
  const draw = drawStates.get(buildId);
  if (draw && !draw.engineStarted) return drawingJob(buildId, draw);
  const e = await engine.build(buildId);
  let ocr = ocrStates.get(buildId);
  if (!ocr) {
    ocr = newOcr(FREQUENT_CHARS);
    ocrStates.set(buildId, ocr);
  }
  if (e.phase === "done" && ocr.state === "idle") {
    ocr.state = "running";
    ocr.startedAt = Date.now();
    void runOcr(buildId, ocr);
  }
  const ocrFinished = ocr.state === "done" || ocr.state === "failed";
  const ocrSpent = ocr.startedAt === null ? null : (ocr.seconds ?? (Date.now() - ocr.startedAt) / 1000);
  const ocrStage: BuildStage = {
    key: "ocr",
    status: ocr.state === "idle" ? "pending" : ocr.state === "running" ? "active" : ocr.state,
    done: ocrFinished ? ocr.chars.length : 0,
    total: ocr.chars.length,
    seconds: ocrSpent,
  };
  // 남은 시간 = 엔진 어림 + OCR 어림. OCR이 어림보다 오래 걸리면 0(곧 끝남)으로 둔다.
  const remainingSeconds =
    e.phase === "failed"
      ? null
      : ocrFinished
        ? 0
        : ocrSpent !== null
          ? Math.max(0, ocrEstimate(ocr.chars.length) - ocrSpent)
          : e.remaining === null
            ? null
            : e.remaining + ocrEstimate(ocr.chars.length);
  const phase: BuildJob["phase"] = e.phase === "failed" ? "failed" : e.phase === "done" ? (ocrFinished ? "done" : "checking") : e.phase;
  const passed = phase === "done" && ocr.passed === true && e.checks.every((c) => c.status === "pass");
  return {
    jobId: buildId,
    phase,
    stages: [...(draw ? [drawStage(draw)] : []), ...e.stages, ocrStage],
    queued: e.stage === "queue",
    elapsedSeconds: (draw ? ((draw.rest.finishedAt ?? Date.now()) - draw.rest.startedAt) / 1000 : 0) + e.elapsed + (ocrSpent ?? 0),
    remainingSeconds,
    builtGlyphs: e.builtGlyphs,
    totalGlyphs: e.totalGlyphs,
    checks: e.checks,
    ocrPassed: ocrFinished ? ocr.passed : null,
    misreads: ocr.misreads,
    similarity: e.similarity,
    fontId: passed ? buildId : null,
    models: ocr.model ? [modelLabel("ocr", ocr.model)] : [],
    error: e.error ?? (ocr.state === "failed" ? `OCR 판독 실패: ${ocr.error}` : null),
  };
}
