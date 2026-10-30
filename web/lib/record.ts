import { RECORD_CATEGORIES, RIGHTS } from "./constants";
import type { RecordEvent } from "./types";

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 제작 기록 파일 내용. 항목은 지식재산처 가이드 권장 항목 + 이용권 순서다. */
export function buildRecordText(fontName: string, events: RecordEvent[]): string {
  const lines = [`# ${fontName} 제작 기록`, ""];
  for (const { key, label } of RECORD_CATEGORIES) {
    const items = events.filter((e) => e.category === key);
    lines.push(`## ${label}`);
    if (items.length === 0) lines.push("- (기록 없음)");
    for (const e of items) lines.push(`- [${formatTime(e.at)}] ${e.text}`);
    lines.push("");
  }
  lines.push("## 이용권");
  lines.push(`- 권리 표현: ${RIGHTS.expression}`);
  for (const item of RIGHTS.allowed) lines.push(`- 할 수 있어요: ${item}`);
  for (const item of RIGHTS.notAllowed) lines.push(`- 할 수 없어요: ${item}`);
  lines.push("");
  lines.push(`AI 생성 표시: ${RIGHTS.aiNotice}`);
  return lines.join("\n");
}
