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
  | "creator"
  | "clinic"
  | "stay_travel"
  | "book_stationery"
  | "local_service"
  | "office_pro"
  | "other";
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
export type UsageContext = "signage_menu" | "sns_thumbnail" | "packaging_sticker" | "print_card" | "web_app";

/** 11/4 속성 고르기: 같은 글자를 두 방식으로 보여 주고 하나씩 고른다. 네 쌍 모두 골라야 한다(건너뛰기 없음). */
export interface StyleAttributes {
  edge: "round" | "sharp"; // 획 끝 → 둥글기
  weight: "thin" | "bold"; // 굵기
  contrast: "even" | "high"; // 가로세로 굵기(고딕처럼 균일 / 명조처럼 차이) → 대비
  hand: "neat" | "brush"; // 손맛 → 흔들림
}

export interface UploadInput {
  logoImage: string | null; // data URL
  logoFileName: string | null;
  logoHash: string | null; // 원본 파일 SHA-256
  inputPath: InputPath | null;
  sampleId: string | null;
  storeName: string;
  industry: Industry | null;
  notifyByEmail?: boolean; // 완성되면 메일로 알림(없으면 보냄)
  industryOther: string; // 업종이 '기타'일 때 직접 적은 업종(비워도 된다)
  brandTones: BrandTone[]; // 2~3개
  usageContexts: UsageContext[]; // 1개 이상
  desiredFeel: string; // 11/4부터 '사업 내용과 추구하는 가치'(여러 문장). 키는 이전 작업과 맞추려고 그대로 둔다. 비워도 된다
  logoSource: LogoSource | null;
  logoFont: LogoFont | null;
  logoFontName: string; // 로고에 쓴 폰트 이름(알면), 비워도 된다
  /** 11/4부터 로고 글자·브랜드 톤·주 사용처는 묻지 않는다(이전 작업에만 남아 있다). 대신 속성 네 쌍을 고른다. 이전 작업에는 없다. */
  attributes?: StyleAttributes | null;
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
  chosen?: boolean; // 사용자가 속성으로 직접 정한 축(11/4). 그리기 지시문에 늘 넣는다.
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

/** 서체 계열(11/4). 이미지 모델에게 가장 크게 먹히는 방향 지시라 따로 둔다. */
export type StyleFamily = "gothic" | "myeongjo" | "rounded" | "brush" | "display";

/** AI가 낸 서체 방향 하나: 계열 + 표현 방식(짧은 구) + 서체 설계 지시문(4~6문장). 안끼리 계열이 달라야 한다. */
export interface StyleDirection {
  family: StyleFamily;
  expression: string;
  brief: string | null; // 설계 지시문. 색·기울기·위치 같은 금지 내용이 든 문장은 걸러 낸다(server/style.ts)
  why?: string | null; // 이 가게에 이 방향이 어울리는 이유 한 줄(견본 카드에 보인다, 11/5). 이전 작업에는 없다
  weight?: number; // 이 방향의 기본 굵기(굵기 축 값). 방향을 고르면 폰트 전체 굵기가 된다. 없으면(이전 작업) 조절값 그대로(11/4)
}

/** 브랜드 가치 → 반영한 조형 요소 → 근거. 제작 기록(창작 의도)에 남는다. */
export interface ValueMapping {
  value: string;
  form: string;
  why: string;
}

export interface StyleCard {
  axes: StyleAxis[];
  strokeEnd: string; // 획 끝 묘사
  signature: string | null; // 시그니처 요소와 들어갈 자리
  guideFont?: string; // 구조 참고용 무료 폰트 이름(엔진 compare/free 안). 있으면 guide 대신 그 서체의 뼈대를 휘어 옅은 선으로 준다(11/5)
  guideStrong?: boolean; // 구조 참고 뼈대를 굵고 진하게(11/5)
  guideChoice?: { cluster: number; top: string[] }; // 구조 참고 폰트를 고른 결과(제작 출처에만 남긴다)
  guideWarp?: number; // 뼈대를 휘는 정도 0~2(참고만 하고 그대로 따르지 않게)
  guide?: "light" | "none"; // 기준 글자표 강도(11/5, 캘리그래피처럼 글자 모양을 자유롭게 그릴 때): light 옅은 중심선만 · none 칸 번호만. 없으면 기준 서체 글자 그대로
  signatureDraw?: string | null; // 글자 그리기에 넘기는 로고 고유 조형(구체적 조형 + 들어갈 자리). 없으면(이전 작업) 그리기 지시는 예전과 같다(11/5 시그니처 시험)
  toneMismatch: string | null; // AI 해석이 고른 톤과 다를 때 알림
  expression: string; // 참고 글자 초안의 표현 방식. 사용자가 AI 제안에서 고르거나 직접 쓴다
  expressionOptions: string[]; // AI가 로고와 고른 톤을 보고 제안한 표현 방식
  conflict: StyleConflict | null;
  colors: string[]; // 로고에서 뽑은 [대표색, 어두운 색, 밝은 색]. 자리로 읽으니 같은 색이 겹칠 수 있다. 적용 시안에만 쓴다
  models: string[]; // 쓴 모델 이름, 제작 기록에 남는다
  // 11/4: 아래는 모두 없어도 된다. 이전에 만든 작업에는 없고, 없으면 지시문은 예전과 똑같이 만든다(이어서 만들기·다시 그리기에서 서체가 바뀌지 않게).
  family?: StyleFamily; // 고른 방향의 서체 계열
  designBrief?: string | null; // 고른 방향의 서체 설계 지시문. 한 번 정하면 모든 글자표에 같은 글을 쓴다(장마다 달라지면 서체가 흔들린다)
  directions?: StyleDirection[]; // AI가 낸 방향 3개(첫 안이 추천)
  slogans?: string[]; // 브랜드 맞춤 문장(견본·목업에 쓴다)
  valueMappings?: ValueMapping[];
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

/** 글자 하나(또는 전체)에 사용자가 더한 조정(11/3 다듬기). 엔진 contour.Tweak과 같다.
 * pull은 굵기 축 증감(1단위 ≈ 틀에서 0.08px, 눈에 보이려면 ±100 안팎), slant는 기울기 증감(도), width·height·scale은 %, tx·ty는 폰트 단위(+는 오른쪽·위).
 * AI가 정한 조절값은 건드리지 않고 그 위에 더한다. 그래서 "AI 값 대비 사용자가 바꾼 것"이 그대로 남는다. */
export interface GlyphTweak {
  pull: number;
  slant: number;
  width: number;
  height: number;
  scale: number;
  tx: number;
  ty: number;
}

/** 표에 저장되는 조정. rel은 전체("*") 조정에서만: 굵기(pull)를 모든 글자에 같은 양으로 걸지 않고, 이 글자에서 실제로 달라진 획 두께의 배율을 다른 글자에도 건다(11/5, 엔진 drawn.resolve_all). */
export type StoredTweak = GlyphTweak & { rel?: string };

/** 조정 표. "*"는 전체 글자, 나머지는 글자별 조정(전체 조정을 덮어쓴다). 조정이 없는 글자는 표에 없다. */
export type TweakTable = Record<string, StoredTweak>;

/** 글자 조정 저장. tweak이 null이면 그 글자(또는 전체)의 조정을 지운다. 글자 하나는 지금 폰트에 바로 바꿔 끼운다. */
export interface SaveGlyphTweakRequest {
  char: string; // 한글 한 글자 또는 "*"(전체)
  tweak: StoredTweak | null;
  note?: string; // 어떻게 조정했는지(슬라이더·변형·프리셋). 제작 기록에 붙는다
}

export interface SaveGlyphTweakResponse {
  tweaks: TweakTable;
  patched: boolean; // 지금 폰트에 바로 반영했는가(글자 하나만 가능)
  rebuild: boolean; // 11/5부터 늘 false: 전체 조정은 서버가 바로 폰트를 다시 만들기 시작한다(프로젝트가 만드는 중으로 바뀐다)
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

export type NearestKind = "free" | "commercial" | "specimen";

export interface SimilarityResult {
  score: number;
  threshold: number;
  nearestFont: string;
  nearestKind: NearestKind; // 무료 폰트 · 상용 폰트 · 견본 이미지
  passed: boolean;
  compared: Record<NearestKind, number>; // 종류별로 비교한 수. 상용이 0이면 상용 폰트와는 비교하지 않은 것, 견본은 폰트 파일이 아니라 이미지에서 뽑은 지문(정밀도 낮음)
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
  fontId: string | null; // 다 만들어지면 /api/font/[fontId]로 TTF를 받는다. 검사에 떨어져도, 유사도를 넘어도 준다(10/30 시연)
  models: string[];
  error?: string | null; // 조합이나 OCR이 실패한 이유
}

// ---------- 제작 기록 ----------

export type RecordCategory =
  | "creative_intent" // 창작 의도
  | "ai_model" // AI 모델명
  | "chat_log" // 채팅 지시 기록(10/29 말로 고치기를 빼기 전 기록)
  | "selection" // 선택·수정 과정
  | "human_edit" // 사용자가 직접 한 조정(11/3 다듬기: 슬라이더·변형·그리기)
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

/** 그리기 수준(11/2): 표준은 이미지 품질을 한 단계 낮춰 싸고 빠르다. 정밀은 지금까지 쓴 품질. */
export type DrawQuality = "standard" | "fine";

export interface StartGlyphJobRequest {
  upload: UploadInput; // logoImage는 이미지 API의 참고 이미지로 쓴다
  style: StyleCard;
  sampleId?: string | null; // 화면 2에서 고른 견본. 초안이 이 견본의 글씨를 따른다
  quality?: DrawQuality; // 없으면 정밀
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
  skipDraw?: boolean; // 11/5: 전체 조정처럼 폰트만 다시 만들 때. 아직 그리지 않은 글자를 새로 그리지 않는다(이미지 호출 없음)
  redraw?: string[]; // 11/2: 이미 그린 나머지 글자 중 다시 그릴 글자(스튜디오 '다시 볼 글자'에서 고름)
  /** 11/5: 엔진이 빌드 폴더에 남기는 출처(프로젝트 번호·서체 방향 등). 가게 이름·소유자·로고 이미지는 넣지 않는다. 서체끼리의 유사도 분석(docs/similarity-analysis-20261105.md)에 쓴다. */
  provenance?: Record<string, unknown>;
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

// ---------- 폰트 작업(11/2 B안: 만들기 → 만드는 중 → 스튜디오) ----------

/** 서버가 이어서 돌리는 단계. analyzing 로고 읽기 → drawing 참고 글자 30자 → reviewing 사용자 확인(20초 뒤 저절로 계속)
 * → building 나머지 글자·숫자·문장부호 그리기와 폰트 파일·검사 → done. */
export type ProjectPhase = "analyzing" | "choosing" | "drawing" | "reviewing" | "building" | "done" | "failed"; // reviewing은 11/4 이전에 만든 작업만 거친다(참고 글자 확인)

export interface CreateProjectRequest {
  upload: UploadInput;
  quality?: DrawQuality; // 11/3: 화면에서는 더 이상 고르지 않는다(항상 정밀)
}

export interface ProjectSummary {
  id: string;
  name: string; // 폰트 이름. 처음에는 '가게 이름 + 체'
  storeName: string;
  desiredFeel: string;
  favorite: boolean;
  phase: ProjectPhase;
  quality: DrawQuality;
  createdAt: string; // ISO
  logoUrl: string;
  fontId: string | null; // 다 만들면 /api/font/[fontId]
  glyphCount: number | null; // 서체에 든 한글 수(다 만든 뒤)
  extraCount: number | null; // 서체에 든 숫자·문장부호 수(다 만든 뒤)
  progress: { done: number; total: number } | null; // 그리는 중이면 그린 글자 수
  remainingSeconds: number | null;
  error: string | null;
  /** 11/6 저녁: 고른 느낌의 이름(느낌 고르기 카드의 계열 이름, 예: '둥근 고딕'). 만드는 중 머리 줄·멈춤·스튜디오·목록 줄에 보인다.
   * 느낌을 고르기 전이거나 느낌 고르기가 없던 예전 작업이면 null, 이 값을 모르는 예전 서버는 키가 없다(undefined). 없으면 화면은 지금 문구 그대로. */
  feelName?: string | null;
}

/** reviewing: 참고 글자 30자 확인. continueAt이 지나면 서버가 저절로 다음 단계로 간다. held면 사용자가 '계속'을 누를 때까지 기다린다. */
export interface ProjectReview {
  items: GlyphItem[];
  continueAt: number | null; // epoch ms
  held: boolean;
}

/** 느낌 고르기(11/4): AI가 낸 서체 방향 3개를 가게 이름 견본 그림으로 보여 주고 하나를 고르게 한다. */
export interface ChooseDirection {
  family: StyleFamily;
  familyLabel: string;
  expression: string;
  weightLabel: string | null; // 이 방향의 굵기를 말로(가는·보통·굵은·아주 굵은)
  why: string | null; // 이 가게에 어울리는 이유 한 줄(없으면 summary를 보인다)
  summary: string | null; // 설계 지시문 첫 문장
  imageUrl: string | null; // 견본 그림(그리는 중·실패면 null)
  status: "drawing" | "ready" | "failed";
  recommended: boolean; // AI가 가장 추천하는 안(첫 안)
}

export interface ProjectChoose {
  directions: ChooseDirection[];
  again: boolean; // 30자를 보고 다른 느낌을 다시 고르는 중
  previous?: number | null; // 11/6: 다시 고를 때 전에 고른 안의 순서(again일 때만). 화면이 '전에 고른 느낌' 꼬리표를 붙인다
}

// 11/4 사용자 결정: 느낌은 저절로 고르지 않는다. 고를 때까지 서버가 기다린다.
export type ChooseAction = { action: "pick"; index: number } | { action: "redraw"; index: number };

export interface ProjectView extends ProjectSummary {
  upload: Omit<UploadInput, "logoImage">;
  colors: string[]; // 로고에서 뽑은 색(시안에만 쓴다)
  review: ProjectReview | null;
  choose: ProjectChoose | null; // 느낌 고르는 단계(11/4)
  build: BuildJob | null;
  recent: { char: string; imageUrl: string }[]; // 방금 그린 나머지 글자, 늦게 그린 것부터 최대 60자(그리는 중·11/6부터 멈춤에도)
  missing: string[]; // 서체에 없는 한글(다 만든 뒤)
  extras: string[]; // 서체에 든 숫자·문장부호(다 만든 뒤)
  recheck: string[]; // 다시 볼 글자: 획 두께·크기가 기준에서 가장 많이 벗어난 나머지 글자(다 만든 뒤, 최대 30자)
  tweaks: TweakTable; // 사용자가 더한 조정(11/3 다듬기). "*"는 전체 글자
  edited: string[]; // 그림판으로 직접 고친 글자(11/4)
  rebuilding: boolean; // 이미 완성한 폰트가 있는데 빠진 글자를 다시 그리는 중(11/4). 중단하면 그 폰트로 돌아간다
  revision: number; // 폰트 파일이 바뀔 때마다 달라지는 값. 글자를 고치면 파일이 바뀌어 폰트를 다시 불러오는 열쇠로 쓴다
  slogans: string[]; // AI가 쓴 브랜드 맞춤 문장(없으면 빈 배열). 견본·목업의 문장
  record: RecordEvent[];
  /**
   * 11/6 저녁: 서체에 들어갈 그림이 있는 글자 수(기준 글자 · 나머지 글자 · 직접 그려 넣은 글자, 한글 2,350 + 82자 안에서). 만드는 중(building)·멈춤(failed)에만 있고,
   * 글자 작업이 아직 없으면(로고 읽기·느낌 고르기에서 멈춤) null. 이 값을 모르는 예전 서버는 키가 없다(undefined).
   * (11/6 오후의 글자 지도 비트 drawnMap은 지도를 지우면서 뺐다. 화면에는 그린 개수만 필요하다.)
   */
  drawnCount?: number | null;
  lastSheetAt?: number | null;
}

export type ReviewAction = { action: "hold" } | { action: "release" } | { action: "continue" } | { action: "redraw"; indices: number[] } | { action: "restyle" }; // restyle: 30자를 보고 다른 느낌으로 다시 고른다(11/4)

export interface UpdateProjectRequest {
  name?: string;
  favorite?: boolean;
}
