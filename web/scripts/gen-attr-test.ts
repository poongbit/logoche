// 속성 축 후보 시험(docs/similarity-analysis-20261105.md 마지막 절). L1b 시험(docs/l1-steering-experiment-design.md 8절)을 바탕으로 했다: 구조 지시를 이미지 호출의 서체 설계 지시문(brief)에 붙이면 글자 뼈대가 달라지는가.
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

// 새 속성 축 후보(11/5): 획 끝·짜임·자모 크기를 두 값씩. 기존 속성(둥글게·굵게·균일)과 부딪히지 않게 긍정문으로 쓴다.
const VARIANTS: { id: string; structure: string | null }[] = [
  { id: "tip-flick", structure: "획 끝: 모든 획의 끝을 둥글게 맺되 끝을 살짝 삐치듯 바깥쪽으로 뻗어 방향이 느껴지게 한다." },
  { id: "tip-blunt", structure: "획 끝: 모든 획의 끝을 똑같이 뭉툭하게 잘라 둥글게 맺고 삐침은 넣지 않는다." },
  { id: "pack-full", structure: "짜임: 자모를 크게 그려 글자 틀을 거의 다 채우고 자모 사이 간격을 아주 좁힌다." },
  { id: "pack-airy", structure: "짜임: 자모를 작게 그리고 자모 사이를 넉넉히 비워 글자 틀 안에 여백을 둔다." },
  { id: "size-even", structure: "자모 크기: 초성·중성·받침을 거의 같은 크기와 같은 굵기로 그린다." },
  { id: "size-varied", structure: "자모 크기: 초성은 크게, 중성은 가늘고 길게, 받침은 작게 그려 자모 사이 크기 차이를 분명히 둔다." },
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
    attributes: { edge: "round", weight: "bold", contrast: "even", hand: "neat" }, // 둥글고 굵고 균일(기준선이 가장 높은 칸)
  };
  const style = await analyzeStyle(upload);
  const direction = style.directions![0];
  const base = applyDirection(style, direction);
  console.log(`방향: ${base.family} · ${direction.expression}`);
  for (const v of VARIANTS) {
    const applied = v.structure ? { ...base, designBrief: `${base.designBrief ?? ""}\n${v.structure}`.trim() } : base;
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
        licenseText: "attr-test",
        aiNotice: "attr-test",
        edits: [],
        tweaks: {},
        provenance: { source: "experiment-attr", variant: v.id, logoId: logo.id, family: applied.family ?? null, expression: direction.expression, refsReady: ready },
      });
      let phase = "composing";
      for (let i = 0; i < 150 && phase !== "done" && phase !== "failed"; i++) {
        await sleep(1000);
        phase = ((await (await fetch(`${ENGINE_URL}/builds/${buildId}`)).json()) as { phase: string }).phase;
      }
      const row = { variant: v.id, buildId, jobId, ready, phase, seconds: Math.round((Date.now() - t0) / 1000) };
      await fs.appendFile(OUT, JSON.stringify(row) + "\n");
      console.log(`  ${v.id}: 참고 글자 ${ready}자, 빌드 ${phase}, ${row.seconds}초`);
    } catch (err) {
      console.error(`  ${v.id} 실패: ${err instanceof Error ? err.message : err}`);
      await fs.appendFile(OUT, JSON.stringify({ variant: v.id, error: String(err) }) + "\n");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
