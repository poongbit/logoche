// 화면 4 미리보기: 그린 글자와 조절값으로 글 몇 자만 엔진에서 만든다(빌드와 같은 방법: 그린 글자 → 외곽선).
// 다듬을 때마다 부른다. 2,350자 전체는 화면 4 빌드에서 만든다. 아직 그리지 않은 글자는 화면이 기본 글꼴로 그린다.

import type { PreviewRequest, PreviewResponse } from "@/lib/types";
import { engineAxes } from "./build";
import { engine } from "./engine";
import { readEdits } from "./edits";
import { glyphDrawWeight, readyRefs } from "./glyphs";
import { RouteError } from "./env";
import { readRestGlyphs } from "./rest";

const MAX_CHARS = 80; // 엔진 preview.MAX_CHARS와 같다

export async function previewGlyphs(req: PreviewRequest): Promise<PreviewResponse> {
  if (!req.glyphJobId) throw new RouteError(400, "참고 글자 작업이 없어요");
  const text = [...req.text].slice(0, MAX_CHARS).join("");
  const refs = await readyRefs(req.glyphJobId);
  const chars = new Set(text);
  const [glyphs, edits] = await Promise.all([readRestGlyphs(req.glyphJobId, chars), readEdits(req.glyphJobId, chars)]);
  return engine.preview({ text, axes: engineAxes(req.axes, await glyphDrawWeight(req.glyphJobId)), refs, glyphs, edits });
}

/** 모의 응답: 만든 글자가 없으므로 화면이 모두 기본 글꼴로 그린다. */
export function mockPreview(req: PreviewRequest): PreviewResponse {
  const glyphs = [...req.text].slice(0, MAX_CHARS).map((char) => ({ char, path: char === " " ? "" : null, advance: char === " " ? 280 : null }));
  return { unitsPerEm: 1000, ascender: 880, descender: -120, glyphs };
}
