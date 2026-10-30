"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { MIN_REFERENCE_READY, PREVIEW_SENTENCES } from "./constants";
import type {
  AxisKey,
  BuildJob,
  GlyphItem,
  RecordCategory,
  RecordEvent,
  StyleCard,
  StyleOptionKind,
  UploadInput,
} from "./types";

/** 화면 2 표현 방식 견본 하나의 상태 */
export type SampleState =
  | { status: "drawing" }
  | { status: "ready"; sampleId: string; imageUrl: string }
  | { status: "failed"; error: string };

export interface AppState {
  upload: UploadInput;
  style: StyleCard | null;
  styleSamples: Record<string, SampleState>; // 표현 방식 → 견본
  glyphJobId: string | null; // 화면 3 참고 글자 그리기 작업
  glyphItems: GlyphItem[];
  glyphEdits: string[]; // 화면 4에서 고친 글자
  editsVersion: number; // 글자를 고쳐 저장할 때마다 늘린다(미리보기를 새로 만든다)
  buildJobId: string | null;
  build: BuildJob | null;
  fontRevision: number; // 만든 폰트에서 글자를 바꿔 끼운 횟수(폰트 파일 캐시를 나눈다)
  buildDirty: boolean; // 폰트를 만든 뒤 다듬었는데 아직 폰트 파일에 반영하지 않음(화면 4 '적용해 보기'에서 다시 만든다)
  record: RecordEvent[];
  maxStep: number; // 갈 수 있는 가장 먼 화면 (0부터)
  run: number; // 몇 번째 작업인지. 처음부터 다시 하거나 새 로고로 시작하면 늘린다
  draftInput: string | null; // 지금 초안을 그릴 때 쓴 입력(draftInputOf). 화면 2에서 바뀌면 화면 3이 새로 그린다
}

// 10/30 사용자 보고: 화면 3에 전에 만든 초안이 나왔다. 작업은 서로 따로 돌아야 한다.
// 그래서 요청을 보낼 때의 run을 결과에 붙여, 그사이 새 작업을 시작했으면 늦게 온 결과(분석·견본·작업 번호)를 버린다.
// 진행 상황은 작업 번호가 지금 것과 같을 때만 받는다.
type Action =
  | { type: "hydrate"; state: AppState | null }
  | { type: "setUpload"; patch: Partial<UploadInput> }
  | { type: "setStyle"; style: StyleCard | null; run: number }
  | { type: "setAxis"; key: AxisKey; value: number }
  | { type: "setExpression"; value: string }
  | { type: "chooseConflict"; kind: StyleOptionKind }
  | { type: "setSample"; expression: string; sample: SampleState; run: number }
  | { type: "setGlyphJob"; jobId: string; input: string; run: number }
  | { type: "setGlyphJob"; jobId: null }
  | { type: "setGlyphItems"; jobId: string; items: GlyphItem[] }
  | { type: "setGlyphEdits"; edits: string[]; patched: boolean }
  | { type: "setBuildJob"; jobId: string; run: number }
  | { type: "setBuildJob"; jobId: null }
  | { type: "setBuild"; build: BuildJob }
  | { type: "record"; event: RecordEvent }
  | { type: "reachStep"; step: number }
  | { type: "reset" };

export const EMPTY_UPLOAD: UploadInput = {
  logoImage: null,
  logoFileName: null,
  logoHash: null,
  inputPath: null,
  sampleId: null,
  storeName: "",
  industry: null,
  brandTones: [],
  usageContexts: [],
  desiredFeel: "",
  logoSource: null,
  logoFont: null,
  logoFontName: "",
};

const INITIAL_STATE: AppState = {
  upload: EMPTY_UPLOAD,
  style: null,
  styleSamples: {},
  glyphJobId: null,
  glyphItems: [],
  glyphEdits: [],
  editsVersion: 0,
  buildJobId: null,
  build: null,
  fontRevision: 0,
  buildDirty: false,
  record: [],
  maxStep: 0,
  run: 0,
  draftInput: null,
};

const NO_DRAFT = { glyphJobId: null, glyphItems: [], glyphEdits: [], draftInput: null } satisfies Partial<AppState>;

/** 초안 그림을 바꾸는 화면 2 입력: 표현 방식, 고른 견본, 톤 충돌에서 고른 안. 화면 1 입력이 바뀌면 작업 전체를 새로 시작한다(setUpload). */
export function draftInputOf(state: AppState): string {
  const expression = state.style?.expression.trim() ?? "";
  const sample = state.styleSamples[expression];
  return JSON.stringify([expression, sample?.status === "ready" ? sample.sampleId : null, state.style?.conflict?.chosen ?? null]);
}

/** 그사이 새 작업을 시작해 버려야 하는 결과 */
function isStale(state: AppState, action: Action): boolean {
  switch (action.type) {
    case "setStyle":
    case "setSample":
      return action.run !== state.run;
    case "setGlyphJob":
    case "setBuildJob":
      return action.jobId !== null && action.run !== state.run;
    case "setGlyphItems":
      return action.jobId !== state.glyphJobId;
    case "setBuild":
      return action.build.jobId !== state.buildJobId;
    default:
      return false;
  }
}

// 이 값이 바뀌면 조절값부터 다시 정한다. 가게 이름과 로고 출처는 생성에 쓰지 않는다.
const STYLE_INPUT_KEYS: (keyof UploadInput)[] = ["logoImage", "industry", "brandTones", "usageContexts", "desiredFeel"];

// 그리기 입력이 바뀌면 조합·빌드와 검사를 다시 거친다.
function clearBuild(state: AppState, maxStep: number): AppState {
  return { ...state, buildJobId: null, build: null, buildDirty: false, maxStep: Math.min(state.maxStep, maxStep) };
}

// 10/28 결정: 초안 → 폰트 만들기 → 다듬기 순서. 다듬기(조절값)는 만든 폰트를 지우지 않고
// '반영 전'으로 표시한다. 화면 4의 '적용해 보기'를 누를 때 한 번 다시 만들고 검사한다(슬라이더마다 빌드·OCR이 돌지 않게).
// 다시 만든 폰트가 검사를 통과해야 적용 키트로 넘어간다.
function markEdited(state: AppState): AppState {
  return { ...state, buildDirty: !!state.buildJobId, maxStep: Math.min(state.maxStep, 3) };
}

function reducer(state: AppState, action: Action): AppState {
  if (isStale(state, action)) return state;
  switch (action.type) {
    case "hydrate":
      return action.state ?? state;
    case "setUpload": {
      const upload = { ...state.upload, ...action.patch };
      const changed = STYLE_INPUT_KEYS.some(
        (k) => k in action.patch && JSON.stringify(action.patch[k]) !== JSON.stringify(state.upload[k]),
      );
      if (!changed || !state.style) return { ...state, upload };
      // 새 로고로 처음부터 만든다. 제작 기록도 새로 쓴다(10/30: 지난 작업의 선택이 새 폰트의 기록에 섞이지 않게).
      return { ...INITIAL_STATE, upload, run: state.run + 1 };
    }
    case "setStyle":
      return clearBuild({ ...state, ...NO_DRAFT, style: action.style, styleSamples: {} }, 2);
    case "setAxis": {
      if (!state.style) return state;
      const axes = state.style.axes.map((a) => (a.key === action.key ? { ...a, value: action.value } : a));
      return markEdited({ ...state, style: { ...state.style, axes } });
    }
    case "setExpression":
      if (!state.style) return state;
      return clearBuild({ ...state, style: { ...state.style, expression: action.value } }, 2);
    case "chooseConflict": {
      const conflict = state.style?.conflict;
      const option = conflict?.options.find((o) => o.kind === action.kind);
      if (!state.style || !conflict || !option) return state;
      const axes = state.style.axes.map((a) => (a.key === conflict.axis ? { ...a, value: option.value } : a));
      return clearBuild({ ...state, style: { ...state.style, axes, conflict: { ...conflict, chosen: action.kind } } }, 2);
    }
    case "setSample":
      return { ...state, styleSamples: { ...state.styleSamples, [action.expression]: action.sample } };
    case "setGlyphJob":
      return clearBuild(action.jobId ? { ...state, ...NO_DRAFT, glyphJobId: action.jobId, draftInput: action.input } : { ...state, ...NO_DRAFT }, 2);
    case "setGlyphItems": {
      // 폰트를 만든 뒤 참고 글자를 다시 그리거나 고쳤으면 그 폰트는 지난 참고 글자로 만든 것이다. 화면 4에 들어가면 다시 만든다.
      const refs = (items: GlyphItem[]) => items.flatMap((i) => (i.status === "ready" && i.imageUrl ? [i.imageUrl] : [])).join("|");
      const next = { ...state, glyphItems: action.items };
      return state.buildJobId && refs(state.glyphItems) !== refs(action.items) ? clearBuild(next, 3) : next;
    }
    case "setGlyphEdits":
      // 만든 폰트에 바로 바꿔 끼웠으면 파일을 다시 불러오고, 아니면(다듬기를 반영하지 않은 동안) 다음에 만들 때 들어간다.
      return {
        ...state,
        glyphEdits: action.edits,
        editsVersion: state.editsVersion + 1,
        fontRevision: state.fontRevision + (action.patched ? 1 : 0),
      };
    case "setBuildJob":
      return { ...state, buildJobId: action.jobId, build: null, fontRevision: 0, buildDirty: false, maxStep: Math.min(state.maxStep, 3) };
    case "setBuild":
      return { ...state, build: action.build };
    case "record":
      return { ...state, record: [...state.record, action.event] };
    case "reachStep":
      return { ...state, maxStep: Math.max(state.maxStep, action.step) };
    case "reset":
      return { ...INITIAL_STATE, run: state.run + 1 };
  }
}

// 새로 고침해도 이어서 볼 수 있게 탭 단위로 저장한다. v2(10/29): 자소 대신 참고 글자.
const STORAGE_KEY = "logoche-state-v2";

function loadState(): AppState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as AppState;
    const loaded = { ...INITIAL_STATE, ...saved, upload: { ...INITIAL_STATE.upload, ...saved.upload } };
    // draftInput이 생기기 전(10/30)에 그린 초안은 지금 화면 2 입력으로 그린 것으로 본다. 이후에 바뀌면 새로 그린다.
    const state = loaded.glyphJobId && loaded.draftInput === null ? { ...loaded, draftInput: draftInputOf(loaded) } : loaded;
    // 필드가 늘기 전(10/28 misreads·compared)에 저장한 빌드 결과는 버린다. 화면 4가 들어오면 다시 만든다.
    // 10/30부터 발급 대장과 비교하지 않는다. 발급 서체와 닮아 떨어진 빌드는 다시 만들어 새 기준으로 검사한다.
    const nearIssued = (state.build?.similarity?.nearestKind as string | undefined) === "issued";
    if (state.build && (!state.build.misreads || (state.build.similarity && !state.build.similarity.compared) || nearIssued)) {
      return { ...state, buildJobId: null, build: null, buildDirty: false, maxStep: Math.min(state.maxStep, 3) };
    }
    return state;
  } catch {
    return null;
  }
}

function saveState(state: AppState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 큰 로고 이미지로 저장 한도를 넘으면 이미지만 빼고 저장한다.
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, upload: { ...state.upload, logoImage: null } }));
    } catch {}
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  hydrated: boolean;
  record: (category: RecordCategory, text: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// 저장된 상태를 읽기 전(hydrated: false)에는 화면이 앞 단계 확인을 미룬다.
function rootReducer(store: { app: AppState; hydrated: boolean }, action: Action) {
  if (action.type === "hydrate") return { app: reducer(store.app, action), hydrated: true };
  return { ...store, app: reducer(store.app, action) };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [{ app: state, hydrated }, dispatch] = useReducer(rootReducer, { app: INITIAL_STATE, hydrated: false });

  useEffect(() => {
    dispatch({ type: "hydrate", state: loadState() });
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  const record = useCallback((category: RecordCategory, text: string) => {
    dispatch({ type: "record", event: { at: new Date().toISOString(), category, text } });
  }, []);

  const value = useMemo(() => ({ state, dispatch, hydrated, record }), [state, hydrated, record]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp은 AppProvider 안에서만 쓸 수 있다");
  return value;
}

/** 화면 3·4 견본에 보일 글: 가게 이름과 업종 예문. 화면 4에서 이 글자들을 먼저 그린다(rest.ts는 가게 이름·자주 쓰는 글자부터). */
export function specimenLines(state: AppState): { text: string; kind: "name" | "sentence" }[] {
  const name = state.upload.storeName || "가게 이름";
  const sentence = state.upload.industry ? PREVIEW_SENTENCES[state.upload.industry] : "";
  return [{ text: name, kind: "name" }, ...(sentence ? [{ text: sentence, kind: "sentence" as const }] : [])];
}

/** 참고 글자를 다 그렸고(실패한 글자는 다시 그리거나 빼고 만든다), 통과한 글자가 MIN_REFERENCE_READY자 이상이다. */
export function isGlyphsDone(state: AppState): boolean {
  const items = state.glyphItems;
  const settled = items.length > 0 && items.every((i) => i.status === "ready" || i.status === "failed");
  return settled && items.filter((i) => i.status === "ready").length >= MIN_REFERENCE_READY;
}

export function isBuildPassed(build: BuildJob | null): boolean {
  return !!build && build.phase === "done" && build.ocrPassed === true && build.checks.every((c) => c.status === "pass");
}
