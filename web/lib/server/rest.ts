// 화면 4 나머지 글자 그리기(10/30 결정: MX-Font를 빼고 이미지 모델이 2,350자를 다 그린다).
//
// 화면 3에서 확정한 참고 글자 글자표(sheet.png)를 스타일 참고로 붙여, 참고 글자 밖의 글자를 30자씩 글자표로 그린다(restSheetParts).
// 엔진이 칸별로 잘라 폰트 틀에 자리를 맞추고(획 두께는 참고 글자에 맞춤), Claude가 장마다 검사한다.
// 떨어진 글자는 한 자씩이 아니라 떨어진 글자끼리 모아 글자표로 다시 그린다(10/30 시험: 모양이 틀리는 건 주로 한 자씩 다시 그릴 때였다).
// 그래도 떨어진 글자는 서체에서 빠지고, 화면 4 글자 고치기로 그려 넣거나 다시 만들 때 또 그린다.
// 순서: 가게 이름 → 견본 글 → 자주 쓰는 글자(hangulOrder.ts). GLYPH_REST_LIMIT로 서체 글자 수를 줄여 싸게 시험할 수 있다.
// 그림은 web/.data/glyphs/<참고 글자 작업>/rest/<코드포인트 16진수>.png(엔진이 자리 맞춘 틀 그림), 상태는 rest/index.json.
// 같은 작업으로 다시 만들면 그린 글자는 그대로 쓰고 못 그린 글자만 다시 그린다. 화면 3에서 참고 글자를 다시 그려도 그린 글자는 남는다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { FREQUENT_CHARS, PANGRAM } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { HANGUL_BY_FREQUENCY } from "@/lib/hangulOrder";
import type { StartGlyphJobRequest } from "@/lib/types";
import { engine, type EngineRef } from "./engine";
import { MODELS, RouteError, modelLabel } from "./env";
import { listEdits } from "./edits";
import { checkSheet, isFatal, jobContext, jobDir, limiter, loadJob, readDataUrl, readyRefs, restSheetParts, type Context, type JobState } from "./glyphs";
import { generateImage } from "./openai";

const SHEET_SIZE = 30;
const REDRAW_ROUNDS = 2; // 떨어진 글자를 글자표로 다시 그리는 횟수(한 번 만들 때마다)
const REST_LIMIT = Math.min(KSX1001_HANGUL.size, Number(process.env.GLYPH_REST_LIMIT ?? KSX1001_HANGUL.size));
// 동시에 그리는 장 수. OpenAI 한도에 걸리면(429) 그 장은 떨어진 글자로 돌아가 다음 바퀴에 다시 그린다.
const sheetLimit = limiter(Number(process.env.GLYPH_SHEET_CONCURRENCY ?? 8));
const SHEET_SECONDS = 35; // 한 장 그리기·자르기·검사 어림(10/30 시험 21~29초 + 검사). 실제로 잰 값으로 바꿔 간다

interface RestIndex {
  drawn: Record<string, number>; // 그린 글자 → 몇 번째 장에서
  failed: Record<string, string>; // 끝내 떨어진 글자 → 마지막 이유
  sheets: number;
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
  promise: Promise<void>;
}

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

/** 그릴 글자: 가게 이름 → 견본 글 → 자주 쓰는 글자. 참고 글자로 이미 있는 글자, 그린 글자, 화면 4에서 직접 그려 넣은 글자는 뺀다. */
function plan(job: JobState, index: RestIndex, storeName: string, edited: Set<string>): string[] {
  const refs = new Set(job.items.filter((i) => i.status === "ok").map((i) => i.char));
  const room = Math.max(0, REST_LIMIT - refs.size);
  const order = [...new Set([...storeName, ...PANGRAM, ...FREQUENT_CHARS, ...HANGUL_BY_FREQUENCY])].filter(
    (c) => KSX1001_HANGUL.has(c) && !refs.has(c),
  );
  return order.slice(0, room).filter((c) => !(c in index.drawn) && !edited.has(c));
}

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** 한 장을 그려 자르고 검사한다. 떨어진 글자와 이유를 돌려준다. 다시 해도 소용없는 오류는 던진다. */
async function drawSheet(
  job: JobState,
  ctx: Context,
  chars: string[],
  approved: string | null,
  refs: EngineRef[],
  index: RestIndex,
  run: RestRun,
  save: () => Promise<void>,
): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  const startedAt = Date.now();
  try {
    const sheet = await engine.glyphSheet(chars.join(""));
    const { value: image, model } = await sheetLimit(() => generateImage(MODELS.image, restSheetParts(ctx, sheet, approved), sheet.aspectRatio));
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
    await Promise.all(
      placed.cells.map(async (cell, i) => {
        const verdict = verdicts ? (verdicts.get(i + 1) ?? { ok: false, problem: "검사 결과 없음" }) : { ok: true, problem: null };
        if (cell.image && !cell.problem && verdict.ok) {
          await fs.writeFile(restFile(job.id, cell.char), Buffer.from(cell.image.slice(cell.image.indexOf(",") + 1), "base64"));
          index.drawn[cell.char] = sheetNo;
          delete index.failed[cell.char];
          run.done++;
        } else {
          failed.set(cell.char, cell.problem ?? verdict.problem ?? "검사 실패");
        }
      }),
    );
    run.sheetSeconds.push((Date.now() - startedAt) / 1000);
  } catch (err) {
    if (isFatal(err)) throw err;
    console.error("[logoche] 나머지 글자표 실패", err);
    for (const c of chars) failed.set(c, `글자표 그리기 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
  await save();
  return failed;
}

async function drawAll(job: JobState, ctx: Context, chars: string[], run: RestRun) {
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
    const results = await Promise.all(chunk(todo, SHEET_SIZE).map((s) => drawSheet(job, ctx, s, approved, refs, index, run, save)));
    problems = new Map(results.flatMap((m) => [...m]));
    todo = [...problems.keys()];
    if (todo.length) console.log(`[logoche] 나머지 글자 ${round + 1}바퀴: ${todo.length}자 떨어짐 (${todo.slice(0, 20).join("")})`);
  }
  for (const [char, problem] of problems) index.failed[char] = problem;
  run.failed = problems.size;
  await save();
}

/** 이 참고 글자 작업의 나머지 글자를 그린다. 이미 그리는 중이면 그 작업을 돌려준다. */
export async function ensureRest(jobId: string, req: StartGlyphJobRequest): Promise<RestRun> {
  const running = runs.get(jobId);
  if (running && running.finishedAt === null) return running;
  const job = await loadJob(jobId);
  if (!job.finished) throw new RouteError(409, "참고 글자를 아직 그리는 중이에요");
  const chars = plan(job, await readIndex(jobId), req.upload.storeName, new Set(await listEdits(jobId)));
  const ctx = await jobContext(job, req);
  const run: RestRun = { total: chars.length, done: 0, failed: 0, startedAt: Date.now(), finishedAt: null, sheetSeconds: [], error: null, promise: Promise.resolve() };
  run.promise = (async () => {
    try {
      if (chars.length) await drawAll(job, ctx, chars, run);
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
