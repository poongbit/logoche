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

// 새 스타일 네 가지 시험(11/5): 펜글씨·어린이 글씨·레트로 간판체·도트체. 같은 로고에서 Claude 방향 호출은 한 번만 하고, 방향의 계열·표현·설계 지시문·굵기를
// 스타일별로 갈아 끼운다(시그니처 끈다). 기준 글자표 강도는 구조가 필요한 스타일은 그대로, 자유로움이 필요한 스타일은 칸 번호만.
const STYLES: { id: string; family: "display"; expression: string; brief: string; weight: number; guide: "light" | "none" | undefined }[] = [
  {
    id: "pen",
    family: "display",
    expression: "펜으로 또박또박 쓴 필기체",
    brief: "펜글씨 서체: 볼펜이나 만년필로 또박또박 써 내려간 필기체다. 선 굵기는 거의 일정하고 가장자리는 매끈하며 붓 자국이나 번짐은 없다. 글자마다 획의 길이와 기울기가 조금씩 다르고 자모가 자연스럽게 이어지기도 한다. 글자 크기는 고르지만 모양은 손으로 쓴 듯 자유롭다. 글자는 또렷이 읽혀야 한다.",
    weight: 420,
    guide: "none",
  },
  {
    id: "kid",
    family: "display",
    expression: "크레용으로 쓴 삐뚤빼뚤 통통한 글씨",
    brief: "어린이 글씨 서체: 크레용이나 굵은 마커로 어린이가 쓴 듯 통통하고 삐뚤빼뚤하다. 획이 곧지 않고 조금씩 휘며 글자 크기와 기울기가 제각각이다. 모서리는 둥글고 획 끝은 뭉툭하다. 귀엽고 서툰 손맛이 있되 글자는 또렷이 읽혀야 한다.",
    weight: 620,
    guide: "none",
  },
  {
    id: "retro",
    family: "display",
    expression: "70~80년대 간판 글씨",
    brief: "레트로 간판체 서체: 1970~80년대 가게 간판 글씨다. 획이 굵고 각지며 모서리를 사선으로 깎아 낸다. 가로획 끝이나 꺾임 자리에 두께를 키운 장식 돌기를 넣고, 글자 안쪽 속공간은 좁게 둔다. 글자 틀을 꽉 채우듯 크게 쓰고 모든 글자의 모서리 처리를 같게 맞춘다.",
    weight: 780,
    guide: undefined,
  },
  {
    id: "dot",
    family: "display",
    expression: "정사각 도트로 쌓은 픽셀 글씨",
    brief: "도트체 서체: 모든 획을 같은 크기의 정사각 픽셀 블록으로 쌓아 그린다. 곡선과 사선도 계단 모양으로 표현하고 블록 크기와 간격이 모든 글자에서 같다. 가장자리는 흐리지 않고 또렷하며 획 굵기는 블록 두 칸으로 일정하다. 글자는 또렷이 읽혀야 한다.",
    weight: 600,
    guide: undefined,
  },
];

async function main() {
  const logo = SAMPLE_LOGOS.find((l) => l.id === LOGO_ID)!;
  console.log(`로고 ${logo.id}, 스타일 ${STYLES.map((v) => v.id).join(", ")}${DRY ? " (--dry: AI 호출 없음)" : ""}`);
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
    brandTones: ["warm", "cute"],
    usageContexts: ["signage_menu", "packaging_sticker"],
    desiredFeel: "동네 주민들이 매일 아침 들르는 작은 빵집이에요. 갓 구운 빵의 따뜻하고 푸근한 분위기를 담고 싶어요.",
    logoSource: null,
    logoFont: null,
    logoFontName: "",
  };
  const style = await analyzeStyle(upload);
  const direction = style.directions![0];
  console.log("방향 호출 한 번(스타일별로 갈아 끼움)");
  for (const v of STYLES) {
    const applied = { ...applyDirection(style, { ...direction, family: v.family, expression: v.expression, brief: v.brief, weight: v.weight }), guide: v.guide, signatureDraw: null };
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
        licenseText: "styles2-test",
        aiNotice: "styles2-test",
        edits: [],
        tweaks: {},
        provenance: { source: "experiment-styles2", variant: v.id, guide: v.guide ?? "full", logoId: logo.id, family: applied.family ?? null, expression: direction.expression, refsReady: ready },
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
