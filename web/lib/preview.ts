import type { CSSProperties } from "react";
import type { AxisKey, StyleAxis } from "./types";

// 아직 TTF가 없을 때 쓰는 근사 미리보기. 기준 서체에 굵기·너비·기울기·자간만 흉내 낸다.
// 둥글기·대비·흔들림은 CSS로 흉내 낼 수 없어 반영되지 않는다.
export const GLYPH_FONT_STACK = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
// 화면 5 비교용 "업체 기본값 고딕". 10/29 디자인은 Noto Sans KR 400(globals.css에서 불러온다).
export const BASE_GOTHIC_STACK = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
export const GENERATED_FONT_FAMILY = "LogocheGenerated";

export function axesToValues(axes: StyleAxis[]): Record<AxisKey, number> {
  return Object.fromEntries(axes.map((a) => [a.key, a.value])) as Record<AxisKey, number>;
}

export function approxFontStyle(values: Record<AxisKey, number>, weightOffset = 0): CSSProperties {
  const weight = Math.min(900, Math.max(100, Math.round((values.weight + weightOffset) / 100) * 100));
  return {
    fontFamily: GLYPH_FONT_STACK,
    fontWeight: weight,
    letterSpacing: `${values.tracking / 100}em`,
    transform: `scaleX(${values.width / 100}) skewX(${-values.slant}deg)`,
    transformOrigin: "left center",
    display: "inline-block",
  };
}
