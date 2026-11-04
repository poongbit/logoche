import type {
  ChooseAction,
  GlyphTweak,
  SaveGlyphTweakRequest,
  SaveGlyphTweakResponse,
  CreateProjectRequest,
  ProjectSummary,
  ProjectView,
  ReviewAction,
  UpdateProjectRequest,
  GlyphEditSource,
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

  // 11/2 B안: 폰트 작업(서버가 로고 읽기부터 폰트 파일까지 이어서 돌린다)
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  createProject: (body: CreateProjectRequest) => post<{ id: string }>("/api/projects", body),
  getProject: (id: string) => request<ProjectView>(`/api/projects/${id}`),
  updateProject: (id: string, body: UpdateProjectRequest) => post<{ ok: boolean }>(`/api/projects/${id}`, body, undefined, "PATCH"),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  chooseProject: (id: string, body: ChooseAction) => post<{ ok: boolean }>(`/api/projects/${id}/choose`, body),
  /** 만드는 중인 일을 멈춘다(11/4). 그린 글자는 남고, 이어서 만들거나 그만둘 수 있다. */
  cancelProject: (id: string) => post<{ ok: boolean }>(`/api/projects/${id}/cancel`, {}),
  /** 다듬기(11/4): 글자 하나 또는 전체("*")의 조정 저장. 글자 하나는 지금 폰트에 바로 들어간다. */
  saveGlyphTweak: (id: string, body: SaveGlyphTweakRequest) => post<SaveGlyphTweakResponse>(`/api/projects/${id}/tweaks`, body, undefined, "PUT"),
  /** 그 글자의 조정 기록(최대 100개) */
  glyphTweakHistory: (id: string, char: string) =>
    request<{ history: { at: string; tweak: GlyphTweak | null; note: string }[] }>(`/api/projects/${id}/tweaks?char=${encodeURIComponent(char)}`),
  /** 다듬기의 직접 그리기: 편집 화면에 띄울 그림 / 저장(image가 null이면 직접 고친 것을 지움) */
  projectGlyphEditSource: (id: string, char: string) => post<GlyphEditSource>(`/api/projects/${id}/glyph-edit`, { char }),
  saveProjectGlyphEdit: (id: string, body: { char: string; image: string | null }) => post<{ edited: string[] }>(`/api/projects/${id}/glyph-edit`, body, undefined, "PUT"),
  reviewProject: (id: string, body: ReviewAction) => post<{ ok: boolean }>(`/api/projects/${id}/review`, body),
  rebuildProject: (id: string) => post<{ ok: boolean }>(`/api/projects/${id}/rebuild`, {}),
  redrawGlyphs: (id: string, chars: string[]) => post<{ ok: boolean }>(`/api/projects/${id}/redraw`, { chars }),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
