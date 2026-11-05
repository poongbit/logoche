// 11/4 다듬기: 서버(lib/server/tweaks.ts)와 브라우저(components/fonts/GlyphPolish.tsx)가 함께 쓰는 조정 상수와 미리보기 변환.
// 이 파일은 node 모듈을 쓰지 않는다(브라우저 번들에 들어간다).

import type { GlyphTweak } from "./types";

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

export const isNoTweak = (t: GlyphTweak) => (Object.keys(NO_TWEAK) as (keyof GlyphTweak)[]).every((k) => t[k] === NO_TWEAK[k]);

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
