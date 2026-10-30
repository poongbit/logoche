import type {
  AnalyzeStyleRequest,
  BuildJob,
  GlyphEditSource,
  GlyphEditSourceRequest,
  GlyphJob,
  PreviewRequest,
  PreviewResponse,
  RetryGlyphsRequest,
  SaveGlyphEditRequest,
  SaveGlyphEditResponse,
  StartBuildJobRequest,
  StartGlyphJobRequest,
  StartJobResponse,
  StyleCard,
  StyleSample,
  StyleSampleRequest,
} from "./types";

export type FontFormat = "ttf" | "otf" | "woff" | "woff2";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function post<T>(url: string, body: unknown, signal?: AbortSignal, method = "POST"): Promise<T> {
  return request<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
}

export const api = {
  analyzeStyle: (body: AnalyzeStyleRequest) => post<StyleCard>("/api/style/analyze", body),
  /** 화면 2 표현 방식 견본(가게 이름을 그 방식으로 그린 그림 한 장) */
  styleSample: (body: StyleSampleRequest, signal?: AbortSignal) => post<StyleSample>("/api/style/samples", body, signal),
  startGlyphJob: (body: StartGlyphJobRequest) => post<StartJobResponse>("/api/glyphs/jobs", body),
  getGlyphJob: (jobId: string) => request<GlyphJob>(`/api/glyphs/jobs/${jobId}`),
  /** 참고 글자를 다시 그린다. index를 주면 그 글자만 한 번, 없으면 실패한 글자 모두 */
  retryGlyphs: (jobId: string, body: RetryGlyphsRequest) => post<StartJobResponse>(`/api/glyphs/jobs/${jobId}/retry`, body),
  /** 참고 글자를 직접 고친 그림으로 바꾼다 */
  saveRefEdit: (jobId: string, index: string, image: string) => post<{ ok: boolean }>(`/api/glyphs/jobs/${jobId}/items/${index}/edit`, { image }),
  /** 바꾸기 전 참고 글자와 맞바꾼다 */
  restoreGlyph: (jobId: string, index: string) => post<{ ok: boolean }>(`/api/glyphs/jobs/${jobId}/items/${index}/restore`, {}),
  /** 기준 서체로 그린 글자(직접 그릴 때 밑그림) */
  structureGlyph: (char: string) => request<{ image: string }>(`/api/glyphs/structure?char=${encodeURIComponent(char)}`),
  /** 화면 4 글자 고치기: 편집 화면에 띄울 그림 */
  glyphEditSource: (jobId: string, body: GlyphEditSourceRequest) => post<GlyphEditSource>(`/api/glyphs/jobs/${jobId}/edits`, body),
  /** 화면 4 글자 고치기: 저장(image가 null이면 되돌리기) */
  saveGlyphEdit: (jobId: string, body: SaveGlyphEditRequest) => post<SaveGlyphEditResponse>(`/api/glyphs/jobs/${jobId}/edits`, body, undefined, "PUT"),
  startBuildJob: (body: StartBuildJobRequest) => post<StartJobResponse>("/api/build/jobs", body),
  getBuildJob: (jobId: string) => request<BuildJob>(`/api/build/jobs/${jobId}`),
  /** 화면 4 미리보기: 글 몇 자를 빌드와 같은 방법(그린 글자 → 외곽선)으로 만든 글자별 SVG 패스 */
  preview: (body: PreviewRequest, signal?: AbortSignal) => post<PreviewResponse>("/api/preview", body, signal),
  /** download이면 받은 서체를 발급 대장(기록)에 올린다. revision은 글자를 고친 횟수(캐시를 나눈다). */
  fontUrl: (fontId: string, { download = false, format = "ttf", revision = 0 }: { download?: boolean; format?: FontFormat; revision?: number } = {}) => {
    const params = new URLSearchParams();
    if (format !== "ttf") params.set("format", format);
    if (revision) params.set("v", String(revision));
    if (download) params.set("download", "1");
    const query = params.toString();
    return `/api/font/${fontId}${query ? `?${query}` : ""}`;
  },
  /** 모두 받기(zip) */
  fontBundleUrl: (fontId: string) => `/api/font/${fontId}/bundle`,
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
