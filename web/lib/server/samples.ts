// 화면 2 표현 방식 견본(10/29 사용자 제안): AI가 제안한 표현 방식마다 가게 이름을 그 방식으로 한 장 그려 보여 준다.
// 고른 견본은 화면 3 초안을 그릴 때 참고 이미지로 붙는다(glyphs.ts). 그림은 web/.data/samples/<id>.png에 둔다.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { StyleSample, StyleSampleRequest } from "@/lib/types";
import { RouteError } from "./env";
import { drawStyleSample } from "./glyphs";

const DATA_DIR = path.join(process.cwd(), ".data", "samples");
const ID = /^[0-9a-f-]{36}$/;

function sampleFile(sampleId: string): string {
  if (!ID.test(sampleId)) throw new RouteError(404, "견본을 찾을 수 없어요");
  return path.join(DATA_DIR, `${sampleId}.png`);
}

export async function createSample(req: StyleSampleRequest): Promise<StyleSample> {
  const { image, model } = await drawStyleSample(req);
  const sampleId = crypto.randomUUID();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(sampleFile(sampleId), Buffer.from(image.slice(image.indexOf(",") + 1), "base64"));
  return { sampleId, imageUrl: `/api/style/samples/${sampleId}`, model };
}

export async function readSampleFile(sampleId: string): Promise<Buffer> {
  try {
    return await fs.readFile(sampleFile(sampleId));
  } catch {
    throw new RouteError(404, "견본을 찾을 수 없어요");
  }
}

/** 견본 그림(data URL). 이미지 API의 참고 이미지로 쓴다. */
export async function readSample(sampleId: string): Promise<string> {
  return `data:image/png;base64,${(await readSampleFile(sampleId)).toString("base64")}`;
}
