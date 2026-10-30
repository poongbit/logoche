// 화면 3 참고 글자 그리기 작업(10/29 결정: 자소 조합을 그만두고 음절을 그린다).
//
// 이미지 API가 참고 글자 30자(REFERENCE_CHARS)를 한 장(6열×5행)에 그린다. 화면 2의 표현 방식대로 그리고,
// 로고는 획 끝·질감 참고로 가볍게 붙인다(로고 글자 모양은 옮기지 않는다). 기준 글자표(기준 서체로 쓴 같은 글자)는 철자와 칸을 알려 준다.
// 엔진이 글자표를 칸별로 자르고, Claude가 칸마다 그 글자로 읽히는지와 다른 칸과 스타일이 맞는지 검사한다.
// 떨어진 글자만 처음 글자표를 스타일 참고로 붙여 한 자씩 다시 그린다(작업당 GLYPH_MAX_REDRAWS회까지).
// 그래도 떨어진 글자는 화면 3 글자 카드의 '다시 그리기'로 한 번씩 다시 그린다(retryGlyph, 10/29 사용자 제안).
// 10/29: 통과한 글자도 마음에 안 들면 다시 그리거나(전 글자는 남겨 두고 떨어지면 그대로 둔다) 직접 고친다(saveRefEdit).
// 화면 2에서 고른 견본(samples.ts)이 있으면 모든 그림에 참고 이미지로 붙여, 고른 글씨대로 그려지게 한다.
// 그린 글자는 web/.data/glyphs/<작업 id>/<순서>.png에 저장해 서버를 다시 켜도 화면과 빌드가 쓸 수 있게 한다.
// 바꾸기 전 글자는 <순서>.prev.png. 같은 폴더에 글자표(sheet.png)와 작업 보고(report.json: 글자, 그린 굵기, 호출 수,
// 검사에서 떨어진 칸과 이유, 글자별 상태)를 남긴다. 서버를 다시 켜면 작업 보고로 작업을 되살린다(loadJob).
// 10/30 결정(MX-Font를 뺐다): 참고 글자는 그대로 폰트에 들어가고, 나머지 글자는 화면 4에서 이 글자표를 참고로 붙여 그린다(rest.ts).

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AXES, BRAND_TONES, INDUSTRIES, REFERENCE_CHARS, USAGE_CONTEXTS } from "@/lib/constants";
import { KSX1001_HANGUL, decompose } from "@/lib/hangul";
import { isImitationRequest } from "@/lib/rules";
import type { AxisKey, GlyphItem, GlyphJob, StartGlyphJobRequest, StyleSampleRequest } from "@/lib/types";
import { listEdits } from "./edits";
import { engine, type EngineGlyphSheet, type EngineRef } from "./engine";
import { MODELS, RouteError, SAMPLE_QUALITY, modelLabel } from "./env";
import { generateJson } from "./anthropic";
import { generateImage } from "./openai";
import { imagePart, type Part } from "./parts";
import { readSample } from "./samples";

const DATA_DIR = path.join(process.cwd(), ".data", "glyphs");
// 다시 그리기 상한(이미지 API 비용 상한). GPT Image 1회 값은 서버 로그의 토큰 수로 확인한다.
const MAX_REDRAWS = Number(process.env.GLYPH_MAX_REDRAWS ?? 10);
const ATTEMPTS_PER_GLYPH = 2;
// 사용자가 글자 카드에서 누르는 '다시 그리기'의 글자당 횟수(누를 때마다 이미지 1장)
const USER_REDRAWS = Number(process.env.GLYPH_USER_REDRAWS ?? 3);
// 사용자가 표현 방식을 비웠을 때 쓰는 기본값
const DEFAULT_EXPRESSION = "획의 굵기와 곡선을 과감하게 바꾼 디스플레이 글자";

type GlyphState = "pending" | "retry" | "redrawing" | "ok" | "failed";

interface ItemState {
  index: number;
  char: string; // 지금 그리는 글자. 계속 떨어지면 쉬운 글자로 바뀐다(switchIfStuck)
  original: string; // 처음 맡은 참고 글자
  tried: string[]; // 그려 보다 바꾼 글자
  charFails: number; // 지금 글자로 다시 그려 떨어진 횟수
  status: GlyphState;
  problem: string | null;
  attempts: number;
  version: number; // 그림을 저장할 때마다 1씩 늘린다. 그림 주소에 붙여 브라우저 캐시를 나눈다
  note: string | null; // 통과한 글자에 붙일 말
  userRedraws: number; // 사용자가 누른 '다시 그리기' 횟수
  hasPrevious: boolean; // <순서>.prev.png에 바꾸기 전 글자가 있다
  handEdited: boolean;
  prevHandEdited: boolean;
}

const newItem = (index: number, char: string): ItemState => ({
  index,
  char,
  original: char,
  tried: [],
  charFails: 0,
  status: "pending",
  problem: null,
  attempts: 0,
  version: 0,
  note: null,
  userRedraws: 0,
  hasPrevious: false,
  handEdited: false,
  prevHandEdited: false,
});

interface Problem {
  char: string;
  stage: "sheet" | "redraw";
  problem: string;
}

export interface JobState {
  id: string;
  createdAt: number;
  drawWeight: number; // 그릴 때의 굵기. 엔진이 지금 굵기와의 차이만큼 획을 굵히거나 가늘인다
  sampleId: string | null; // 화면 2에서 고른 견본
  items: ItemState[];
  fatal: RouteError | null;
  models: Set<string>; // 실제로 답한 모델(제작 기록)
  imageCalls: number;
  redraws: number;
  problems: Problem[];
  finished: boolean;
}

const globalJobs = globalThis as unknown as { __logocheGlyphJobs?: Map<string, JobState> };
const jobs: Map<string, JobState> = (globalJobs.__logocheGlyphJobs ??= new Map());

// ---------- 파일 ----------

const UUID = /^[0-9a-f-]{36}$/;

export function jobDir(jobId: string): string {
  if (!UUID.test(jobId)) throw new RouteError(404, "작업을 찾을 수 없어요");
  return path.join(DATA_DIR, jobId);
}

export const glyphFile = (jobId: string, index: number) => path.join(jobDir(jobId), `${index}.png`);
const prevFile = (jobId: string, index: number) => path.join(jobDir(jobId), `${index}.prev.png`);

/** data URL은 그림으로, 그 밖의 글은 그대로 저장한다. */
async function saveFile(jobId: string, name: string, content: string) {
  await fs.mkdir(jobDir(jobId), { recursive: true });
  const isDataUrl = content.startsWith("data:");
  const body = isDataUrl ? Buffer.from(content.slice(content.indexOf(",") + 1), "base64") : content;
  await fs.writeFile(path.join(jobDir(jobId), name), body);
}

type SavedItem = Pick<
  ItemState,
  "status" | "problem" | "version" | "note" | "userRedraws" | "hasPrevious" | "handEdited" | "prevHandEdited" | "original" | "tried" | "charFails"
>;

interface Report {
  chars?: string;
  drawWeight?: number;
  ok?: number[];
  sampleId?: string | null;
  models?: string[];
  items?: SavedItem[];
}

async function readReport(jobId: string): Promise<Report | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(jobDir(jobId), "report.json"), "utf-8"));
  } catch {
    return null;
  }
}

export async function readGlyph(jobId: string, index: number): Promise<Buffer> {
  try {
    return await fs.readFile(glyphFile(jobId, index));
  } catch {
    throw new RouteError(404, `참고 글자 그림이 없어요: ${index}`);
  }
}

/** 메모리의 작업. 서버를 다시 켰으면 작업 보고(report.json)로 되살린다(그리던 글자는 실패로 둔다). */
export async function loadJob(jobId: string): Promise<JobState> {
  const live = jobs.get(jobId);
  if (live) {
    // 바꿔 그리기(10/30)를 넣기 전에 메모리에 올라온 작업은 그 칸이 없다(개발 서버 핫 리로드). 떨어진 글자는 이미 다시 그려 본 글자로 본다.
    for (const item of live.items) {
      item.original ??= item.char;
      item.tried ??= [];
      item.charFails ??= item.status === "failed" ? 1 : 0;
    }
    return live;
  }
  const report = await readReport(jobId);
  if (!report?.chars || !report.ok) throw new RouteError(404, "참고 글자 작업을 찾을 수 없어요. 화면 3에서 다시 그려 주세요.");
  const ok = new Set(report.ok);
  const job: JobState = {
    id: jobId,
    createdAt: Date.now(),
    drawWeight: typeof report.drawWeight === "number" ? report.drawWeight : 400,
    sampleId: report.sampleId ?? null,
    items: [...report.chars].map((char, index) => {
      const saved = report.items?.[index];
      // 이전 버전 보고에는 글자별 상태가 없다. 그림 주소가 겹치지 않게 버전을 서버를 켠 시각으로 둔다.
      // 바꿔 그리기(10/30) 전 보고의 떨어진 글자는 이미 다시 그려 본 글자로 본다(다음 다시 그리기에서 쉬운 글자로 바꾼다).
      return {
        ...newItem(index, char),
        ...saved,
        charFails: saved?.charFails ?? (ok.has(index) ? 0 : 1),
        version: saved?.version ?? Date.now(),
        status: ok.has(index) ? "ok" : "failed",
        problem: ok.has(index) ? null : (saved?.problem ?? "서버를 다시 켜서 그리기가 멈췄어요"),
      } satisfies ItemState;
    }),
    fatal: null,
    models: new Set(report.models ?? []),
    imageCalls: 0,
    redraws: 0,
    problems: [],
    finished: true,
  };
  jobs.set(jobId, job);
  return job;
}

/** 참고 글자를 그릴 때의 굵기. 모르면 null. */
export async function glyphDrawWeight(jobId: string): Promise<number | null> {
  return (await loadJob(jobId).catch(() => null))?.drawWeight ?? null;
}

/** 검사를 통과한 참고 글자(엔진에 보낼 형식) */
export async function readyRefs(jobId: string): Promise<EngineRef[]> {
  const job = await loadJob(jobId);
  const ready = job.items.filter((i) => i.status === "ok");
  return Promise.all(
    ready.map(async ({ index, char }) => ({ char, image: `data:image/png;base64,${(await readGlyph(jobId, index)).toString("base64")}` })),
  );
}

/** 참고 글자 작업에서 실제로 쓴 모델. 서버를 다시 켜 작업 정보가 없으면 빈 목록. */
export function glyphModels(jobId: string): string[] {
  return [...(jobs.get(jobId)?.models ?? [])];
}

// ---------- 동시 호출 제한 ----------

export function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}
const imageLimit = limiter(4);
// 화면 4 나머지 글자는 장을 여러 개 함께 검사한다(10/30).
const checkLimit = limiter(Number(process.env.GLYPH_CHECK_CONCURRENCY ?? 8));

// ---------- 프롬프트 ----------

export interface Context {
  logo: Part;
  sample: Part | null; // 화면 2에서 고른 견본(가게 이름을 그 표현 방식으로 그린 그림)
  purpose: string;
  weight: number;
  expression: string;
  direction: string[]; // AI 제안에서 바뀐 그리기 방향(둥글기·대비·흔들림)
}

function axisValue(req: StartGlyphJobRequest, key: AxisKey): number {
  return req.style.axes.find((a) => a.key === key)?.value ?? (AXES[key].min + AXES[key].max) / 2;
}

function makeContext(req: StartGlyphJobRequest, sample: string | null = null): Context {
  const u = req.upload;
  if (!u.logoImage) throw new RouteError(400, "로고 이미지가 없어요. 화면 1에서 로고를 다시 올려 주세요.");
  const industry = INDUSTRIES.find((i) => i.value === u.industry)?.label ?? "";
  const usage = u.usageContexts.map((c) => USAGE_CONTEXTS.find((x) => x.value === c)?.label).join("·");
  const tones = u.brandTones.map((t) => BRAND_TONES.find((b) => b.value === t)?.label).join("·");
  return {
    logo: imagePart(u.logoImage),
    sample: sample ? imagePart(sample) : null,
    purpose: `쓰임: ${industry} ${usage}. 분위기: ${tones}${u.desiredFeel && !isImitationRequest(u.desiredFeel) ? `, ${u.desiredFeel}` : ""}.`,
    weight: axisValue(req, "weight"),
    expression: req.style.expression?.trim() && !isImitationRequest(req.style.expression) ? req.style.expression.trim() : DEFAULT_EXPRESSION,
    direction: directionLines(req),
  };
}

const weightWord = (v: number) => (v < 350 ? "가늘게" : v < 550 ? "보통 굵기로" : v < 750 ? "굵게" : "아주 굵게");

// 그리기 방향 축을 말로. AI가 처음 제안한 값에서 바뀐 축만 넣는다(처음 초안은 표현 방식을 앞세운다).
// 10/29: 말로 고치기를 빼며 화면에서 바꿀 곳은 없어졌다. 화면 2의 톤 충돌 3안(chooseConflict)이 바꿀 수 있다.
const DIRECTION_WORDS: Record<"roundness" | "contrast" | "wobble", (v: number) => string> = {
  roundness: (v) =>
    v < 0.15
      ? "모서리와 획 끝을 직각으로 각지게"
      : v < 0.45
        ? "모서리는 살짝만 둥글리고 획 끝은 반듯하게 끊어"
        : v < 0.75
          ? "모서리와 획 끝을 둥글게"
          : "획 끝을 반원처럼 완전히 둥글게, 모서리도 크게 둥글려",
  contrast: (v) =>
    v >= 0.95 ? "가로획과 세로획 굵기를 똑같이" : v >= 0.8 ? "가로획을 세로획보다 조금 가늘게" : "가로획을 세로획보다 확실히 가늘게 해 굵기 대비가 뚜렷하게",
  wobble: (v) =>
    v < 0.08 ? "자로 그은 듯 반듯하게" : v < 0.3 ? "아주 약간만 손맛이 나게" : v < 0.6 ? "손으로 그린 듯 획이 조금씩 흔들리게" : "손글씨처럼 획이 자유롭게 흔들리게",
};

function directionLines(req: StartGlyphJobRequest): string[] {
  return (Object.keys(DIRECTION_WORDS) as (keyof typeof DIRECTION_WORDS)[]).flatMap((key) => {
    const axis = req.style.axes.find((a) => a.key === key);
    if (!axis || Math.abs(axis.value - axis.suggested) < AXES[key].step / 2) return [];
    return [`${AXES[key].label}: ${DIRECTION_WORDS[key](axis.value)}`];
  });
}

// 10/30: 지시문을 정리했다(같은 말 되풀이 합치기, 짜임 설명 줄이기). 글자표 1,534자 → 1,066자, 한 자 다시 그리기 약 900자 → 약 700자.
function styleLines(ctx: Context): string[] {
  return [
    ctx.purpose,
    `표현 방식: ${ctx.expression}. 모든 글자에 과감하게 적용하세요.`,
    `기본 굵기: ${weightWord(ctx.weight)}. 표현 방식에 맞게 획마다 굵기를 바꿔도 됩니다.`,
    ctx.direction.length ? `사용자가 요청한 방향도 모든 글자에 분명히 반영하세요: ${ctx.direction.join(" / ")}.` : "",
    "획 안을 검게 채우고(속이 빈 외곽선 금지), 글자를 기울이지 말고 똑바로 세우세요.",
    // 10/30 시험: 획 끝 물결 표현에서 ㅏ의 짧은 획 끝 말림이 획 하나처럼 보여 가→갸, 서→샤로 그렸다.
    "획 끝 장식(말림·물결 등)이 짧은 획처럼 보이지 않게 하세요. 장식 때문에 ㅏ가 ㅑ로, ㅓ가 ㅕ로 읽히면 안 됩니다.",
  ];
}

const ORDINALS = ["첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"];
const SAMPLE_TEXT = "사용자가 고른 글씨 견본(가게 이름)입니다. 획 굵기·획 끝·모서리·곡선·질감·비례를 이 견본과 똑같이 맞추세요.";
const EXTRAS = "격자선, 번호, 설명 글씨, 색, 그림자, 글자와 떨어진 장식은 넣지 마세요.";
const NO_EXTRAS = `흰 바탕에 검은색 글자만 그리세요. ${EXTRAS}`;

/** 참고 이미지와 그 설명. 로고는 늘 첫 번째다(10/28: 로고와의 연결을 지키려고 가볍게 붙인다). */
function references(ctx: Context, structure: { image: string; text: string }, styleRef: { image: string; text: string } | null) {
  const refs: { part: Part; text: string }[] = [
    { part: ctx.logo, text: "로고입니다. 획 끝과 질감만 가볍게 참고하고, 로고 글자 모양은 옮기지 마세요." },
    { part: imagePart(structure.image), text: structure.text },
  ];
  if (ctx.sample) refs.push({ part: ctx.sample, text: SAMPLE_TEXT });
  if (styleRef) refs.push({ part: imagePart(styleRef.image), text: styleRef.text });
  return { parts: refs.map((r) => r.part), lines: refs.map((r, i) => `${ORDINALS[i]} 이미지는 ${r.text}`) };
}

// 그림 모델이 다른 글자로 끌려가는 자소의 구조 설명. 10/28: 붓글씨 표현에서 ㅊ이 한자 '大'로 그려져 검사에 5번 연달아 떨어졌다.
// 10/30: 아주 굵고 둥근 표현(고양이)에서 꽃의 ㄲ을 ㄱ 하나로, 원의 ㅝ를 ㅟ로 뭉개 다시 그려도 계속 떨어졌다. 겹자음·겹모음·겹받침을 더했다.
const DOUBLE = (jaso: string, part: string) => `${jaso}은 ${part} 두 개를 나란히 붙인 자음입니다. ${part} 두 개가 모두 따로 보여야 합니다.`;
const DOUBLE_FINALS: Record<string, string> = { ㄳ: "ㄱㅅ", ㄵ: "ㄴㅈ", ㄶ: "ㄴㅎ", ㄺ: "ㄹㄱ", ㄻ: "ㄹㅁ", ㄼ: "ㄹㅂ", ㄽ: "ㄹㅅ", ㄾ: "ㄹㅌ", ㄿ: "ㄹㅍ", ㅀ: "ㄹㅎ", ㅄ: "ㅂㅅ" };
const STRUCTURE_HINTS: Record<string, string> = {
  ㅊ: "ㅊ은 맨 위 짧은 꼭지가 가로획 위에 따로 떨어져 있고 아래 획과 이어지지 않습니다. 한자 '大'처럼 그리지 마세요.",
  ㄲ: DOUBLE("ㄲ", "ㄱ"),
  ㄸ: DOUBLE("ㄸ", "ㄷ"),
  ㅃ: DOUBLE("ㅃ", "ㅂ") + " 세로획 네 개가 다 보여야 합니다.",
  ㅆ: DOUBLE("ㅆ", "ㅅ"),
  ㅉ: DOUBLE("ㅉ", "ㅈ"),
  ㅘ: "ㅘ는 아래 ㅗ와 오른쪽 ㅏ입니다. 오른쪽 세로획 바깥으로 짧은 가로획이 나옵니다.",
  ㅙ: "ㅙ는 아래 ㅗ와 오른쪽 ㅐ(세로획 두 개와 그 사이 짧은 가로획)입니다.",
  ㅚ: "ㅚ는 아래 ㅗ와 오른쪽 세로획 하나입니다. 짧은 가로획은 없습니다.",
  ㅝ: "ㅝ는 아래 ㅜ(가로획과 그 아래 짧은 획)와 오른쪽 ㅓ입니다. 오른쪽 세로획 안쪽에 짧은 가로획이 붙어야 하고, 빠지면 ㅟ로 읽힙니다.",
  ㅞ: "ㅞ는 아래 ㅜ와 오른쪽 ㅔ(세로획 두 개와 그 사이 짧은 가로획)입니다.",
  ㅟ: "ㅟ는 아래 ㅜ와 오른쪽 세로획 하나입니다. 짧은 가로획은 없습니다.",
  ㅢ: "ㅢ는 아래 가로획 ㅡ와 오른쪽 세로획 하나입니다.",
  ...Object.fromEntries(
    Object.entries(DOUBLE_FINALS).map(([jaso, [a, b]]) => [jaso, `받침 ${jaso}은 ${a}과 ${b}을 나란히 붙인 겹받침입니다. 둘 다 보여야 합니다.`]),
  ),
};
const structureHints = (chars: string[]) =>
  [...new Set(chars.flatMap((c) => (decompose(c) ?? []).map((p) => p.jaso)))].flatMap((j) => STRUCTURE_HINTS[j] ?? []);

// 같은 글자로 다시 그려도 떨어지면, 같은 어려운 자모가 든 쉬운 글자로 바꿔 그린다(10/30 사용자 요청).
// 바꿔 그린 참고 글자는 그 글자로 폰트에 들어가고, 원래 글자는 화면 4에서 나머지 글자와 함께 그린다(rest.ts).
// 아래는 받침 빼기·초성 ㅇ으로 바꾸기만으로는 어려운 자모(ㄲ·ㅃ·ㅆ·ㅝ·ㅢ·ㅊ·ㅟ)가 빠지는 참고 글자의 대안이다.
const EASIER: Record<string, string> = { 꽃: "꼬까", 빵: "빠뻐", 원: "워뭐", 있: "씨싸", 의: "희늬", 쳇: "체차", 퀴: "귀위", 쥐: "위뒤" };
const IEUNG = 11; // 초성 ㅇ의 순서
const syllable = (cho: number, jung: number, jong = 0) => String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong);

/** 바꿔 그릴 쉬운 글자 후보(앞이 먼저) */
function easierChars(char: string): string[] {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return [];
  const [cho, jung, jong] = [Math.floor(code / 588), Math.floor((code % 588) / 28), code % 28];
  const out = [...(EASIER[char] ?? "")];
  if (jong) out.push(syllable(cho, jung)); // 받침 빼기
  if (cho !== IEUNG) out.push(syllable(IEUNG, jung)); // 초성을 ㅇ으로
  return [...new Set(out)].filter((c) => c !== char && KSX1001_HANGUL.has(c));
}

/** 지금 글자로 다시 그려 한 번 이상 떨어졌으면 다음 쉬운 글자로 바꾼다. 다른 칸의 글자·이미 그려 본 글자는 고르지 않는다. */
function switchIfStuck(job: JobState, item: ItemState) {
  if (item.charFails < 1) return;
  const taken = new Set([...job.items.filter((i) => i !== item).map((i) => i.char), ...item.tried, item.char]);
  const next = easierChars(item.original).find((c) => !taken.has(c));
  if (!next) return;
  console.log(`[logoche] 참고 글자 '${item.char}'이(가) 다시 그려도 떨어져 '${next}'(으)로 바꿔 그림 (원래 '${item.original}')`);
  item.tried.push(item.char);
  item.char = next;
  item.charFails = 0;
  item.problem = null; // 앞 글자의 떨어진 이유는 새 글자 지시문에 넣지 않는다
}

function sheetParts(ctx: Context, sheet: EngineGlyphSheet): Part[] {
  const chars = [...sheet.chars];
  const refs = references(
    ctx,
    { image: sheet.image, text: "기준 글자표입니다. 칸 배치, 어떤 글자인지, 획이 어디서 이어지고 떨어지는지만 따르고 굵기·곡선·비례·획 끝은 따르지 마세요." },
    null,
  );
  const text = [
    `한글 서체 하나의 참고 글자 ${chars.length}자를 한 장에 그립니다. 모든 글자의 굵기·획 끝·모서리·질감이 같아야 합니다.`,
    ...styleLines(ctx),
    ...refs.lines,
    `기준 글자표와 같은 ${sheet.cols}열×${sheet.rows}행 칸에 같은 순서(왼쪽 위부터 줄 순서)로 한 자씩 그리세요: ${chars.map((c, i) => `${i + 1}.${c}`).join(" ")}.`,
    "각 글자는 그 글자로 읽혀야 합니다. 칸 안에 크게 그리되 이웃 글자와 닿지 않게 띄우세요.",
    ...structureHints(chars),
    NO_EXTRAS,
  ]
    .filter(Boolean)
    .join("\n");
  return [{ text }, ...refs.parts];
}

/** 화면 4 나머지 글자 한 장(10/30). 화면 3에서 확정한 참고 글자 글자표(approved)를 마지막 참고 이미지로 붙여 같은 서체로 그리게 한다.
 * 10/30 시험(바다식당·고양이, 어려운 짜임 30자): 30칸 한 장이 모두 통과했고 16칸으로 줄여도 나아지지 않았다. */
export function restSheetParts(ctx: Context, sheet: EngineGlyphSheet, approved: string | null): Part[] {
  const chars = [...sheet.chars];
  const refs = references(
    ctx,
    { image: sheet.image, text: "기준 글자표입니다. 칸 배치, 어떤 글자인지, 획이 어디서 이어지고 떨어지는지만 따르고 굵기·곡선·비례·획 끝은 따르지 마세요." },
    approved
      ? { image: approved, text: "이 서체에서 이미 확정한 참고 글자들입니다. 굵기·획 끝·모서리·곡선·질감·비례·글자 크기를 이 글자들과 똑같이 맞추세요." }
      : null,
  );
  const text = [
    `한글 서체 하나의 나머지 글자 ${chars.length}자를 한 장에 그립니다. 이미 확정한 참고 글자와 같은 서체로 보여야 합니다.`,
    ...styleLines(ctx),
    ...refs.lines,
    `기준 글자표와 같은 ${sheet.cols}열×${sheet.rows}행 칸에 같은 순서(왼쪽 위부터 줄 순서)로 한 자씩 그리세요: ${chars.map((c, i) => `${i + 1}.${c}`).join(" ")}.`,
    "각 글자는 그 글자로 읽혀야 합니다. 칸 안에 크게 그리되 이웃 글자와 닿지 않게 띄우세요.",
    ...structureHints(chars),
    NO_EXTRAS,
  ]
    .filter(Boolean)
    .join("\n");
  return [{ text }, ...refs.parts];
}

/** 화면 2 견본: 가게 이름(한글 4자까지)을 표현 방식대로 한 장에. 고르면 초안의 참고 이미지가 된다. */
function sampleParts(ctx: Context, sheet: EngineGlyphSheet, others: string[]): Part[] {
  const chars = [...sheet.chars];
  const refs = references(ctx, { image: sheet.image, text: "기준 글자표입니다. 어떤 글자인지와 칸 배치만 보여 줍니다." }, null);
  const text = [
    `한글 서체의 글씨 견본으로 '${chars.join("")}'를 그립니다. 가게 주인이 후보 견본 몇 장을 나란히 보고 서체 방향을 고릅니다.`,
    ...styleLines(ctx),
    // 10/29: 같은 지시문으로는 세 견본이 모두 평범한 둥근 고딕에 가까워 고를 수가 없었다. 방향을 과장하고 다른 후보와 다르게 그리게 한다.
    `견본만 보고도 '${ctx.expression}'이(가) 한눈에 보이도록 획 모양을 과감하게 과장하세요. 평범한 고딕이나 둥근 고딕처럼 보이면 실패입니다.`,
    others.length ? `다른 후보(${others.map((o) => `'${o}'`).join(", ")})와 나란히 놓았을 때 확실히 다른 서체로 보여야 합니다.` : "",
    ...refs.lines,
    `기준 글자표와 똑같은 ${sheet.cols}열×${sheet.rows}행 칸, 같은 순서로 칸마다 글자 하나씩 그리세요(왼쪽 위부터 줄 순서): ${chars.join(" ")}. 칸 선은 그리지 마세요.`,
    "모든 글자의 획 굵기, 획 끝, 모서리, 질감을 똑같이 맞추세요.",
    "기준 글자표는 어떤 글자인지와 획이 어디서 이어지고 떨어지는지만 알려 줍니다. 획의 굵기·곡선·비례·획 끝은 표현 방식대로 바꾸세요.",
    "각 글자는 그 글자로 읽혀야 합니다. 칸 안에 크게 그리되 칸 밖으로 나가거나 이웃 칸에 닿으면 안 됩니다.",
    ...structureHints(chars),
    NO_EXTRAS,
  ]
    .filter(Boolean)
    .join("\n");
  return [{ text }, ...refs.parts];
}

/** 견본에 그릴 글자: 가게 이름에서 완성형 한글만 4자까지. 없으면 '가나다'. */
export function sampleChars(storeName: string): string {
  const chars = [...storeName].filter((c) => KSX1001_HANGUL.has(c)).slice(0, 4);
  return chars.length ? chars.join("") : "가나다";
}

export async function drawStyleSample(req: StyleSampleRequest): Promise<{ image: string; model: string }> {
  const expression = req.expression.trim();
  const others = req.style.expressionOptions.filter((o) => o.trim() !== expression);
  if (!expression) throw new RouteError(400, "표현 방식을 적어 주세요");
  if (isImitationRequest(expression)) throw new RouteError(400, "특정 서체는 따라 하지 않아요. 원하는 획 모양을 말로 적어 주세요.");
  const ctx = makeContext({ upload: req.upload, style: { ...req.style, expression } });
  const sheet = await engine.wordSheet(sampleChars(req.upload.storeName));
  const { value, model } = await imageLimit(() => generateImage(MODELS.image, sampleParts(ctx, sheet, others), sheet.aspectRatio, SAMPLE_QUALITY));
  return { image: value, model: modelLabel("image", model) };
}

/** 글자 하나 다시 그리기. problem은 직전 그림이 검사에서 떨어진 이유로, 같은 실수를 되풀이하지 않게 알려 준다. */
function singleParts(ctx: Context, item: ItemState, reference: string, styleRef: string | null): Part[] {
  const refs = references(
    ctx,
    { image: reference, text: "이 글자의 구조 참고입니다. 어떤 글자인지와 획이 어디서 이어지고 떨어지는지만 따르세요." },
    styleRef ? { image: styleRef, text: "같은 서체로 먼저 그린 글자들입니다. 굵기·획 끝·모서리·질감을 이 글자들과 똑같이 맞추세요." } : null,
  );
  const text = [
    `한글 서체의 참고 글자 '${item.char}' 하나를 그립니다.`,
    ...styleLines(ctx),
    ...refs.lines,
    ...structureHints([item.char]),
    "굵게 그려도 획 사이에 빈틈을 남겨, 획끼리 붙어 뭉개지거나 획이 빠지지 않게 하세요.",
    item.problem ? `직전 그림은 '${item.problem}'(이)라서 검사에서 떨어졌습니다. 이 점을 고쳐 그리세요.` : "",
    `흰 바탕 가운데에 검은색으로 이 글자 하나만 크게 그리세요. ${EXTRAS}`,
  ]
    .filter(Boolean)
    .join("\n");
  return [{ text }, ...refs.parts];
}

// ---------- 검사 ----------

const SheetCheckSchema = z.object({
  cells: z.array(z.object({ index: z.number().int(), ok: z.boolean(), problem: z.string().nullable() })),
});
const SingleCheckSchema = z.object({ ok: z.boolean(), problem: z.string().nullable() });

const CHECK_RULES = [
  "실험적인 표현의 디스플레이 서체입니다. 그 글자로 읽히고 획 수와 이어짐·떨어짐이 맞으면 ok=true입니다.",
  "굵기·곡선·비례·획 끝이 보통 글자와 많이 달라도, 획에 붙은 표현(부풀림·물결·흘러내림 등)이 있어도 통과시키세요.",
  "다른 글자로 읽히거나, 획이 빠지거나 더 있거나, 글자와 떨어진 그림·글씨·테두리가 섞였거나, 속이 빈 외곽선만 있으면 ok=false와 짧은 이유(한국어 15자 안)를 주세요.",
].join("\n");

export async function checkSheet(job: JobState, contactSheet: string, chars: string[]): Promise<Map<number, { ok: boolean; problem: string | null }>> {
  const prompt = [
    "한글 서체의 참고 글자 검사입니다. 칸 아래에 번호가 있고, 칸마다 다음 글자가 있어야 합니다.",
    chars.map((c, i) => `${i + 1}: ${c}`).join(", "),
    CHECK_RULES,
    "다른 칸들과 굵기·획 끝·질감이 눈에 띄게 다른 칸도 ok=false(이유 '스타일 다름')입니다. 작은 차이는 통과시키세요.",
    "X 표시가 있는 빈 칸은 ok=false, 이유 '빈 칸'입니다. 모든 번호에 대해 답하세요.",
  ].join("\n");
  const { value, model } = await checkLimit(() => generateJson(MODELS.check, [{ text: prompt }, imagePart(contactSheet)], SheetCheckSchema, "medium"));
  job.models.add(modelLabel("check", model));
  return new Map(value.cells.map((c) => [c.index, { ok: c.ok, problem: c.problem }]));
}

async function checkSingle(job: JobState, image: string, item: ItemState) {
  const prompt = [`이 그림은 한글 '${item.char}' 한 글자여야 합니다.`, CHECK_RULES].join("\n");
  const { value, model } = await checkLimit(() => generateJson(MODELS.check, [{ text: prompt }, imagePart(image)], SingleCheckSchema, "medium"));
  job.models.add(modelLabel("check", model));
  return value;
}

// ---------- 작업 ----------

/** 키·크레딧·조직 인증·모델 id·엔진 연결처럼 다시 해도 소용없는 오류 */
export function isFatal(err: unknown): boolean {
  if (err instanceof RouteError && (err.status === 402 || err.status === 403)) return true; // 크레딧 없음·조직 인증
  const message = err instanceof Error ? err.message : String(err);
  return /\.env\.local|키를 확인|(OpenAI|Claude) (400|401|403|404)|엔진 서버/.test(message);
}

async function draw(job: JobState, parts: Part[], aspectRatio: string): Promise<string> {
  const { value, model } = await imageLimit(() => generateImage(MODELS.image, parts, aspectRatio));
  job.models.add(modelLabel("image", model));
  job.imageCalls++;
  return value;
}

function fail(job: JobState, item: ItemState, stage: Problem["stage"], problem: string) {
  item.status = "retry";
  item.problem = problem;
  job.problems.push({ char: item.char, stage, problem });
}

/** 글자표를 그려 칸별로 자르고 검사한다. 그린 글자표를 돌려준다(다시 그릴 때 스타일 참고). 그리지 못했으면 null. */
async function drawSheet(job: JobState, ctx: Context): Promise<string | null> {
  const chars = job.items.map((i) => i.char);
  try {
    const sheet = await engine.glyphSheet(chars.join(""));
    const image = await draw(job, sheetParts(ctx, sheet), sheet.aspectRatio);
    await saveFile(job.id, "sheet.png", image);
    const split = await engine.splitGlyphs(sheet.chars, image);
    // 검사 호출만 실패하면 엔진이 문제를 찾지 못한 칸은 통과로 둔다(검사 오류로 다시 그리기가 몰리지 않게).
    const verdicts = await checkSheet(job, split.contactSheet, chars).catch((err) => {
      if (isFatal(err)) throw err;
      console.error("[logoche] 참고 글자 검사 실패", err);
      return null;
    });
    await Promise.all(
      job.items.map(async (item, i) => {
        const cell = split.cells[i];
        const verdict = verdicts ? (verdicts.get(i + 1) ?? { ok: false, problem: "검사 결과 없음" }) : { ok: true, problem: null };
        if (cell?.image && !cell.problem && verdict.ok) {
          await saveGlyph(job, item, cell.image);
        } else {
          fail(job, item, "sheet", cell?.problem ?? verdict.problem ?? "검사 실패");
        }
      }),
    );
    return image;
  } catch (err) {
    if (isFatal(err)) throw err;
    console.error("[logoche] 참고 글자표 실패", err);
    const message = `글자표 그리기 실패: ${err instanceof Error ? err.message : String(err)}`;
    for (const item of job.items) fail(job, item, "sheet", message);
    return null;
  }
}

async function saveGlyph(job: JobState, item: ItemState, image: string) {
  await saveFile(job.id, `${item.index}.png`, image);
  item.version++;
  item.status = "ok";
  item.problem = null;
  item.note = item.char !== item.original ? `'${item.original}' 대신 그린 글자예요. '${item.original}'도 폰트에 들어가요.` : null;
  item.handEdited = false;
}

/** 지금 글자를 바꾸기 전 글자(<순서>.prev.png)로 남긴다. */
async function keepPrevious(job: JobState, item: ItemState) {
  await fs.copyFile(glyphFile(job.id, item.index), prevFile(job.id, item.index));
  item.hasPrevious = true;
  item.prevHandEdited = item.handEdited;
}

/** 글자 하나를 한 번 다시 그려 검사한다. 통과하면 ok, 떨어지면 retry(이유는 item.problem). 다시 해도 소용없는 오류는 던진다.
 * canSwitch: 통과한 글자가 없는 칸이면, 지금 글자로 이미 떨어졌을 때 쉬운 글자로 바꿔 그린다. */
async function redrawOnce(job: JobState, ctx: Context, item: ItemState, styleRef: string | null, canSwitch: boolean) {
  item.attempts++;
  job.redraws++;
  item.status = "redrawing";
  if (canSwitch) switchIfStuck(job, item);
  try {
    const reference = await engine.glyphSingle(item.char);
    const image = await draw(job, singleParts(ctx, item, reference.image, styleRef), "1:1");
    const normalized = await engine.normalizeGlyph(image, item.char);
    if (!normalized.image || normalized.problem) {
      item.charFails++;
      fail(job, item, "redraw", normalized.problem ?? "빈 그림");
      return;
    }
    const verdict = await checkSingle(job, normalized.image, item);
    if (verdict.ok) await saveGlyph(job, item, normalized.image);
    else {
      item.charFails++;
      fail(job, item, "redraw", verdict.problem ?? "검사 실패");
    }
  } catch (err) {
    if (isFatal(err)) throw err;
    console.error(`[logoche] ${item.char} 다시 그리기 실패`, err);
    fail(job, item, "redraw", `오류: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function redraw(job: JobState, ctx: Context, item: ItemState, styleRef: string | null) {
  while (item.status === "retry") {
    if (item.attempts >= ATTEMPTS_PER_GLYPH || job.redraws >= MAX_REDRAWS) {
      item.status = "failed";
      return;
    }
    await redrawOnce(job, ctx, item, styleRef, true);
  }
}

async function redrawMissing(job: JobState, ctx: Context, styleRef: string | null) {
  await Promise.all(job.items.filter((i) => i.status === "retry").map((item) => redraw(job, ctx, item, styleRef)));
}

/** 작업의 프롬프트 재료. 견본은 작업을 시작할 때 고른 것을 쓴다(다시 그릴 때도 같다). */
export async function jobContext(job: JobState, req: StartGlyphJobRequest): Promise<Context> {
  return makeContext(req, job.sampleId ? await readSample(job.sampleId).catch(() => null) : null);
}

async function runJob(job: JobState, req: StartGlyphJobRequest) {
  try {
    const ctx = await jobContext(job, req);
    const sheet = await drawSheet(job, ctx);
    await redrawMissing(job, ctx, sheet);
  } catch (err) {
    failJob(job, err);
  } finally {
    await finishJob(job);
  }
}

function failJob(job: JobState, err: unknown) {
  job.fatal = err instanceof RouteError ? err : new RouteError(500, err instanceof Error ? err.message : String(err));
  console.error("[logoche] 참고 글자 작업 실패", err);
}

async function finishJob(job: JobState) {
  // 글자 카드의 '다시 생성'으로 따로 그리는 중인 글자는 그대로 둔다(그 호출이 끝나며 정한다).
  for (const item of job.items) if (item.status !== "ok" && item.status !== "redrawing") item.status = "failed";
  job.finished = true;
  console.log(`[logoche] 참고 글자 작업 ${job.id}: 이미지 생성 ${job.imageCalls}회, 다시 그리기 ${job.redraws}회`);
  await writeReport(job);
}

async function writeReport(job: JobState) {
  const report = {
    chars: job.items.map((i) => i.char).join(""),
    drawWeight: job.drawWeight,
    sampleId: job.sampleId,
    ok: job.items.filter((i) => i.status === "ok").map((i) => i.index),
    items: job.items.map(
      ({ status, problem, version, note, userRedraws, hasPrevious, handEdited, prevHandEdited, original, tried, charFails }) =>
        ({ status, problem, version, note, userRedraws, hasPrevious, handEdited, prevHandEdited, original, tried, charFails }) satisfies SavedItem,
    ),
    imageCalls: job.imageCalls,
    redraws: job.redraws,
    models: [...job.models],
    fatal: job.fatal?.message ?? null,
    problems: job.problems,
  };
  await saveFile(job.id, "report.json", JSON.stringify(report, null, 1)).catch(() => {});
}

export async function readDataUrl(jobId: string, name: string): Promise<string | null> {
  try {
    return `data:image/png;base64,${(await fs.readFile(path.join(jobDir(jobId), name))).toString("base64")}`;
  } catch {
    return null;
  }
}

/** 실패한 글자만 다시 그린다(화면 3 '실패한 글자만 다시 그리기'). 처음 글자표를 스타일 참고로 쓴다.
 * 다시 그리기 상한(MAX_REDRAWS)은 이 호출마다 새로 센다. */
export async function retryFailedGlyphs(jobId: string, req: StartGlyphJobRequest): Promise<void> {
  const job = await loadJob(jobId);
  if (!job.finished) throw new RouteError(409, "아직 그리는 중이에요");
  const failed = job.items.filter((i) => i.status === "failed");
  if (failed.length === 0) return;
  const ctx = await jobContext(job, req);
  for (const item of failed) {
    item.status = "retry";
    item.attempts = 0;
  }
  job.finished = false;
  job.fatal = null;
  job.redraws = 0;
  void (async () => {
    try {
      await redrawMissing(job, ctx, await readDataUrl(job.id, "sheet.png"));
    } catch (err) {
      failJob(job, err);
    } finally {
      await finishJob(job);
    }
  })();
}

/** 글자 하나만 한 번 다시 그린다(화면 3 글자 카드의 '다시 그리기'). 글자당 USER_REDRAWS번까지.
 * 통과한 글자를 다시 그리면 전 글자를 남겨 두고, 새 글자가 검사에서 떨어지면 전 글자를 그대로 둔다.
 * 실패한 글자가 또 떨어지면 카드에 다시 '다시 그리기'가 나온다.
 * 크레딧 없음 같은 오류도 작업 전체를 멈추지 않고 그 글자의 실패 이유로 보여 준다. */
export async function retryGlyph(jobId: string, index: number, req: StartGlyphJobRequest): Promise<void> {
  const job = await loadJob(jobId);
  const item = job.items[index];
  if (!item) throw new RouteError(404, "참고 글자를 찾을 수 없어요");
  if (item.status !== "ok" && item.status !== "failed") throw new RouteError(409, `'${item.char}'은(는) 아직 그리는 중이에요`);
  if (item.userRedraws >= USER_REDRAWS) throw new RouteError(409, `'${item.char}'은(는) 다시 그리기를 ${USER_REDRAWS}번 다 썼어요. 직접 고쳐 주세요.`);
  const ctx = await jobContext(job, req);
  const wasOk = item.status === "ok";
  if (wasOk) await keepPrevious(job, item);
  item.userRedraws++;
  item.status = "retry";
  item.note = null;
  void (async () => {
    try {
      await redrawOnce(job, ctx, item, await readDataUrl(job.id, "sheet.png"), !wasOk);
    } catch (err) {
      console.error(`[logoche] ${item.char} 다시 그리기 실패`, err);
      item.problem = err instanceof Error ? err.message : String(err);
    } finally {
      if (item.status !== "ok") {
        if (wasOk) {
          // 새 글자가 떨어졌으면 전 글자로 돌린다. 되돌릴 글자는 남지 않는다(같은 그림이다).
          await fs.copyFile(prevFile(job.id, item.index), glyphFile(job.id, item.index));
          item.version++;
          item.status = "ok";
          item.handEdited = item.prevHandEdited;
          item.hasPrevious = false;
          item.note = `새로 그린 글자가 검사를 통과하지 못해 전 글자를 그대로 뒀어요${item.problem ? `(${item.problem})` : ""}.`;
          item.problem = null;
        } else {
          item.status = "failed";
        }
      }
      await writeReport(job).catch(() => {});
    }
  })();
}

/** 바꾸기 전 글자로 되돌린다(지금 글자와 맞바꾼다. 한 번 더 누르면 다시 돌아온다). */
export async function restoreGlyph(jobId: string, index: number): Promise<void> {
  const job = await loadJob(jobId);
  const item = job.items[index];
  if (!item?.hasPrevious) throw new RouteError(409, "되돌릴 글자가 없어요");
  if (item.status === "pending" || item.status === "retry" || item.status === "redrawing") throw new RouteError(409, "아직 그리는 중이에요");
  const current = glyphFile(job.id, index);
  const swap = `${current}.swap`;
  if (item.status === "ok") await fs.rename(current, swap);
  await fs.rename(prevFile(job.id, index), current);
  if (item.status === "ok") await fs.rename(swap, prevFile(job.id, index));
  else item.hasPrevious = false;
  [item.handEdited, item.prevHandEdited] = [item.prevHandEdited, item.handEdited];
  item.version++;
  item.status = "ok";
  item.problem = null;
  item.note = null;
  await writeReport(job);
}

const NORMALIZE_PROBLEMS: Record<string, string> = {
  "빈 칸": "글자가 비었어요. 획을 그려 주세요.",
  "칸 경계에 닿음": "글자가 가장자리에 닿았어요. 조금 안쪽으로 그려 주세요.",
  "칸이 거의 다 칠해짐": "바탕이 거의 다 칠해졌어요. 획만 남겨 주세요.",
};

/** 참고 글자를 사용자가 직접 고친 그림으로 바꾼다(화면 3 '직접 고치기'). 검사 없이 받되, 글자표 칸과 같은 형식으로 자른다. */
export async function saveRefEdit(jobId: string, index: number, image: string): Promise<void> {
  const job = await loadJob(jobId);
  const item = job.items[index];
  if (!item) throw new RouteError(404, "참고 글자를 찾을 수 없어요");
  if (item.status !== "ok" && item.status !== "failed") throw new RouteError(409, `'${item.char}'은(는) 아직 그리는 중이에요`);
  const normalized = await engine.normalizeGlyph(image, item.char);
  if (!normalized.image || normalized.problem) {
    throw new RouteError(400, NORMALIZE_PROBLEMS[normalized.problem ?? "빈 칸"] ?? normalized.problem ?? "그림을 읽지 못했어요");
  }
  if (item.status === "ok") await keepPrevious(job, item);
  await saveGlyph(job, item, normalized.image);
  item.handEdited = true;
  await writeReport(job);
}

export function startGlyphJob(req: StartGlyphJobRequest): string {
  makeContext(req); // 로고가 없으면 바로 400
  const id = crypto.randomUUID();
  const job: JobState = {
    id,
    createdAt: Date.now(),
    drawWeight: axisValue(req, "weight"),
    sampleId: req.sampleId ?? null,
    items: [...REFERENCE_CHARS].map((char, index) => newItem(index, char)),
    fatal: null,
    models: new Set(),
    imageCalls: 0,
    redraws: 0,
    problems: [],
    finished: false,
  };
  jobs.set(id, job);
  void runJob(job, req);
  return id;
}

function itemView(job: JobState, item: ItemState): GlyphItem {
  const status: GlyphItem["status"] =
    item.status === "ok" ? "ready" : item.status === "failed" ? "failed" : item.status === "pending" ? "drawing" : "redrawing";
  return {
    id: String(item.index),
    char: item.char,
    status,
    imageUrl: status === "ready" ? `/api/glyphs/jobs/${job.id}/images/${item.index}?v=${item.version}` : null,
    problem: status === "failed" ? item.problem : null,
    note: status === "ready" ? item.note : null,
    redrawsLeft: Math.max(0, USER_REDRAWS - item.userRedraws),
    canRestore: item.hasPrevious && (status === "ready" || status === "failed"),
    handEdited: item.handEdited,
    swappedFrom: item.char !== item.original ? item.original : null,
  };
}

export async function getGlyphJob(jobId: string): Promise<GlyphJob> {
  const job = await loadJob(jobId);
  if (job.fatal) throw job.fatal;
  const items = job.items.map((item) => itemView(job, item));
  return { jobId: job.id, status: job.finished ? "done" : "running", items, models: [...job.models], edits: await listEdits(jobId) };
}
