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
// 4차(모델·품질 비교): --only id,id 로 입력을 고르고 --quality fine|standard 로 그리기 수준을 정한다. 모델은 환경변수 OPENAI_IMAGE_MODEL.
const ONLY = arg("--only")?.split(",");
const QUALITY = (arg("--quality") ?? "standard") as "standard" | "fine";
const TAG = arg("--tag") ?? "";
const LOGO_ID = arg("--logo") ?? "dalkom";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 선택 규칙 시험(11/5): 입력 조합 3가지 → 규칙(engine/scripts/guide_select.py)이 뽑은 구조 참고 폰트로 30자를 그려 인상이 입력과 맞는지 본다.
// 구조 참고는 강하게(guideStrong) 주고 방향 설계 지시문·속성 축은 뺀다(11/5 시험에서 이래야 따라간다고 확인). 표현은 입력 분위기를 한 줄로 쓴다.
// 2차: 같은 입력에서 (구조 참고 폰트 + 구체적인 분위기 문장) 대 (문장만, 구조 참고 폰트 없음)을 비교해 인상을 정하는 쪽을 가른다.
const RICH = {
  cute: "통통하고 동글동글한 획, 모서리가 모두 둥글고 획 끝이 뭉툭한 귀여운 글씨",
  premium: "가로획은 가늘고 세로획은 또렷한 굵기 대비, 획 끝이 가늘게 빠지는 단정하고 우아한 명조 느낌의 글씨",
  traditional: "세리프가 분명한 전통 바탕체 느낌, 가로획은 가늘고 세로획은 굵으며 붓 질감 없이 깨끗한 윤곽",
};
const VARIANTS: { id: string; font?: string; tones: UploadInput["brandTones"]; usage: UploadInput["usageContexts"]; expression: string }[] = [
  { id: "cute-font", font: "Jua-Regular", tones: ["cute", "playful"], usage: ["packaging_sticker"], expression: RICH.cute },
  { id: "cute-text", tones: ["cute", "playful"], usage: ["packaging_sticker"], expression: RICH.cute },
  { id: "premium-font", font: "NanumKarGugSu", tones: ["premium", "calm"], usage: ["print_card"], expression: RICH.premium },
  { id: "premium-text", tones: ["premium", "calm"], usage: ["print_card"], expression: RICH.premium },
  { id: "trad-font", font: "BlackHanSans-Regular", tones: ["traditional"], usage: ["signage_menu"], expression: RICH.traditional },
  { id: "trad-text", tones: ["traditional"], usage: ["signage_menu"], expression: RICH.traditional },
];

async function main() {
  if (ONLY) { for (let i = VARIANTS.length - 1; i >= 0; i--) if (!ONLY.includes(VARIANTS[i].id)) VARIANTS.splice(i, 1); }
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
    attributes: null, // 1차 시험은 둥글고 굵게를 남겨 구조 참고가 묻혔다 → 속성 없음
  };
  const style = await analyzeStyle(upload);
  const direction = style.directions![0];
  const base = applyDirection(style, direction);
  console.log(`방향: ${base.family} · ${direction.expression}`);
  for (const v of VARIANTS) {
    const axes = base.axes.map((ax) => ({ ...ax, chosen: false }));
    const applied = {
      ...base,
      axes,
      designBrief: null,
      expression: v.expression,
      guideFont: v.font,
      guideStrong: !!v.font,
      guideWarp: v.font ? 0.6 : 0,
      signatureDraw: null,
    };
    const t0 = Date.now();
    try {
      const jobId = startGlyphJob({ upload: { ...upload, brandTones: v.tones, usageContexts: v.usage }, style: applied, sampleId: null, quality: QUALITY });
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
        licenseText: "select-test",
        aiNotice: "select-test",
        edits: [],
        tweaks: {},
        provenance: { source: "experiment-freedom", variant: v.id + TAG, guideFont: v.font ?? null, tones: v.tones, usage: v.usage, logoId: logo.id, family: applied.family ?? null, expression: direction.expression, refsReady: ready },
      });
      let phase = "composing";
      for (let i = 0; i < 150 && phase !== "done" && phase !== "failed"; i++) {
        await sleep(1000);
        phase = ((await (await fetch(`${ENGINE_URL}/builds/${buildId}`)).json()) as { phase: string }).phase;
      }
      const row = { variant: v.id + TAG, guideFont: v.font ?? null, tones: v.tones, usage: v.usage, failed: job.items.filter((i) => i.status !== "ready").length, buildId, jobId, ready, phase, seconds: Math.round((Date.now() - t0) / 1000) };
      await fs.appendFile(OUT, JSON.stringify(row) + "\n");
      console.log(`  ${v.id}: 참고 글자 ${ready}자, 빌드 ${phase}, ${row.seconds}초`);
    } catch (err) {
      console.error(`  ${v.id} 실패: ${err instanceof Error ? err.message : err}`);
      await fs.appendFile(OUT, JSON.stringify({ variant: v.id + TAG, guideFont: v.font ?? null, tones: v.tones, usage: v.usage, error: String(err) }) + "\n");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
