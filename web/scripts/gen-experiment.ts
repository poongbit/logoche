// 서체끼리의 유사도 분석(docs/similarity-analysis-20261105.md)용 통제된 생성 실험(방식 A: 참고 글자 30자만).
// --plan pilot: 샘플 로고 3개 × 속성 조합 3개 + 첫 입력 반복 1건 = 10건.
// --plan main: 로고 8개(샘플 3 + --logos-dir의 5) × 속성 조합 5개 + 같은 입력 반복 6건 = 46건. 순서는 고정 시드로 섞는다(중간에 멈춰도 한쪽에 쏠리지 않게, 반복은 원본 뒤에 온다).
// 한 건: 로고 읽기(Claude) → 서체 방향 중 첫 안 고르기 → 그 방향의 견본 1장 → 참고 글자 30자 그리기 → 엔진에 참고 글자만으로 빌드(나머지 글자는 그리지 않는다).
// 실제 흐름과 다른 점: 방향 3개의 견본을 모두 그리지 않고 첫 안의 견본만 그린다. 사용자가 고르는 단계도 없다.
// 실제 AI 호출이 나가 돈이 든다(방식 A 한 건 약 $0.14~0.2 어림). 상한: LOGOCHE_COST_CAP(이미지 어림 달러)과 이 스크립트의 --cap(전체 어림 달러).
//
// 실행(web 폴더에서, 엔진이 8000번에서 돌고 있어야 한다):
//   LOGOCHE_LEDGER=/경로/ledger.jsonl LOGOCHE_COST_CAP=12 FONT_ENGINE_URL=http://127.0.0.1:8001 node --env-file=.env.local <tsx>/dist/cli.mjs scripts/gen-experiment.ts --plan main --logos-dir <폴더> [--dry] [--from N] [--limit N] [--cap 15] [--out runs.jsonl]

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SAMPLE_LOGOS } from "@/lib/constants";
import { ENGINE_URL } from "@/lib/server/env";
import { engineAxes } from "@/lib/server/build";
import { engine } from "@/lib/server/engine";
import { getGlyphJob, glyphDrawWeight, glyphModels, readyRefs, startGlyphJob } from "@/lib/server/glyphs";
import { createSample } from "@/lib/server/samples";
import { analyzeStyle, applyDirection, type NeighborCard } from "@/lib/server/style";
import type { StyleAttributes, UploadInput } from "@/lib/types";

const ATTRS: Record<string, StyleAttributes> = {
  "둥글고 굵고 균일": { edge: "round", weight: "bold", contrast: "even", hand: "neat" },
  "각지고 가늘고 대비": { edge: "sharp", weight: "thin", contrast: "high", hand: "neat" },
  "둥글고 가늘고 붓맛": { edge: "round", weight: "thin", contrast: "even", hand: "brush" },
  "각지고 굵고 대비 붓맛": { edge: "sharp", weight: "bold", contrast: "high", hand: "brush" },
  "둥글고 가늘고 대비": { edge: "round", weight: "thin", contrast: "high", hand: "neat" },
};
const PILOT_ATTRS = Object.keys(ATTRS).slice(0, 3);

interface Plan {
  n: number;
  logoId: string;
  attrName: string;
  repeat: boolean;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PLAN_NAME = arg("--plan") ?? "pilot";
const LOGOS_DIR = arg("--logos-dir");

interface LogoSource {
  id: string;
  storeName: string;
  industry: UploadInput["industry"];
  fileName: string;
  load: () => Promise<{ buffer: Buffer; hash: string }>;
}

async function loadLogos(): Promise<LogoSource[]> {
  const out: LogoSource[] = SAMPLE_LOGOS.map((l) => ({
    id: l.id,
    storeName: l.prefill.storeName,
    industry: l.prefill.industry,
    fileName: `${l.id}.svg`,
    load: async () => {
      const svg = await fs.readFile(path.join(process.cwd(), "public", l.src.replace(/^\//, "")));
      const png = await sharp(svg, { density: 192 }).resize({ width: 800 }).flatten({ background: "#ffffff" }).png().toBuffer();
      return { buffer: png, hash: createHash("sha256").update(svg).digest("hex") };
    },
  }));
  if (PLAN_NAME === "main") {
    if (!LOGOS_DIR) throw new Error("--plan main에는 --logos-dir이 필요해요");
    const meta = JSON.parse(await fs.readFile(path.join(LOGOS_DIR, "meta.json"), "utf-8")) as { id: string; file: string; storeName: string; industry: UploadInput["industry"] }[];
    for (const m of meta) {
      out.push({
        id: m.id,
        storeName: m.storeName,
        industry: m.industry,
        fileName: m.file,
        load: async () => {
          const buffer = await fs.readFile(path.join(LOGOS_DIR, m.file));
          return { buffer, hash: createHash("sha256").update(buffer).digest("hex") };
        },
      });
    }
  }
  return out;
}

/** 고정 시드 섞기(mulberry32) */
function shuffle<T>(list: T[], seed: number): T[] {
  const a = [...list];
  let t = seed;
  const rand = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPlan(logos: LogoSource[]): Plan[] {
  if (PLAN_NAME === "pilot") {
    const plan: Plan[] = [];
    for (const logo of logos) for (const attrName of PILOT_ATTRS) plan.push({ n: plan.length + 1, logoId: logo.id, attrName, repeat: false });
    plan.push({ n: plan.length + 1, logoId: plan[0].logoId, attrName: plan[0].attrName, repeat: true });
    return plan;
  }
  const base: Omit<Plan, "n">[] = [];
  for (const logo of logos) for (const attrName of Object.keys(ATTRS)) base.push({ logoId: logo.id, attrName, repeat: false });
  const shuffled = shuffle(base, 7);
  const repeatOf = shuffled.filter((_, i) => i % 7 === 3).slice(0, 6).map((p) => ({ ...p, repeat: true }));
  const all = shuffle([...shuffled, ...repeatOf], 11);
  // 반복은 같은 입력의 원본 뒤에 오게 한다
  for (let i = 0; i < all.length; i++) {
    if (!all[i].repeat) continue;
    const orig = all.findIndex((p) => !p.repeat && p.logoId === all[i].logoId && p.attrName === all[i].attrName);
    if (orig > i) [all[i], all[orig]] = [all[orig], all[i]];
  }
  return all.map((p, i) => ({ n: i + 1, ...p }));
}

const DRY = process.argv.includes("--dry");
// L1 조향 실험(docs/l1-steering-experiment-design.md): --arm steer --cells "칸1,칸2" --seed-runs 대조군runs.jsonl --registry 레지스트리.jsonl
const ARM = arg("--arm") ?? "control";
const CELLS = (arg("--cells") ?? "").split(",").filter(Boolean);
const SEED_RUNS = arg("--seed-runs");
const REGISTRY = arg("--registry") ?? "steer-registry.jsonl";
const NEIGHBORS_K = 4;

interface RegistryRow extends NeighborCard {
  cell: string;
  buildId: string;
  arm: string;
}

/** 레지스트리를 읽는다. 처음이면 대조군 빌드(해당 칸)로 채운다: 서비스에 이미 사용자가 있는 상황을 흉내 낸다. */
async function loadRegistry(): Promise<RegistryRow[]> {
  try {
    return (await fs.readFile(REGISTRY, "utf-8")).split("\n").filter(Boolean).map((l) => JSON.parse(l) as RegistryRow);
  } catch {}
  if (!SEED_RUNS) throw new Error("--arm steer에는 --seed-runs(대조군 runs.jsonl)가 필요해요");
  const rows: RegistryRow[] = [];
  for (const line of (await fs.readFile(SEED_RUNS, "utf-8")).split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.phase !== "done" || !CELLS.includes(r.attrName) || !r.family || !r.expression) continue;
    let weight: number | undefined;
    try {
      const prov = JSON.parse(await fs.readFile(path.join(process.cwd(), "..", "engine", "data", "builds", r.buildId, "provenance.json"), "utf-8"));
      weight = prov.axes?.weight;
    } catch {}
    rows.push({ cell: r.attrName, buildId: r.buildId, arm: "control", family: r.family, expression: r.expression, weight });
  }
  await fs.writeFile(REGISTRY, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return rows;
}
const FROM = Number(arg("--from") ?? 1);
const LIMIT = Number(arg("--limit") ?? 9999); // 마지막 번호(포함)
const CAP = Number(arg("--cap") ?? 2.2);
const OUT = arg("--out") ?? "pilot-runs.jsonl";
const LEDGER = process.env.LOGOCHE_LEDGER;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 기록 파일의 어림 비용: 이미지는 기록된 어림 단가, Claude는 Opus 5.5 공식 단가(입력 $4·출력 $20 / 100만 토큰) */
async function spent(): Promise<{ image: number; claude: number; total: number }> {
  let image = 0;
  let claude = 0;
  if (LEDGER) {
    try {
      for (const line of (await fs.readFile(LEDGER, "utf-8")).split("\n")) {
        if (!line) continue;
        const row = JSON.parse(line);
        if (row.kind === "image") image += row.estUsd ?? 0;
        if (row.kind === "claude") claude += ((row.input ?? 0) * 4 + (row.output ?? 0) * 20) / 1e6;
      }
    } catch {}
  }
  return { image, claude, total: image + claude };
}

async function runOne(plan: Plan, logos: LogoSource[]): Promise<Record<string, unknown>> {
  const logo = logos.find((l) => l.id === plan.logoId)!;
  const loaded = await logo.load();
  const hash = loaded.hash;
  const dataUrl = `data:image/png;base64,${loaded.buffer.toString("base64")}`;
  const upload: UploadInput = {
    logoImage: dataUrl,
    logoFileName: logo.fileName,
    logoHash: hash,
    inputPath: "sample",
    sampleId: logo.id,
    storeName: logo.storeName,
    industry: logo.industry,
    industryOther: "",
    brandTones: [],
    usageContexts: [],
    desiredFeel: "",
    logoSource: null,
    logoFont: null,
    logoFontName: "",
    attributes: ATTRS[plan.attrName],
  };
  const t0 = Date.now();
  let steer: { neighbors: NeighborCard[]; all: NeighborCard[] } | undefined;
  if (ARM === "steer") {
    const reg = (await loadRegistry()).filter((r) => r.cell === plan.attrName);
    steer = { neighbors: reg.slice(-NEIGHBORS_K).map(({ family, expression, weight }) => ({ family, expression, weight })), all: reg.map(({ family, expression, weight }) => ({ family, expression, weight })) };
    console.log(`  조향: 같은 칸 서체 ${reg.length}개, 이웃 ${steer.neighbors.length}개를 넘김`);
  }
  const style = await analyzeStyle(upload, steer);
  const direction = style.directions?.[0];
  const applied = direction ? applyDirection(style, direction) : style;
  let sampleId: string | null = null;
  if (direction) {
    try {
      sampleId = (await createSample({ upload, style: applied, expression: direction.expression })).sampleId;
    } catch (err) {
      console.error("  견본 실패(그림 없이 계속):", err instanceof Error ? err.message : err);
    }
  }
  const jobId = startGlyphJob({ upload, style: applied, sampleId, quality: "standard" });
  let job = await getGlyphJob(jobId);
  while (job.status === "running") {
    await sleep(2000);
    job = await getGlyphJob(jobId);
  }
  const ready = job.items.filter((i) => i.status === "ready").length;
  const failed = job.items.length - ready;
  if (ready === 0) throw new Error("참고 글자를 하나도 그리지 못했어요");
  const refs = await readyRefs(jobId);
  const buildId = crypto.randomUUID().replace(/-/g, "");
  await engine.startBuild({
    buildId,
    storeName: upload.storeName,
    logoHash: hash,
    axes: engineAxes(applied.axes, await glyphDrawWeight(jobId)),
    refs,
    glyphs: [],
    models: glyphModels(jobId),
    licenseText: "pilot",
    aiNotice: "pilot",
    edits: [],
    tweaks: {},
    provenance: {
      source: "experiment-A",
      experiment: ARM === "steer" ? `steer-20261105` : `${PLAN_NAME}-20261105`,
      arm: ARM,
      n: plan.n,
      repeat: plan.repeat,
      logoId: plan.logoId,
      attrName: plan.attrName,
      projectId: `pilot-${plan.logoId}-${plan.attrName}`,
      industry: upload.industry,
      attributes: upload.attributes,
      family: applied.family ?? null,
      expression: direction?.expression ?? null,
      axes: applied.axes.map((a) => ({ key: a.key, value: a.value, suggested: a.suggested, basis: a.basis, chosen: a.chosen ?? false })),
      glyphJobId: jobId,
      withSample: !!sampleId,
      refsReady: ready,
      refsFailed: failed,
    },
  });
  let phase = "composing";
  for (let i = 0; i < 150 && phase !== "done" && phase !== "failed"; i++) {
    await sleep(1000);
    phase = ((await (await fetch(`${ENGINE_URL}/builds/${buildId}`)).json()) as { phase: string }).phase;
  }
  if (ARM === "steer" && phase === "done" && applied.family && direction) {
    const row: RegistryRow = { cell: plan.attrName, buildId, arm: "steer", family: applied.family, expression: direction.expression, weight: direction.weight };
    await fs.appendFile(REGISTRY, JSON.stringify(row) + "\n");
  }
  return { buildId, jobId, family: applied.family ?? null, expression: direction?.expression ?? null, ready, failed, phase, seconds: Math.round((Date.now() - t0) / 1000) };
}

async function main() {
  const logos = await loadLogos();
  let plans = buildPlan(logos).filter((p) => p.n >= FROM && p.n <= LIMIT);
  if (ARM === "steer") {
    if (CELLS.length === 0) throw new Error("--arm steer에는 --cells가 필요해요");
    plans = plans.filter((p) => !p.repeat && CELLS.includes(p.attrName)); // 대조군과 같은 입력·같은 순서(번호는 본 계획 그대로)
  }
  console.log(`계획 ${plans.length}건${DRY ? " (--dry: AI 호출 없음)" : ""}, 비용 상한 어림 $${CAP}`);
  for (const p of plans) console.log(`  ${p.n}. 로고 ${p.logoId} · 속성 ${p.attrName}${p.repeat ? " · (반복)" : ""}`);
  if (DRY) {
    for (const l of logos) console.log(`로고 ${l.id}: ${(await l.load()).buffer.length} 바이트`);
    return;
  }
  for (const p of plans) {
    const before = await spent();
    if (before.total >= CAP) {
      console.log(`비용 상한 도달(어림 $${before.total.toFixed(2)} ≥ $${CAP}). 여기서 멈춥니다.`);
      break;
    }
    console.log(`\n[${p.n}/${plans.length}] ${p.logoId} · ${p.attrName}${p.repeat ? " · 반복" : ""} 시작 (지금까지 어림 $${before.total.toFixed(2)})`);
    try {
      const result = await runOne(p, logos);
      const after = await spent();
      const row = { ...p, ...result, costUsd: Number((after.total - before.total).toFixed(3)), totalUsd: Number(after.total.toFixed(3)) };
      await fs.appendFile(OUT, JSON.stringify(row) + "\n");
      console.log(`  완료: 참고 글자 ${result.ready}자(실패 ${result.failed}), 방향 ${result.family}, 빌드 ${result.phase}, ${result.seconds}초, 어림 $${row.costUsd}`);
    } catch (err) {
      const after = await spent();
      console.error(`  실패: ${err instanceof Error ? err.message : err} (어림 $${(after.total - before.total).toFixed(3)} 소모)`);
      await fs.appendFile(OUT, JSON.stringify({ ...p, error: String(err instanceof Error ? err.message : err), costUsd: Number((after.total - before.total).toFixed(3)) }) + "\n");
    }
  }
  const end = await spent();
  console.log(`\n끝. 어림 합계 $${end.total.toFixed(2)} (이미지 $${end.image.toFixed(2)} + Claude $${end.claude.toFixed(2)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
