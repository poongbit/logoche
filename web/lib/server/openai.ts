// 이미지 생성: GPT Image(OpenAI 이미지 편집 API)가 참고 글자표를 그린다(10/27 결정: Gemini는 쓰지 않는다).
// 참고 이미지(로고·기준 글자표·처음 그린 글자표)는 순서대로 여러 장 넣고, 글 조각은 한 프롬프트로 합친다.
// 프롬프트의 "첫 번째 이미지는 …" 순서가 넣는 순서와 같다.

import OpenAI, { toFile } from "openai";
import { OPENAI_IMAGE_QUALITY, RouteError, requireKey, type ImageQuality } from "./env";
import { decodeDataUrl, type Part } from "./parts";

let client: OpenAI | null = null;

function openai(): OpenAI {
  // 높은 품질은 한 장에 1분을 넘길 수 있다. 재시도는 한 번만 한다(붐빌 때 몇 분씩 붙잡지 않게).
  client ??= new OpenAI({ apiKey: requireKey("OPENAI_API_KEY"), timeout: 300_000, maxRetries: 1 });
  return client;
}

// GPT Image 크기: 16의 배수, 가로:세로 1:3~3:1. 2560x1440(약 369만 픽셀)을 넘으면 실험 해상도라 약 236만 픽셀로 맞췄다.
const SIZES: Record<string, string> = {
  "1:1": "1536x1536",
  "4:3": "1792x1344",
  "3:2": "1872x1248",
  "16:9": "2048x1152",
  "21:9": "2352x1008",
};

const OVERLOADED = new Set([429, 500, 502, 503, 504]);

function firstLine(message: string): string {
  const text = message.replace(/^\d{3} /, "").replace(/\s+/g, " ");
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** 이미지를 하나 그려 data URL로 돌려준다. 모델 목록을 앞에서부터 시도하고, 붐비는 모델은 건너뛴다. */
export async function generateImage(
  models: string[],
  parts: Part[],
  aspectRatio: string,
  quality: ImageQuality = OPENAI_IMAGE_QUALITY,
): Promise<{ value: string; model: string }> {
  const size = SIZES[aspectRatio];
  if (!size) throw new RouteError(500, `GPT Image가 받지 않는 가로:세로예요: ${aspectRatio}`);
  const prompt = parts.flatMap((p) => ("text" in p ? [p.text] : [])).join("\n");
  const images = await Promise.all(
    parts
      .flatMap((p) => ("image" in p ? [p.image] : []))
      .map((url, i) => {
        const { mimeType, data } = decodeDataUrl(url);
        return toFile(Buffer.from(data, "base64"), `ref-${i + 1}.${mimeType.split("/")[1] ?? "png"}`, { type: mimeType });
      }),
  );
  for (const model of models) {
    try {
      const res = await openai().images.edit({
        model,
        image: images,
        prompt,
        size,
        quality,
        background: "opaque",
        output_format: "png",
      });
      const data = res.data?.[0]?.b64_json;
      if (!data) throw new RouteError(502, "이미지 API가 그림을 돌려주지 않았어요");
      // 이미지 값은 토큰으로 매긴다. 비용 확인용.
      if (res.usage) console.log(`[logoche] GPT Image ${model} 토큰: 입력 ${res.usage.input_tokens}, 출력 ${res.usage.output_tokens}`);
      return { value: `data:image/png;base64,${data}`, model };
    } catch (err) {
      if (err instanceof OpenAI.APIConnectionError) {
        console.warn(`[logoche] OpenAI ${model} 연결 실패·시간 초과, 다음 모델로 넘어감`);
        continue;
      }
      if (!(err instanceof OpenAI.APIError)) throw err;
      const status = err.status ?? 0;
      if (status === 429 && err.code === "insufficient_quota") {
        throw new RouteError(402, "OpenAI 크레딧이 없어요. platform.openai.com의 결제(Billing)를 확인해 주세요.");
      }
      if (status === 401) throw new RouteError(500, "OPENAI_API_KEY가 맞지 않아요. web/.env.local의 키를 확인해 주세요.");
      if (status === 403 && /verif/i.test(err.message)) {
        throw new RouteError(403, `${model}은(는) OpenAI 조직 인증이 필요해요. platform.openai.com 설정의 조직 인증을 확인해 주세요.`);
      }
      if (!OVERLOADED.has(status)) throw new RouteError(502, `OpenAI ${status} (${model}): ${firstLine(err.message)}`);
      console.warn(`[logoche] OpenAI ${model} ${status}, 다음 모델로 넘어감`);
    }
  }
  throw new RouteError(503, `OpenAI가 응답하지 않아요 (${models.join(", ")}). 잠시 뒤 다시 시도해 주세요.`);
}
