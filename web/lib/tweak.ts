// 11/4 다듬기: 서버(lib/server/tweaks.ts)와 브라우저(components/fonts/GlyphPolish.tsx)가 함께 쓰는 조정 상수와 미리보기 변환.
// 이 파일은 node 모듈을 쓰지 않는다(브라우저 번들에 들어간다).

import type { CutKey, EditTweak, GlyphParts, GlyphTweak, PartKey, PartValues } from "./types";

export const NO_TWEAK: GlyphTweak = { pull: 0, slant: 0, width: 100, height: 100, scale: 100, tx: 0, ty: 0 };

/** 화면 슬라이더와 서버가 받는 범위. 엔진은 이보다 넉넉하게 받는다(엔진 main.TweakInput). */
export const TWEAK_RANGES: Record<keyof GlyphTweak, [number, number]> = {
  pull: [-300, 150], // 아래쪽은 엔진 한도(main.TweakInput)까지. -150은 굵은 서체에서 기준 Bold까지밖에 못 내려가 가장 가늘게 해도 여전히 굵었다(11/5)
  slant: [-10, 30],
  width: [60, 140],
  height: [60, 140],
  scale: [50, 150],
  tx: [-200, 200],
  ty: [-200, 200],
};

export const TWEAK_FIELDS: { key: keyof GlyphTweak; label: string; step: number; unit: string; signed: boolean }[] = [
  { key: "pull", label: "굵기", step: 5, unit: "", signed: true },
  { key: "slant", label: "기울기", step: 1, unit: "°", signed: true },
  { key: "width", label: "가로", step: 1, unit: "%", signed: false },
  { key: "height", label: "세로", step: 1, unit: "%", signed: false },
  { key: "scale", label: "크기", step: 1, unit: "%", signed: false },
  { key: "tx", label: "가로 이동", step: 5, unit: "", signed: true },
  { key: "ty", label: "세로 이동", step: 5, unit: "", signed: true },
];

export const TWEAK_PRESETS: { label: string; values: Partial<GlyphTweak> }[] = [
  { label: "원래대로", values: {} },
  { label: "가늘게", values: { pull: -150 } },
  { label: "굵게", values: { pull: 60 } },
  { label: "아주 굵게", values: { pull: 120, width: 105, tx: -4 } },
  { label: "기울임", values: { slant: 12 } },
  { label: "좁게", values: { width: 80, tx: -6 } },
  { label: "넓게", values: { width: 125, tx: 10 } },
];

// ---- 11/11 부분 조정(초성·중성·종성) ----
export const NO_PART: PartValues = { width: 100, height: 100, scale: 100, tx: 0, ty: 0 };
export const PART_RANGES: Record<keyof PartValues, [number, number]> = { width: [30, 250], height: [30, 250], scale: [30, 250], tx: [-400, 400], ty: [-400, 400] };
export const PART_KEYS: PartKey[] = ["cho", "jung", "jong"];
export const PART_LABEL: Record<PartKey, string> = { cho: "초성", jung: "중성", jong: "종성" };
export const CUT_RANGE: [number, number] = [-300, 300];
export const isNoPart = (p: PartValues | undefined) => !p || (Object.keys(NO_PART) as (keyof PartValues)[]).every((k) => p[k] === NO_PART[k]);
export const clampPartValue = (key: keyof PartValues, v: number) => Math.round(Math.min(PART_RANGES[key][1], Math.max(PART_RANGES[key][0], v)));

/** 기본값인 부분과, 부분 조정이 없을 때의 경계 이동을 뺀다(저장·비교용). 경계 이동은 부분 조정이 있어야 뜻이 있다. */
export function cleanTweak(t: EditTweak): EditTweak {
  const { parts, cuts, ...rest } = t;
  const keptParts = Object.fromEntries(PART_KEYS.filter((k) => !isNoPart(parts?.[k])).map((k) => [k, parts![k]!]));
  if (Object.keys(keptParts).length === 0) return rest;
  const keptCuts = Object.fromEntries((["x", "y", "j"] as CutKey[]).filter((k) => cuts?.[k]).map((k) => [k, cuts![k]!]));
  return { ...rest, parts: keptParts, ...(Object.keys(keptCuts).length ? { cuts: keptCuts } : {}) };
}

export const isNoTweak = (t: EditTweak) => {
  const c = cleanTweak(t);
  return (Object.keys(NO_TWEAK) as (keyof GlyphTweak)[]).every((k) => c[k] === NO_TWEAK[k]) && !c.parts;
};
/** 두 조정이 같은가(기본값과 같은 부분은 없는 것으로 본다) */
export const sameTweak = (a: EditTweak, b: EditTweak) => JSON.stringify(sortKeys(cleanTweak(a))) === JSON.stringify(sortKeys(cleanTweak(b)));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v) || typeof v !== "object" || v === null) return v;
  return Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, x]) => [k, sortKeys(x)]));
}

// SVG 행렬 (a b c d e f): x' = a·x + c·y + e, y' = b·x + d·y + f (폰트 단위, y 위쪽)
export type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const scaleAbout = (sx: number, sy: number, cx: number, cy: number): Mat => [sx, 0, 0, sy, cx * (1 - sx), cy * (1 - sy)];

/** 엔진 contour.tweak_transform과 같은 글자 전체 변환(크기·가로·세로 → 기울기 → 이동) */
export function glyphMatrix(t: GlyphTweak, advance: number): Mat {
  const cx = advance / 2;
  const cy = 380;
  const sx = (t.width / 100) * (t.scale / 100);
  const sy = (t.height / 100) * (t.scale / 100);
  const shear = Math.tan((t.slant * Math.PI) / 180);
  return mul([1, 0, 0, 1, t.tx, t.ty], mul([1, 0, shear, 1, -cy * shear, 0], scaleAbout(sx, sy, cx, cy)));
}

/** 부분 하나의 변환(엔진 drawn._part_transform): 부분 잉크 상자 가운데가 축 */
export function partMatrix(p: PartValues | undefined, bounds: [number, number, number, number]): Mat {
  if (!p) return [1, 0, 0, 1, 0, 0];
  const sx = (p.width / 100) * (p.scale / 100);
  const sy = (p.height / 100) * (p.scale / 100);
  return mul([1, 0, 0, 1, p.tx, p.ty], scaleAbout(sx, sy, (bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2));
}

/** 글자 칸(너비 advance × 높이 1000 = 줄 높이)에 부분들을 그리는 SVG 변환. y를 뒤집고(폰트 y는 위쪽) 윗선(880)을 칸 맨 위로 둔다. */
export const stageFlip = (): Mat => [1, 0, 0, -1, 0, 880];
export const matString = (m: Mat) => `matrix(${m.map((x) => +x.toFixed(4)).join(" ")})`;
export const outerMatrix = (parts: GlyphParts, t: GlyphTweak): Mat => mul(stageFlip(), mul(parts.style, glyphMatrix(t, parts.advance)));

/** 값을 슬라이더 범위로 맞춘다 */
export const clampTweakValue = (key: keyof GlyphTweak, v: number) => Math.round(Math.min(TWEAK_RANGES[key][1], Math.max(TWEAK_RANGES[key][0], v)));

// 엔진은 글자 몸통 가운데(advance/2, 380)를 축으로 크기·가로·세로 → 기울기 → 이동 순으로 건다(contour.tweak_transform).
// 폰트는 hhea 880/-120, 1em = 1,000단위라 줄 높이 1로 놓은 글자 칸의 가운데가 바로 그 축이다.
// 폰트 파일에는 이미 '저장한 조정(saved)'이 들어 있으므로, 화면 미리보기는 saved에서 지금 값(edited)으로 가는 차이만 CSS로 건다.
type Affine = { a: number; b: number; c: number; d: number; tx: number; ty: number }; // [[a b][c d]] · (x y) + (tx ty), 축 기준 글꼴 단위, y는 위쪽

function affineOf(t: GlyphTweak): Affine {
  const sx = (t.width / 100) * (t.scale / 100);
  const sy = (t.height / 100) * (t.scale / 100);
  const shear = Math.tan((t.slant * Math.PI) / 180);
  return { a: sx, b: shear * sy, c: 0, d: sy, tx: t.tx, ty: t.ty };
}

/** CSS transform 문자열(transform-origin: 50% 50%). size는 글자 칸 높이(px), 1em = size. */
export function deltaTransform(saved: GlyphTweak, edited: GlyphTweak, size: number): string {
  const s = affineOf(saved);
  const e = affineOf(edited);
  const det = s.a * s.d - s.b * s.c;
  const inv = { a: s.d / det, b: -s.b / det, c: -s.c / det, d: s.a / det }; // 2x2 역행렬
  const a = e.a * inv.a + e.b * inv.c;
  const b = e.a * inv.b + e.b * inv.d;
  const c = e.c * inv.a + e.d * inv.c;
  const d = e.c * inv.b + e.d * inv.d;
  const tdx = e.tx - (a * s.tx + b * s.ty);
  const tdy = e.ty - (c * s.tx + d * s.ty);
  const k = size / 1000;
  // 글꼴 단위(y 위쪽) → CSS(y 아래쪽): matrix(a, -c, -b, d, k·tx, -k·ty)
  return `matrix(${a}, ${-c}, ${-b}, ${d}, ${tdx * k}, ${-tdy * k})`;
}

/** 굵기 차이를 글자 둘레 선 굵기(px)로 어림한다. 굵기 축 1단위는 1em=500px 틀에서 한쪽 0.077px(엔진 drawn._px_per_weight).
 * 늘리면 글자색 선을, 줄이면 바탕색 선을 둘러 깎는다(11/5: 줄이는 쪽은 이전에 미리보기에 아무 변화가 없어 슬라이더가 안 되는 것처럼 보였다). */
export function strokeFor(savedPull: number, editedPull: number, size: number): { width: number; thin: boolean } {
  const d = editedPull - savedPull;
  return { width: Math.abs(d) * 0.000154 * size, thin: d < 0 };
}
