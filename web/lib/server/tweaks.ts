// 11/3 다듬기: 사용자가 글자 하나(또는 전체)에 더한 조정을 글자 그림 작업(glyphJobId)마다 둔다.
// 표는 web/.data/glyphs/<작업 id>/tweaks.json. 모든 빌드·미리보기·글자 바꿔 끼우기 요청에 실어 보내야 한다.
// 실어 보내지 않으면 나중에 폰트를 통째로 다시 만들 때(이어서 만들기·빠진 글자 채우기) 조정이 말없이 사라진다.
// 표의 "*"는 전체 글자에 거는 조정이고, 글자별 조정은 그 글자에서 "*"를 덮어쓴다(더하지 않는다. 엔진 contour.ALL_GLYPHS).
// 글자마다 바꾼 기록(최대 HISTORY_MAX개)을 함께 둔다. 되돌리기와 제작 기록의 근거다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { WEIGHT_CAP } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { CUT_RANGE, GROUP_KEY, effectiveParts, NO_PART, PART_KEYS, PART_LABEL, PART_RANGES, NO_TWEAK, TWEAK_RANGES, cleanTweak, isNoTweak } from "@/lib/tweak";
import type { CutKey, EditTweak, GlyphTweak, PartKey, PartValues, StoredTweak, TweakTable } from "@/lib/types";
import { RouteError } from "./env";

const DATA_DIR = path.join(process.cwd(), ".data", "glyphs");
const UUID = /^[0-9a-f-]{36}$/;
export const ALL_GLYPHS = "*";
export const HISTORY_MAX = 100;
const WEIGHT_FLOOR = 100; // 굵기 축 아래쪽 한도

export { NO_TWEAK, TWEAK_RANGES, isNoTweak };

export interface TweakHistoryEntry {
  at: string;
  tweak: StoredTweak | null; // null이면 조정을 지운 것
  note: string;
}

interface Stored {
  table: TweakTable;
  history: Record<string, TweakHistoryEntry[]>;
}

const file = (jobId: string) => {
  if (!UUID.test(jobId)) throw new RouteError(404, "작업을 찾을 수 없어요");
  return path.join(DATA_DIR, jobId, "tweaks.json");
};

async function read(jobId: string): Promise<Stored> {
  try {
    const raw = JSON.parse(await fs.readFile(file(jobId), "utf-8")) as Partial<Stored>;
    return { table: raw.table ?? {}, history: raw.history ?? {} };
  } catch {
    return { table: {}, history: {} };
  }
}

async function write(jobId: string, stored: Stored) {
  await fs.mkdir(path.dirname(file(jobId)), { recursive: true });
  const tmp = `${file(jobId)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(stored));
  await fs.rename(tmp, file(jobId)); // 쓰다 멈춰도 표가 깨지지 않게
}

/** 한글 완성형 한 글자, "*"(전체), 또는 같은 자모 열쇠("cho:ㅂ" · "jung:ㅜ" · "jong:ㅇ") */
export function checkTweakKey(char: string): string {
  if (char !== ALL_GLYPHS && !GROUP_KEY.test(char) && ([...char].length !== 1 || !KSX1001_HANGUL.has(char))) {
    throw new RouteError(400, "한글 완성형 2,350자 가운데 한 글자이거나 전체, 같은 자모여야 해요");
  }
  return char;
}

/** 값을 슬라이더 범위로 맞춘다. 굵기는 지금 굵기(baseWeight) + 조정이 굵기 한도 안에 들게 한다(WEIGHT_CAP 넘으면 폰트가 뭉개진다). */
export function clampTweak(input: unknown, baseWeight: number): StoredTweak {
  if (typeof input !== "object" || input === null) throw new RouteError(400, "조정 값을 보내 주세요");
  const out = { ...NO_TWEAK };
  for (const key of Object.keys(NO_TWEAK) as (keyof GlyphTweak)[]) {
    const v = (input as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) throw new RouteError(400, `조정 값이 숫자가 아니에요: ${key}`);
    const [lo, hi] = TWEAK_RANGES[key];
    out[key] = Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10;
  }
  out.pull = Math.min(WEIGHT_CAP - baseWeight, Math.max(WEIGHT_FLOOR - baseWeight, out.pull));
  const rel = (input as { rel?: unknown }).rel;
  const stored: StoredTweak = cleanTweak({ ...out, ...clampParts(input as Record<string, unknown>) }) as StoredTweak;
  if (typeof rel === "string" && [...rel].length === 1 && KSX1001_HANGUL.has(rel) && out.pull !== 0) stored.rel = rel; // 기준 글자(전체 조정의 굵기 배율을 잴 글자)
  return stored;
}

/** 부분 조정과 경계 이동(11/11)을 범위에 맞춘다. 모르는 키·숫자가 아닌 값은 버린다. */
function clampParts(input: Record<string, unknown>): Pick<EditTweak, "parts" | "cuts"> {
  const out: Pick<EditTweak, "parts" | "cuts"> = {};
  const rawParts = input.parts;
  if (typeof rawParts === "object" && rawParts !== null) {
    const parts: Partial<Record<PartKey, PartValues>> = {};
    for (const k of PART_KEYS) {
      const raw = (rawParts as Record<string, unknown>)[k];
      if (typeof raw !== "object" || raw === null) continue;
      const p = { ...NO_PART };
      for (const f of Object.keys(NO_PART) as (keyof PartValues)[]) {
        const v = (raw as Record<string, unknown>)[f];
        if (typeof v === "number" && Number.isFinite(v)) p[f] = Math.round(Math.min(PART_RANGES[f][1], Math.max(PART_RANGES[f][0], v)) * 10) / 10;
      }
      parts[k] = p;
    }
    out.parts = parts;
  }
  const rawCuts = input.cuts;
  if (typeof rawCuts === "object" && rawCuts !== null) {
    const cuts: Partial<Record<CutKey, number>> = {};
    for (const k of ["x", "y", "j"] as CutKey[]) {
      const v = (rawCuts as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) cuts[k] = Math.round(Math.min(CUT_RANGE[1], Math.max(CUT_RANGE[0], v)));
    }
    out.cuts = cuts;
  }
  return out;
}

export async function readTweakTable(jobId: string): Promise<TweakTable> {
  return (await read(jobId)).table;
}

export async function readTweakHistory(jobId: string, char: string): Promise<TweakHistoryEntry[]> {
  return (await read(jobId)).history[checkTweakKey(char)] ?? [];
}

/** 이 글자에 실제로 걸리는 조정: 글자별 조정이 있으면 그것, 없으면 전체 조정 */
export function effectiveTweak(table: TweakTable, char: string): StoredTweak | null {
  const base = table[char] ?? table[ALL_GLYPHS] ?? null;
  if (!KSX1001_HANGUL.has(char)) return base;
  // 11/12 같은 초성·중성·종성 모든 글자에 건 조정을 이 글자의 조정 위에 얹는다(엔진 drawn.with_groups와 같다)
  const parts = effectiveParts(table, char);
  if (Object.keys(parts).length === 0) return base;
  return { ...(base ?? NO_TWEAK), parts };
}

/** 조정을 저장한다(tweak이 null이거나 모두 기본값이면 지운다). 바꾼 표를 돌려준다. */
export async function writeTweak(jobId: string, char: string, tweak: StoredTweak | null, note: string): Promise<{ table: TweakTable; previous: StoredTweak | null }> {
  const key = checkTweakKey(char);
  const stored = await read(jobId);
  const previous = stored.table[key] ?? null;
  const next = tweak && !isNoTweak(tweak) ? tweak : null;
  if (next) stored.table[key] = next;
  else delete stored.table[key];
  const list = stored.history[key] ?? [];
  list.push({ at: new Date().toISOString(), tweak: next, note });
  stored.history[key] = list.slice(-HISTORY_MAX);
  await write(jobId, stored);
  return { table: stored.table, previous };
}

const LABELS: Record<keyof GlyphTweak, { name: string; unit: string; signed: boolean }> = {
  pull: { name: "굵기", unit: "", signed: true },
  slant: { name: "기울기", unit: "°", signed: true },
  width: { name: "가로", unit: "%", signed: false },
  height: { name: "세로", unit: "%", signed: false },
  scale: { name: "크기", unit: "%", signed: false },
  tx: { name: "가로 이동", unit: "", signed: true },
  ty: { name: "세로 이동", unit: "", signed: true },
};

/** 제작 기록에 남길 한 줄: 바뀐 항목만 "기울기 +4° → +8°" 식으로 */
export function describeTweak(char: string, before: StoredTweak | null, after: StoredTweak | null, note: string): string {
  const group = GROUP_KEY.exec(char);
  const who = char === ALL_GLYPHS ? "전체 글자" : group ? `${{ cho: "초성", jung: "중성", jong: "종성" }[group[1] as "cho" | "jung" | "jong"]} ${group[2]}을(를) 가진 모든 글자` : `'${char}'`;
  if (!after) return `${who} 조정을 지워 AI가 정한 값으로 되돌림`;
  const from = before ?? NO_TWEAK;
  const fmt = (k: keyof GlyphTweak, v: number) => `${LABELS[k].signed && v > 0 ? "+" : ""}${v}${LABELS[k].unit}`;
  const changes = (Object.keys(NO_TWEAK) as (keyof GlyphTweak)[]).filter((k) => after[k] !== from[k]).map((k) => `${LABELS[k].name} ${fmt(k, from[k])} → ${fmt(k, after[k])}`);
  const partChanges = PART_KEYS.filter((k) => JSON.stringify(after.parts?.[k] ?? null) !== JSON.stringify(before?.parts?.[k] ?? null)).map((k) => {
    const p = after.parts?.[k];
    if (!p) return `${PART_LABEL[k]} 원래대로`;
    const bits = (Object.keys(NO_PART) as (keyof PartValues)[]).filter((f) => p[f] !== NO_PART[f]).map((f) => `${{ width: "가로", height: "세로", scale: "크기", tx: "가로 이동", ty: "세로 이동" }[f]} ${p[f]}${f === "tx" || f === "ty" ? "" : "%"}`);
    return `${PART_LABEL[k]} ${bits.join(" ")}`;
  });
  if (partChanges.length) changes.push(...partChanges);
  const rel = after.rel ? ` · 굵기는 '${after.rel}'에서 달라진 획 두께의 비율로 건다` : "";
  return `${who} 조정: ${changes.join(", ") || "변경 없음"}${rel}${note ? ` (${note})` : ""}`;
}
