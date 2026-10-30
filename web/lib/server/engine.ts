// Python 엔진 서버(engine/) 호출. 엔진은 측정·기준 글자표·글자표 자르기와 자리 맞추기·TTF 빌드·구조 검사를 맡는다.
// 10/30: MX-Font를 뺐다. 엔진은 이미지 API가 그린 글자로 바로 외곽선을 딴다. 이미지 API·Claude 호출은 웹 서버가 한다.

import type { BuildStage, CheckResult, GlyphGuides, NearestKind, PreviewResponse } from "@/lib/types";
import { ENGINE_URL, RouteError } from "./env";

interface Measured {
  value: number;
  reason: string;
}

export interface EngineMeasure {
  measured: Record<"weight" | "roundness" | "width" | "contrast" | "slant", Measured | null>;
  colors: string[];
}

/** 기준 글자표: 참고 음절을 칸마다 하나씩 기준 서체로 놓은 그림 */
export interface EngineGlyphSheet {
  chars: string; // 칸 순서대로
  cols: number;
  rows: number;
  aspectRatio: string;
  image: string;
}

export interface EngineGlyphSplit {
  cells: { char: string; image: string | null; problem: string | null }[];
  contactSheet: string;
}

export interface EngineAxes {
  weight: number;
  roundness: number; // 낮으면 굵기를 바꿀 때 모서리를 각지게 둔다
  width: number;
  slant: number;
  tracking: number;
  drawnWeight: number | null; // 참고 글자를 그릴 때의 굵기. 엔진이 지금 굵기와의 차이만큼 획을 굵히거나 가늘인다
}

/** 그린 글자 하나. 참고 글자는 칸에서 자른 그림, 나머지 글자는 엔진이 자리 맞춘 틀 그림(placeGlyphs) */
export interface EngineRef {
  char: string;
  image: string;
}

/** 사용자가 고친 글자(편집 화면 그림 512px). weight는 고칠 때의 굵기로, 굵기를 바꾸면 그 차이만큼만 윤곽을 옮긴다. */
export interface EngineEdit {
  char: string;
  image: string;
  weight: number;
}

export interface EngineBuildRequest {
  buildId: string;
  storeName: string;
  logoHash: string | null;
  axes: EngineAxes;
  refs: EngineRef[];
  glyphs: EngineRef[]; // 나머지 글자
  models: string[];
  licenseText: string;
  aiNotice: string;
  edits: EngineEdit[];
}

export interface EngineGlyphEditRequest {
  char: string;
  axes: EngineAxes;
  refs: EngineRef[];
  glyphs: EngineRef[]; // 이 글자가 나머지 글자면 그 그림
  edit: EngineEdit | null;
}

export type FontFormat = "ttf" | "otf" | "woff" | "woff2";

export interface EngineBuild {
  buildId: string;
  phase: "composing" | "checking" | "done" | "failed";
  stage: "queue" | "trace" | "save" | "check" | "done" | "failed";
  stages: BuildStage[]; // trace · save · check
  elapsed: number; // 작업을 받은 뒤 지난 초(끝나면 멈춘다)
  remaining: number | null; // 엔진 작업의 남은 시간 어림(초)
  builtGlyphs: number;
  totalGlyphs: number;
  checks: CheckResult[];
  similarity: { score: number; threshold: number; nearestFont: string; nearestKind: NearestKind; passed: boolean; compared: Record<NearestKind, number> } | null;
  fontReady: boolean;
  error: string | null;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new RouteError(503, `엔진 서버(${ENGINE_URL})에 연결하지 못했어요. engine 폴더에서 서버를 켜 주세요.`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // 400은 보낸 값이 틀렸다는 뜻이라(빈 글자 등) 그대로 넘긴다. 엔진의 말은 화면에 그대로 보인다.
    if (res.status === 400) throw new RouteError(400, body?.detail ?? "엔진이 요청을 받지 않았어요");
    throw new RouteError(res.status === 404 ? 404 : 502, `엔진: ${body?.detail ?? `${res.status} ${res.statusText}`}`);
  }
  return res;
}

async function json<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit | undefined =
    body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  return (await call(path, init)).json() as Promise<T>;
}

export const engine = {
  measure: (image: string, storeName: string) => json<EngineMeasure>("/measure", { image, storeName }),
  glyphSheet: (chars: string) => json<EngineGlyphSheet>("/sheets/glyphs", { chars }),
  /** 가게 이름 견본의 기준 그림(2·3자는 한 줄) */
  wordSheet: (chars: string) => json<EngineGlyphSheet>("/sheets/word", { chars }),
  splitGlyphs: (chars: string, image: string) => json<EngineGlyphSplit>("/sheets/glyphs/split", { chars, image }),
  /** 나머지 글자 한 장: 칸별로 잘라 폰트 틀에 자리를 맞춘다(획 두께는 refs에 맞춘다). image가 null인 칸은 자르지 못한 칸 */
  placeGlyphs: (chars: string, image: string, refs: EngineRef[]) => json<EngineGlyphSplit>("/sheets/glyphs/place", { chars, image, refs }),
  /** 글자 하나의 기준 그림(한 자씩 다시 그릴 때) */
  glyphSingle: (char: string) => json<{ char: string; image: string }>(`/sheets/glyph?char=${encodeURIComponent(char)}`),
  normalizeGlyph: (image: string, char: string) => json<{ image: string | null; problem: string | null }>("/glyphs/normalize", { image, char }),
  startBuild: (body: EngineBuildRequest) => json<{ buildId: string }>("/builds", body),
  /** 글 몇 자만 빌드와 같은 방법(그린 글자 → 외곽선)으로 만든 글자별 SVG 패스 */
  preview: (body: { text: string; axes: EngineAxes; refs: EngineRef[]; glyphs: EngineRef[]; edits: EngineEdit[] }) => json<PreviewResponse>("/preview", body),
  /** 편집 화면에 띄울 그림: 지금 글자 · AI가 그린 그대로(못 그린 글자는 빈 그림) · 글자 틀 자리 */
  editSource: (body: EngineGlyphEditRequest) =>
    json<{ char: string; size: number; image: string; original: string; guides: GlyphGuides }>("/glyphs/edit-source", body),
  /** 만든 폰트에서 글자 하나만 다시 딴다(edit가 null이면 AI가 만든 그대로) */
  patchGlyph: (buildId: string, body: EngineGlyphEditRequest) => json<{ ok: boolean }>(`/builds/${buildId}/glyph`, body),
  build: (buildId: string) => json<EngineBuild>(`/builds/${buildId}`),
  /** OCR용 그림. 서체에 있는 글자만 놓고, 놓은 글자를 chars로 돌려준다 */
  ocrSheet: (buildId: string, chars: string) => json<{ image: string; chars: string }>(`/builds/${buildId}/ocr-sheet`, { chars }),
  font: (buildId: string, format: FontFormat = "ttf") => call(`/builds/${buildId}/font.${format}`),
  /** 모두 받기(zip): TTF·OTF·웹폰트·OFL 원문과 files */
  bundle: (buildId: string, body: { fileStem: string; family: string; files: { name: string; text: string }[] }) =>
    call(`/builds/${buildId}/bundle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  issue: (buildId: string) => json<{ issued: boolean }>(`/builds/${buildId}/issue`, {}),
};
