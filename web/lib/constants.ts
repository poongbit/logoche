import type {
  AxisKey,
  BrandTone,
  BuildStageKey,
  CheckKey,
  Industry,
  LogoFont,
  LogoSource,
  NearestKind,
  RecordCategory,
  UploadInput,
  UsageContext,
} from "./types";

export const STEPS = [
  { path: "/", label: "로고 업로드" },
  { path: "/style", label: "AI가 읽은 방향" },
  { path: "/draft", label: "AI 초안" },
  { path: "/build", label: "폰트 만들기·다듬기" },
  { path: "/kit", label: "브랜드 적용 키트" },
  { path: "/download", label: "다운로드" },
] as const;

// ---------- 화면 1 ----------

export const ACCEPTED_LOGO_TYPES = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
export const MAX_LOGO_BYTES = 10 * 1024 * 1024;

export const LOGO_SOURCES: { value: LogoSource; label: string }[] = [
  { value: "self_made", label: "직접 만들었어요" },
  { value: "outsourced_transferred", label: "외주로 만들고 저작권을 넘겨받았어요" },
  { value: "unknown", label: "잘 모르겠어요" },
];

/** 로고 글자를 만든 방법. 사용자 몫의 권리 확인이라 답을 제작 기록에 남긴다(10/28). */
export const LOGO_FONTS: { value: LogoFont; label: string }[] = [
  { value: "lettering", label: "글자를 직접 그렸어요 (손글씨·레터링)" },
  { value: "free_font", label: "무료 폰트를 썼어요" },
  { value: "commercial_font", label: "유료(상용) 폰트를 썼어요" },
  { value: "no_text", label: "로고에 글자가 없어요" },
  { value: "unknown", label: "잘 모르겠어요" },
];

// 업종별 추천 톤은 분위기 사전(임낙원) 확정 전 임시 값이다.
// 업종과 그 업종에 먼저 추천하는 톤. 10/27 사용자 결정으로 4개에서 14개로 늘렸다(추천 톤은 임시 값).
export const INDUSTRIES: { value: Industry; label: string; tones: BrandTone[] }[] = [
  { value: "cafe_dessert", label: "카페·디저트", tones: ["warm", "cute"] },
  { value: "bakery", label: "베이커리", tones: ["warm", "natural"] },
  { value: "snack_korean", label: "분식·한식", tones: ["warm", "trustworthy"] },
  { value: "western_brunch", label: "양식·브런치", tones: ["modern", "fresh"] },
  { value: "asian", label: "일식·아시안", tones: ["calm", "traditional"] },
  { value: "bar_pub", label: "술집·바", tones: ["retro", "hip"] },
  { value: "craft", label: "공방", tones: ["warm", "traditional"] },
  { value: "beauty", label: "뷰티·네일", tones: ["premium", "cute"] },
  { value: "flower_plant", label: "꽃·식물", tones: ["natural", "elegant"] },
  { value: "fashion_goods", label: "옷·소품샵", tones: ["hip", "modern"] },
  { value: "pet", label: "반려동물", tones: ["cute", "playful"] },
  { value: "fitness", label: "운동·요가", tones: ["bold", "fresh"] },
  { value: "education", label: "학원·교육", tones: ["trustworthy", "calm"] },
  { value: "creator", label: "크리에이터", tones: ["playful", "hip"] },
];

export const BRAND_TONES: { value: BrandTone; label: string }[] = [
  { value: "cute", label: "귀여운" },
  { value: "warm", label: "따뜻한" },
  { value: "playful", label: "장난스러운" },
  { value: "premium", label: "고급스러운" },
  { value: "trustworthy", label: "믿음직한" },
  { value: "traditional", label: "전통적인" },
  { value: "modern", label: "모던한" },
  { value: "natural", label: "자연스러운" },
  { value: "retro", label: "레트로한" },
  { value: "hip", label: "힙한" },
  { value: "bold", label: "강렬한" },
  { value: "calm", label: "차분한" },
  { value: "fresh", label: "산뜻한" },
  { value: "elegant", label: "우아한" },
];

export const USAGE_CONTEXTS: { value: UsageContext; label: string }[] = [
  { value: "signage_menu", label: "간판·메뉴판" },
  { value: "sns_thumbnail", label: "SNS·썸네일" },
  { value: "packaging_sticker", label: "포장·스티커" },
];

export const SAMPLE_LOGOS: {
  id: string;
  name: string;
  caption: string;
  src: string;
  prefill: Pick<UploadInput, "storeName" | "industry" | "brandTones" | "usageContexts">;
}[] = [
  {
    id: "dalkom",
    name: "달콤한집",
    caption: "카페 · 샘플",
    src: "/samples/dalkom.svg",
    prefill: { storeName: "달콤한집", industry: "cafe_dessert", brandTones: ["warm", "cute"], usageContexts: ["signage_menu"] },
  },
  {
    id: "bada",
    name: "바다식당",
    caption: "식당 · 샘플",
    src: "/samples/bada.svg",
    prefill: { storeName: "바다식당", industry: "snack_korean", brandTones: ["warm", "trustworthy"], usageContexts: ["signage_menu"] },
  },
  {
    id: "supsok",
    name: "숲속공방",
    caption: "공방 · 샘플",
    src: "/samples/supsok.svg",
    prefill: { storeName: "숲속공방", industry: "craft", brandTones: ["warm", "traditional"], usageContexts: ["sns_thumbnail", "packaging_sticker"] },
  },
];

// ---------- 화면 2 ----------

export const AXIS_ORDER: AxisKey[] = ["weight", "roundness", "width", "contrast", "slant", "wobble", "tracking"];

// stage(10/27): draw는 그리기 전에 AI가 정하는 방향(프롬프트에 들어가 바꾸면 다시 그려야 한다),
// refine은 폰트를 만든 뒤 화면 4에서 다듬는 값(엔진이 외곽선을 딸 때 적용해 미리보기로 바로 보인다).
export type AxisStage = "draw" | "refine";

export const AXES: Record<
  AxisKey,
  { label: string; description: string; min: number; max: number; step: number; unit: string; stage: AxisStage }
> = {
  weight: { label: "굵기", description: "획 두께", min: 100, max: 900, step: 10, unit: "", stage: "refine" },
  roundness: { label: "둥글기", description: "0은 각짐, 1은 반원", min: 0, max: 1, step: 0.01, unit: "", stage: "draw" },
  width: { label: "너비", description: "글자 가로 폭", min: 80, max: 120, step: 1, unit: "%", stage: "refine" },
  contrast: { label: "대비", description: "가로획 ÷ 세로획 굵기", min: 0.5, max: 1, step: 0.01, unit: "", stage: "draw" },
  slant: { label: "기울기", description: "글자를 기울인 각도", min: -12, max: 12, step: 0.5, unit: "°", stage: "refine" },
  wobble: { label: "흔들림", description: "손으로 만든 느낌", min: 0, max: 1, step: 0.01, unit: "", stage: "draw" },
  tracking: { label: "자간", description: "글자 사이 간격", min: -10, max: 20, step: 0.5, unit: "%", stage: "refine" },
};

// 획이 많은 글자(뷁·뚫)의 속공간이 막히지 않게 두는 굵기 상한. 엔진 실측 전 임시 값.
export const WEIGHT_CAP = 850;

/** 축 값 표시. 예: 너비 104%, 기울기 2° */
export function formatAxis(key: AxisKey, v: number): string {
  return `${Number(v.toFixed(2))}${AXES[key].unit}`;
}

// ---------- 화면 3 ----------

/** 이미지 API가 화면 3에서 먼저 그리는 참고 글자 30자. 그대로 폰트에 들어가고, 화면 4에서 나머지 글자를 그릴 때 스타일 참고가 된다(10/30).
 * 모든 가게가 같은 30자를 쓴다. 고르는 기준(10/30):
 * 1. 한 장(6열×5행)에 그린다. 그림 1장이라 글자 수를 줄여도 비용은 같다.
 * 2. 자모를 고루: 기본 자음 14개가 모두 초성으로, 대표 받침 7개(ㄱㄴㄹㅁㅂㅅㅇ), 기본 모음 6개(ㅏㅓㅗㅜㅡㅣ)가 다 나온다.
 * 3. 짜임 6가지(세로·가로·섞임 모음 × 받침 없음·있음)가 다 나온다.
 * 4. 자주 쓰는 글자를 먼저 고른다(화면 3에서 스타일을 보기 쉽다).
 * 5. 그림 모델이 뭉개는 짜임은 뺀다: 쌍자음 아래 가로 모음(꼬), ㅝ·ㅙ·ㅞ, 겹받침. 10/30 아주 굵은 표현에서 꽃·원이 다시 그려도 계속 떨어졌다.
 * 짜임 순서로 놓았다: 세로 모음 · 가로 모음 · 섞임 모음 · 세로 모음+받침 · 가로 모음+받침 · 섞임 모음+받침. */
export const REFERENCE_CHARS = "가다타파하서이에내고로무수의쥐퀴한헌람것있밥면빵쳇는를들국왕";
/** 폰트를 만들려면 검사를 통과한 참고 글자가 이만큼은 있어야 한다(떨어진 글자는 빼고 만든다). 임시 값. */
export const MIN_REFERENCE_READY = 20;

// ---------- 화면 4 ----------

export const TOTAL_GLYPHS = 2350;

export const CHECKS: { key: CheckKey; label: string; criterion: string }[] = [
  { key: "glyph_set", label: "글자 세트", criterion: "한글 2,350자" },
  { key: "broken_glyphs", label: "깨진 글자", criterion: "0개 (윤곽 자기교차·열린 패스)" },
  { key: "embedding", label: "문서 포함 허용", criterion: "fsType 0" },
  { key: "naming_license", label: "이름·라이선스 정보", criterion: "메타데이터 기록" },
  { key: "platform_render", label: "기기별 표시", criterion: "Windows·macOS·iOS·Chrome" },
  { key: "size_legibility", label: "크기 기준", criterion: "12px~96px 가독" },
  { key: "similarity", label: "유사도", criterion: "무료 폰트와 비교 (상용 폰트 제외)" },
];

/** 화면 4 진행 단계(순서대로). unit이 있으면 개수를 보인다. live면 끝낸 개수가 실시간으로 늘고, 아니면 전체 개수만 보인다. */
export const BUILD_STAGES: { key: BuildStageKey; label: string; description: string; unit?: string; live?: boolean }[] = [
  { key: "send", label: "참고 글자 보내기", description: "AI가 그린 참고 글자를 보내요" },
  { key: "draw", label: "나머지 글자 그리기", description: "참고 글자와 같은 글씨로 30자씩 그리고 검사해요", unit: "자", live: true },
  { key: "trace", label: "외곽선 따기", description: "굵기·너비·기울기·자간을 맞춰 글자마다 외곽선을 따요", unit: "자", live: true },
  { key: "save", label: "TTF 파일 만들기", description: "외곽선을 글꼴 파일로 묶어요" },
  { key: "check", label: "상업용 검사 7항목", description: "글자 수, 깨진 글자, 이름 정보, 유사도 등을 확인해요", unit: "항목", live: true },
  { key: "ocr", label: "AI 판독", description: "Claude가 자주 쓰는 글자를 읽어 보며 알아보기 쉬운지 확인해요", unit: "자" },
];

export const NEAREST_KIND_LABELS: Record<NearestKind, string> = {
  free: "무료 폰트",
  commercial: "상용 폰트",
};

/** 유사도 검사가 무엇과 비교했는지. 상용 폰트와 비교하지 않았으면 그렇다고 밝힌다(선별 검사이지 권리 보증이 아님, 10/28). */
export function similarityScope(compared: Record<NearestKind, number>): string {
  const base = `무료 폰트 ${compared.free}개`;
  return compared.commercial ? `${base}·상용 폰트 ${compared.commercial}개와 비교` : `${base}와 비교, 상용 폰트와는 비교하지 않음`;
}

// 기본 자음 14개가 모두 나오는 팬그램. 견본·OCR 검수 글자에 쓴다. (10/27~28에는 이 문장의 자소만 그렸다.)
export const PANGRAM = "다람쥐 헌 쳇바퀴에 타고파";


// 목업의 "자주 쓰는 글자 우선 검수" 60자
export const FREQUENT_CHARS =
  "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후그느드르";

// ---------- 미리보기·시안 ----------

export const PREVIEW_SENTENCES: Record<Industry, string> = {
  cafe_dessert: "딸기 생크림 케이크와 따뜻한 라테 한 잔",
  snack_korean: "매콤한 떡볶이와 참치김밥 한 줄",
  craft: "손으로 빚은 소이 캔들 원데이 클래스",
  beauty: "봄맞이 커트와 펌 예약 받아요",
  bakery: "갓 구운 소금빵과 무화과 깜파뉴",
  western_brunch: "에그 베네딕트와 리코타 샐러드 브런치",
  asian: "진한 돈코츠 라멘과 바삭한 교자",
  bar_pub: "오늘의 하이볼과 바삭한 감자튀김",
  flower_plant: "오늘 들어온 작약 꽃다발과 몬스테라",
  fashion_goods: "봄 신상 니트와 빈티지 소품 입고",
  pet: "강아지 목욕과 고양이 간식 세트",
  fitness: "아침 요가와 필라테스 개인 수업",
  education: "중등 수학 주말 집중반 모집",
  creator: "주말 브이로그 새 영상 공개",
};

// 시연용 가상 메뉴와 가격. 가격 숫자는 기본 글꼴로 둔다(본선 서체에는 숫자가 없다).
export const MENU_BY_INDUSTRY: Record<Industry, [string, string][]> = {
  cafe_dessert: [
    ["딸기 생크림 케이크", "6,500"],
    ["바닐라 마들렌", "3,000"],
    ["얼그레이 스콘", "3,800"],
  ],
  snack_korean: [
    ["떡볶이", "4,500"],
    ["참치김밥", "4,000"],
    ["순대", "4,000"],
  ],
  craft: [
    ["원데이 클래스", "35,000"],
    ["소이 캔들", "18,000"],
    ["가죽 키링", "9,000"],
  ],
  beauty: [
    ["커트", "20,000"],
    ["펌", "60,000"],
    ["염색", "50,000"],
  ],
  bakery: [
    ["소금빵", "3,200"],
    ["무화과 깜파뉴", "7,500"],
    ["크루아상", "4,000"],
  ],
  western_brunch: [
    ["에그 베네딕트", "14,000"],
    ["리코타 샐러드", "12,000"],
    ["트러플 감자튀김", "9,000"],
  ],
  asian: [
    ["돈코츠 라멘", "10,000"],
    ["가라아게 덮밥", "9,500"],
    ["교자", "6,000"],
  ],
  bar_pub: [
    ["하이볼", "8,000"],
    ["감자튀김", "9,000"],
    ["모둠 꼬치", "18,000"],
  ],
  flower_plant: [
    ["작약 꽃다발", "45,000"],
    ["몬스테라 화분", "32,000"],
    ["꽃 정기구독", "39,000"],
  ],
  fashion_goods: [
    ["울 니트", "49,000"],
    ["빈티지 머그", "15,000"],
    ["캔버스 에코백", "22,000"],
  ],
  pet: [
    ["강아지 목욕", "30,000"],
    ["고양이 간식 세트", "12,000"],
    ["미용 컷", "45,000"],
  ],
  fitness: [
    ["요가 원데이", "25,000"],
    ["필라테스 10회", "300,000"],
    ["개인 운동", "70,000"],
  ],
  education: [
    ["중등 수학 주말반", "280,000"],
    ["영어 회화", "200,000"],
    ["글쓰기 첨삭", "50,000"],
  ],
  creator: [
    ["주말 브이로그", "토 19:00"],
    ["라이브 방송", "수 21:00"],
    ["굿즈 스티커", "5,000"],
  ],
};

// ---------- 제작 기록·권리 카드 ----------

export const RECORD_CATEGORIES: { key: RecordCategory; label: string }[] = [
  { key: "creative_intent", label: "창작 의도" },
  { key: "ai_model", label: "AI 모델명" },
  { key: "chat_log", label: "채팅 지시 기록" },
  { key: "selection", label: "선택·수정 과정" },
  { key: "ai_scope", label: "AI 활용 범위" },
  { key: "check", label: "검사 결과" },
];

// 권리 카드 문구. 법률 자문 전 초안이다.
// 10/29 결정: MX-Font 생성망이 OFL 폰트로 학습해 결과 서체도 SIL OFL 1.1이다(OFL FAQ 1.25). 상업 사용은 되지만 서체 파일만 따로 팔지 않는다.
// 10/30 MX-Font를 뺐지만 권리 문구는 그대로 둔다(바꿀지는 사용자 결정).
export const RIGHTS = {
  expression: "상업 사용 가능 + 제작 기록",
  license: "SIL Open Font License 1.1",
  licenseUrl: "/licenses/OFL-1.1.txt",
  allowed: [
    "상업 사용: 간판·메뉴판·현수막, 영상·SNS, 쇼핑몰·앱 임베딩",
    "BI/CI 사용과 수정",
    "간판·인쇄 업체에 파일을 넘겨 제작하기",
    "가게를 넘길 때 함께 넘기기",
    "구독 없이 계속 쓰기",
  ],
  notAllowed: ["서체 파일만 따로 판매하기"],
  // 사용자가 알아야 할 조건: 독점이 아니다(OFL은 받은 사람의 재배포를 막을 수 없다).
  openNote: "서체 파일을 받은 사람도 같은 OFL 조건으로 쓰고 나눌 수 있어요. 나만 쓰는 독점 서체는 아니에요.",
  aiNotice: "이 서체는 AI를 활용해 만들었습니다.",
  // 10/28: 권리 확인을 사용자와 나눈다. 도구는 결과물을 선별 검사하고, 로고에 쓴 폰트의 라이선스는 사용자가 확인한다.
  screening:
    "유사도 검사는 다른 폰트와 닮지 않았는지 걸러 내는 선별 검사이고, 권리 문제가 없다는 보증은 아니에요. 로고에 쓴 폰트의 라이선스 확인과 최종 사용 책임은 사용하는 분께 있어요.",
};
