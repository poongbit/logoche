// 화면 2 스타일 카드: 로고 측정(엔진) + 분위기 해석(Claude) + 분위기 사전 규칙으로 7축을 정한다.

import { z } from "zod";
import { AXES, AXIS_ORDER, BRAND_TONES, INDUSTRIES, USAGE_CONTEXTS, WEIGHT_CAP } from "@/lib/constants";
import { isImitationRequest } from "@/lib/rules";
import type { AxisKey, BrandTone, StyleAxis, StyleCard, StyleConflict, UploadInput, UsageContext } from "@/lib/types";
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
  expressions: string[];
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
    expression: interpretation.expressions[0] ?? "",
    expressionOptions: interpretation.expressions,
    conflict,
    colors,
    models,
  };
}

const TONE_VALUES = BRAND_TONES.map((t) => t.value) as [BrandTone, ...BrandTone[]];

const InterpretationSchema = z.object({
  strokeEnd: z.string().describe("획 끝 모양을 한국어 20자 안으로. 예: 획 끝을 둥글게 맺음"),
  signature: z
    .string()
    .nullable()
    .describe("심볼에서 따올 만한 시그니처 요소와 그 요소가 들어갈 자소 자리. 예: 심볼의 둥근 얼굴 → ㅇ 자리. 없으면 null"),
  readTones: z.array(z.enum(TONE_VALUES)).describe("로고가 주는 분위기를 보기 중에서 1~3개, 강한 순서로"),
  expressions: z
    .array(z.string())
    .describe(
      "자소 초안(실험적인 디스플레이 서체)을 그릴 획 표현 방식 3개. 한국어 15자 안의 짧은 구. " +
        "로고와 고른 톤에 어울리되 서로 뚜렷이 다르고 과감하게. 예: 풍선처럼 부풀린 획, 녹아 흐르는 획, 물결치는 획, " +
        "붓으로 휘두른 획, 가시처럼 날카로운 획, 리본처럼 접힌 획. 특정 서체 이름과 속이 빈 외곽선은 쓰지 않음",
    ),
});

function interpretPrompt(upload: UploadInput): string {
  const industry = INDUSTRIES.find((i) => i.value === upload.industry)?.label ?? "미정";
  const usage = upload.usageContexts.map((u) => USAGE_CONTEXTS.find((x) => x.value === u)?.label).join("·");
  return [
    "이 로고 그림을 보고 한글 서체를 새로 만들기 위한 분위기를 읽어 주세요. 로고의 글자 모양을 옮기려는 것이 아니라 느낌만 씁니다.",
    `가게 이름: ${upload.storeName}`,
    `업종: ${industry}`,
    `사용자가 고른 브랜드 톤: ${toneNames(upload.brandTones)}`,
    `주 사용처: ${usage || "미정"}`,
    upload.desiredFeel && !isImitationRequest(upload.desiredFeel) ? `원하는 느낌: ${upload.desiredFeel}` : "",
    `보기(readTones): ${BRAND_TONES.map((t) => `${t.value}=${t.label}`).join(", ")}`,
    "특정 서체 이름은 쓰지 마세요.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function analyzeStyle(upload: UploadInput): Promise<StyleCard> {
  if (!upload.logoImage) throw new RouteError(400, "로고 이미지가 없어요. 화면 1에서 로고를 다시 올려 주세요.");
  const [measure, { value: interpretation, model }] = await Promise.all([
    engine.measure(upload.logoImage, upload.storeName),
    generateJson(MODELS.interpret, [{ text: interpretPrompt(upload) }, imagePart(upload.logoImage)], InterpretationSchema, "low"),
  ]);

  const measured: MeasuredAxes = {};
  for (const [key, m] of Object.entries(measure.measured)) {
    if (m) measured[key as AxisKey] = m;
  }
  const top = interpretation.readTones[0];
  const toneMismatch =
    top && !upload.brandTones.includes(top) ? `로고는 '${toneLabel(top)}' 느낌으로도 읽혀요.` : null;
  return buildStyleCard(
    upload,
    measured,
    { strokeEnd: interpretation.strokeEnd, signature: interpretation.signature, toneMismatch, expressions: [...new Set(interpretation.expressions.map((e) => e.trim()).filter(Boolean))].slice(0, 3) },
    measure.colors,
    [modelLabel("interpret", model)],
  );
}
