// 호출 기록과 비용 상한(11/3 전체 실측용). LOGOCHE_LEDGER에 파일 경로를 주면 AI 호출마다 한 줄(JSON)씩 남긴다.
// LOGOCHE_COST_CAP(달러)을 주면 이미지 호출의 어림 비용이 이 값에 닿는 순간부터 이미지 호출을 막는다(Claude 호출은 막지 않는다).
// 단가는 공개 단가표가 아니라 10/30 시험값(입력 약 7,000·출력 약 2,200 토큰 = 장당 약 0.12달러)에 맞춰 입력:출력 1:4로 역산한 어림이다.
// 실제 청구액은 각 콘솔에서 확인한다.

import fs from "node:fs";
import { RouteError } from "./env";

const IMAGE_IN_PER_TOKEN = 0.0000076;
const IMAGE_OUT_PER_TOKEN = 0.0000304;

const LEDGER = process.env.LOGOCHE_LEDGER;
const CAP = Number(process.env.LOGOCHE_COST_CAP ?? 0);

const g = globalThis as unknown as { __logocheSpent?: { image: number; calls: number } };
// 서버를 다시 켜도 이어지게, 기록 파일에 이미 쌓인 이미지 호출 합계로 시작한다
function fromLedger(): { image: number; calls: number } {
  const total = { image: 0, calls: 0 };
  if (!LEDGER) return total;
  try {
    for (const line of fs.readFileSync(LEDGER, "utf-8").split("\n")) {
      if (!line) continue;
      const row = JSON.parse(line);
      if (row.kind === "image") {
        total.image += row.estUsd;
        total.calls++;
      }
    }
  } catch {}
  return total;
}
const spent = (g.__logocheSpent ??= fromLedger());

export function ledger(kind: string, data: Record<string, unknown>) {
  if (!LEDGER) return;
  try {
    fs.appendFileSync(LEDGER, JSON.stringify({ t: Date.now(), kind, ...data }) + "\n");
  } catch {}
}

export function imageEstimate(input: number, output: number): number {
  return input * IMAGE_IN_PER_TOKEN + output * IMAGE_OUT_PER_TOKEN;
}

/** 이미지 호출 직전: 상한에 닿았으면 던진다 */
export function guardImageCall() {
  if (CAP > 0 && spent.image >= CAP) {
    ledger("cap", { spent: spent.image });
    throw new RouteError(402, `비용 상한(${CAP}달러, 어림)에 닿아 이미지 호출을 멈췄어요`);
  }
}

export function recordImage(model: string, quality: string, size: string, input: number, output: number, ms: number) {
  const cost = imageEstimate(input, output);
  spent.image += cost;
  spent.calls++;
  ledger("image", { model, quality, size, input, output, ms, estUsd: cost, totalEstUsd: spent.image });
}

export function recordClaude(model: string, input: number, output: number, cacheRead: number, cacheWrite: number, ms: number) {
  ledger("claude", { model, input, output, cacheRead, cacheWrite, ms });
}
