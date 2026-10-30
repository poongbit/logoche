import type { JasoPosition } from "./types";

export const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
export const JUNGSEONG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
export const JONGSEONG = ["ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

/** 완성형 한 글자를 자모 자리별로 나눈다. 한글 음절이 아니면 null. 그림 모델이 뭉개는 짜임의 설명을 붙일 때 쓴다(glyphs.ts STRUCTURE_HINTS). */
export function decompose(char: string): { position: JasoPosition; jaso: string }[] | null {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  const parts: { position: JasoPosition; jaso: string }[] = [
    { position: "initial", jaso: CHOSEONG[Math.floor(code / 588)] },
    { position: "medial", jaso: JUNGSEONG[Math.floor((code % 588) / 28)] },
  ];
  const jong = code % 28;
  if (jong > 0) parts.push({ position: "final", jaso: JONGSEONG[jong - 1] });
  return parts;
}

/** KS X 1001 완성형 한글 2,350자(만든 서체에 들어 있는 글자). EUC-KR 0xB0A1~0xC8FE를 풀어 만든다. */
export const KSX1001_HANGUL: ReadonlySet<string> = (() => {
  const decoder = new TextDecoder("euc-kr");
  const chars = new Set<string>();
  for (let hi = 0xb0; hi <= 0xc8; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) chars.add(decoder.decode(new Uint8Array([hi, lo])));
  }
  return chars;
})();
