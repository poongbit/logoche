// 시그니처 시험(docs/l1-steering-experiment-design.md 10·11절). 10절은 style.signature를 brief에 직접 붙여 그렸고(--manual), 11절은 서비스 경로(방향 호출이 구체적 조형 mark를 읽고 style.signatureDraw로 글자 그리기에 전달)를 그대로 쓴다.
// 로고마다 Claude 한 번(방향과 시그니처 읽기) + 이미지 한 번. 대조는 같은 로고·같은 속성의 본 실험 서체(docs/main-20261105-runs.jsonl)를 쓴다. 견본 그림 없음.
// 실행(web 폴더, 엔진 8000번): LOGOCHE_LEDGER=... LOGOCHE_COST_CAP=0.8 FONT_ENGINE_URL=http://127.0.0.1:8000 node --env-file=.env.local <tsx>/dist/cli.mjs scripts/gen-signature-test.ts --logos-dir <폴더> --ids cup,badge,leaf --out signature-runs.jsonl [--dry]

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ENGINE_URL } from "@/lib/server/env";
import { engineAxes } from "@/lib/server/build";
import { engine } from "@/lib/server/engine";
import { getGlyphJob, glyphDrawWeight, glyphModels, readyRefs, startGlyphJob } from "@/lib/server/glyphs";
import { analyzeStyle, applyDirection } from "@/lib/server/style";
import type { UploadInput } from "@/lib/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("--out") ?? "signature-runs.jsonl";
const DRY = process.argv.includes("--dry");
const LOGOS_DIR = arg("--logos-dir");
const MANUAL = process.argv.includes("--manual"); // 10절 방식(옛 signature를 brief에 직접 붙임)
const IDS = (arg("--ids") ?? "cup,badge,leaf").split(",");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!LOGOS_DIR) throw new Error("--logos-dir이 필요해요");
  const meta = (JSON.parse(await fs.readFile(path.join(LOGOS_DIR, "meta.json"), "utf-8")) as { id: string; file: string; storeName: string; industry: UploadInput["industry"] }[]).filter((m) => IDS.includes(m.id));
  console.log(`로고 ${meta.map((m) => m.id).join(", ")}${DRY ? " (--dry: AI 호출 없음)" : ""}`);
  if (DRY) return;
  for (const m of meta) {
    const buffer = await fs.readFile(path.join(LOGOS_DIR, m.file));
    const hash = createHash("sha256").update(buffer).digest("hex");
    const upload: UploadInput = {
      logoImage: `data:image/png;base64,${buffer.toString("base64")}`,
      logoFileName: m.file,
      logoHash: hash,
      inputPath: "sample",
      sampleId: m.id,
      storeName: m.storeName,
      industry: m.industry,
      industryOther: "",
      brandTones: [],
      usageContexts: [],
      desiredFeel: "",
      logoSource: null,
      logoFont: null,
      logoFontName: "",
      attributes: { edge: "round", weight: "bold", contrast: "even", hand: "neat" }, // 둥글고 굵고 균일
    };
    const t0 = Date.now();
    try {
      const style = await analyzeStyle(upload);
      const direction = style.directions![0];
      const base = applyDirection(style, direction);
      const signature = MANUAL ? style.signature : style.signatureDraw;
      console.log(`${m.id}: 방향 ${base.family} · ${direction.expression} / ${MANUAL ? "시그니처" : "고유 조형"}: ${signature ?? "(없음)"}`);
      if (!signature) throw new Error("시그니처가 없어 건너뜀");
      const applied = MANUAL
        ? { ...base, designBrief: `${base.designBrief ?? ""}\n시그니처 조형: ${signature}. 이 조형을 해당 자리의 자소에 모든 글자에서 같은 모양으로 한 번씩, 읽기를 해치지 않을 만큼 뚜렷하게 넣으세요.`.trim() }
        : base; // 서비스 경로: base.signatureDraw가 glyphs.ts의 고유 조형 지시로 들어간다
      const jobId = startGlyphJob({ upload, style: applied, sampleId: null, quality: "standard" });
      let job = await getGlyphJob(jobId);
      while (job.status === "running") {
        await sleep(2000);
        job = await getGlyphJob(jobId);
      }
      const ready = job.items.filter((i) => i.status === "ready").length;
      if (ready === 0) throw new Error("참고 글자를 하나도 그리지 못했어요");
      const buildId = crypto.randomUUID().replace(/-/g, "");
      await engine.startBuild({
        buildId,
        storeName: upload.storeName,
        logoHash: hash,
        axes: engineAxes(applied.axes, await glyphDrawWeight(jobId)),
        refs: await readyRefs(jobId),
        glyphs: [],
        models: glyphModels(jobId),
        licenseText: "signature-test",
        aiNotice: "signature-test",
        edits: [],
        tweaks: {},
        provenance: { source: "experiment-signature", logoId: m.id, family: applied.family ?? null, expression: direction.expression, signature, refsReady: ready },
      });
      let phase = "composing";
      for (let i = 0; i < 150 && phase !== "done" && phase !== "failed"; i++) {
        await sleep(1000);
        phase = ((await (await fetch(`${ENGINE_URL}/builds/${buildId}`)).json()) as { phase: string }).phase;
      }
      const row = { logoId: m.id, signature, family: base.family, expression: direction.expression, buildId, jobId, ready, phase, seconds: Math.round((Date.now() - t0) / 1000) };
      await fs.appendFile(OUT, JSON.stringify(row) + "\n");
      console.log(`  ${m.id}: 참고 글자 ${ready}자, 빌드 ${phase}, ${row.seconds}초`);
    } catch (err) {
      console.error(`  ${m.id} 실패: ${err instanceof Error ? err.message : err}`);
      await fs.appendFile(OUT, JSON.stringify({ logoId: m.id, error: String(err) }) + "\n");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
