// 화면 4 나머지 글자 그리기(10/30 결정: MX-Font를 빼고 이미지 모델이 2,350자를 다 그린다).
//
// 화면 3에서 확정한 참고 글자 글자표(sheet.png)를 스타일 참고로 붙여, 참고 글자 밖의 글자를 30자씩 글자표로 그린다(restSheetParts).
// 엔진이 칸별로 잘라 폰트 틀에 자리를 맞추고(획 두께는 참고 글자에 맞춤), Claude가 장마다 검사한다.
// 떨어진 글자는 한 자씩이 아니라 떨어진 글자끼리 모아 글자표로 다시 그린다(10/30 시험: 모양이 틀리는 건 주로 한 자씩 다시 그릴 때였다).
// 그래도 떨어진 글자는 서체에서 빠지고, 화면 4 글자 고치기로 그려 넣거나 다시 만들 때 또 그린다.
// 순서: 가게 이름 → 견본 글 → 자주 쓰는 글자(hangulOrder.ts)를 짜임별로 묶어서(11/2). GLYPH_REST_LIMIT로 서체 글자 수를 줄여 싸게 시험할 수 있다.
// 11/2: 숫자·문장부호 30자(EXTRA_CHARS)도 그린다. 한글과 섞지 않고 따로 한 장에 그린다(지시문·검사가 다르다).
// 11/2 스타일 검사(품질 개선 2-1): 읽히기는 하지만 획 두께·크기가 혼자 튀는 글자(엔진 styleProblem)는 그 그림을 일단 남기고 다음 바퀴에 다시 그린다.
// 다시 그린 쪽이 기준에 더 가까울 때만 바꾼다. 마지막 바퀴까지 튀면 남겨 둔 그림 중 나은 것을 쓴다(빠진 글자보다 낫다).
// 이렇게 다시 그리는 비용은 사용자에게 받지 않는다(11/2 사용자 결정: 우리가 잘못 그린 것). 몇 자를 다시 그렸는지 rest/index.json에 남긴다.
// 11/2 다시 볼 글자(품질 개선 2-3): 다 만든 뒤 기준에서 가장 많이 벗어난 글자를 스튜디오에 보여 주고(restRecheck), 사용자가 고른 글자를 다시 그린다(req.redraw).
// 다시 그린 그림이 검사와 스타일 검사를 통과할 때만 바꾸고, 아니면 지금 그림을 그대로 둔다.
// 그림은 web/.data/glyphs/<참고 글자 작업>/rest/<코드포인트 16진수>.png(엔진이 자리 맞춘 틀 그림), 상태는 rest/index.json.
// 같은 작업으로 다시 만들면 그린 글자는 그대로 쓰고 못 그린 글자만 다시 그린다. 화면 3에서 참고 글자를 다시 그려도 그린 글자는 남는다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { EXTRA_CHARS, FREQUENT_CHARS, PANGRAM } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { HANGUL_BY_FREQUENCY } from "@/lib/hangulOrder";
import type { StartBuildJobRequest } from "@/lib/types";
import { engine, type EngineRef } from "./engine";
import { MODELS, RouteError, modelLabel } from "./env";
import { listEdits } from "./edits";
import { checkSheet, isFatal, jobContext, jobDir, limiter, loadJob, readDataUrl, readyRefs, restSheetParts, type Context, type JobState } from "./glyphs";
import { generateImage } from "./openai";
import { ledger } from "./usage";

const SHEET_SIZE = 30;
const REDRAW_ROUNDS = 2; // 떨어진 글자를 글자표로 다시 그리는 횟수(한 번 만들 때마다)
const REST_LIMIT = Math.min(KSX1001_HANGUL.size, Number(process.env.GLYPH_REST_LIMIT ?? KSX1001_HANGUL.size));
// 동시에 그리는 장 수. OpenAI 한도에 걸리면(429) 그 장은 떨어진 글자로 돌아가 다음 바퀴에 다시 그린다.
const sheetLimit = limiter(Number(process.env.GLYPH_SHEET_CONCURRENCY ?? 8));
const SHEET_SECONDS = 35; // 한 장 그리기·자르기·검사 어림(10/30 시험 21~29초 + 검사). 실제로 잰 값으로 바꿔 간다
const RECHECK_COUNT = 30; // 다시 볼 글자 최대 수(한 장)
const RECHECK_MIN = Math.log(1.05); // 기준에서 5% 넘게 벗어난 글자만 다시 볼 글자로 보인다

interface RestIndex {
  drawn: Record<string, number>; // 그린 글자 → 몇 번째 장에서
  failed: Record<string, string>; // 끝내 떨어진 글자 → 마지막 이유
  sheets: number;
  off?: Record<string, number>; // 남긴 그림이 기준(획 두께·크기 1)에서 벗어난 정도(로그 값). 다시 그린 그림과 견줄 때 쓴다
  styleRedrawn?: number; // 스타일 검사로 다시 그린 글자 수(누적)
}

/** 진행 중이거나 끝난 그리기(참고 글자 작업마다 하나) */
export interface RestRun {
  total: number; // 이번에 그리기로 한 글자 수
  done: number;
  failed: number; // 끝내 떨어진 글자 수(끝난 뒤)
  startedAt: number;
  finishedAt: number | null;
  sheetSeconds: number[];
  error: string | null;
  aborted: boolean; // 사용자가 중단했다(11/4). 아직 시작하지 않은 장은 그리지 않는다. 이미 그리는 중인 장은 끝까지 간다.
  promise: Promise<void>;
}

/** 사용자가 중단해서 그리지 않은 장. 떨어진 글자로 세지 않는다(다음에 이어서 그린다). */
class Aborted extends Error {}

const globalRest = globalThis as unknown as { __logocheRest?: Map<string, RestRun> };
const runs: Map<string, RestRun> = (globalRest.__logocheRest ??= new Map());

const restDir = (jobId: string) => path.join(jobDir(jobId), "rest");
const restFile = (jobId: string, char: string) => path.join(restDir(jobId), `${char.codePointAt(0)!.toString(16)}.png`);

async function readIndex(jobId: string): Promise<RestIndex> {
  try {
    return JSON.parse(await fs.readFile(path.join(restDir(jobId), "index.json"), "utf-8"));
  } catch {
    return { drawn: {}, failed: {}, sheets: 0 };
  }
}

/** 그린 나머지 글자(엔진에 보낼 형식). chars를 주면 그 글자만 */
export async function readRestGlyphs(jobId: string, chars?: Set<string>): Promise<EngineRef[]> {
  const index = await readIndex(jobId);
  const wanted = Object.keys(index.drawn).filter((c) => !chars || chars.has(c));
  const glyphs = await Promise.all(
    wanted.map(async (char) => {
      try {
        return { char, image: `data:image/png;base64,${(await fs.readFile(restFile(jobId, char))).toString("base64")}` };
      } catch {
        return null;
      }
    }),
  );
  return glyphs.filter((g): g is EngineRef => g !== null);
}

// 짜임 묶음(11/2 품질 개선 1-1): 모음 방향(세로·가로·섞임) × 받침(없음·홑·겹). 생김새가 같은 글자끼리 한 장에 그려 비례가 고르게 나오게 한다.
const VERTICAL = new Set([0, 1, 2, 3, 4, 5, 6, 7, 20]); // ㅏㅐㅑㅒㅓㅔㅕㅖㅣ (중성 순서)
const HORIZONTAL = new Set([8, 12, 13, 17, 18]); // ㅗㅛㅜㅠㅡ
const DOUBLE_FINAL = new Set([3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18]); // ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ (종성 순서)
function shapeGroup(c: string): number {
  const k = c.charCodeAt(0) - 0xac00;
  const jung = Math.floor((k % 588) / 28);
  const jong = k % 28;
  const vowel = VERTICAL.has(jung) ? 0 : HORIZONTAL.has(jung) ? 1 : 2;
  const final = jong === 0 ? 0 : DOUBLE_FINAL.has(jong) ? 2 : 1;
  return final * 3 + vowel;
}
/** 한글을 짜임 묶음 순서로(같은 묶음 안에서는 원래 순서 = 자주 쓰는 순서). 숫자·문장부호는 뒤에 그대로 */
const byShape = (chars: string[]) => [
  ...chars.filter((c) => KSX1001_HANGUL.has(c)).sort((a, b) => shapeGroup(a) - shapeGroup(b)),
  ...chars.filter((c) => !KSX1001_HANGUL.has(c)),
];

/** 그릴 글자: 가게 이름 → 견본 글 → 짜임별로 묶은 자주 쓰는 글자, 그리고 숫자·문장부호(11/2).
 *  글자 수를 줄여 시험할 때(GLYPH_REST_LIMIT)도 자주 쓰는 순서로 먼저 고른 뒤 묶는다. 가게 이름·견본 글은 미리보기가 빨리 차게 맨 앞에 둔다.
 *  참고 글자로 이미 있는 글자, 그린 글자, 화면 4에서 직접 그려 넣은 글자는 뺀다. */
function plan(job: JobState, index: RestIndex, storeName: string, edited: Set<string>): string[] {
  const refs = new Set(job.items.filter((i) => i.status === "ok").map((i) => i.char));
  const room = Math.max(0, REST_LIMIT - refs.size);
  const order = [...new Set([...storeName, ...PANGRAM, ...FREQUENT_CHARS, ...HANGUL_BY_FREQUENCY])].filter(
    (c) => KSX1001_HANGUL.has(c) && !refs.has(c),
  );
  const chosen = order.slice(0, room);
  const first = new Set([...storeName, ...PANGRAM]);
  return [...chosen.filter((c) => first.has(c)), ...byShape(chosen.filter((c) => !first.has(c))), ...EXTRA_CHARS].filter(
    (c) => !(c in index.drawn) && !edited.has(c),
  );
}

/** 그린 글자(나머지 글자) 목록. 그린 차례(장 번호)가 늦은 것부터 */
export async function restDrawnChars(jobId: string): Promise<string[]> {
  const index = await readIndex(jobId);
  return Object.entries(index.drawn)
    .sort((a, b) => b[1] - a[1])
    .map(([char]) => char);
}

export const restGlyphFile = restFile;

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
/** 글자표로 나눈다. 숫자·문장부호는 한글과 섞지 않고 따로 그린다(지시문·검사가 다르다). */
const sheetsOf = (chars: string[]) => [
  ...chunk(chars.filter((c) => KSX1001_HANGUL.has(c)), SHEET_SIZE),
  ...chunk(chars.filter((c) => !KSX1001_HANGUL.has(c)), SHEET_SIZE),
];

/** 기준(획 두께·크기 1)에서 벗어난 정도. 둘 중 더 벗어난 쪽 */
const offOf = (style: { thickness: number; size: number } | null | undefined) =>
  style ? Math.max(Math.abs(Math.log(style.thickness)), Math.abs(Math.log(style.size))) : 0;

/** 한 장을 그려 자르고 검사한다. 떨어진 글자와 이유를 돌려준다(스타일 검사로 다시 그릴 글자도 넣는다). 다시 해도 소용없는 오류는 던진다.
 *  last: 마지막 바퀴면 스타일 검사로는 더 다시 그리지 않는다 */
async function drawSheet(
  job: JobState,
  ctx: Context,
  chars: string[],
  approved: string | null,
  refs: EngineRef[],
  index: RestIndex,
  run: RestRun,
  save: () => Promise<void>,
  last: boolean,
  force: Set<string>,
): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  const startedAt = Date.now();
  // 실패 원인별 글자 수(11/3 추가): 글자표 그리기 실패(429 등) / 엔진이 칸을 못 씀 / 검사 탈락 / 스타일 재그리기
  const cause = { draw: 0, engine: 0, check: 0, style: 0 };
  try {
    const sheet = await engine.glyphSheet(chars.join(""));
    const { value: image, model } = await sheetLimit(() => {
      if (run.aborted) throw new Aborted(); // 순서를 기다리는 동안 중단됐으면 이미지를 부르지 않는다
      return generateImage(MODELS.image, restSheetParts(ctx, sheet, approved), sheet.aspectRatio, ctx.quality);
    });
    job.models.add(modelLabel("image", model));
    const sheetNo = ++index.sheets;
    const placed = await engine.placeGlyphs(sheet.chars, image, refs);
    // 검사 호출만 실패하면 엔진이 문제를 찾지 못한 칸은 통과로 둔다(검사 오류로 다시 그리기가 몰리지 않게).
    const verdicts = await checkSheet(job, placed.contactSheet, [...sheet.chars]).catch((err) => {
      if (isFatal(err)) throw err;
      console.error("[logoche] 나머지 글자 검사 실패", err);
      return null;
    });
    await fs.mkdir(restDir(job.id), { recursive: true });
    index.off ??= {};
    await Promise.all(
      placed.cells.map(async (cell, i) => {
        const verdict = verdicts ? (verdicts.get(i + 1) ?? { ok: false, problem: "검사 결과 없음" }) : { ok: true, problem: null };
        if (!cell.image || cell.problem || !verdict.ok) {
          failed.set(cell.char, cell.problem ?? verdict.problem ?? "검사 실패");
          if (cell.image && !cell.problem) {
            cause.check++;
            // 검사에 떨어진 그림은 따로 남겨, 검사 오판인지 그림 문제인지 나중에 사람이 볼 수 있게 한다(11/3). 가장 최근 시도만 남는다.
            const dir = path.join(restDir(job.id), "rejected");
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(path.join(dir, path.basename(restFile(job.id, cell.char))), Buffer.from(cell.image.slice(cell.image.indexOf(",") + 1), "base64"));
          } else cause.engine++;
          return;
        }
        const off = offOf(cell.style);
        const had = cell.char in index.drawn;
        const forced = force.delete(cell.char); // 사용자가 고른 글자: 스타일 검사까지 통과하면 바꾼다
        // 스타일 검사로 다시 그린 글자는 기준에 더 가까울 때만 바꾼다
        if (forced ? !cell.styleProblem : !had || off < (index.off![cell.char] ?? 0)) {
          await fs.writeFile(restFile(job.id, cell.char), Buffer.from(cell.image.slice(cell.image.indexOf(",") + 1), "base64"));
          index.drawn[cell.char] = sheetNo;
          index.off![cell.char] = off;
          delete index.failed[cell.char];
        }
        if (!had || forced) run.done++;
        if (cell.styleProblem && !last && !had) {
          failed.set(cell.char, cell.styleProblem);
          cause.style++;
          index.styleRedrawn = (index.styleRedrawn ?? 0) + 1;
        }
      }),
    );
    run.sheetSeconds.push((Date.now() - startedAt) / 1000);
  } catch (err) {
    if (err instanceof Aborted) {
      for (const c of chars) failed.set(c, "중단"); // drawAll이 중단을 보고 이 글자들을 떨어진 글자로 적지 않는다
      return failed;
    }
    if (isFatal(err)) throw err;
    console.error("[logoche] 나머지 글자표 실패", err);
    for (const c of chars) failed.set(c, `글자표 그리기 실패: ${err instanceof Error ? err.message : String(err)}`);
    cause.draw = chars.length;
  }
  ledger("sheet", { chars: chars.length, failed: failed.size, ...cause, last });
  await save();
  return failed;
}

async function drawAll(job: JobState, ctx: Context, chars: string[], run: RestRun, force: Set<string>) {
  const index = await readIndex(job.id);
  const approved = await readDataUrl(job.id, "sheet.png");
  const refs = await readyRefs(job.id);
  let writing = Promise.resolve();
  // 장마다 상태를 남긴다(서버를 다시 켜도 그린 글자는 남는다). 쓰기는 차례로.
  const save = () =>
    (writing = writing.then(async () => {
      await fs.mkdir(restDir(job.id), { recursive: true });
      await fs.writeFile(path.join(restDir(job.id), "index.json"), JSON.stringify(index, null, 1));
    }));

  let todo = chars;
  let problems = new Map<string, string>();
  for (let round = 0; round <= REDRAW_ROUNDS && todo.length; round++) {
    // 다시 그리는 바퀴도 짜임별로 묶는다(첫 바퀴는 plan이 이미 묶었다)
    const sheets = sheetsOf(round === 0 ? todo : byShape(todo));
    const results = await Promise.all(sheets.map((s) => drawSheet(job, ctx, s, approved, refs, index, run, save, round === REDRAW_ROUNDS, force)));
    if (run.aborted) {
      await save();
      return; // 중단: 못 그린 글자는 떨어진 글자로 적지 않는다. 이어서 만들면 그때 그린다.
    }
    problems = new Map(results.flatMap((m) => [...m]));
    todo = [...problems.keys()];
    ledger("round", { round: round + 1, sheets: sheets.length, todo: todo.length, styleRedrawn: index.styleRedrawn ?? 0 });
    if (todo.length) console.log(`[logoche] 나머지 글자 ${round + 1}바퀴: ${todo.length}자 떨어짐 (${todo.slice(0, 20).join("")})`);
  }
  // 스타일 검사로 다시 그리다 만 글자는 남겨 둔 그림을 쓴다(떨어진 글자가 아니다)
  for (const char of problems.keys()) if (char in index.drawn) problems.delete(char);
  for (const [char, problem] of problems) index.failed[char] = problem;
  run.failed = problems.size;
  await save();
}

/** 다시 볼 글자: 기준(획 두께·크기)에서 가장 많이 벗어난 나머지 글자부터 */
export async function restRecheck(jobId: string): Promise<string[]> {
  const index = await readIndex(jobId);
  return Object.entries(index.off ?? {})
    .filter(([char, off]) => off > RECHECK_MIN && char in index.drawn)
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECHECK_COUNT)
    .map(([char]) => char);
}

/** 스타일 검사로 다시 그린 글자 수(제작 기록용) */
export async function restStyleRedrawn(jobId: string): Promise<number> {
  return (await readIndex(jobId)).styleRedrawn ?? 0;
}

/** 이 참고 글자 작업의 나머지 글자를 그린다. 이미 그리는 중이면 그 작업을 돌려준다. */
export async function ensureRest(jobId: string, req: StartBuildJobRequest): Promise<RestRun> {
  const running = runs.get(jobId);
  if (running && running.finishedAt === null) return running;
  const job = await loadJob(jobId);
  if (!job.finished) throw new RouteError(409, "참고 글자를 아직 그리는 중이에요");
  const index = await readIndex(jobId);
  const force = new Set((req.redraw ?? []).filter((c) => c in index.drawn).slice(0, RECHECK_COUNT));
  const chars = [...byShape([...force]), ...plan(job, index, req.upload.storeName, new Set(await listEdits(jobId)))];
  const ctx = await jobContext(job, req);
  const run: RestRun = { total: chars.length, done: 0, failed: 0, startedAt: Date.now(), finishedAt: null, sheetSeconds: [], error: null, aborted: false, promise: Promise.resolve() };
  run.promise = (async () => {
    try {
      if (chars.length) await drawAll(job, ctx, chars, run, force);
    } catch (err) {
      run.error = err instanceof Error ? err.message : String(err);
      console.error("[logoche] 나머지 글자 그리기 실패", err);
    } finally {
      run.finishedAt = Date.now();
    }
  })();
  runs.set(jobId, run);
  return run;
}

/** 남은 시간 어림(초). 장마다 잰 시간의 가운데 값으로, 동시에 그리는 장 수를 셈한다. */
export function restRemaining(run: RestRun): number {
  if (run.finishedAt !== null) return 0;
  const left = Math.max(0, run.total - run.done);
  const per = run.sheetSeconds.length ? run.sheetSeconds.slice().sort((a, b) => a - b)[Math.floor(run.sheetSeconds.length / 2)] : SHEET_SECONDS;
  const concurrency = Number(process.env.GLYPH_SHEET_CONCURRENCY ?? 8);
  const waves = Math.ceil(Math.ceil(left / SHEET_SIZE) / concurrency);
  const spent = (Date.now() - run.startedAt) / 1000;
  // 첫 장이 끝나기 전에는 시작한 뒤 지난 시간을 뺀다
  return run.sheetSeconds.length ? waves * per : Math.max(per / 2, waves * per - spent);
}

/** 나머지 글자 그리기를 중단한다(11/4). 아직 시작하지 않은 장은 그리지 않고, 이미 그리는 중인 장은 끝난 뒤 멈춘다. 그린 글자는 남는다. */
export function abortRest(jobId: string): void {
  const run = runs.get(jobId);
  if (run && run.finishedAt === null) run.aborted = true;
}
