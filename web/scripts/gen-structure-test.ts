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

// 속성(둥글게·균일 등)과 부딪히지 않는 글자 구조 지시. 긍정문으로 쓴다.
const VARIANTS: { id: string; structure: string | null }[] = [
  { id: "none-1", structure: null },
  { id: "none-2", structure: null },
  { id: "wide-open", structure: "글자 구조: 가로로 넓은 네모 틀(가로 대 세로 약 1.1 대 1)을 꽉 채우고, 초성과 중성 사이를 넉넉히 벌리고, ㅇ과 ㅁ 같은 속공간을 아주 크게 연다. 획 사이는 느슨하고 시원하게 둔다." },
  { id: "tall-tight", structure: "글자 구조: 세로로 긴 틀(가로 대 세로 약 0.8 대 1)에 자모를 촘촘히 모으고, 속공간은 작게 둔다. ㅏ ㅣ ㅓ 같은 세로 모음을 길게 뻗어 세로 리듬을 만든다." },
  { id: "heavy-final", structure: "글자 구조: 받침을 크게 키워 글자의 무게중심을 아래쪽에 둔다. 초성은 작고 가볍게, 받침 칸은 넓고 안정적으로 그린다. ㅇ은 정원이 아닌 납작한 타원으로 그린다." },
  { id: "linked", structure: "글자 구조: 초성에서 중성으로 획이 이어지는 듯 자모를 서로 붙이고, 가로획을 길게 뻗어 글자 안에서 이어 읽히게 한다. 모서리는 크게 둥글린다." },
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
        licenseText: "structure-test",
        aiNotice: "structure-test",
        edits: [],
        tweaks: {},
        provenance: { source: "experiment-structure", variant: v.id, logoId: logo.id, family: applied.family ?? null, expression: direction.expression, refsReady: ready },
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
