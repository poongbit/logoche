// 화면 사이와 API에서 주고받는 데이터. 필드 이름은 design.md "데이터 필드"와 같다.

// ---------- 화면 1. 로고 업로드 ----------

export type InputPath = "upload" | "sample";
export type LogoSource = "self_made" | "outsourced_transferred" | "unknown";
/** 로고 글자를 만든 방법(10/28). 상용 폰트는 엔진이 비교하지 못해 사용자가 라이선스를 확인한다. */
export type LogoFont = "lettering" | "free_font" | "commercial_font" | "no_text" | "unknown";
export type Industry =
  | "cafe_dessert"
  | "bakery"
  | "snack_korean"
  | "western_brunch"
  | "asian"
  | "bar_pub"
  | "craft"
  | "beauty"
  | "flower_plant"
  | "fashion_goods"
  | "pet"
  | "fitness"
  | "education"
  | "creator";
export type BrandTone =
  | "cute"
  | "warm"
  | "playful"
  | "premium"
  | "trustworthy"
  | "traditional"
  | "modern"
  | "natural"
  | "retro"
  | "hip"
  | "bold"
  | "calm"
  | "fresh"
  | "elegant";
export type UsageContext = "signage_menu" | "sns_thumbnail" | "packaging_sticker";

export interface UploadInput {
  logoImage: string | null; // data URL
  logoFileName: string | null;
  logoHash: string | null; // 원본 파일 SHA-256
  inputPath: InputPath | null;
  sampleId: string | null;
  storeName: string;
  industry: Industry | null;
  brandTones: BrandTone[]; // 2~3개
  usageContexts: UsageContext[]; // 1개 이상
  desiredFeel: string; // 원하는 느낌 한 줄, 비워도 된다
  logoSource: LogoSource | null;
  logoFont: LogoFont | null;
  logoFontName: string; // 로고에 쓴 폰트 이름(알면), 비워도 된다
}

// ---------- 화면 2. 스타일 카드 ----------

export type AxisKey = "weight" | "roundness" | "width" | "contrast" | "slant" | "wobble" | "tracking";

/** 값의 근거: 사용자 선택 · 로고 측정 · AI 해석(Claude) · 잴 수 없어 범위 가운데 */
export type AxisBasis = "selection" | "measurement" | "interpretation" | "range_mid";

export interface StyleAxis {
  key: AxisKey;
  value: number; // 지금 값
  suggested: number; // AI가 처음 제안한 값
  range: [number, number]; // 고른 톤에서 온 범위
  basis: AxisBasis;
  reason: string;
}

export type StyleOptionKind = "logo" | "tone" | "middle";

export interface StyleOption {
  kind: StyleOptionKind; // 로고 충실 · 톤 강조 · 중간
  value: number;
}

/** 고른 톤과 로고 측정값이 부딪힐 때 내는 3안 */
export interface StyleConflict {
  axis: AxisKey;
  note: string;
  options: StyleOption[];
  chosen: StyleOptionKind | null;
}

export interface StyleCard {
  axes: StyleAxis[];
  strokeEnd: string; // 획 끝 묘사
  signature: string | null; // 시그니처 요소와 들어갈 자리
  toneMismatch: string | null; // AI 해석이 고른 톤과 다를 때 알림
  expression: string; // 참고 글자 초안의 표현 방식. 사용자가 AI 제안에서 고르거나 직접 쓴다
  expressionOptions: string[]; // AI가 로고와 고른 톤을 보고 제안한 표현 방식
  conflict: StyleConflict | null;
  colors: string[]; // 로고에서 뽑은 [대표색, 어두운 색, 밝은 색]. 자리로 읽으니 같은 색이 겹칠 수 있다. 적용 시안에만 쓴다
  models: string[]; // 쓴 모델 이름, 제작 기록에 남는다
}

// ---------- 화면 3. AI 초안 ----------

// 10/29 결정: 자소 조합 대신 음절을 그린다. 10/30 결정: MX-Font를 빼고, 이미지 API가 참고 글자 30자(화면 3)에 이어 나머지 글자(화면 4)까지 2,350자를 그린다.

/** 자리(초성·중성·종성). 한글 자모 표(lib/hangul.ts)에 쓴다. */
export type JasoPosition = "initial" | "medial" | "final";
export type GlyphStatus = "drawing" | "redrawing" | "ready" | "failed";

/** 참고 글자 하나(이미지 API가 그린 음절) */
export interface GlyphItem {
  id: string; // 참고 글자 목록에서의 순서(0부터)
  char: string;
  status: GlyphStatus;
  imageUrl: string | null; // ready일 때만. null이면 화면이 임시 글씨로 그린다
  problem: string | null; // failed일 때 떨어진 이유(검사 결과나 오류)
  note?: string | null; // ready일 때 알릴 말(다시 그린 글자가 떨어져 전 글자를 그대로 뒀을 때 등)
  redrawsLeft?: number; // 사용자가 더 누를 수 있는 '다시 그리기' 횟수
  canRestore?: boolean; // 바꾸기 전 글자로 되돌릴 수 있다(다시 그렸거나 직접 고쳤을 때)
  handEdited?: boolean; // 사용자가 직접 고친 글자
  swappedFrom?: string | null; // 계속 떨어져 쉬운 글자로 바꿔 그렸으면 원래 글자(10/30). 원래 글자도 폰트에 들어간다
}

export interface GlyphJob {
  jobId: string;
  status: "running" | "done" | "failed";
  items: GlyphItem[];
  models: string[];
  edits: string[]; // 화면 4에서 고친 글자(2,350자 가운데)
}

/** 화면 2 표현 방식 견본: 가게 이름을 그 방식으로 그린 그림 */
export interface StyleSample {
  sampleId: string;
  imageUrl: string;
  model: string;
}

export interface StyleSampleRequest {
  upload: UploadInput;
  style: StyleCard;
  expression: string;
}

// ---------- 글자 고치기(10/29, 그림판처럼) ----------

/** 편집 화면 그림의 글자 틀 자리(픽셀). y는 아래로 커진다. */
export interface GlyphGuides {
  baseline: number;
  ascender: number;
  descender: number;
  left: number;
  right: number;
}

/** 화면 4 편집 화면에 띄울 그림. image는 지금 글자(고친 적이 있으면 고친 그림), original은 AI가 만든 그대로. */
export interface GlyphEditSource {
  char: string;
  size: number; // 정사각형 한 변(픽셀)
  image: string;
  original: string;
  guides: GlyphGuides;
  edited: boolean;
}

export interface GlyphEditSourceRequest {
  char: string;
  axes: StyleAxis[];
}

/** 고친 글자 저장. image가 null이면 고친 것을 지우고 AI가 만든 그대로 돌린다.
 * buildId가 있으면 그 폰트 파일에서 이 글자만 바로 바꿔 끼운다(다듬기를 반영하지 않은 동안에는 다음 빌드에 들어간다). */
export interface SaveGlyphEditRequest {
  char: string;
  image: string | null;
  axes: StyleAxis[];
  buildId: string | null;
}

export interface SaveGlyphEditResponse {
  edits: string[];
  patched: boolean;
}

// ---------- 화면 4. 조합·빌드 ----------

export type CheckKey =
  | "glyph_set"
  | "broken_glyphs"
  | "embedding"
  | "naming_license"
  | "platform_render"
  | "size_legibility"
  | "similarity";

export type CheckStatus = "pending" | "pass" | "fail";

export interface CheckResult {
  key: CheckKey;
  status: CheckStatus;
  detail: string;
}

export type NearestKind = "free" | "commercial";

export interface SimilarityResult {
  score: number;
  threshold: number;
  nearestFont: string;
  nearestKind: NearestKind; // 무료 폰트 · 상용 폰트
  passed: boolean;
  compared: Record<NearestKind, number>; // 종류별로 비교한 폰트 수. 상용이 0이면 상용 폰트와는 비교하지 않은 것
}

export type BuildPhase = "composing" | "checking" | "done" | "failed";

/** 화면 4 진행 단계. send(참고 글자 보내기)는 화면만 알고, draw(나머지 글자 그리기, 10/30)·ocr은 웹 서버가, trace~check는 엔진이 알려 준다. */
export type BuildStageKey = "send" | "draw" | "trace" | "save" | "check" | "ocr";

export interface BuildStage {
  key: Exclude<BuildStageKey, "send">;
  status: "pending" | "active" | "done" | "failed";
  done: number; // 끝낸 개수(글자·검사 항목)
  total: number;
  seconds: number | null; // 끝난 단계는 걸린 시간, 진행 중이면 지금까지 걸린 시간
}

/** OCR 판독에서 글자를 다르게 읽은 것. read는 AI가 읽은 글자이고, 알아보지 못했으면 '?', 답이 없었으면 빈 문자열이다. */
export interface OcrMisread {
  char: string;
  read: string;
}

export interface BuildJob {
  jobId: string;
  phase: BuildPhase;
  stages: BuildStage[];
  queued: boolean; // 앞서 시작한 조합이 끝나기를 기다리는 중
  elapsedSeconds: number;
  remainingSeconds: number | null; // 남은 시간 어림. 모르면(실패 등) null
  builtGlyphs: number;
  totalGlyphs: number;
  checks: CheckResult[];
  ocrPassed: boolean | null;
  misreads: OcrMisread[]; // OCR이 다르게 읽은 글자
  similarity: SimilarityResult | null;
  fontId: string | null; // 다 만들어지면 /api/font/[fontId]로 TTF를 받는다
  models: string[];
  error?: string | null; // 조합이나 OCR이 실패한 이유
}

// ---------- 제작 기록 ----------

export type RecordCategory =
  | "creative_intent" // 창작 의도
  | "ai_model" // AI 모델명
  | "chat_log" // 채팅 지시 기록(10/29 말로 고치기를 빼기 전 기록)
  | "selection" // 선택·수정 과정
  | "ai_scope" // AI 활용 범위
  | "check"; // 검사 결과

export interface RecordEvent {
  at: string; // ISO 시각
  category: RecordCategory;
  text: string;
}

// ---------- API 요청·응답 ----------

export interface AnalyzeStyleRequest {
  upload: UploadInput;
}

export interface StartGlyphJobRequest {
  upload: UploadInput; // logoImage는 이미지 API의 참고 이미지로 쓴다
  style: StyleCard;
  sampleId?: string | null; // 화면 2에서 고른 견본. 초안이 이 견본의 글씨를 따른다
}

/** 화면 3 다시 그리기. index가 있으면 그 글자만 한 번(글자 카드의 '다시 그리기'), 없으면 실패한 글자를 모두 다시 그린다. */
export interface RetryGlyphsRequest extends StartGlyphJobRequest {
  index?: number;
}

/** 화면 3 참고 글자를 직접 고친 그림(흰 바탕 검은 글씨 PNG) */
export interface SaveRefEditRequest {
  image: string;
}

/** upload·style은 나머지 글자를 그릴 때 참고 글자와 같은 지시문을 쓰려고 함께 보낸다(10/30). */
export interface StartBuildJobRequest extends StartGlyphJobRequest {
  storeName: string;
  logoHash: string | null; // 발급 대장에 함께 적는다(기록용)
  glyphJobId: string | null; // 참고 글자 그림을 찾는다
  axes: StyleAxis[];
}

export interface StartJobResponse {
  jobId: string;
}

/** 화면 4 미리보기: 글 몇 자를 빌드와 같은 방법(그린 글자 → 외곽선)으로 만든다. 아직 그리지 않은 글자는 기본 글꼴로 보인다. */
export interface PreviewRequest {
  glyphJobId: string;
  axes: StyleAxis[];
  text: string; // 최대 80자
  refsVersion?: string; // 화면이 미리보기를 새로 만들 때를 가르려고만 넣는다(서버는 쓰지 않는다)
}

export interface PreviewGlyph {
  char: string;
  path: string | null; // SVG 패스(y 아래쪽, 위 끝 = ascender). null이면 서체에 없는 글자(한글 2,350자 밖), ""면 띄어쓰기
  advance: number | null; // 글자 폭(1em = unitsPerEm)
}

export interface PreviewResponse {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphs: PreviewGlyph[];
}
