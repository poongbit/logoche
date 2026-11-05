// L1b 시험(docs/l1-steering-experiment-design.md 8절): 구조 지시를 이미지 호출의 서체 설계 지시문(brief)에 붙이면 글자 뼈대가 달라지는가.
// 같은 로고·같은 속성·같은 방향(Claude는 한 번만 부른다)에서 구조 지시만 바꿔 참고 글자 30자를 그리고 엔진에 빌드한다(견본 그림 없음).
// 변형: 지시 없음 ×2(같은 입력 흔들림) + 구조 지시 4가지. 서비스 코드는 바꾸지 않는다.
// 실제 AI 호출이 나간다(이미지 6번 + Claude 1번, 어림 $0.7). 실행(web 폴더, 엔진 8000번):
//   LOGOCHE_LEDGER=/경로/ledger.jsonl LOGOCHE_COST_CAP=0.9 FONT_ENGINE_URL=http://127.0.0.1:8000 node --env-file=.env.local <tsx>/dist/cli.mjs scripts/gen-structure-test.ts --out structure-runs.jsonl [--dry]

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SAMPLE_LOGOS } from "@/lib/constants";
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
const OUT = arg("--out") ?? "structure-runs.jsonl";
const DRY = process.argv.includes("--dry");
const LOGO_ID = arg("--logo") ?? "dalkom";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 캘리그래피 자유도 시험(11/5): 기준 글자표 강도(guide)와 캘리그래피 지시를 바꿔 글자 모양이 자유로워지는가, 읽히는가.
// 같은 로고·같은 속성·같은 방향(Claude는 한 번만)에서 지시 없음(대조) 1 + 캘리그래피 3(기준표 그대로/옅은 중심선/칸 번호만). 시그니처는 끈다.
const CALLI = "캘리그래피 서체: 붓으로 한 번에 써 내려간 듯 획이 흐르고, 글자마다 획의 길이와 굴림과 크기를 조금씩 다르게 자유롭게 쓴다. 가로획은 가늘게, 세로획과 꺾임은 굵게 눌러 굵기가 오가게 한다. 획 끝은 붓끝으로 맺거나 가늘게 빠진다. 자모가 서로 이어져도 되지만 글자는 또렷이 읽혀야 한다.";
const VARIANTS: { id: string; calli: boolean; guide: "light" | "none" | undefined }[] = [
  { id: "ctrl", calli: false, guide: undefined },
  { id: "calli-full", calli: true, guide: undefined },
  { id: "calli-light", calli: true, guide: "light" },
  { id: "calli-none", calli: true, guide: "none" },
];

async function main() {
  const logo = SAMPLE_LOGOS.find((l) => l.id === LOGO_ID)!;
  console.log(`로고 ${logo.id}, 변형 ${VARIANTS.map((v) => v.id).join(", ")}${DRY ? " (--dry: AI 호출 없음)" : ""}`);
  if (DRY) return;
  const svg = await fs.readFile(path.join(process.cwd(), "public", logo.src.replace(/^\//, "")));
  const buffer = await sharp(svg, { density: 192 }).resize({ width: 800 }).flatten({ background: "#ffffff" }).png().toBuffer();
  const hash = createHash("sha256").update(svg).digest("hex");
  const upload: UploadInput = {
    logoImage: `data:image/png;base64,${buffer.toString("base64")}`,
    logoFileName: `${logo.id}.svg`,
    logoHash: hash,
    inputPath: "sample",
    sampleId: logo.id,
    storeName: logo.prefill.storeName,
    industry: logo.prefill.industry,
    industryOther: "",
    brandTones: [],
    usageContexts: [],
    desiredFeel: "",
    logoSource: null,
    logoFont: null,
    logoFontName: "",
    attributes: { edge: "sharp", weight: "bold", contrast: "high", hand: "brush" }, // 각지고 굵고 대비 붓맛(캘리그래피에 가까운 속성)
  };
  const style = await analyzeStyle(upload);
  const direction = style.directions!.find((d) => d.family === "brush") ?? style.directions![0];
  const base = applyDirection(style, direction);
  console.log(`방향: ${base.family} · ${direction.expression}`);
  for (const v of VARIANTS) {
    const applied = { ...base, designBrief: v.calli ? `${base.designBrief ?? ""}\n${CALLI}`.trim() : base.designBrief, guide: v.guide, signatureDraw: null };
    const t0 = Date.now();
    try {
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
        licenseText: "calli-test",
        aiNotice: "calli-test",
        edits: [],
        tweaks: {},
        provenance: { source: "experiment-calli", variant: v.id, guide: v.guide ?? "full", logoId: logo.id, family: applied.family ?? null, expression: direction.expression, refsReady: ready },
      });
      let phase = "composing";
      for (let i = 0; i < 150 && phase !== "done" && phase !== "failed"; i++) {
        await sleep(1000);
        phase = ((await (await fetch(`${ENGINE_URL}/builds/${buildId}`)).json()) as { phase: string }).phase;
      }
      const row = { variant: v.id, guide: v.guide ?? "full", failed: job.items.filter((i) => i.status !== "ready").length, buildId, jobId, ready, phase, seconds: Math.round((Date.now() - t0) / 1000) };
      await fs.appendFile(OUT, JSON.stringify(row) + "\n");
      console.log(`  ${v.id}: 참고 글자 ${ready}자, 빌드 ${phase}, ${row.seconds}초`);
    } catch (err) {
      console.error(`  ${v.id} 실패: ${err instanceof Error ? err.message : err}`);
      await fs.appendFile(OUT, JSON.stringify({ variant: v.id, guide: v.guide ?? "full", error: String(err) }) + "\n");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
