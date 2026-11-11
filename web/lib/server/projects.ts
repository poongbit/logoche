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
import { AXES, BRAND_TONES, attributeLabel, CHECKS, EXTRA_CHARS, FAMILY_LABEL, weightLabel, LOGO_FONTS, LOGO_SOURCES, MIN_REFERENCE_READY, NEAREST_KIND_LABELS, SHOWCASE_FONTS, USAGE_CONTEXTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { DESIRED_FEEL_MAX, industryText, isImitationRequest, missingUploadFields } from "@/lib/rules";
import type {
  BuildJob,
  CreateProjectRequest,
  DrawQuality,
  ProjectPhase,
  ProjectSummary,
  ProjectView,
  RecordCategory,
  RecordEvent,
  ChooseAction,
  ReviewAction,
  GlyphParts,
  SaveGlyphTweakRequest,
  SaveGlyphTweakResponse,
  StartBuildJobRequest,
  StartGlyphJobRequest,
  StyleCard,
  UpdateProjectRequest,
  UploadInput,
} from "@/lib/types";
import { cancelBuild, getBuild, startBuild } from "./build";
import { editSource, engineRequest, listEdits, readEdits, saveEdit } from "./edits";
import { engine } from "./engine";
import { MOCK, RouteError } from "./env";
import { getGlyphJob, readyRefs, retryGlyph, startGlyphJob } from "./glyphs";
import { chooseGuideFont, guideFontEnabled } from "./guidefont";
import { chooseMail, doneMail, draftMail, emailOf, failedMail, sendMail } from "./mail";
import { restDrawnChars, restDrawnState, restRecheck, restStyleRedrawn } from "./rest";
import { createSample } from "./samples";
import { analyzeStyle, applyDirection, cleanSlogans } from "./style";
import { ALL_GLYPHS, checkTweakKey, clampTweak, describeTweak, readTweakHistory, readTweakTable, writeTweak, type TweakHistoryEntry } from "./tweaks";

const DIR = path.join(process.cwd(), ".data", "projects");
const ID = /^[0-9a-f-]{36}$/;
const RUNNING: ProjectPhase[] = ["analyzing", "choosing", "drawing", "reviewing", "building"];
// 서버가 지금 일을 하고 있는 단계. choosing·reviewing은 사용자의 결정을 기다리는 단계라 탈퇴를 막지 않는다.
const ACTIVE: ProjectPhase[] = ["analyzing", "drawing", "building"];

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
  // 느낌 고르기(11/4). 견본 그림은 방향마다 한 장. 서버를 다시 켜도 이어 가려고 파일에 둔다(그리는 일꾼은 메모리에 있다).
  choose?: { samples: { sampleId: string | null; status: "drawing" | "ready" | "failed" }[]; readyAt: number | null; held: boolean; picked: number | null; again?: boolean; previous?: number | null };
  draftNotified?: boolean; // 30자 초안 알림 메일을 보냈다(결정을 기다리는 단계에 들어갈 때 한 번)
  chooseNotified?: boolean; // 느낌 고르기 알림 메일을 보냈다(견본이 다 그려졌을 때 한 번)
  result: { build: BuildJob; missing: string[]; extras: string[] } | null;
  record: RecordEvent[];
  notified?: "done" | "failed"; // 완성·멈춤 알림 메일을 이미 보낸 종류(같은 메일을 두 번 보내지 않게)
}

const store = globalThis as unknown as { __logocheProjectLocks?: Map<string, Promise<unknown>>; __logocheDrivers?: Set<string>; __logocheSampleWorkers?: Set<string> };
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

export async function glyphRequest(p: Stored, sampleId: string | null = null, guard?: { round: number; exclude: string[] }): Promise<StartGlyphJobRequest> {
  if (!p.style) throw new RouteError(409, "로고를 아직 읽는 중이에요");
  return { upload: { ...p.upload, logoImage: await logoOf(p.id) }, style: withGuideFont(p, p.style, guard, await availableGuideFonts()), sampleId, quality: p.quality };
}

/** 구조 참고 폰트를 모든 입력에 켠다(11/5 선택 규칙). 켜진 경우 11/5 시험에서 구조 참고가 따라온 조건으로 맞춘다:
 * 방향 설계 지시문과 사용자 조절 표시를 빼 속성이 모양을 덮지 않게 한다. 선택은 프로젝트 번호로 고정되어 같은 프로젝트는 같은 폰트다. */
let fontsCache: { at: number; fonts: Set<string> | null } | null = null;
/** 엔진에 실제로 있는 구조 참고 폰트. 5분 캐시. 못 가져오면 null(구조 참고를 쓰지 않는다). */
async function availableGuideFonts(): Promise<Set<string> | null> {
  if (!guideFontEnabled()) return null;
  if (fontsCache && Date.now() - fontsCache.at < 300_000) return fontsCache.fonts;
  const fonts = await engine.guideFonts().then((l) => new Set(l)).catch(() => null);
  fontsCache = { at: Date.now(), fonts };
  return fonts;
}

function withGuideFont(p: Stored, style: StyleCard, guard: { round: number; exclude: string[] } | undefined, available: Set<string> | null): StyleCard {
  if (!guideFontEnabled() || !available || (style.guideFont && !guard)) return style;
  const choice = chooseGuideFont(p.upload, guard ? `${p.id}#${guard.round}` : p.id, guard?.exclude ?? [], available);
  if (!choice) return style;
  return {
    ...style,
    designBrief: null,
    axes: style.axes.map((a) => ({ ...a, chosen: false })),
    guideFont: choice.stem,
    guideStrong: true,
    guideWarp: 0.6,
    guideChoice: { cluster: choice.cluster, top: choice.top },
  };
}

async function buildRequest(p: Stored): Promise<StartBuildJobRequest> {
  const req = await glyphRequest(p);
  return {
    ...req,
    storeName: p.upload.storeName,
    logoHash: p.upload.logoHash,
    glyphJobId: p.glyphJobId,
    axes: req.style.axes,
    provenance: buildProvenance(p, req.style),
  };
}

/** 11/5 빌드 출처. 같은 로고의 재빌드와 서로 다른 로고의 결과를 나중에 가르려는 기록이다(유사도 분석). 가게 이름·소유자·로고 이미지는 넣지 않는다. */
function buildProvenance(p: Stored, style: StyleCard): Record<string, unknown> {
  return {
    source: "web",
    projectId: p.id,
    sampleId: p.upload.sampleId,
    industry: p.upload.industry,
    attributes: p.upload.attributes ?? null,
    brandTones: p.upload.brandTones,
    family: style.family ?? null,
    guideFont: style.guideFont ?? null,
    guideCluster: style.guideChoice?.cluster ?? null,
    axes: style.axes.map((a) => ({ key: a.key, value: a.value, suggested: a.suggested, basis: a.basis, chosen: a.chosen ?? false })),
  };
}

// ---------- 만들기 ----------

/** 화면 1이 남기던 기록(로고 원본·권리 답변·창작 의도)에 그리기 수준을 더한다. */
function firstRecord(u: UploadInput): RecordEvent[] {
  const out = [
    event("selection", `로고 원본: ${u.logoFileName} (${u.inputPath === "sample" ? "샘플" : "업로드"}) · 해시 ${u.logoHash?.slice(0, 8)}`),
    event("selection", `로고 출처 답변: ${labelOf(LOGO_SOURCES, u.logoSource)}`),
  ];
  if (u.logoFont) {
    const fontName = u.logoFont === "free_font" || u.logoFont === "commercial_font" ? u.logoFontName.trim() : "";
    out.push(event("selection", `로고 글자 폰트 답변: ${labelOf(LOGO_FONTS, u.logoFont)}${fontName ? ` (${fontName})` : ""}`));
  }
  if (u.attributes) {
    const a = u.attributes;
    out.push(event("selection", `글씨 속성 선택: 획 끝 ${attributeLabel("edge", a.edge)} · 굵기 ${attributeLabel("weight", a.weight)} · 굵기 차이 ${attributeLabel("contrast", a.contrast)} · 손맛 ${attributeLabel("hand", a.hand)}`));
  }
  const intent = [
    u.industry && `업종 ${industryText(u)}`,
    u.brandTones.length && `브랜드 톤 ${u.brandTones.map((t) => labelOf(BRAND_TONES, t)).join(", ")}`,
    u.usageContexts.length && `주 사용처 ${u.usageContexts.map((x) => labelOf(USAGE_CONTEXTS, x)).join(", ")}`,
  ].filter(Boolean);
  out.push(event("creative_intent", intent.length ? intent.join(" · ") : "업종·톤·사용처는 고르지 않음(톤은 AI가 로고에서 읽음)"));
  if (u.desiredFeel.trim()) out.push(event("creative_intent", `사업 내용·추구하는 가치: ${u.desiredFeel.trim()}`));
  return out;
}

export async function createProject(owner: string, req: CreateProjectRequest): Promise<string> {
  const u = req.upload;
  if (!u.logoImage) throw new RouteError(400, "로고를 올려 주세요");
  if (!u.storeName.trim()) throw new RouteError(400, "가게 이름을 적어 주세요");
  const missing = missingUploadFields(u);
  if (missing.length) throw new RouteError(400, `빠진 것이 있어요: ${missing.join(", ")}`);
  if (isImitationRequest(u.desiredFeel)) throw new RouteError(400, "특정 서체는 따라 하지 않아요. 사업 내용과 원하는 모양을 말로 적어 주세요.");
  if (u.desiredFeel.length > DESIRED_FEEL_MAX) throw new RouteError(400, `사업 내용은 ${DESIRED_FEEL_MAX}자까지 적을 수 있어요.`);
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

/** 로고를 읽어 조절값·서체 방향 3개를 정하고, 방향마다 가게 이름 견본을 그리는 느낌 고르기 단계로 넘어간다(11/4).
 * 방향이 없으면(모의 응답 등) 예전처럼 바로 참고 글자 30자를 그린다. */
const ANALYZE_ATTEMPTS = 3;

async function analyze(p: Stored) {
  let style = await analyzeStyle({ ...p.upload, logoImage: await logoOf(p.id) });
  // 11/5: 서체 방향이 하나도 없으면(AI가 빈 방향을 냈을 때) 예전에는 사용자가 고르기 전에 AI가 정한 느낌으로 바로 글자 그리기를 시작했다.
  // 시작 전 확인을 건너뛰는 길이라 막는다: 다시 읽어 보고, 끝내 없으면 만들기를 시작하지 않고 실패로 알린다(이 단계 비용은 로고 읽기뿐).
  for (let attempt = 1; !MOCK && (style.directions?.length ?? 0) === 0 && attempt < ANALYZE_ATTEMPTS; attempt++) {
    if ((await read(p.id)).phase !== "analyzing") return;
    console.error("[logoche] 서체 방향이 비어 로고를 다시 읽어요", p.id, attempt);
    style = await analyzeStyle({ ...p.upload, logoImage: await logoOf(p.id) });
  }
  if ((await read(p.id)).phase !== "analyzing") return; // 읽는 동안 사용자가 중단했다
  if (!MOCK && (style.directions?.length ?? 0) === 0) throw new Error("로고에서 서체 느낌을 정하지 못했어요. 잠시 뒤 다시 만들어 주세요.");
  const choosing = !MOCK && (style.directions?.length ?? 0) > 0;
  const glyphJobId = choosing ? null : startGlyphJob(await glyphRequest({ ...p, style }));
  await update(p.id, (q) => {
    q.style = style;
    q.glyphJobId = glyphJobId;
    q.phase = choosing ? "choosing" : "drawing";
    if (choosing) q.choose = { samples: style.directions!.map(() => ({ sampleId: null, status: "drawing" as const })), readyAt: null, held: false, picked: null };
    for (const m of style.models) q.record.push(event("ai_model", `스타일 분석: ${m}`));
    q.record.push(event("selection", `AI가 정한 조절값: ${style.axes.map((a) => `${AXES[a.key].label} ${a.value}`).join(" · ")}`));
    if (choosing) {
      q.record.push(event("creative_intent", `AI가 낸 서체 방향 ${style.directions!.length}개: ${style.directions!.map((d) => `${FAMILY_LABEL[d.family]} '${d.expression}'${d.weight ? ` 굵기 ${d.weight}` : ""}`).join(" / ")}${q.upload.desiredFeel.trim() ? " (사업 내용·가치 반영)" : ""}`));
    } else {
      q.record.push(event("creative_intent", `표현 방식: ${style.expression} (AI 제안${q.upload.desiredFeel.trim() ? ", 사업 내용·가치 반영" : ""})`));
    }
    for (const v of style.valueMappings ?? []) q.record.push(event("creative_intent", `브랜드 가치 → 조형: ${v.value} → ${v.form} (${v.why})`));
  });
}

// 견본을 그리는 일꾼. 서버를 다시 켜면 사라지므로, 파일에 'drawing'으로 남은 견본은 waitChoice가 다시 그린다.
const SAMPLE_ATTEMPTS = Number(process.env.SAMPLE_ATTEMPTS ?? 3);
const SAMPLE_RETRY_MS = Number(process.env.SAMPLE_RETRY_MS ?? 4000);
const sampleWorkers: Set<string> = (store.__logocheSampleWorkers ??= new Set());

/** 방향 하나의 견본 그림을 그려 파일에 적는다. 실패해도 작업은 계속된다(그 방향은 그림 없이 고를 수 있다). */
function drawSample(id: string, index: number) {
  const key = `${id}:${index}`;
  if (sampleWorkers.has(key)) return;
  sampleWorkers.add(key);
  void (async () => {
    let sampleId: string | null = null;
    let lastError = "";
    try {
      const p = await read(id);
      const d = p.style?.directions?.[index];
      if (!p.style || !d) return;
      const style = applyDirection(p.style, d); // 방향의 굵기까지 적용해 견본을 그린다
      const logoImage = await logoOf(id);
      // 11/6: 한 번 실패하면 영영 '그리지 못함'으로 남던 것을 고쳐, 쉬었다가 최대 SAMPLE_ATTEMPTS번 다시 그린다. 사유는 기록에 남긴다.
      for (let attempt = 1; attempt <= SAMPLE_ATTEMPTS && !sampleId; attempt++) {
        try {
          sampleId = (await createSample({ upload: { ...p.upload, logoImage }, style, expression: d.expression })).sampleId;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.error(`[logoche] 느낌 견본 실패 (${attempt}/${SAMPLE_ATTEMPTS})`, id, index, err);
          if (err instanceof RouteError && (err.status === 400 || err.status === 402)) break; // 다시 해도 같은 결과(문구·비용 상한)
          if (attempt < SAMPLE_ATTEMPTS) await sleep(SAMPLE_RETRY_MS * attempt);
        }
      }
      if (!sampleId) {
        await update(id, (q) => void q.record.push(event("ai_model", `느낌 견본 ${index + 1}번을 그리지 못함: ${lastError.slice(0, 160)}`))).catch(() => {});
      }
    } catch (err) {
      console.error("[logoche] 느낌 견본 실패", id, index, err);
    } finally {
      sampleWorkers.delete(key);
      await update(id, (q) => {
        const s = q.choose?.samples[index];
        if (s) {
          s.sampleId = sampleId;
          s.status = sampleId ? "ready" : "failed";
        }
      }).catch(() => {});
    }
  })();
}

/** 느낌 고르기 단계(11/4 사용자 결정: 저절로 고르지 않는다): 견본이 다 그려지면 메일로 알리고, 사용자가 고를 때까지 일을 멈춘다(false).
 * 사용자가 고르면 chooseProject가 다시 돌려 그 방향으로 참고 글자 그리기를 시작한다. 서버를 다시 켜 끊긴 견본은 다시 그린다. */
async function waitChoice(p: Stored): Promise<boolean | void> {
  for (;;) {
    const q = await read(p.id);
    if (q.phase !== "choosing" || !q.choose || !q.style?.directions) return;
    const { samples } = q.choose;
    samples.forEach((s, i) => s.status === "drawing" && drawSample(p.id, i));
    if (samples.some((s) => s.status === "drawing")) {
      await sleep(1000);
      continue;
    }
    if (q.choose.picked === null) {
      void notify(p.id, "choose");
      return false; // 고를 때까지 기다린다
    }
    break;
  }
  const idx = (await read(p.id)).choose!.picked!;
  const q = await read(p.id);
  const d = q.style!.directions![idx] ?? q.style!.directions![0];
  const sample = q.choose!.samples[idx];
  const style = applyDirection(q.style!, d);
  const glyphJobId = startGlyphJob(await glyphRequest({ ...q, style }, sample?.status === "ready" ? sample.sampleId : null));
  await update(p.id, (r) => {
    r.style = style;
    r.glyphJobId = glyphJobId;
    r.phase = "drawing";
    if (r.choose) r.choose.picked = idx;
    r.record.push(event("selection", "서체 방향을 직접 고름"));
    r.record.push(event("creative_intent", `고른 서체 방향: ${FAMILY_LABEL[d.family]} · ${d.expression}${d.weight ? ` · 굵기 ${d.weight}` : ""}${sample?.status === "ready" ? " (견본 그림을 참고 이미지로 사용)" : ""}`));
    if (d.brief) r.record.push(event("creative_intent", `서체 설계 지시: ${d.brief}`));
  });
}

/** 참고 글자 30자가 다 그려지면 떨어진 글자를 사용자에게 묻지 않고 우리 비용으로 다시 그린 뒤(11/5 사용자 결정), 통과한 글자가 충분하면
 * 확인 없이 바로 나머지 글자를 이어서 그린다. 사용자는 견본을 고른 뒤 "글자를 그리고 있어요" 하나로 이어지는 화면만 본다.
 * 다시 그려도 통과한 글자가 MIN_REFERENCE_READY보다 적을 때만 예전처럼 30자를 보여 주고 사용자가 정하게 한다(reviewing).
 * 이전(11/4)에는 나머지 글자를 그리는 일(약 2,300자, 약 6분)이 가장 큰 비용이라 30자를 보고 정한 뒤에만 시작했다. 크레딧 차감 시점은 견본을 고르고 만들기를 시작할 때다. */
const AUTO_RETRY_ROUNDS = Number(process.env.REF_AUTO_RETRY_ROUNDS ?? 2);

async function waitIdle(jobId: string) {
  for (;;) {
    const job = await getGlyphJob(jobId);
    if (!job.items.some((i) => i.status === "drawing" || i.status === "redrawing")) return job;
    await sleep(1000);
  }
}

// 닮음 가드(11/5): 참고 글자 30자가 무료 폰트와 기준 이상 닮으면 서체를 만들기 전에 이 단계에서 다시 그린다.
// 참고 글자 그림의 점수는 완성 서체의 점수보다 낮게 나오는 경향이라(시험에서 0.75대가 완성 후 0.86) 기준(GUARD_REF_THRESHOLD)을 완성 서체 기준 0.85보다 낮게 둔다.
const GUARD_THRESHOLD = Number(process.env.GUARD_REF_THRESHOLD ?? 0.78);
const GUARD_ROUNDS = Number(process.env.GUARD_REF_ROUNDS ?? 2);

type GuardOutcome = { jobId: string; note: string; style: StyleCard | null };

export async function guardRefs(p: Stored, firstJobId: string): Promise<GuardOutcome | null> {
  if (GUARD_ROUNDS <= 0 || MOCK) return null;
  const measure = async (id: string) => (await engine.refsSimilarity(await readyRefs(id)).catch(() => null))?.score ?? null;
  const first = await measure(firstJobId);
  if (first === null || first < GUARD_THRESHOLD) return null;
  let best: { jobId: string; score: number; style: StyleCard | null } = { jobId: firstJobId, score: first, style: null };
  const used: string[] = p.style?.guideFont ? [p.style.guideFont] : [];
  let redone = 0;
  for (let round = 1; round <= GUARD_ROUNDS && best.score >= GUARD_THRESHOLD; round++) {
    if ((await read(p.id)).phase !== "drawing") return null;
    const req = await glyphRequest(p, null, { round, exclude: used });
    if (req.style.guideFont) used.push(req.style.guideFont);
    const id = startGlyphJob(req);
    let job = await getGlyphJob(id);
    while (job.status === "running") {
      await sleep(2000);
      job = await getGlyphJob(id);
    }
    const failedIdx = job.items.flatMap((i, index) => (i.status === "failed" ? [index] : []));
    for (const index of failedIdx) await retryGlyph(id, index, req).catch(() => undefined);
    job = await waitIdle(id);
    redone++;
    if (job.items.filter((i) => i.status === "ready").length < MIN_REFERENCE_READY) continue;
    const score = await measure(id);
    if (score !== null && score < best.score) best = { jobId: id, score, style: req.style };
  }
  return { jobId: best.jobId, style: best.style, note: `기준 글자 닮음 검사: 무료 폰트와 최대 ${first.toFixed(2)} → 기준 ${GUARD_THRESHOLD.toFixed(2)}를 넘어 ${redone}번 다시 그림, 최종 ${best.score.toFixed(2)}${best.score >= GUARD_THRESHOLD ? " (그래도 기준 이상, 가장 덜 닮은 것을 씀)" : ""}` };
}

async function waitRefs(p: Stored) {
  const id = p.glyphJobId!;
  let job = await getGlyphJob(id);
  while (job.status === "running") {
    await sleep(2000);
    job = await getGlyphJob(id);
  }
  let ready = job.items.filter((i) => i.status === "ready").length;
  if (ready === 0) throw new Error("기준 글자를 하나도 그리지 못했어요");
  if ((await read(p.id)).phase !== "drawing") return; // 그리는 동안 사용자가 중단했다
  // 떨어진 글자를 자동으로 다시 그린다(글자 하나씩, 최대 AUTO_RETRY_ROUNDS번). 사용자에게는 보이지 않는다.
  let retried = 0;
  for (let round = 0; round < AUTO_RETRY_ROUNDS; round++) {
    const failedIdx = job.items.flatMap((i, index) => (i.status === "failed" ? [index] : []));
    if (!failedIdx.length) break;
    if ((await read(p.id)).phase !== "drawing") return;
    const req = await glyphRequest(p);
    for (const index of failedIdx) {
      try {
        await retryGlyph(id, index, req);
        retried++;
      } catch (err) {
        console.error("[logoche] 떨어진 참고 글자 자동 다시 그리기를 건너뜀", index, err instanceof Error ? err.message : err);
      }
    }
    job = await waitIdle(id);
    ready = job.items.filter((i) => i.status === "ready").length;
  }
  if ((await read(p.id)).phase !== "drawing") return;
  let guardNote = "";
  if (ready >= MIN_REFERENCE_READY) {
    const guard = await guardRefs(p, id);
    if (guard) {
      guardNote = guard.note;
      if (guard.jobId !== id) {
        job = await getGlyphJob(guard.jobId);
        ready = job.items.filter((i) => i.status === "ready").length;
        await update(p.id, (q) => {
          q.glyphJobId = guard.jobId;
          if (guard.style) q.style = guard.style;
        });
      }
    }
  }
  const failedLeft = job.items.length - ready;
  if (ready >= MIN_REFERENCE_READY) {
    const q = await read(p.id);
    const buildJobId = await startBuild(await buildRequest(q));
    await update(p.id, (r) => {
      if (r.phase !== "drawing") return; // 시작하는 사이 사용자가 중단했다
      r.phase = "building";
      r.buildJobId = buildJobId;
      for (const m of job.models) r.record.push(event("ai_model", `기준 글자 그리기·검사: ${m}`));
      r.record.push(event("check", `기준 글자 ${job.items.length}자 중 ${ready}자 통과${retried ? ` (떨어진 글자를 자동으로 ${retried}번 다시 그림)` : ""}${failedLeft ? `, ${failedLeft}자는 빼고 그림` : ""}`));
      if (guardNote) r.record.push(event("check", guardNote));
      r.record.push(event("check", "통과한 글자가 충분해 확인 없이 나머지 글자를 이어서 그림"));
    });
    return;
  }
  // 통과한 글자가 너무 적다: 사용자에게 30자를 보여 주고 정하게 한다.
  await update(p.id, (q) => {
    q.phase = "reviewing";
    q.review = { readyAt: Date.now(), held: false, continued: false };
    for (const m of job.models) q.record.push(event("ai_model", `기준 글자 그리기·검사: ${m}`));
    q.record.push(event("check", `기준 글자 ${job.items.length}자 중 ${ready}자만 통과해 사용자 확인을 기다림${retried ? ` (자동으로 ${retried}번 다시 그렸음)` : ""}`));
  });
  void notify(p.id, "draft");
}

/** 확인 단계(11/4부터 사용자 결정을 기다린다): 다시 그리는 글자가 끝나면, 사용자가 '이어서 그리기'를 눌렀을 때만 나머지 글자를 그린다.
 * 누르지 않았으면 false를 돌려 일을 멈춘다(drive가 이 작업을 그만 돈다). 사용자가 누르면 reviewProject가 다시 돌린다. */
async function waitReview(p: Stored): Promise<boolean | void> {
  for (;;) {
    const q = await read(p.id);
    if (q.phase !== "reviewing") return;
    const job = await getGlyphJob(q.glyphJobId!);
    const busy = job.items.some((i) => i.status === "drawing" || i.status === "redrawing");
    if (!busy) {
      if (!q.review.continued) return false; // 결정을 기다린다
      break;
    }
    await sleep(1000);
  }
  const q = await read(p.id);
  const buildJobId = await startBuild(await buildRequest(q));
  await update(p.id, (r) => {
    r.phase = "building";
    r.buildJobId = buildJobId;
    r.record.push(event("selection", "기준 글자 30자를 보고 나머지 글자를 이어서 그리기로 함"));
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

/** 완성·멈춤·30자 초안 완료를 만든 사람에게 메일로 알린다. 같은 종류는 한 번만 보내고, 실패해도 작업에는 영향이 없다.
 * draft(11/4): 30자를 그리고 나서 나머지를 그릴지 정하기를 기다리는 단계에 들어갔을 때. 창을 닫았어도 결정하러 돌아오게 한다. */
const unclaimSafe = (id: string, kind: "done" | "failed" | "draft" | "choose") =>
  update(id, (r) => void (kind === "draft" ? (r.draftNotified = false) : kind === "choose" ? (r.chooseNotified = false) : (r.notified = undefined))).catch(() => {});

async function notify(id: string, kind: "done" | "failed" | "draft" | "choose") {
  try {
    let claimed = false;
    const p = await update(id, (r) => {
      if (r.upload.notifyByEmail === false) return;
      if (kind === "draft" ? r.draftNotified : kind === "choose" ? r.chooseNotified : r.notified === kind) return;
      if (kind === "draft") r.draftNotified = true;
      else if (kind === "choose") r.chooseNotified = true;
      else r.notified = kind;
      claimed = true;
    });
    if (!claimed) return;
    const unclaim = () => update(id, (r) => void (kind === "draft" ? (r.draftNotified = false) : kind === "choose" ? (r.chooseNotified = false) : (r.notified = undefined)));
    const to = emailOf(p.owner);
    if (!to) return; // 로그인 없이 만든 작업
    const missing = p.result?.missing.length ?? 0;
    const mail =
      kind === "done"
        ? await doneMail(to, p.name, p.id, KSX1001_HANGUL.size - missing, p.result?.extras.length ?? 0)
        : kind === "draft"
          ? await draftMail(to, p.name, p.id)
          : kind === "choose"
            ? await chooseMail(to, p.name, p.id)
            : await failedMail(to, p.name, p.id);
    if (!(await sendMail(mail))) await unclaim(); // 키가 없어 못 보냈으면 나중에 다시 시도할 수 있게
  } catch (err) {
    console.error("[logoche] 알림 메일 실패", id, err);
    await unclaimSafe(id, kind);
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
      const present = new Set([...(await readyRefs(q.glyphJobId!)).map((r) => r.char), ...(await restDrawnChars(q.glyphJobId!)), ...(await listEdits(q.glyphJobId!))]); // 직접 그려 넣은 글자도 폰트에 들어 있다
      const missing = [...KSX1001_HANGUL].filter((c) => !present.has(c));
      const extras = [...EXTRA_CHARS].filter((c) => present.has(c));
      const glyphModels = (await getGlyphJob(q.glyphJobId!).catch(() => null))?.models ?? [];
      const restyled = await restStyleRedrawn(q.glyphJobId!);
      await update(p.id, (r) => {
        if (r.phase !== "building") return; // 끝나는 사이 사용자가 중단했다
        r.phase = "done";
        r.fontId = job.fontId;
        r.error = null;
        r.result = { build: job, missing, extras };
        for (const m of glyphModels) r.record.push(event("ai_model", `글자 그리기·검사: ${m}`));
        for (const m of job.models) r.record.push(event("ai_model", `폰트 검사: ${m}`));
        if (restyled) r.record.push(event("check", `획 두께·크기가 다른 글자와 달라 다시 그린 글자 ${restyled}자`));
        r.record.push(event("check", summarize(job)));
      });
      if ((await read(p.id)).phase === "done") void notify(p.id, "done");
      return;
    }
    await sleep(3000);
  }
}

const STEPS: Partial<Record<ProjectPhase, (p: Stored) => Promise<boolean | void>>> = {
  analyzing: analyze,
  choosing: waitChoice,
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
        if ((await step(p)) === false) return; // 사용자의 결정을 기다리는 단계는 일을 멈춘다(결정하면 다시 돌린다)
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
      feelName: feelNameOf(p),
    },
  };
}

/** 11/6 저녁: 고른 느낌의 이름(느낌 고르기 카드와 같은 계열 이름). 고른 안(choose.picked)이 있으면 그 방향, 없으면 고른 방향을 적용한 서체 계열(style.family).
 * 느낌 고르기가 없던 예전 작업이나 아직 고르기 전이면 null. */
function feelNameOf(p: Stored): string | null {
  const picked = p.choose?.picked;
  const family = (typeof picked === "number" ? p.style?.directions?.[picked]?.family : undefined) ?? p.style?.family;
  return family ? (FAMILY_LABEL[family] ?? null) : null;
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
    review = { items: job?.items ?? [], continueAt: null, held: p.review.held }; // 11/4: 저절로 계속하지 않으므로 시간은 없다
  }
  let choose: ProjectView["choose"] = null;
  if (p.phase === "choosing" && p.choose && p.style?.directions) {
    const c = p.choose;
    choose = {
      directions: p.style.directions.map((d, i) => ({
        family: d.family,
        familyLabel: FAMILY_LABEL[d.family],
        expression: d.expression,
        weightLabel: d.weight ? weightLabel(d.weight) : null,
        why: d.why ?? null,
        summary: d.brief ? (d.brief.split(/(?<=[.!?。])\s+/)[0] ?? null) : null,
        imageUrl: c.samples[i]?.status === "ready" && c.samples[i].sampleId ? `/api/style/samples/${c.samples[i].sampleId}` : null,
        status: c.samples[i]?.status ?? "failed",
        recommended: i === 0,
      })),
      again: !!c.again,
      previous: c.again && typeof c.previous === "number" ? c.previous : null,
    };
  }
  let recent: ProjectView["recent"] = [];
  const edited = p.glyphJobId ? await listEdits(p.glyphJobId).catch(() => []) : [];
  // 11/6: 만드는 중·멈춤 화면의 그린 글자 수(drawnCount)와 '마지막으로 그린 때'(lastSheetAt). 멈춤 화면도 '마지막으로 그린 글자'를 보이므로 recent를 같이 준다.
  let drawnCount: number | null = null;
  let lastSheetAt: number | null = null;
  if ((p.phase === "building" || p.phase === "failed") && p.glyphJobId) {
    const jobId = p.glyphJobId;
    const rest = await restDrawnState(jobId).catch(() => ({ chars: [] as string[], lastSheetAt: null }));
    recent = rest.chars.slice(0, 60).map((char) => ({ char, imageUrl: `/api/glyphs/jobs/${jobId}/rest/${char.codePointAt(0)!.toString(16)}` }));
    const refs = (await getGlyphJob(jobId).catch(() => null))?.items.filter((i) => i.status === "ready").map((i) => i.char) ?? [];
    drawnCount = [...new Set([...refs, ...rest.chars, ...edited])].filter((c) => FONT_CHARS.has(c)).length;
    lastSheetAt = rest.lastSheetAt;
  }
  const upload: Partial<UploadInput> = { ...p.upload };
  delete upload.logoImage;
  return {
    ...summary,
    upload: upload as Omit<UploadInput, "logoImage">,
    colors: p.style?.colors ?? [],
    review,
    choose,
    build,
    recent,
    missing: p.result?.missing ?? [],
    extras: p.result?.extras ?? [],
    recheck: p.phase === "done" && p.glyphJobId ? await restRecheck(p.glyphJobId).catch(() => []) : [],
    tweaks: p.glyphJobId ? await readTweakTable(p.glyphJobId) : {},
    edited,
    rebuilding: p.phase === "building" && !!p.fontId && !!p.result,
    revision: p.updatedAt,
    slogans: cleanSlogans(p.style?.slogans),
    record: p.record,
    drawnCount,
    lastSheetAt,
  };
}

/** 폰트에 들어가는 글자: 한글 2,350자(KS X 1001) + 숫자·문장부호·영문 82자(EXTRA_CHARS). 그린 글자 수(drawnCount)는 이 안에서 센다. */
const FONT_CHARS = new Set([...KSX1001_HANGUL, ...EXTRA_CHARS]);

// ---------- 바꾸기 ----------

/** 확인 단계에서의 동작: 고르는 중(hold)·고른 것을 다 풀기(release)·계속(continue)·고른 글자 다시 그리기(redraw) */
export async function reviewProject(owner: string, id: string, action: ReviewAction): Promise<void> {
  const p = await readOwned(owner, id);
  if (p.phase !== "reviewing") throw new RouteError(409, "기준 글자를 확인하는 단계가 아니에요");
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
      q.record.push(event("selection", `기준 글자 다시 그리기: ${chars.join(", ")}`));
    });
  } else if (action.action === "restyle") {
    // 30자를 보고 마음에 들지 않으면 다른 느낌을 다시 고른다(견본은 그대로 남아 있어 비용이 거의 안 든다). 그린 30자는 지운다.
    const old = p.glyphJobId;
    if (old && ID.test(old)) await fs.rm(path.join(process.cwd(), ".data", "glyphs", old), { recursive: true, force: true });
    await update(id, (q) => {
      q.phase = "choosing";
      q.glyphJobId = null;
      q.review = { readyAt: null, held: false, continued: false };
      q.draftNotified = false;
      if (q.choose) q.choose = { ...q.choose, previous: q.choose.picked, picked: null, again: true }; // 11/6: 다시 고르는 화면에 '전에 고른 느낌' 표시
      q.chooseNotified = false; // 다시 고를 때도 견본이 준비돼 있다고 알린다
      q.record.push(event("selection", "기준 글자 30자를 보고 다른 느낌으로 다시 고르기로 함"));
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

/** 만드는 중인 일을 멈춘다(11/4). 그린 글자는 남는다. 이미 완성한 폰트가 있으면(빠진 글자 그리기 도중) 그 폰트로 돌아가고,
 * 아니면 '멈춤'이 되어 이어서 만들거나 그만둘 수 있다. 멈춤 메일은 보내지 않는다(사용자가 한 일이다). */
export async function cancelProject(owner: string, id: string): Promise<void> {
  const p = await readOwned(owner, id);
  if (!ACTIVE.includes(p.phase)) throw new RouteError(409, "지금 만드는 중이 아니에요");
  const hasFont = !!(p.fontId && p.result);
  if (p.buildJobId) cancelBuild(p.buildJobId, p.glyphJobId);
  await update(id, (q) => {
    if (!ACTIVE.includes(q.phase)) return;
    const was = q.phase;
    if (hasFont) {
      q.phase = "done";
      q.buildJobId = q.fontId;
      q.error = null;
      q.record.push(event("selection", "빠진 글자 그리기를 중단함 (이미 만든 폰트는 그대로)"));
    } else {
      q.phase = "failed";
      q.error = "직접 멈췄어요. 그린 글자는 남아 있어요. 이어서 만들거나 그만둘 수 있어요.";
      q.record.push(event("selection", `만드는 도중 직접 멈춤 (${was === "analyzing" ? "로고 읽는 중" : was === "drawing" ? "기준 글자 그리는 중" : "글자 그리는 중"})`));
    }
  });
}

/** 느낌 고르기 단계에서 방향을 고른다(pick). 고르면 그 방향으로 참고 글자 그리기를 시작한다. */
export async function chooseProject(owner: string, id: string, action: ChooseAction): Promise<void> {
  const p = await readOwned(owner, id);
  if (p.phase !== "choosing" || !p.choose) throw new RouteError(409, "느낌을 고르는 단계가 아니에요");
  const count = p.style?.directions?.length ?? 0;
  if (action.action === "redraw") {
    // 11/6: 그리지 못한 견본만 다시 그린다. 이미 그려진 견본·그리는 중인 견본은 그대로 둔다.
    const s = p.choose.samples[action.index];
    if (!s || s.status !== "failed") throw new RouteError(409, "다시 그릴 견본이 아니에요");
    await update(id, (q) => {
      const t = q.choose?.samples[action.index];
      if (t) {
        t.status = "drawing";
        t.sampleId = null;
      }
    });
    drawSample(id, action.index);
    return;
  }
  if (action.action !== "pick" || !(Number.isInteger(action.index) && action.index >= 0 && action.index < count)) throw new RouteError(400, "고를 수 있는 안이 아니에요");
  await update(id, (q) => void (q.choose && (q.choose.picked = action.index)));
  drive(id);
  // 11/5: 글자 그리기 작업이 시작되어 단계가 바뀔 때까지 기다렸다가 돌려준다. 기다리지 않으면 화면이 아직 '느낌 고르기'인 상태를 받아
  // 선택 화면에 그대로 남는다(선택을 기다리는 동안은 화면이 새로 받지 않는다). 못 바뀌어도(최대 20초) 그대로 돌려주고 이후는 화면이 따라간다.
  for (let i = 0; i < 40; i++) {
    const q = await read(id);
    if (q.phase !== "choosing" || q.error) return;
    await sleep(500);
  }
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
  } else if (!p.buildJobId && !p.fontId) {
    // 나머지 글자를 그리기 전에 멈췄다(참고 글자 그리는 중). 30자를 보고 이어서 그릴지 정하는 단계로 간다.
    await update(id, (q) => {
      q.phase = "reviewing";
      q.error = null;
      q.review = { readyAt: Date.now(), held: false, continued: false };
      q.record.push(event("selection", "멈춘 곳부터 이어서 만듦 (기준 글자 확인 단계로)"));
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
 * 글자 하나는 지금 폰트 파일에서 그 글자만 바로 바꿔 끼운다(동기, 몇 초 안). 전체는 표를 바꾼 뒤 서버가 바로 폰트를 다시 만들기 시작한다
 * (11/5: 그리지 못한 글자는 새로 그리지 않는다, skipDraw. 이미지 호출 없음). 모든 저장은 제작 기록에 human_edit 한 줄로 남는다. */
export async function saveProjectTweak(owner: string, id: string, req: SaveGlyphTweakRequest): Promise<SaveGlyphTweakResponse> {
  const p = await readOwned(owner, id);
  if (p.phase !== "done" || !p.glyphJobId || !p.style) throw new RouteError(409, "다 만든 폰트만 다듬을 수 있어요");
  if (drivers.has(id)) throw new RouteError(409, "아직 만드는 중이에요");
  const jobId = p.glyphJobId;
  const key = checkTweakKey(req.char);
  const baseWeight = p.style.axes.find((a) => a.key === "weight")?.value ?? 400;
  const tweak = req.tweak === null ? null : clampTweak(req.tweak, baseWeight);
  if (tweak && key !== ALL_GLYPHS) delete tweak.rel; // 기준 글자는 전체 조정에서만 쓴다
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
  if (key === ALL_GLYPHS) {
    let buildJobId: string;
    try {
      buildJobId = await startBuild({ ...(await buildRequest(p)), skipDraw: true });
    } catch (err) {
      await writeTweak(jobId, key, previous, "저장 실패로 되돌림");
      throw err;
    }
    await update(id, (q) => {
      q.phase = "building";
      q.buildJobId = buildJobId;
      q.error = null;
    });
    drive(id);
  }
  return { tweaks: table, patched, rebuild: false };
}

/** 다듬기의 "직접 그리기": 편집 화면에 띄울 그림(지금 글자, AI가 그린 그대로, 글자 틀 자리). */
export async function projectGlyphEditSource(owner: string, id: string, char: string) {
  const p = await readOwned(owner, id);
  if (p.phase !== "done" || !p.glyphJobId || !p.style) throw new RouteError(409, "다 만든 폰트만 고칠 수 있어요");
  return editSource(p.glyphJobId, { char, axes: p.style.axes });
}

/** 직접 그린 그림을 저장해 지금 폰트에 바로 바꿔 끼운다(image가 null이면 직접 고친 것을 지우고 AI가 그린 그대로). 제작 기록(사용자 조정)에 남는다. */
export async function saveProjectGlyphEdit(owner: string, id: string, req: { char: string; image: string | null }): Promise<{ edited: string[] }> {
  const p = await readOwned(owner, id);
  if (p.phase !== "done" || !p.glyphJobId || !p.style || !p.fontId) throw new RouteError(409, "다 만든 폰트만 고칠 수 있어요");
  if (drivers.has(id)) throw new RouteError(409, "아직 만드는 중이에요");
  const res = await saveEdit(p.glyphJobId, { char: req.char, image: req.image, axes: p.style.axes, buildId: p.fontId });
  await update(id, (q) => void q.record.push(event("human_edit", req.image ? `'${req.char}' 직접 그려 고침 (그림판)` : `'${req.char}' 직접 고친 그림을 지우고 AI가 그린 그대로 돌림`)));
  return { edited: res.edits };
}

/** 부분 끌어서 바꾸기(11/11): 글자를 초성·중성·종성 영역으로 나눈 외곽선. cuts는 경계를 자동으로 찾은 자리에서 옮긴 만큼(폰트 단위). */
export async function projectGlyphParts(owner: string, id: string, char: string, cuts: unknown): Promise<GlyphParts> {
  const p = await readOwned(owner, id);
  if (p.phase !== "done" || !p.glyphJobId || !p.style) throw new RouteError(409, "다 만든 폰트만 고칠 수 있어요");
  const key = checkTweakKey(char);
  if (key === ALL_GLYPHS) throw new RouteError(400, "글자 하나를 골라 주세요");
  const [edit] = await readEdits(p.glyphJobId, new Set([key]));
  const base = await engineRequest(p.glyphJobId, key, p.style.axes, edit ?? null);
  const clean = clampTweak({ ...(base.tweak ?? {}), cuts }, p.style.axes.find((a) => a.key === "weight")?.value ?? 400);
  return engine.parts({ ...base, tweak: { ...clean, parts: undefined } });
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
  return { fonts: mine.length, building: mine.filter((p) => ACTIVE.includes(p.phase)).length };
}

/** 폰트 작업 하나의 데이터를 모두 지운다: 엔진의 폰트 파일(메인에 진열하는 폰트는 제외), 그린 글자·고친 글자·조정(.data/glyphs/<작업>),
 * 견본 그림(가게 이름이 그려 있다), 로고, 작업 파일(마지막에 지워서 중간에 실패해도 다시 눌러 이어서 지운다). 엔진의 발급 기록은 지우지 않는다. */
async function purgeProject(p: Stored): Promise<void> {
  const keep = new Set(SHOWCASE_FONTS.map((f) => f.fontId));
  for (const id of new Set([p.fontId, p.buildJobId])) {
    if (!id || keep.has(id) || !/^[0-9a-f]{32}$/.test(id)) continue;
    await engine.discardBuild(id).catch((err) => {
      if (!(err instanceof RouteError && err.status === 404)) throw err; // 이미 없으면 넘어간다
    });
  }
  if (p.glyphJobId && ID.test(p.glyphJobId)) await fs.rm(path.join(process.cwd(), ".data", "glyphs", p.glyphJobId), { recursive: true, force: true });
  for (const s of p.choose?.samples ?? []) if (s.sampleId && ID.test(s.sampleId)) await fs.rm(path.join(process.cwd(), ".data", "samples", `${s.sampleId}.png`), { force: true });
  await fs.rm(file(p.id), { force: true });
  await fs.rm(file(p.id, "logo"), { force: true });
}

/** 탈퇴(11/4): 이 사람의 폰트 작업을 모두 지운다. 로고·제작 기록(작업 파일), 그린 글자·고친 글자·조정(.data/glyphs/<작업>), 엔진의 폰트 파일.
 * 만드는 중인 폰트가 있으면 아무것도 지우지 않고 409를 낸다. 메인에 진열하는 폰트 파일은 지우지 않는다.
 * 작업 파일은 가장 마지막에 지워서, 중간에 실패해도 다시 눌러 이어서 지울 수 있게 한다. 엔진의 발급 기록(issued)은 지우지 않는다. */
export async function deleteAllProjects(owner: string): Promise<number> {
  const mine = await ownedProjects(owner);
  if (mine.some((p) => ACTIVE.includes(p.phase))) throw new RouteError(409, "만드는 중인 폰트가 있어요. 다 만든 뒤에 탈퇴해 주세요.");
  for (const p of mine) await purgeProject(p);
  return mine.length;
}

export async function deleteProject(owner: string, id: string): Promise<void> {
  const p = await readOwned(owner, id);
  if (ACTIVE.includes(p.phase)) throw new RouteError(409, "아직 만드는 중이에요. 먼저 중단해 주세요.");
  await purgeProject(p); // 11/4: 폰트·글자·견본까지 모두 지운다(이전에는 작업 파일과 로고만 지웠다)
}
