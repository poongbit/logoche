// 닮음 가드 전체 흐름 시험(11/5): 가드가 닮은 참고 글자를 알아보고 다른 구조 참고 폰트로 다시 그린 뒤 가장 덜 닮은 것을 고르는지 본다.
// 서체 만들기(나머지 2,300자)는 하지 않는다. 기준을 낮춰(GUARD_REF_THRESHOLD=0.5) 일부러 다시 그리기를 일으킨다.
// 실제 AI 호출: Claude 1번 + 이미지 3번 정도(어림 $0.15). 실행(web 폴더, 엔진 8000번):
//   LOGOCHE_GUIDE_FONT=1 GUARD_REF_THRESHOLD=0.5 OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst LOGOCHE_LEDGER=… LOGOCHE_COST_CAP=0.4 FONT_ENGINE_URL=http://127.0.0.1:8000 node --env-file=.env.local <tsx>/dist/cli.mjs scripts/gen-guard-test.ts
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SAMPLE_LOGOS } from "@/lib/constants";
import { getGlyphJob, startGlyphJob } from "@/lib/server/glyphs";
import { glyphRequest, guardRefs, deleteProject } from "@/lib/server/projects";
import { analyzeStyle, applyDirection } from "@/lib/server/style";
import type { UploadInput } from "@/lib/types";

const OWNER = "guard-test";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const logo = SAMPLE_LOGOS.find((l) => l.id === "bada")!;
  const svg = await fs.readFile(path.join(process.cwd(), "public", logo.src.replace(/^\//, "")));
  const png = await sharp(svg, { density: 192 }).resize({ width: 800 }).flatten({ background: "#ffffff" }).png().toBuffer();
  const logoImage = `data:image/png;base64,${png.toString("base64")}`;
  const upload: UploadInput = {
    logoImage, logoFileName: "bada.svg", logoHash: createHash("sha256").update(svg).digest("hex"), inputPath: "sample", sampleId: logo.id,
    storeName: logo.prefill.storeName, industry: logo.prefill.industry, industryOther: "", brandTones: ["premium", "calm"], usageContexts: ["print_card"],
    desiredFeel: "", logoSource: null, logoFont: null, logoFontName: "", attributes: null,
  };
  const style0 = await analyzeStyle(upload);
  const style = applyDirection(style0, style0.directions![0]);
  const id = crypto.randomUUID();
  const dir = path.join(process.cwd(), ".data", "projects");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.logo`), logoImage);
  const now = Date.now();
  const stored = {
    id, owner: OWNER, createdAt: now, updatedAt: now, name: "가드시험체", favorite: false, upload: { ...upload, logoImage: null }, quality: "standard", style,
    glyphJobId: null, buildJobId: null, fontId: null, phase: "drawing", error: null, review: { readyAt: null, held: false, continued: false }, result: null, record: [],
  };
  await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(stored));
  try {
    const req = await glyphRequest(stored as never);
    console.log("처음 구조 참고 폰트:", req.style.guideFont ?? "(없음)");
    const jobId = startGlyphJob(req);
    let job = await getGlyphJob(jobId);
    while (job.status === "running") {
      await sleep(2000);
      job = await getGlyphJob(jobId);
    }
    console.log("처음 30자:", job.items.filter((i) => i.status === "ready").length, "자 통과");
    const out = await guardRefs(stored as never, jobId);
    console.log("가드 결과:", out ? { 새작업: out.jobId !== jobId, 폰트: out.style?.guideFont ?? "(처음 것 유지)", 기록: out.note } : "가드가 일하지 않음(기준 미만)");
  } finally {
    await deleteProject(OWNER, id).catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
