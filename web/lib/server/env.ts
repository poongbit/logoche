// 서버(라우트 핸들러)에서만 읽는 설정. 값은 web/.env.local에 둔다.

export class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** LOGOCHE_MOCK=1이면 AI·엔진 대신 모의 응답을 쓴다(오프라인 화면 확인용). */
export const MOCK = process.env.LOGOCHE_MOCK === "1";

export const ENGINE_URL = (process.env.FONT_ENGINE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

// 모델 id는 .env.local에서 바꿀 수 있다. 10/27 결정: 그리기는 GPT Image, 이미지를 보는 일은 Claude(10/29 말로 고치기는 뺐다).
// Gemini는 쓰지 않는다. 실제로 답한 모델이 제작 기록에 남는다.
const chain = (value: string | undefined, fallback: string[]) =>
  value ? value.split(",").map((s) => s.trim()).filter(Boolean) : fallback;

// 참고 글자표 품질. low·medium은 더 싸지만 획 끝이 거칠어질 수 있다.
export type ImageQuality = "low" | "medium" | "high" | "xhigh" | "max";
export const OPENAI_IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "high") as ImageQuality;
// 11/2: 만들 때 고르는 그리기 수준. 정밀은 지금까지 쓴 품질(OPENAI_IMAGE_QUALITY), 표준은 한 단계 낮춰 싸고 빠르다.
export const DRAW_QUALITY: Record<"standard" | "fine", ImageQuality> = { standard: "medium", fine: OPENAI_IMAGE_QUALITY };
// 화면 2 견본 품질. 세 장을 그리는 동안 기다리므로 한 단계 낮춰 빨리 그린다.
export const SAMPLE_QUALITY = (process.env.OPENAI_SAMPLE_QUALITY || "medium") as ImageQuality;

const VISION = process.env.CLAUDE_VISION_MODEL || "claude-opus-5-5";

export const MODELS = {
  interpret: VISION, // 로고 해석
  check: VISION, // 참고 글자 검사
  // 이미지 그리기. 앞 모델이 붐비면 다음 모델로 넘어간다(쉼표로 여러 개). 나머지 글자(rest.ts)가 쓴다.
  // 11/5 사용자 결정: 나머지 2,300자도 sunburst로 끝까지 그린다(30자와 스타일이 이어지게). 나머지 글자에서의 비용·속도는 아직 재지 않았다.
  image: chain(process.env.OPENAI_IMAGE_MODEL, ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]),
  // 가게 이름 견본과 참고 글자 30자. 같은 입력 3가지 시험에서 sunburst가 flare가 못 낸 가로세로 대비·획 끝 변화를 냈고 medium 품질 한 번 비용은 비슷했다(약 $0.04~0.06).
  refImage: chain(process.env.OPENAI_REF_IMAGE_MODEL, ["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]),
  ocr: VISION, // 조합 결과 판독
};

const MODEL_ROLES = {
  interpret: "Claude 로고 해석",
  check: "Claude 참고 글자 검사",
  image: "GPT Image 이미지 생성",
  ocr: "Claude OCR 판독",
};

/** 제작 기록에 남길 모델 이름 */
export function modelLabel(role: keyof typeof MODEL_ROLES, model: string): string {
  return `${MODEL_ROLES[role]} (${model})`;
}

export function requireKey(name: "OPENAI_API_KEY" | "ANTHROPIC_API_KEY"): string {
  const value = process.env[name];
  if (!value) throw new RouteError(500, `${name}가 web/.env.local에 없어요. 키를 넣고 개발 서버를 다시 켜 주세요.`);
  return value;
}

/** 라우트 핸들러의 오류를 { error } JSON으로 바꾼다. 화면은 이 메시지를 그대로 보여 준다. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const status = err instanceof RouteError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    if (status >= 500) console.error("[logoche]", err);
    return Response.json({ error: message }, { status });
  }
}
