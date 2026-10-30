// 모델에 넘기는 입력 조각: 글 또는 이미지(data URL). 이미지 생성(GPT Image)과 이미지 보기(Claude)가 함께 쓴다.

import { RouteError } from "./env";

export type Part = { text: string } | { image: string };

const DATA_URL = /^data:([^;]+);base64,([\s\S]*)$/;

export function imagePart(dataUrl: string): Part {
  decodeDataUrl(dataUrl);
  return { image: dataUrl };
}

/** data URL을 (MIME, base64 본문)으로 나눈다. */
export function decodeDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new RouteError(400, "이미지는 data URL이어야 해요");
  return { mimeType: match[1], data: match[2] };
}
