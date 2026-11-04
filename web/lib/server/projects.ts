// 폰트 작업(11/2 B안: 만들기 → 만드는 중 → 스튜디오). '폰트 만들기'를 한 번 누르면 서버가
// 로고 읽기 → 참고 글자 30자 → 확인(20초 뒤 저절로 계속) → 나머지 글자·숫자·문장부호 → 폰트 파일·검사를 이어서 돌린다.
// 창을 닫아도 서버에서 계속 돈다. 사용자가 참고 글자를 눌러 고르면(hold) 확인 단계에서 '계속'을 누를 때까지 기다린다.
// 단계마다 쓰는 일은 화면 2~4가 쓰던 함수 그대로다(analyzeStyle·startGlyphJob·retryGlyph·startBuild·getBuild). 화면 2 견본 고르기는 없고
// 표현 방식은 AI가 낸 첫 안을 쓴다.
//
// 작업마다 web/.data/projects/<id>.json(단계·분석 결과·작업 번호·제작 기록)과 <id>.logo(로고 data URL)를 둔다.
// 그린 글자는 지금처럼 .data/glyphs/<참고 글자 작업>/에 있다.
// 서버를 다시 켜면 그리던 단계는 끊긴다(참고 글자·나머지 글자 진행이 메모리에 있다). 그 작업은 실패로 두고 '다시 만들기'로 이어서 그린다
// (그린 글자는 그대로 쓰고 못 그린 글자만 그린다).
// 11/2 구글 로그인: 주인(owner)은 로그인한 사람의 id다(lib/server/auth.ts). 밖에서 부르는 함수는 모두 주인을 받아 확인하고,
// 남의 작업은 없는 것처럼 404를 낸다. 로그인을 넣기 전에 만든 작업(owner 'local')은 아무에게도 보이지 않는다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { AXES, BRAND_TONES, CHECKS, EXTRA_CHARS, LOGO_FONTS, LOGO_SOURCES, NEAREST_KIND_LABELS, SHOWCASE_FONTS, USAGE_CONTEXTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { industryText, isImitationRequest } from "@/lib/rules";
import type {
  BuildJob,
  CreateProjectRequest,
  DrawQuality,
  ProjectPhase,
  ProjectSummary,
  ProjectView,
  RecordCategory,
  RecordEvent,
  ReviewAction,
  SaveGlyphTweakRequest,
  SaveGlyphTweakResponse,
  StartBuildJobRequest,
  StartGlyphJobRequest,
  StyleCard,
  UpdateProjectRequest,
  UploadInput,
} from "@/lib/types";
import { getBuild, startBuild } from "./build";
import { engineRequest, readEdits } from "./edits";
import { engine } from "./engine";
import { RouteError } from "./env";
import { getGlyphJob, readyRefs, retryGlyph, startGlyphJob } from "./glyphs";
import { doneMail, emailOf, failedMail, sendMail } from "./mail";
import { restDrawnChars, restRecheck, restStyleRedrawn } from "./rest";
import { analyzeStyle } from "./style";
import { ALL_GLYPHS, checkTweakKey, clampTweak, describeTweak, readTweakHistory, readTweakTable, writeTweak, type TweakHistoryEntry } from "./tweaks";

const DIR = path.join(process.cwd(), ".data", "projects");
const REVIEW_SECONDS = 20; // 참고 글자를 보여 주고 저절로 계속하기까지
const ID = /^[0-9a-f-]{36}$/;
const RUNNING: ProjectPhase[] = ["analyzing", "drawing", "reviewing", "building"];

interface Stored {
  id: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  favorite: boolean;
  upload: UploadInput; // logoImage는 비워 두고 <id>.logo에 따로 둔다(목록을 읽을 때 큰 그림을 읽지 않게)
  quality: DrawQuality;
  style: StyleCard | null;
  glyphJobId: string | null;
  buildJobId: string | null;
  fontId: string | null;
  phase: ProjectPhase;
  error: string | null;
  review: { readyAt: number | null; held: boolean; continued: boolean };
  result: { build: BuildJob; missing: string[]; extras: string[] } | null;
  record: RecordEvent[];
  notified?: "done" | "failed"; // 완성·멈춤 알림 메일을 이미 보낸 종류(같은 메일을 두 번 보내지 않게)
}

const store = globalThis as unknown as { __logocheProjectLocks?: Map<string, Promise<unknown>>; __logocheDrivers?: Set<string> };
const locks: Map<string, Promise<unknown>> = (store.__logocheProjectLocks ??= new Map());
const drivers: Set<string> = (store.__logocheDrivers ??= new Set());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const event = (category: RecordCategory, text: string): RecordEvent => ({ at: new Date().toISOString(), category, text });
const labelOf = <T extends string>(list: { value: T; label: string }[], value: T | null) => list.find((x) => x.value === value)?.label ?? "";
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ---------- 파일 ----------

function file(id: string, ext = "json"): string {
  if (!ID.test(id)) throw new RouteError(404, "폰트를 찾을 수 없어요");
  return path.join(DIR, `${id}.${ext}`);
}

async function read(id: string): Promise<Stored> {
  let p: Stored;
  try {
    p = JSON.parse(await fs.readFile(file(id), "utf-8"));
  } catch (err) {
    if (err instanceof RouteError) throw err;
    throw new RouteError(404, "폰트를 찾을 수 없어요");
  }
  return p;
}

/** 주인이 맞을 때만 읽는다. 서버 진행(drive)은 주인과 상관없이 read를 쓴다. */
async function readOwned(owner: string, id: string): Promise<Stored> {
  const p = await read(id);
  if (p.owner !== owner) throw new RouteError(404, "폰트를 찾을 수 없어요");
  return p;
}

async function write(p: Stored) {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${file(p.id)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(p));
  await fs.rename(tmp, file(p.id));
}

/** 읽고 고쳐 쓴다. 같은 작업은 차례로 한다(화면 요청과 서버 진행이 겹쳐도 서로 덮어쓰지 않게). */
function update(id: string, change: (p: Stored) => void | Promise<void>): Promise<Stored> {
  const next = (locks.get(id) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const p = await read(id);
      await change(p);
      p.updatedAt = Date.now();
      await write(p);
      return p;
    });
  locks.set(id, next);
  void next.catch(() => {}).finally(() => locks.get(id) === next && locks.delete(id));
  return next;
}

async function logoOf(id: string): Promise<string> {
  try {
    return await fs.readFile(file(id, "logo"), "utf-8");
  } catch {
    throw new RouteError(404, "로고를 찾을 수 없어요");
  }
}

export async function readLogo(owner: string, id: string): Promise<string> {
  await readOwned(owner, id);
  return logoOf(id);
}

/** 이 사람이 만든 폰트 파일인지(폰트 id는 빌드 작업 번호와 같다) */
export async function ownsFont(owner: string, fontId: string): Promise<boolean> {
  return (await ownedProjects(owner)).some((p) => p.fontId === fontId || p.buildJobId === fontId);
}

export async function ownsGlyphJob(owner: string, jobId: string): Promise<boolean> {
  return (await ownedProjects(owner)).some((p) => p.glyphJobId === jobId);
}

async function glyphRequest(p: Stored): Promise<StartGlyphJobRequest> {
  if (!p.style) throw new RouteError(409, "로고를 아직 읽는 중이에요");
  return { upload: { ...p.upload, logoImage: await logoOf(p.id) }, style: p.style, sampleId: null, quality: p.quality };
}

async function buildRequest(p: Stored): Promise<StartBuildJobRequest> {
  const req = await glyphRequest(p);
  return { ...req, storeName: p.upload.storeName, logoHash: p.upload.logoHash, glyphJobId: p.glyphJobId, axes: req.style.axes };
}

// ---------- 만들기 ----------

/** 화면 1이 남기던 기록(로고 원본·권리 답변·창작 의도)에 그리기 수준을 더한다. */
function firstRecord(u: UploadInput): RecordEvent[] {
  const out = [
    event("selection", `로고 원본: ${u.logoFileName} (${u.inputPath === "sample" ? "샘플" : "업로드"}) · 해시 ${u.logoHash?.slice(0, 8)}`),
    event("selection", `로고 출처 답변: ${labelOf(LOGO_SOURCES, u.logoSource)}`),
  ];
  const fontName = u.logoFont === "free_font" || u.logoFont === "commercial_font" ? u.logoFontName.trim() : "";
  out.push(event("selection", `로고 글자 폰트 답변: ${labelOf(LOGO_FONTS, u.logoFont)}${fontName ? ` (${fontName})` : ""}`));
  const intent = [
    u.industry && `업종 ${industryText(u)}`,
    u.brandTones.length && `브랜드 톤 ${u.brandTones.map((t) => labelOf(BRAND_TONES, t)).join(", ")}`,
    u.usageContexts.length && `주 사용처 ${u.usageContexts.map((x) => labelOf(USAGE_CONTEXTS, x)).join(", ")}`,
  ].filter(Boolean);
  out.push(event("creative_intent", intent.length ? intent.join(" · ") : "업종·톤·사용처는 고르지 않음(톤은 AI가 로고에서 읽음)"));
  if (u.desiredFeel.trim()) out.push(event("creative_intent", `원하는 느낌: ${u.desiredFeel.trim()}`));
  return out;
}

export async function createProject(owner: string, req: CreateProjectRequest): Promise<string> {
  const u = req.upload;
  if (!u.logoImage) throw new RouteError(400, "로고를 올려 주세요");
  if (!u.storeName.trim()) throw new RouteError(400, "가게 이름을 적어 주세요");
  if (!u.logoSource || !u.logoFont) throw new RouteError(400, "권리 확인 두 가지를 골라 주세요");
  if (isImitationRequest(u.desiredFeel)) throw new RouteError(400, "특정 서체는 따라 하지 않아요. 원하는 느낌을 말로 적어 주세요.");
  const quality: DrawQuality = "fine"; // 11/3: 그리기 수준 선택을 없애고 정밀만 쓴다
  const id = crypto.randomUUID();
  const now = Date.now();
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(file(id, "logo"), u.logoImage);
  await write({
    id,
    owner,
    createdAt: now,
    updatedAt: now,
    name: `${u.storeName.trim()}체`,
    favorite: false,
    upload: { ...u, storeName: u.storeName.trim(), logoImage: null },
    quality,
    style: null,
    glyphJobId: null,
    buildJobId: null,
    fontId: null,
    phase: "analyzing",
    error: null,
    review: { readyAt: null, held: false, continued: false },
    result: null,
    record: firstRecord(u),
  });
  drive(id);
  return id;
}

// ---------- 단계 ----------

/** 로고를 읽어 조절값·표현 방식을 정하고 참고 글자 30자를 그리기 시작한다. */
async function analyze(p: Stored) {
  const style = await analyzeStyle({ ...p.upload, logoImage: await logoOf(p.id) });
  const glyphJobId = startGlyphJob(await glyphRequest({ ...p, style }));
  await update(p.id, (q) => {
    q.style = style;
    q.glyphJobId = glyphJobId;
    q.phase = "drawing";
    for (const m of style.models) q.record.push(event("ai_model", `스타일 분석: ${m}`));
    q.record.push(event("selection", `AI가 정한 조절값: ${style.axes.map((a) => `${AXES[a.key].label} ${a.value}`).join(" · ")}`));
    q.record.push(event("creative_intent", `표현 방식: ${style.expression} (AI 제안${q.upload.desiredFeel.trim() ? ", 원하는 느낌 반영" : ""})`));
  });
}

/** 참고 글자 작업이 끝나기를 기다렸다가 확인 단계로 넘어간다. */
async function waitRefs(p: Stored) {
  const id = p.glyphJobId!;
  let job = await getGlyphJob(id);
  while (job.status === "running") {
    await sleep(2000);
    job = await getGlyphJob(id);
  }
  const ready = job.items.filter((i) => i.status === "ready").length;
  if (ready === 0) throw new Error("참고 글자를 하나도 그리지 못했어요");
  await update(p.id, (q) => {
    q.phase = "reviewing";
    q.review = { readyAt: Date.now(), held: false, continued: false };
    for (const m of job.models) q.record.push(event("ai_model", `참고 글자 그리기·검사: ${m}`));
    q.record.push(event("selection", `참고 글자 ${job.items.length}자 중 ${ready}자 통과`));
  });
}

/** 확인 단계: 20초가 지나거나(고른 글자가 없을 때) 사용자가 '계속'을 누르면 나머지 글자를 그린다. 다시 그리는 글자가 있으면 끝날 때까지 기다린다. */
async function waitReview(p: Stored) {
  for (;;) {
    const q = await read(p.id);
    if (q.phase !== "reviewing") return;
    const job = await getGlyphJob(q.glyphJobId!);
    const busy = job.items.some((i) => i.status === "drawing" || i.status === "redrawing");
    const timeUp = !q.review.held && q.review.readyAt !== null && Date.now() >= q.review.readyAt + REVIEW_SECONDS * 1000;
    if ((q.review.continued || timeUp) && !busy) break;
    await sleep(1000);
  }
  const q = await read(p.id);
  const buildJobId = await startBuild(await buildRequest(q));
  await update(p.id, (r) => {
    r.phase = "building";
    r.buildJobId = buildJobId;
    r.record.push(event("selection", r.review.continued ? "참고 글자를 확인하고 계속함" : `참고 글자를 ${REVIEW_SECONDS}초 동안 그대로 두어 저절로 계속함`));
  });
}

function summarize(job: BuildJob): string {
  const failed = job.checks.filter((c) => c.status !== "pass").map((c) => CHECKS.find((x) => x.key === c.key)?.label);
  const misread = job.misreads.map((m) => `${m.char}→${m.read || "?"}`).join(", ");
  const parts = [failed.length === 0 ? "7항목 통과" : `실패: ${failed.join(", ")}`, `OCR ${job.ocrPassed ? "통과" : "실패"}${misread ? `(다르게 읽음: ${misread})` : ""}`];
  if (job.similarity) {
    const s = job.similarity;
    parts.push(`유사도 ${s.score.toFixed(2)} (기준 ${s.threshold.toFixed(2)}, 가장 가까운 ${NEAREST_KIND_LABELS[s.nearestKind]} '${s.nearestFont}')`);
  }
  return parts.join(" · ");
}

/** 완성·멈춤을 만든 사람에게 메일로 알린다. 같은 종류는 한 번만 보내고, 실패해도 작업에는 영향이 없다. */
async function notify(id: string, kind: "done" | "failed") {
  try {
    let claimed = false;
    const p = await update(id, (r) => {
      if (r.notified === kind || r.upload.notifyByEmail === false) return;
      r.notified = kind;
      claimed = true;
    });
    if (!claimed) return;
    const to = emailOf(p.owner);
    if (!to) return; // 로그인 없이 만든 작업
    const missing = p.result?.missing.length ?? 0;
    const mail = kind === "done" ? doneMail(to, p.name, p.id, KSX1001_HANGUL.size - missing, p.result?.extras.length ?? 0) : failedMail(to, p.name, p.id);
    if (!(await sendMail(mail))) await update(id, (r) => void (r.notified = undefined)); // 키가 없어 못 보냈으면 나중에 다시 시도할 수 있게
  } catch (err) {
    console.error("[logoche] 알림 메일 실패", id, err);
    await update(id, (r) => void (r.notified = undefined)).catch(() => {});
  }
}

/** 나머지 글자·폰트 파일·검사가 끝나기를 기다린다. */
async function waitBuild(p: Stored) {
  for (;;) {
    const q = await read(p.id);
    if (q.phase !== "building") return;
    const job = await getBuild(q.buildJobId!);
    if (job.phase === "failed") throw new Error(job.error ?? "폰트를 만들지 못했어요");
    if (job.phase === "done") {
      const present = new Set([...(await readyRefs(q.glyphJobId!)).map((r) => r.char), ...(await restDrawnChars(q.glyphJobId!))]);
      const missing = [...KSX1001_HANGUL].filter((c) => !present.has(c));
      const extras = [...EXTRA_CHARS].filter((c) => present.has(c));
      const glyphModels = (await getGlyphJob(q.glyphJobId!).catch(() => null))?.models ?? [];
      const restyled = await restStyleRedrawn(q.glyphJobId!);
      await update(p.id, (r) => {
        r.phase = "done";
        r.fontId = job.fontId;
        r.error = null;
        r.result = { build: job, missing, extras };
        for (const m of glyphModels) r.record.push(event("ai_model", `글자 그리기·검사: ${m}`));
        for (const m of job.models) r.record.push(event("ai_model", `폰트 검사: ${m}`));
        if (restyled) r.record.push(event("check", `획 두께·크기가 다른 글자와 달라 다시 그린 글자 ${restyled}자`));
        r.record.push(event("check", summarize(job)));
      });
      void notify(p.id, "done");
      return;
    }
    await sleep(3000);
  }
}

const STEPS: Partial<Record<ProjectPhase, (p: Stored) => Promise<void>>> = {
  analyzing: analyze,
  drawing: waitRefs,
  reviewing: waitReview,
  building: waitBuild,
};

/** 작업을 끝까지 돌린다. 이미 돌고 있으면 그대로 둔다(서버를 다시 켠 뒤 화면이 물어보면 다시 붙는다). */
function drive(id: string) {
  if (drivers.has(id)) return;
  drivers.add(id);
  void (async () => {
    let phase: ProjectPhase | null = null;
    try {
      for (;;) {
        const p = await read(id);
        const step = STEPS[p.phase];
        if (!step) return;
        phase = p.phase;
        await step(p);
      }
    } catch (err) {
      if (err instanceof RouteError && err.status === 404 && phase === null) return; // 지운 작업
      console.error("[logoche] 폰트 작업 실패", id, err);
      // 참고 글자·빌드 작업을 찾지 못하면 서버를 다시 켜 끊긴 것이다.
      const lost = err instanceof RouteError && err.status === 404;
      const message = lost ? "만드는 도중 서버가 다시 켜져 멈췄어요. 그린 글자는 남아 있어요." : errorText(err);
      await update(id, (p) => {
        p.phase = "failed";
        p.error = message;
      }).catch(() => {});
      if (!lost) void notify(id, "failed"); // 서버가 다시 켜져 끊긴 것은 이어서 만들면 되니 알리지 않는다
    } finally {
      drivers.delete(id);
    }
  })();
}

// ---------- 보기 ----------

async function summaryOf(p: Stored): Promise<{ summary: ProjectSummary; build: BuildJob | null }> {
  let progress: ProjectSummary["progress"] = null;
  let remainingSeconds: number | null = null;
  let build: BuildJob | null = p.phase === "done" ? (p.result?.build ?? null) : null;
  if (p.phase === "drawing" && p.glyphJobId) {
    const job = await getGlyphJob(p.glyphJobId).catch(() => null);
    if (job) progress = { done: job.items.filter((i) => i.status === "ready").length, total: job.items.length };
  }
  if (p.phase === "building" && p.buildJobId) {
    build = await getBuild(p.buildJobId).catch(() => null);
    const draw = build?.stages.find((s) => s.key === "draw");
    if (draw) progress = { done: draw.done, total: draw.total };
    remainingSeconds = build?.remainingSeconds ?? null;
  }
  const missing = p.result?.missing;
  return {
    build,
    summary: {
      id: p.id,
      name: p.name,
      storeName: p.upload.storeName,
      desiredFeel: p.upload.desiredFeel,
      favorite: p.favorite,
      phase: p.phase,
      quality: p.quality,
      createdAt: new Date(p.createdAt).toISOString(),
      logoUrl: `/api/projects/${p.id}/logo`,
      fontId: p.phase === "done" ? p.fontId : null,
      glyphCount: p.phase === "done" && missing ? KSX1001_HANGUL.size - missing.length : null,
      extraCount: p.phase === "done" ? (p.result?.extras.length ?? 0) : null,
      progress,
      remainingSeconds,
      error: p.error,
    },
  };
}

/** 이 사람의 작업, 최근 것부터 */
async function ownedProjects(owner: string): Promise<Stored[]> {
  const names = await fs.readdir(DIR).catch(() => [] as string[]);
  const projects = await Promise.all(
    names.filter((n) => n.endsWith(".json")).map((n) => read(n.slice(0, -".json".length)).catch(() => null)),
  );
  return projects.filter((p): p is Stored => p !== null && p.owner === owner).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listProjects(owner: string): Promise<ProjectSummary[]> {
  const mine = await ownedProjects(owner);
  for (const p of mine) if (RUNNING.includes(p.phase)) drive(p.id);
  return Promise.all(mine.map(async (p) => (await summaryOf(p)).summary));
}

/** 탭 제목용 폰트 이름. 없거나 남의 것이면 null */
export async function projectName(owner: string, id: string): Promise<string | null> {
  return readOwned(owner, id).then(
    (p) => p.name,
    () => null,
  );
}

export async function getProject(owner: string, id: string): Promise<ProjectView> {
  const p = await readOwned(owner, id);
  if (RUNNING.includes(p.phase)) drive(id);
  const { summary, build } = await summaryOf(p);
  let review: ProjectView["review"] = null;
  if ((p.phase === "drawing" || p.phase === "reviewing") && p.glyphJobId) {
    const job = await getGlyphJob(p.glyphJobId).catch(() => null);
    const waiting = p.phase === "reviewing" && !p.review.held && !p.review.continued && p.review.readyAt !== null;
    review = {
      items: job?.items ?? [],
      continueAt: waiting ? p.review.readyAt! + REVIEW_SECONDS * 1000 : null,
      held: p.review.held,
    };
  }
  let recent: ProjectView["recent"] = [];
  if (p.phase === "building" && p.glyphJobId) {
    const jobId = p.glyphJobId;
    recent = (await restDrawnChars(jobId))
      .slice(0, 60)
      .map((char) => ({ char, imageUrl: `/api/glyphs/jobs/${jobId}/rest/${char.codePointAt(0)!.toString(16)}` }));
  }
  const upload: Partial<UploadInput> = { ...p.upload };
  delete upload.logoImage;
  return {
    ...summary,
    upload: upload as Omit<UploadInput, "logoImage">,
    colors: p.style?.colors ?? [],
    review,
    build,
    recent,
    missing: p.result?.missing ?? [],
    extras: p.result?.extras ?? [],
    recheck: p.phase === "done" && p.glyphJobId ? await restRecheck(p.glyphJobId).catch(() => []) : [],
    tweaks: p.glyphJobId ? await readTweakTable(p.glyphJobId) : {},
    record: p.record,
  };
}

// ---------- 바꾸기 ----------

/** 확인 단계에서의 동작: 고르는 중(hold)·고른 것을 다 풀기(release)·계속(continue)·고른 글자 다시 그리기(redraw) */
export async function reviewProject(owner: string, id: string, action: ReviewAction): Promise<void> {
  const p = await readOwned(owner, id);
  if (p.phase !== "reviewing") throw new RouteError(409, "참고 글자를 확인하는 단계가 아니에요");
  if (action.action === "redraw") {
    const req = await glyphRequest(p);
    const job = await getGlyphJob(p.glyphJobId!);
    const chars: string[] = [];
    for (const index of action.indices) {
      await retryGlyph(p.glyphJobId!, index, req);
      chars.push(job.items[index]?.char ?? String(index));
    }
    await update(id, (q) => {
      q.review.held = true;
      q.record.push(event("selection", `참고 글자 다시 그리기: ${chars.join(", ")}`));
    });
  } else {
    await update(id, (q) => {
      if (action.action === "hold") q.review.held = true;
      if (action.action === "release") {
        q.review.held = false;
        q.review.readyAt = Date.now();
      }
      if (action.action === "continue") q.review.continued = true;
    });
  }
  drive(id);
}

/** 다시 만들기: 그린 글자는 그대로 두고 빠진 글자만 그려 폰트를 다시 만든다. 참고 글자가 없으면 처음부터 한다. */
export async function rebuildProject(owner: string, id: string): Promise<void> {
  const p = await readOwned(owner, id);
  if (RUNNING.includes(p.phase) && drivers.has(id)) throw new RouteError(409, "아직 만드는 중이에요");
  const refs = p.glyphJobId ? await readyRefs(p.glyphJobId).catch(() => []) : [];
  if (!p.style || refs.length === 0) {
    await update(id, (q) => {
      q.phase = "analyzing";
      q.error = null;
      q.glyphJobId = null;
      q.buildJobId = null;
      q.record.push(event("selection", "처음부터 다시 만듦"));
    });
  } else {
    const buildJobId = await startBuild(await buildRequest(p));
    await update(id, (q) => {
      q.record.push(event("selection", q.phase === "done" ? "빠진 글자를 다시 그려 폰트를 다시 만듦" : "멈춘 곳부터 이어서 그림"));
      q.phase = "building";
      q.buildJobId = buildJobId;
      q.error = null;
    });
  }
  drive(id);
}

/** 다시 볼 글자 중 고른 글자를 다시 그려 폰트를 다시 만든다(11/2 품질 개선 2-3). 다시 그린 그림이 검사를 통과할 때만 바꾼다(rest.ts). */
export async function redrawGlyphs(owner: string, id: string, chars: string[]): Promise<void> {
  const p = await readOwned(owner, id);
  if (p.phase !== "done" || !p.glyphJobId) throw new RouteError(409, "다 만든 폰트만 글자를 다시 그릴 수 있어요");
  if (drivers.has(id)) throw new RouteError(409, "아직 만드는 중이에요");
  const allowed = new Set(await restDrawnChars(p.glyphJobId));
  const picked = [...new Set(chars)].filter((c) => allowed.has(c)).slice(0, 30);
  if (picked.length === 0) throw new RouteError(400, "다시 그릴 글자를 골라 주세요");
  const buildJobId = await startBuild({ ...(await buildRequest(p)), redraw: picked });
  await update(id, (q) => {
    q.record.push(event("selection", `다시 볼 글자에서 고른 ${picked.length}자를 다시 그림: ${picked.join("")}`));
    q.phase = "building";
    q.buildJobId = buildJobId;
    q.error = null;
  });
  drive(id);
}

/** 다듬기(11/3): 글자 하나 또는 전체("*")에 사용자가 조정을 더한다. tweak이 null이면 그 조정을 지운다.
 * 글자 하나는 지금 폰트 파일에서 그 글자만 바로 바꿔 끼운다(동기, 몇 초 안). 전체는 표만 바꾸고 rebuild: true를 돌려주므로,
 * 호출한 쪽이 폰트를 다시 만들어야 한다(rebuildProject). 모든 저장은 제작 기록에 human_edit 한 줄로 남는다. */
export async function saveProjectTweak(owner: string, id: string, req: SaveGlyphTweakRequest): Promise<SaveGlyphTweakResponse> {
  const p = await readOwned(owner, id);
  if (p.phase !== "done" || !p.glyphJobId || !p.style) throw new RouteError(409, "다 만든 폰트만 다듬을 수 있어요");
  if (drivers.has(id)) throw new RouteError(409, "아직 만드는 중이에요");
  const jobId = p.glyphJobId;
  const key = checkTweakKey(req.char);
  const baseWeight = p.style.axes.find((a) => a.key === "weight")?.value ?? 400;
  const tweak = req.tweak === null ? null : clampTweak(req.tweak, baseWeight);
  const note = typeof req.note === "string" ? req.note.trim().slice(0, 40) : "";

  // 표를 먼저 바꿔야 engineRequest가 새 조정을 읽는다. 엔진이 받지 않으면(빈 글자 등) 표를 되돌린다.
  const { table, previous } = await writeTweak(jobId, key, tweak, note);
  let patched = false;
  if (key !== ALL_GLYPHS && p.fontId) {
    try {
      const [edit] = await readEdits(jobId, new Set([key]));
      await engine.patchGlyph(p.fontId, await engineRequest(jobId, key, p.style.axes, edit ?? null));
      patched = true;
    } catch (err) {
      await writeTweak(jobId, key, previous, "저장 실패로 되돌림");
      throw err;
    }
  }
  if (JSON.stringify(previous) !== JSON.stringify(table[key] ?? null)) await update(id, (q) => void q.record.push(event("human_edit", describeTweak(key, previous, table[key] ?? null, note))));
  return { tweaks: table, patched, rebuild: key === ALL_GLYPHS };
}

/** 글자 하나(또는 전체)의 조정 기록(최대 100개). 되돌리기에 쓴다. */
export async function projectTweakHistory(owner: string, id: string, char: string): Promise<TweakHistoryEntry[]> {
  const p = await readOwned(owner, id);
  return p.glyphJobId ? readTweakHistory(p.glyphJobId, char) : [];
}

export async function updateProject(owner: string, id: string, req: UpdateProjectRequest): Promise<void> {
  await update(id, (p) => {
    if (p.owner !== owner) throw new RouteError(404, "폰트를 찾을 수 없어요");
    if (typeof req.name === "string") {
      const name = req.name.trim().slice(0, 40);
      if (!name) throw new RouteError(400, "폰트 이름을 적어 주세요");
      if (name !== p.name) p.record.push(event("selection", `폰트 이름 바꿈: ${p.name} → ${name}`));
      p.name = name;
    }
    if (typeof req.favorite === "boolean") p.favorite = req.favorite;
  });
}

/** 탈퇴 안내용: 이 사람이 만든 폰트 수와, 지금 만드는 중인 폰트 수 */
export async function accountSummary(owner: string): Promise<{ fonts: number; building: number }> {
  const mine = await ownedProjects(owner);
  return { fonts: mine.length, building: mine.filter((p) => RUNNING.includes(p.phase) || drivers.has(p.id)).length };
}

/** 탈퇴(11/4): 이 사람의 폰트 작업을 모두 지운다. 로고·제작 기록(작업 파일), 그린 글자·고친 글자·조정(.data/glyphs/<작업>), 엔진의 폰트 파일.
 * 만드는 중인 폰트가 있으면 아무것도 지우지 않고 409를 낸다. 메인에 진열하는 폰트 파일은 지우지 않는다.
 * 작업 파일은 가장 마지막에 지워서, 중간에 실패해도 다시 눌러 이어서 지울 수 있게 한다. 엔진의 발급 기록(issued)은 지우지 않는다. */
export async function deleteAllProjects(owner: string): Promise<number> {
  const mine = await ownedProjects(owner);
  if (mine.some((p) => RUNNING.includes(p.phase) || drivers.has(p.id))) throw new RouteError(409, "만드는 중인 폰트가 있어요. 다 만든 뒤에 탈퇴해 주세요.");
  const keep = new Set(SHOWCASE_FONTS.map((f) => f.fontId));
  for (const p of mine) {
    for (const id of new Set([p.fontId, p.buildJobId])) {
      if (!id || keep.has(id) || !/^[0-9a-f]{32}$/.test(id)) continue;
      await engine.discardBuild(id).catch((err) => {
        if (!(err instanceof RouteError && err.status === 404)) throw err; // 이미 없으면 넘어간다
      });
    }
    if (p.glyphJobId && ID.test(p.glyphJobId)) await fs.rm(path.join(process.cwd(), ".data", "glyphs", p.glyphJobId), { recursive: true, force: true });
    await fs.rm(file(p.id), { force: true });
    await fs.rm(file(p.id, "logo"), { force: true });
  }
  return mine.length;
}

export async function deleteProject(owner: string, id: string): Promise<void> {
  await readOwned(owner, id);
  await fs.rm(file(id), { force: true });
  await fs.rm(file(id, "logo"), { force: true });
}
