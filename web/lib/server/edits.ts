// 화면 4 글자 고치기(10/29 사용자 요청: 그림판처럼 고치기). 2,350자 가운데 사용자가 고친 글자를 참고 글자 작업마다 둔다.
// 그림은 web/.data/glyphs/<작업 id>/edits/<코드포인트 16진수>.png(편집 화면 그림 512px), 목록은 edits/index.json.
// 10/30: 편집 그림의 틀이 엔진 drawn.py 틀로 바뀌었다(MX-Font를 빼며). 그 전에 고친 글자는 자리가 어긋날 수 있다.
// 이미지 모델이 끝내 그리지 못한 글자도 여기서 그려 넣으면 다음 빌드에 들어간다.
// 빌드와 미리보기는 고친 글자를 엔진에 함께 보내고, 만든 폰트가 다듬기를 반영한 상태면 그 글자만 바로 바꿔 끼운다.
// 고칠 때의 굵기를 같이 적어 두어, 나중에 굵기를 바꾸면 엔진이 그 차이만큼만 윤곽을 옮긴다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { KSX1001_HANGUL } from "@/lib/hangul";
import type { GlyphEditSource, GlyphEditSourceRequest, SaveGlyphEditRequest, SaveGlyphEditResponse, StyleAxis } from "@/lib/types";
import { engineAxes } from "./build";
import { engine, type EngineEdit } from "./engine";
import { RouteError } from "./env";
import { glyphDrawWeight, readyRefs } from "./glyphs";
import { readRestGlyphs } from "./rest";

const DATA_DIR = path.join(process.cwd(), ".data", "glyphs");
const UUID = /^[0-9a-f-]{36}$/;

type EditIndex = Record<string, { weight: number; savedAt: string }>;

function editDir(jobId: string): string {
  if (!UUID.test(jobId)) throw new RouteError(404, "작업을 찾을 수 없어요");
  return path.join(DATA_DIR, jobId, "edits");
}

const editFile = (jobId: string, char: string) => path.join(editDir(jobId), `${char.codePointAt(0)!.toString(16)}.png`);

function checkChar(char: string): string {
  if ([...char].length !== 1 || !KSX1001_HANGUL.has(char)) throw new RouteError(400, "한글 완성형 2,350자 가운데 한 글자를 골라 주세요");
  return char;
}

async function readIndex(jobId: string): Promise<EditIndex> {
  try {
    return JSON.parse(await fs.readFile(path.join(editDir(jobId), "index.json"), "utf-8"));
  } catch {
    return {};
  }
}

async function writeIndex(jobId: string, index: EditIndex) {
  await fs.mkdir(editDir(jobId), { recursive: true });
  await fs.writeFile(path.join(editDir(jobId), "index.json"), JSON.stringify(index, null, 1));
}

/** 고친 글자 목록(고친 차례) */
export async function listEdits(jobId: string): Promise<string[]> {
  const index = await readIndex(jobId);
  return Object.keys(index).sort((a, b) => index[a].savedAt.localeCompare(index[b].savedAt));
}

/** 엔진에 보낼 고친 글자. chars를 주면 그 글자만 */
export async function readEdits(jobId: string, chars?: Set<string>): Promise<EngineEdit[]> {
  const index = await readIndex(jobId);
  const wanted = Object.keys(index).filter((c) => !chars || chars.has(c));
  const edits = await Promise.all(
    wanted.map(async (char) => {
      try {
        const png = await fs.readFile(editFile(jobId, char));
        return { char, image: `data:image/png;base64,${png.toString("base64")}`, weight: index[char].weight };
      } catch {
        return null; // 목록만 남고 그림이 없으면 빼고 만든다
      }
    }),
  );
  return edits.filter((e): e is EngineEdit => e !== null);
}

async function engineRequest(jobId: string, char: string, axes: StyleAxis[], edit: EngineEdit | null) {
  return {
    char,
    axes: engineAxes(axes, await glyphDrawWeight(jobId)),
    refs: await readyRefs(jobId),
    glyphs: await readRestGlyphs(jobId, new Set([char])),
    edit,
  };
}

const weightOf = (axes: StyleAxis[]) => axes.find((a) => a.key === "weight")?.value ?? 400;

export async function editSource(jobId: string, req: GlyphEditSourceRequest): Promise<GlyphEditSource> {
  const char = checkChar(req.char);
  const [edit] = await readEdits(jobId, new Set([char]));
  const source = await engine.editSource(await engineRequest(jobId, char, req.axes, edit ?? null));
  return { ...source, edited: !!edit };
}

/** 고친 글자 저장(image가 null이면 지운다). buildId가 있으면 그 폰트에서 이 글자를 먼저 바꿔 끼워, 엔진이 받지 않는 그림(빈 글자 등)은 저장하지 않는다. */
export async function saveEdit(jobId: string, req: SaveGlyphEditRequest): Promise<SaveGlyphEditResponse> {
  const char = checkChar(req.char);
  if (req.image !== null && !req.image.startsWith("data:image/png;base64,")) throw new RouteError(400, "PNG 그림을 보내 주세요");
  const edit = req.image === null ? null : { char, image: req.image, weight: weightOf(req.axes) };
  if (req.buildId) {
    if (!/^[0-9a-f]{32}$/.test(req.buildId)) throw new RouteError(404, "폰트를 찾을 수 없어요");
    await engine.patchGlyph(req.buildId, await engineRequest(jobId, char, req.axes, edit));
  }
  const index = await readIndex(jobId);
  if (edit) {
    await fs.mkdir(editDir(jobId), { recursive: true });
    await fs.writeFile(editFile(jobId, char), Buffer.from(edit.image.slice(edit.image.indexOf(",") + 1), "base64"));
    index[char] = { weight: edit.weight, savedAt: new Date().toISOString() };
  } else {
    await fs.rm(editFile(jobId, char), { force: true });
    delete index[char];
  }
  await writeIndex(jobId, index);
  return { edits: await listEdits(jobId), patched: !!req.buildId };
}
