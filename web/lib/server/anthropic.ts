// Claude 호출 공통: 클라이언트, 오류 바꾸기, 이미지 보기(로고 해석·참고 글자 검사·OCR).
// 이미지를 보는 일은 Claude가 한다(10/27 결정: Gemini는 쓰지 않는다).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { RouteError, requireKey } from "./env";
import { decodeDataUrl, type Part } from "./parts";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  client ??= new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY") });
  return client;
}

/** SDK 오류를 화면에 보일 RouteError로 바꾼다. */
export function claudeError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError) return new RouteError(500, "ANTHROPIC_API_KEY가 맞지 않아요");
  if (err instanceof Anthropic.RateLimitError) return new RouteError(503, "Claude 사용량 한도에 걸렸어요. 잠시 뒤 다시 보내 주세요");
  if (err instanceof Anthropic.APIError) return new RouteError(502, `Claude ${err.status ?? ""}: ${err.message}`);
  return err;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function block(part: Part): BetaContentBlockParam {
  if ("text" in part) return { type: "text", text: part.text };
  const { mimeType, data } = decodeDataUrl(part.image);
  if (!IMAGE_TYPES.includes(mimeType as ImageType)) throw new RouteError(400, `Claude가 읽지 못하는 그림 형식이에요: ${mimeType}`);
  return { type: "image", source: { type: "base64", media_type: mimeType as ImageType, data } };
}

/** 그림을 보고 스키마에 맞는 JSON을 받는다. 그림을 글보다 앞에 둔다. model은 실제로 답한 모델이다. */
export async function generateJson<S extends z.ZodType>(
  model: string,
  parts: Part[],
  schema: S,
  effort: "low" | "medium" | "high",
): Promise<{ value: z.infer<S>; model: string }> {
  const ordered = [...parts.filter((p) => "image" in p), ...parts.filter((p) => "text" in p)];
  let response;
  try {
    response = await claude().beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: betaZodOutputFormat(schema), effort },
      messages: [{ role: "user", content: ordered.map(block) }],
    });
  } catch (err) {
    throw claudeError(err);
  }
  if (response.stop_reason === "refusal") throw new RouteError(502, "Claude가 이 그림을 판단하지 않았어요(거절)");
  if (!response.parsed_output) throw new RouteError(502, `Claude 응답이 약속한 형식이 아니에요 (${response.stop_reason})`);
  return { value: response.parsed_output as z.infer<S>, model: response.model };
}
