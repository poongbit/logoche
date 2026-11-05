// 구조 참고 폰트 고르기(11/5, engine/scripts/guide_select.py의 규칙을 옮긴 것). 입력(분위기·쓸 곳·손맛)으로 후보 풀의 점수를 매기고
// 상위 5개 중 프로젝트 번호로 하나를 정한다. 같은 프로젝트는 늘 같은 폰트가 나온다. 사용자 화면에는 보이지 않고 제작 출처에만 남긴다.
// 풀 파일은 engine/compare/guide_pool.json의 복사본이다(바꾸면 둘 다 고친다). 폰트 파일은 엔진 compare 폴더에 있어야 한다.
import { createHash } from "node:crypto";
import pool from "./guide-pool.json";
import type { BrandTone, StyleAttributes, UploadInput, UsageContext } from "@/lib/types";

type Entry = { cluster: number; stem: string; weight: string; loose: string; read: number; tones: string[]; license: string };
const POOL = pool as Entry[];

/** 11/5 사용자 결정으로 기본은 켜 둔다. LOGOCHE_GUIDE_FONT=0으로 끈다. 엔진에 폰트 파일이 없으면 후보에서 빠지고, 후보가 없으면 구조 참고 없이 그린다. */
export const guideFontEnabled = () => process.env.LOGOCHE_GUIDE_FONT !== "0";

const has = (f: Entry, ...tags: string[]) => tags.filter((t) => f.tones.includes(t)).length;
const looseFree = (f: Entry) => f.loose === "느슨" || f.loose === "구조다름";

function toneScore(f: Entry, tone: BrandTone): number {
  const w = f.weight;
  const l = f.loose;
  switch (tone) {
    case "cute": return has(f, "귀여운", "장난스러운", "친근한") + (looseFree(f) ? 0.5 : 0) - (l === "정형" && w !== "굵은" ? 1 : 0);
    case "warm": return has(f, "따뜻한", "친근한", "편안한", "감성") - (f.stem.startsWith("BlackHan") ? 1 : 0);
    case "playful": return has(f, "장난스러운", "개성있는") + (looseFree(f) ? 0.5 : 0) - (l === "정형" ? 1 : 0);
    case "premium": return has(f, "우아한", "고급스러운", "섬세한") + (w === "가는" ? 0.5 : 0) - (w === "굵은" ? 1 : 0) - (l === "느슨" || l === "매우느슨" ? 1 : 0);
    case "trustworthy": return has(f, "신뢰", "단정") + (l === "정형" || l === "보통" ? 0.5 : 0) - (l === "매우느슨" ? 1 : 0);
    case "traditional": return has(f, "전통적인", "빈티지") - (f.tones.includes("현대적") ? 1 : 0);
    case "modern": return has(f, "현대적") + (l === "정형" || l === "보통" ? 0.5 : 0) - (f.tones.includes("장식적") ? 1 : 0);
    case "natural": return has(f, "편안한", "따뜻한", "친근한") + (l === "보통" ? 0.5 : 0) - (w === "굵은" && l === "정형" ? 1 : 0);
    case "retro": return has(f, "빈티지", "장식적", "감성") - (f.tones.includes("현대적") ? 1 : 0);
    case "hip": return has(f, "개성있는", "트렌디") + (l === "구조다름" ? 0.5 : 0) - (f.stem.startsWith("Pretendard") ? 1 : 0);
    case "bold": return has(f, "힘있는", "강렬한") + (w === "굵은" ? 1 : 0) - (w === "가는" ? 1 : 0);
    case "calm": return has(f, "단정", "섬세한", "편안한") + (w === "가는" ? 0.5 : 0) - (w === "굵은" ? 1 : 0) - (l === "매우느슨" ? 1 : 0);
    default: return 0;
  }
}

/** null이면 그 쓸 곳에서는 쓰지 않는다. */
function usageAdjust(f: Entry, use: UsageContext): number | null {
  const bold = f.weight === "굵은";
  switch (use) {
    case "signage_menu": return f.read < 3 ? null : f.weight !== "가는" ? 0.5 : 0;
    case "sns_thumbnail": return f.read < 2 ? null : bold || f.tones.includes("개성있는") ? 0.5 : 0;
    case "packaging_sticker": return f.read < 2 ? null : bold ? 0.5 : 0;
    case "print_card": return f.read < 3 ? null : f.weight === "가는" || f.tones.includes("단정") ? 0.5 : 0;
    case "web_app": return f.read < 3 ? null : f.loose === "정형" || f.loose === "보통" ? 0.5 : 0;
    default: return 0;
  }
}

const LOOSE_NEAT: Record<string, number> = { 정형: 1, 보통: 0.5, 구조다름: 0, 느슨: -0.5, 매우느슨: -1 };
const LOOSE_BRUSH: Record<string, number> = { 정형: -1, 보통: 0, 구조다름: 0, 느슨: 1, 매우느슨: 1 };

function handAdjust(f: Entry, hand: StyleAttributes["hand"] | undefined): number | null {
  const brush = f.tones.some((t) => t.includes("붓맛"));
  if (hand === "neat") return brush ? null : LOOSE_NEAT[f.loose] ?? 0;
  if (hand === "brush") return (LOOSE_BRUSH[f.loose] ?? 0) + (brush ? 0.5 : 0);
  return brush ? null : 0; // 손맛을 안 골랐으면 붓 느낌 폰트는 쓰지 않는다
}

export type GuideChoice = { stem: string; cluster: number; top: string[]; license: string };

/** 입력으로 점수를 매겨(묶음마다 2개까지) 상위 5개를 만들고, seed로 한 가지를 정한다. 후보가 없으면 null. */
export function chooseGuideFont(u: Pick<UploadInput, "brandTones" | "usageContexts" | "attributes">, seed: string, exclude: string[] = [], available?: Set<string>): GuideChoice | null {
  const scored: { s: number; f: Entry }[] = [];
  for (const f of POOL) {
    if (available && !available.has(f.stem)) continue; // 이 서버에 폰트 파일이 없다
    if (exclude.includes(f.stem)) continue; // 닮음 가드가 다시 그릴 때 이미 쓴 폰트는 뺀다
    const uses = u.usageContexts.map((c) => usageAdjust(f, c));
    if (uses.some((x) => x === null)) continue;
    const hand = handAdjust(f, u.attributes?.hand);
    if (hand === null) continue;
    const s = u.brandTones.reduce((a, t) => a + toneScore(f, t), 0) + uses.reduce<number>((a, x) => a + (x ?? 0), 0) + hand;
    scored.push({ s, f });
  }
  scored.sort((a, b) => b.s - a.s);
  const seen = new Map<number, number>();
  const top: { s: number; f: Entry }[] = [];
  for (const e of scored) {
    if ((seen.get(e.f.cluster) ?? 0) >= 2) continue;
    seen.set(e.f.cluster, (seen.get(e.f.cluster) ?? 0) + 1);
    top.push(e);
    if (top.length === 5) break;
  }
  if (top.length === 0) return null;
  const min = Math.min(...top.map((e) => e.s));
  const weights = top.map((e) => Math.max(0.1, e.s - min + 0.5));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = (createHash("sha256").update(seed).digest().readUInt32BE(0) / 0x100000000) * total;
  let pick = top[0];
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) { pick = top[i]; break; }
  }
  return { stem: pick.f.stem, cluster: pick.f.cluster, top: top.map((e) => e.f.stem), license: pick.f.license };
}
