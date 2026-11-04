// 화면 2 스타일 카드: 로고 측정(엔진) + 분위기 해석(Claude) + 분위기 사전 규칙으로 7축을 정한다.

import { z } from "zod";
import { AXES, AXIS_ORDER, BRAND_TONES, STYLE_FAMILIES, USAGE_CONTEXTS, WEIGHT_CAP } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { industryText, isImitationRequest } from "@/lib/rules";
import type { AxisKey, BrandTone, StyleAxis, StyleCard, StyleConflict, StyleDirection, StyleFamily, UploadInput, UsageContext, ValueMapping } from "@/lib/types";
import { engine } from "./engine";
import { MODELS, RouteError, modelLabel } from "./env";
import { generateJson } from "./anthropic";
import { imagePart } from "./parts";

// 분위기 사전의 톤별 범위. '귀여운'만 기획서 2-4 ② 값이고 나머지는 임시 값이다(분위기 사전 확정 전).
// 모던한~우아한 8개는 10/27에 톤을 늘리며 넣은 임시 값이다.
export const TONE_RANGES: Record<BrandTone, Record<AxisKey, [number, number]>> = {
  cute: { weight: [600, 800], roundness: [0.7, 1], width: [102, 110], contrast: [0.95, 1], slant: [0, 2], wobble: [0.1, 0.4], tracking: [3, 6] },
  warm: { weight: [500, 700], roundness: [0.5, 0.9], width: [100, 108], contrast: [0.85, 1], slant: [0, 2], wobble: [0.1, 0.3], tracking: [2, 5] },
  playful: { weight: [600, 850], roundness: [0.6, 1], width: [100, 112], contrast: [0.9, 1], slant: [-3, 5], wobble: [0.3, 0.6], tracking: [2, 6] },
  premium: { weight: [300, 500], roundness: [0, 0.3], width: [92, 102], contrast: [0.6, 0.85], slant: [0, 0], wobble: [0, 0.05], tracking: [4, 10] },
  trustworthy: { weight: [500, 700], roundness: [0.1, 0.4], width: [98, 106], contrast: [0.85, 1], slant: [0, 0], wobble: [0, 0.1], tracking: [0, 3] },
  traditional: { weight: [400, 650], roundness: [0.2, 0.5], width: [95, 104], contrast: [0.6, 0.85], slant: [0, 1], wobble: [0.1, 0.35], tracking: [2, 6] },
  modern: { weight: [400, 600], roundness: [0.1, 0.4], width: [96, 104], contrast: [0.9, 1], slant: [0, 0], wobble: [0, 0.05], tracking: [2, 6] },
  natural: { weight: [400, 600], roundness: [0.4, 0.8], width: [98, 106], contrast: [0.85, 1], slant: [0, 1], wobble: [0.15, 0.35], tracking: [2, 5] },
  retro: { weight: [600, 850], roundness: [0.3, 0.7], width: [100, 112], contrast: [0.7, 0.95], slant: [0, 3], wobble: [0.05, 0.2], tracking: [0, 4] },
  hip: { weight: [600, 850], roundness: [0, 0.5], width: [90, 112], contrast: [0.6, 1], slant: [-4, 6], wobble: [0.1, 0.5], tracking: [-2, 4] },
  bold: { weight: [700, 850], roundness: [0, 0.3], width: [95, 108], contrast: [0.85, 1], slant: [0, 4], wobble: [0, 0.1], tracking: [-2, 2] },
  calm: { weight: [300, 500], roundness: [0.3, 0.6], width: [96, 104], contrast: [0.85, 1], slant: [0, 0], wobble: [0, 0.1], tracking: [3, 8] },
  fresh: { weight: [400, 600], roundness: [0.5, 0.9], width: [98, 106], contrast: [0.9, 1], slant: [0, 2], wobble: [0.05, 0.2], tracking: [3, 7] },
  elegant: { weight: [300, 450], roundness: [0.2, 0.5], width: [92, 100], contrast: [0.55, 0.8], slant: [0, 3], wobble: [0, 0.1], tracking: [5, 12] },
};

// 주 사용처의 가독성 하한 (임시 값)
export const USAGE_WEIGHT_FLOOR: Partial<Record<UsageContext, number>> = { signage_menu: 500, sns_thumbnail: 600 };

export type MeasuredAxes = Partial<Record<AxisKey, { value: number; reason: string }>>;

export interface Interpretation {
  strokeEnd: string;
  signature: string | null;
  toneMismatch: string | null;
  directions: StyleDirection[]; // 1개 이상, 첫 안이 추천
  slogans?: string[];
  valueMappings?: ValueMapping[];
}

const round = (key: AxisKey, v: number) => Number((Math.round(v / AXES[key].step) * AXES[key].step).toFixed(2));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const toneLabel = (t: BrandTone) => BRAND_TONES.find((b) => b.value === t)?.label ?? t;
const toneNames = (tones: BrandTone[]) => tones.map(toneLabel).join("·");

/** 고른 톤의 범위 안에서 측정값으로 7축을 정한다. 측정값이 범위 밖이면 범위 끝으로 맞추고, 사용자가 바꾸는 축이면 3안을 낸다. */
export function buildStyleCard(
  upload: UploadInput,
  measured: MeasuredAxes,
  interpretation: Interpretation,
  colors: string[],
  models: string[],
): StyleCard {
  const tones = upload.brandTones.length > 0 ? upload.brandTones : (["warm"] as BrandTone[]);
  const weightFloor = Math.max(0, ...upload.usageContexts.map((u) => USAGE_WEIGHT_FLOOR[u] ?? 0));
  let conflict: StyleConflict | null = null;

  const axes: StyleAxis[] = AXIS_ORDER.map((key) => {
    const lo = round(key, tones.reduce((s, t) => s + TONE_RANGES[t][key][0], 0) / tones.length);
    const hi = round(key, tones.reduce((s, t) => s + TONE_RANGES[t][key][1], 0) / tones.length);
    const mid = round(key, (lo + hi) / 2);
    const m = measured[key];
    let value = mid;
    let basis: StyleAxis["basis"] = "range_mid";
    let reason = "로고에서 잴 수 없어 범위 가운데";

    if (m) {
      const v = round(key, m.value);
      if (v >= lo && v <= hi) {
        value = v;
        basis = "measurement";
        reason = m.reason;
      } else {
        value = round(key, clamp(v, lo, hi));
        basis = "selection";
        reason = `로고 값 ${v}이 '${toneNames(tones)}' 범위 밖이라 범위 끝으로 맞춤 (${m.reason})`;
        // 그리기 방향 축(둥글기·대비)만 3안으로 묻는다. 굵기·너비 같은 다듬기 축은 범위 끝으로 두고 화면 3에서 고친다.
        if (!conflict && AXES[key].stage === "draw") {
          conflict = {
            axis: key,
            note: `로고는 ${AXES[key].label} ${v}인데, 고른 톤의 범위는 ${lo}~${hi} 사이예요.`,
            options: [
              { kind: "logo", value: key === "weight" ? Math.min(v, WEIGHT_CAP) : v },
              { kind: "tone", value: mid },
              { kind: "middle", value: round(key, (v + mid) / 2) },
            ],
            chosen: null,
          };
        }
      }
    }
    if (key === "weight" && value < weightFloor) {
      value = weightFloor;
      basis = "selection";
      const usage = USAGE_CONTEXTS.filter((u) => USAGE_WEIGHT_FLOOR[u.value] === weightFloor).map((u) => u.label).join("·");
      reason = `주 사용처가 ${usage}라 굵기 하한 ${weightFloor}`;
    }
    if (key === "weight") value = Math.min(value, WEIGHT_CAP);
    return { key, value, suggested: value, range: [lo, hi], basis, reason };
  });

  return {
    axes,
    strokeEnd: interpretation.strokeEnd,
    signature: interpretation.signature,
    toneMismatch: interpretation.toneMismatch,
    expression: interpretation.directions[0]?.expression ?? "",
    expressionOptions: interpretation.directions.map((d) => d.expression),
    conflict,
    colors,
    models,
    family: interpretation.directions[0]?.family,
    designBrief: interpretation.directions[0]?.brief ?? null,
    directions: interpretation.directions,
    slogans: interpretation.slogans ?? [],
    valueMappings: interpretation.valueMappings ?? [],
  };
}

const TONE_VALUES = BRAND_TONES.map((t) => t.value) as [BrandTone, ...BrandTone[]];

const FAMILY_VALUES = STYLE_FAMILIES.map((f) => f.value) as [StyleFamily, ...StyleFamily[]];

const InterpretationSchema = z.object({
  strokeEnd: z.string().describe("획 끝 모양을 한국어 20자 안으로. 예: 획 끝을 둥글게 맺음"),
  signature: z
    .string()
    .nullable()
    .describe("심볼에서 따올 만한 시그니처 요소와 그 요소가 들어갈 자소 자리. 예: 심볼의 둥근 얼굴 → ㅇ 자리. 없으면 null"),
  readTones: z.array(z.enum(TONE_VALUES)).describe("로고가 주는 분위기를 보기 중에서 1~3개, 강한 순서로"),
  directions: z
    .array(
      z.object({
        family: z.enum(FAMILY_VALUES).describe("서체 계열"),
        expression: z.string().describe("이 방향의 획 표현 방식. 한국어 15자 안의 짧은 구. 예: 고양이 등허리처럼 휜 획"),
        brief: z.string().describe("이 방향의 서체 설계 지시문. 한국어 4~6문장(아래 조건)"),
      }),
    )
    .describe("서체 방향 3개. 첫 안이 가장 추천하는 안. 3개 중 적어도 2개는 계열이 달라야 하고, 표현 방식도 서로 뚜렷이 달라야 한다."),
  slogans: z.array(z.string()).describe("가게에 어울리는 짧은 문장 3개. 12~20자, 흔한 한글 글자와 숫자만(한자·영어·희귀 글자 금지). 예: 냥치와 함께하는 우아한 순간"),
  valueMappings: z
    .array(z.object({ value: z.string().describe("사업 내용에서 뽑은 브랜드 가치"), form: z.string().describe("그 가치를 옮긴 조형 요소"), why: z.string().describe("그렇게 옮긴 근거 한 문장") }))
    .describe("브랜드 가치 → 조형 요소 → 근거. 3~4개"),
});

// 설계 지시문에 있으면 안 되는 말. 같은 지시문이 글자표 115장 모두에 들어가므로 서체 전체를 말해야 하고, 색·배경·기울기·위치는
// 엔진의 자리 맞추기·크기 검사와 부딪히거나 검은 글자 규칙을 깬다(11/4 시험: 지시문이 '짙은 갈색'을 시켜 글자가 갈색으로 나왔다).
const BRIEF_BANNED = /색|배경|기울|이탤릭|네모\s?틀|틀을 벗어|높이 변화|위치 변화|로고/;

/** 설계 지시문에서 금지된 말이 든 문장을 걷어 낸다. 남은 문장이 둘보다 적거나 특정 서체를 따라 하라는 말이 있으면 null(표현 방식만 쓴다). */
export function sanitizeBrief(brief: string, storeName: string): string | null {
  const sentences = brief
    .split(/(?<=[.!?。])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !BRIEF_BANNED.test(x) && !(storeName && x.includes(storeName)));
  const kept = sentences.join(" ");
  return sentences.length >= 2 && !isImitationRequest(kept) ? kept : null;
}

/** 견본·목업에 쓸 문장: 서체에 넣을 수 있는 글자(완성형 한글·숫자·기본 부호)만 든 것, 24자 안 */
export function cleanSlogans(list: string[] | undefined): string[] {
  const ok = (c: string) => KSX1001_HANGUL.has(c) || /[0-9 ,.!?~'"]/.test(c);
  return (list ?? [])
    .map((x) => x.trim())
    .filter((x) => x.length >= 4 && x.length <= 24 && [...x].every(ok))
    .slice(0, 3);
}

function interpretPrompt(upload: UploadInput): string {
  const industry = industryText(upload) || "미정";
  const usage = upload.usageContexts.map((u) => USAGE_CONTEXTS.find((x) => x.value === u)?.label).join("·");
  return [
    "당신은 한글 서체 디자이너입니다. 이 로고 그림과 가게 정보를 보고, 이 가게의 전용 한글 서체를 이미지 모델이 그리도록 서체 방향 3개를 설계해 주세요.",
    "로고의 글자 모양을 옮기려는 것이 아니라 느낌을 읽어 새 서체의 방향을 정하는 것입니다.",
    `가게 이름: ${upload.storeName}`,
    `업종: ${industry}`,
    `사용자가 고른 브랜드 톤: ${toneNames(upload.brandTones) || "미정(로고에서 읽어 주세요)"}`,
    `주 사용처: ${usage || "미정"}`,
    upload.desiredFeel && !isImitationRequest(upload.desiredFeel) ? `사업 내용과 추구하는 가치: ${upload.desiredFeel}` : "",
    `보기(readTones): ${BRAND_TONES.map((t) => `${t.value}=${t.label}`).join(", ")}`,
    `서체 계열 보기(family): ${STYLE_FAMILIES.map((f) => `${f.value}=${f.label}(${f.hint})`).join(", ")}`,
    "",
    "방향(directions) 작성 조건:",
    "- 3개 중 적어도 2개는 계열이 달라야 하고, 표현 방식도 뚜렷이 달라야 합니다. 첫 안이 가장 추천하는 안입니다.",
    "- brief는 4~6문장의 한국어 서체 설계 지시문입니다. 계열, 가로·세로획의 굵기 차이(대비), 획 끝 처리(삐침·돌기·테이퍼·맺음), 곡선의 성격, 속공간과 글자 리듬, 브랜드 가치가 어떤 조형으로 이어지는지를 구체적인 타이포그래피 용어로 쓰세요.",
    "- brief는 서체 전체에 적용되는 설계를 말합니다. 가게 이름이나 특정 글자, 로고를 언급하지 마세요.",
    "- brief에 색, 배경, 기울기, 글자 크기·위치·높이 변화, 네모 틀을 벗어나는 것은 쓰지 마세요. 글자는 검은 단색으로 똑바로 서 있고 모든 글자가 같은 크기 틀에 들어갑니다.",
    "- 특정 서체 이름은 쓰지 말고, 속이 빈 외곽선은 시키지 마세요.",
  ]
    .filter((x, i, a) => x !== "" || a[i - 1] !== "")
    .join("\n");
}

/** 방향 3개를 다듬는다: 빈 표현 방식과 같은 표현 방식은 빼고, 설계 지시문은 금지된 문장을 걷어 낸다. */
function cleanDirections(directions: StyleDirection[], storeName: string): StyleDirection[] {
  const seen = new Set<string>();
  const out: StyleDirection[] = [];
  for (const d of directions) {
    const expression = d.expression.trim();
    if (!expression || seen.has(expression)) continue;
    seen.add(expression);
    out.push({ family: d.family, expression, brief: d.brief ? sanitizeBrief(d.brief, storeName) : null });
  }
  return out.slice(0, 3);
}

export async function analyzeStyle(upload: UploadInput): Promise<StyleCard> {
  if (!upload.logoImage) throw new RouteError(400, "로고 이미지가 없어요. 화면 1에서 로고를 다시 올려 주세요.");
  const [measure, { value: interpretation, model }] = await Promise.all([
    engine.measure(upload.logoImage, upload.storeName),
    generateJson(MODELS.interpret, [{ text: interpretPrompt(upload) }, imagePart(upload.logoImage)], InterpretationSchema, "medium"),
  ]);

  const measured: MeasuredAxes = {};
  for (const [key, m] of Object.entries(measure.measured)) {
    if (m) measured[key as AxisKey] = m;
  }
  const top = interpretation.readTones[0];
  // 11/2 B안: 브랜드 톤은 고르지 않아도 된다. 비우면 AI가 로고에서 읽은 톤으로 범위를 정한다.
  const chosen = upload.brandTones.length > 0;
  const toneMismatch =
    chosen && top && !upload.brandTones.includes(top) ? `로고는 '${toneLabel(top)}' 느낌으로도 읽혀요.` : null;
  return buildStyleCard(
    chosen ? upload : { ...upload, brandTones: interpretation.readTones.slice(0, 3) },
    measured,
    {
      strokeEnd: interpretation.strokeEnd,
      signature: interpretation.signature,
      toneMismatch,
      directions: cleanDirections(interpretation.directions, upload.storeName ?? ""),
      slogans: cleanSlogans(interpretation.slogans),
      valueMappings: interpretation.valueMappings.slice(0, 4),
    },
    measure.colors,
    [modelLabel("interpret", model)],
  );
}
