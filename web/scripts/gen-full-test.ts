// 끝까지 만들기 시험(11/5): 참고 글자 30자 + 나머지 글자(GLYPH_REST_LIMIT자까지) + 엔진 빌드. 장당 단가·시간을 재고 30자와 나머지 글자의 스타일이 이어지는지 본다.
// 실제 AI 호출. 실행(web 폴더, 엔진 8000번):
//   GLYPH_REST_LIMIT=300 LOGOCHE_LEDGER=… LOGOCHE_COST_CAP=2.5 FONT_ENGINE_URL=http://127.0.0.1:8000 node --env-file=.env.local <tsx>/dist/cli.mjs scripts/gen-full-test.ts --quality fine|standard --out runs.jsonl
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SAMPLE_LOGOS } from "@/lib/constants";
import { getBuild, startBuild } from "@/lib/server/build";
import { getGlyphJob, startGlyphJob } from "@/lib/server/glyphs";
import { analyzeStyle, applyDirection } from "@/lib/server/style";
import type { UploadInput } from "@/lib/types";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const QUALITY = (arg("--quality") ?? "fine") as "fine" | "standard";
const OUT = arg("--out") ?? "full-runs.jsonl";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const logo = SAMPLE_LOGOS.find((l) => l.id === "bada")!;
  const svg = await fs.readFile(path.join(process.cwd(), "public", logo.src.replace(/^\//, "")));
  const png = await sharp(svg, { density: 192 }).resize({ width: 800 }).flatten({ background: "#ffffff" }).png().toBuffer();
  const hash = createHash("sha256").update(svg).digest("hex");
  const upload: UploadInput = {
    logoImage: `data:image/png;base64,${png.toString("base64")}`, logoFileName: "bada.svg", logoHash: hash, inputPath: "sample", sampleId: logo.id,
    storeName: logo.prefill.storeName, industry: logo.prefill.industry, industryOther: "", brandTones: ["premium", "calm"], usageContexts: ["print_card"],
    desiredFeel: "", logoSource: null, logoFont: null, logoFontName: "", attributes: null,
  };
  const style0 = await analyzeStyle(upload);
  const style = applyDirection(style0, style0.directions![0]);
  console.log(`방향: ${style.family} · ${style0.directions![0].expression} · 그리기 수준 ${QUALITY}`);
  const t0 = Date.now();
  const req = { upload, style, sampleId: null, quality: QUALITY };
  const jobId = startGlyphJob(req);
  let job = await getGlyphJob(jobId);
  while (job.status === "running") {
    await sleep(2000);
    job = await getGlyphJob(jobId);
  }
  console.log(`참고 글자 ${job.items.filter((i) => i.status === "ready").length}자 (${Math.round((Date.now() - t0) / 1000)}초)`);
  const buildId = await startBuild({ ...req, storeName: upload.storeName, logoHash: hash, glyphJobId: jobId, axes: style.axes, provenance: { source: "experiment-full", quality: QUALITY } });
  console.log("빌드", buildId);
  let last = "";
  for (let i = 0; i < 1500; i++) {
    await sleep(5000);
    const b = await getBuild(buildId);
    const line = `${b.phase} ${b.stages.map((s) => `${s.key}:${s.status}${s.total ? `(${s.done}/${s.total})` : ""}`).join(" ")} ${b.builtGlyphs}/${b.totalGlyphs}`;
    if (line !== last) console.log(`  [${Math.round((Date.now() - t0) / 1000)}초] ${line}`);
    last = line;
    if (b.phase === "done" || b.phase === "failed") {
      const row = { quality: QUALITY, jobId, buildId, phase: b.phase, seconds: Math.round((Date.now() - t0) / 1000), glyphs: b.builtGlyphs, total: b.totalGlyphs, similarity: b.similarity, ocrPassed: b.ocrPassed, error: b.error ?? null };
      await fs.appendFile(OUT, JSON.stringify(row) + "\n");
      console.log("끝", JSON.stringify(row));
      return;
    }
  }
  console.log("시간 초과");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
