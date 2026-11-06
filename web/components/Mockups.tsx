"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { UnderlineTabs, tabId, tabPanelId } from "@/components/ds";
import { BASE_GOTHIC_STACK } from "@/lib/preview";

// 스튜디오 '시안 — 가게에 걸어 봐요'. 로고 색 [대표색, 어두운 색, 밝은 색]을 입힌다.
// 네 장면 모두 실제 사진 위에 실제 폰트 글자를 얹는다(글자는 AI가 그리지 않는다).
// 11/2 간판·메뉴판을 사진으로(사용자가 AI로 만든 사진). 11/6 시안 품질 개선:
//  · 메뉴판 사진을 가죽판 종이(Gemini 표시가 있던 사진) → 식탁 위 아크릴 세움판으로 바꿨다(세로 종이라 메뉴가 바로 읽힌다).
//  · 인스타(CSS로 그린 휴대폰) → 손에 든 휴대폰 실사 + 화면 가득 스토리형 게시물 'SNS'. 인스타 로고·화면은 따라 그리지 않는다.
//  · 포장(크라프트 봉투의 라벨 스티커)을 더했다. 간판·메뉴판에 없는 새 문장을 폰트로 보여 주는 자리.
//  · 간판 글자는 입체 채널 글자(두께·그림자), 모든 장면에 미세한 흐림과 필름 입자를 깔아 '붙여 넣은' 느낌을 줄였다.
// 새 사진 세 장은 Figma '로고체 디자인'에서 이미지 생성(gpt-image-2.5)으로 만들었고(1792×768), 면 네 꼭짓점·라벨 칠할 곳 지도는
// engine/scripts/mockups/photo_quads.py · photo_assets.py로 다시 만든다.
// 비교 손잡이 양쪽(만든 폰트·기본 고딕)은 같은 장면·같은 효과에서 글꼴만 바뀐다.

export interface MockupProps {
  storeName: string;
  menu: [string, string][];
  fontStyle: CSSProperties;
  colors: string[];
  logo?: string | null;
  /** 가게 이야기로 쓴 문장(있으면 포장 라벨 둘째 줄에 쓴다) */
  slogan?: string | null;
}

export const BASE_GOTHIC_STYLE: CSSProperties = { fontFamily: BASE_GOTHIC_STACK, fontWeight: 400 };

const HEX = /^#[0-9a-f]{6}$/i;

function rgb(hex: string): [number, number, number] {
  const n = HEX.test(hex) ? parseInt(hex.slice(1), 16) : 0x808080;
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 두 색을 t만큼 섞는다(0이면 a) */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** 바탕 위에서 min 대비를 넘는 첫 로고 색. 모두 모자라면 검정·흰색 중 대비가 큰 쪽(로고 색끼리 겹쳐 안 읽히는 간판을 막는다). */
function readableOn(bg: string, prefer: string[], min: number): string {
  return prefer.find((c) => contrast(c, bg) >= min) ?? (contrast("#141414", bg) >= contrast("#FFFFFF", bg) ? "#141414" : "#FFFFFF");
}

/** 로고 색 [대표색, 어두운 색, 밝은 색]과 그 위에 쓸 글자색. 큰 글자(간판·라벨)는 3:1, 본문은 4.5:1 기준. */
function palette(colors: string[]) {
  const main = HEX.test(colors[0] ?? "") ? colors[0] : "#F26B3A";
  const dark = HEX.test(colors[1] ?? "") ? colors[1] : "#3B2A1E";
  const light = HEX.test(colors[2] ?? "") ? colors[2] : "#FFF5E8";
  return { main, dark, light, onMain: readableOn(main, [dark, light], 3), onLight: readableOn(light, [dark], 4.5) };
}

const chars = (text: string) => Math.max(2, [...text].length);
const won = (p: string) => (/^[\d,]+$/.test(p) ? `${p}원` : p);

function SceneLabel({ title, place }: { title: string; place: string }) {
  return (
    <span className="absolute bottom-3 left-3 rounded-full bg-bg-canvas px-3 py-1.5 text-13 font-bold">
      {title} <span className="font-medium text-text-secondary">· {place}</span>
    </span>
  );
}

// ---------- 사진 무대 ----------
// 글자는 사진 속 면의 네 꼭짓점에 맞춰 원근대로 얹는다(CSS matrix3d).
// 칠할 곳 지도(회색+투명)가 있으면 로고 대표색 × 밝기 비율로 칠해 그늘·주름을 살린다. 회색 = 사진 밝기 ÷ 면 가운데 밝기 × 128, 투명도 = 칠할 정도.
type Point = [number, number];
type Box = { x: number; y: number; w: number; h: number };
interface Photo {
  src: string;
  map?: string;
  width: number;
  height: number;
  safe: Box; // 보여도 되는 곳
  focus: Box; // 꼭 보여야 하는 곳. 무대가 허락하는 한 다 보이게 줄이고 가운데에 둔다(작게 잡을수록 크게 보인다)
  face: Point[]; // 글자를 얹을 면: 왼위·오른위·오른아래·왼아래
}

const SIGN_PHOTO: Photo = {
  src: "/mockups/sign-street.webp",
  map: "/mockups/sign-street-map.png", // 파란 간판 면·차양 줄무늬
  width: 1376,
  height: 768,
  safe: { x: 180, y: 0, w: 1196, h: 768 },
  focus: { x: 280, y: 0, w: 920, h: 520 },
  face: [
    [312.9, 206.7],
    [1163.5, 143.5],
    [1164.9, 358.9],
    [310.3, 382.2],
  ],
};

const MENU_PHOTO: Photo = {
  src: "/mockups/menu-stand.webp", // 식탁 위 아크릴 세움판(세로 종이)
  width: 1792,
  height: 768,
  safe: { x: 240, y: 0, w: 1552, h: 768 }, // 왼쪽 위 벽 게시물은 보이지 않게
  focus: { x: 640, y: 40, w: 540, h: 680 },
  face: [
    [711.0, 93.0],
    [1092.7, 89.1],
    [1108.6, 612.7],
    [721.5, 639.7],
  ],
};
const MENU_PAPER = "#D1BFB0"; // 종이 가운데 색(글자색 대비 계산용)

const PACK_PHOTO: Photo = {
  src: "/mockups/pack-bag.webp", // 빵집 계산대 위 크라프트 봉투 + 흰 라벨 스티커
  map: "/mockups/pack-bag-map.png", // 라벨
  width: 1792,
  height: 768,
  safe: { x: 0, y: 0, w: 1792, h: 768 },
  focus: { x: 620, y: 120, w: 540, h: 550 },
  face: [
    [714.0, 292.0],
    [1066.9, 292.0],
    [1069.9, 498.0],
    [708.4, 498.0],
  ],
};

const SNS_PHOTO: Photo = {
  src: "/mockups/sns-phone.webp", // 카페 식탁에서 손에 든 휴대폰(빈 흰 화면)
  width: 1792,
  height: 768,
  safe: { x: 0, y: 0, w: 1792, h: 768 },
  focus: { x: 620, y: 80, w: 560, h: 540 },
  face: [
    [789.8, 111.0],
    [1002.0, 111.0],
    [1002.0, 586.0],
    [787.0, 586.0],
  ],
};
const SNS_SCREEN_RADIUS = 22; // 사진 속 화면 모서리(사진 화소)

/** w×h 상자를 네 점(왼위·오른위·오른아래·왼아래)에 맞추는 CSS matrix3d(Heckbert의 정사각형→사변형 사상). transform-origin은 0 0. */
function quadMatrix(w: number, h: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Point[]): string {
  const [dx1, dx2, dx3] = [x1 - x2, x3 - x2, x0 - x1 + x2 - x3];
  const [dy1, dy2, dy3] = [y1 - y2, y3 - y2, y0 - y1 + y2 - y3];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const k = (dx1 * dy3 - dx3 * dy1) / det;
  const [a, b, d, e] = [x1 - x0 + g * x1, x3 - x0 + k * x3, y1 - y0 + g * y1, y3 - y0 + k * y3];
  return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1].join(",")})`;
}

const dist = ([ax, ay]: Point, [bx, by]: Point) => Math.hypot(bx - ax, by - ay);

/** 면에 맞출 상자: 크기는 면의 평균 변 길이라, 안의 글자 크기를 사진 화소로 생각하면 된다 */
function faceBox(face: Point[]) {
  const [tl, tr, br, bl] = face;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  return { w, h, transform: quadMatrix(w, h, face) };
}

const SIGN_FACE = faceBox(SIGN_PHOTO.face);
const MENU_FACE = faceBox(MENU_PHOTO.face);
const PACK_FACE = faceBox(PACK_PHOTO.face);
const SNS_FACE = faceBox(SNS_PHOTO.face);

const pixelCache = new Map<string, Promise<ImageData>>();

function pixels(src: string): Promise<ImageData> {
  let cached = pixelCache.get(src);
  if (!cached) {
    cached = (async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    })();
    pixelCache.set(src, cached);
  }
  return cached;
}

/** 사진을 캔버스에 그리고, 지도와 색이 있으면 지도대로 칠한다(100만 화소대, 수 ms) */
async function paintPhoto(canvas: HTMLCanvasElement, photo: Photo, color: string | null) {
  const [img, map] = await Promise.all([pixels(photo.src), photo.map && color ? pixels(photo.map) : null]);
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  if (map && color) {
    const t = rgb(color);
    const [px, m] = [out.data, map.data];
    for (let i = 0; i < px.length; i += 4) {
      const a = m[i + 3] / 255;
      if (!a) continue;
      const k = m[i] / 128;
      for (let c = 0; c < 3; c++) px[i + c] = px[i + c] * (1 - a) + Math.min(255, t[c] * k) * a;
    }
  }
  canvas.getContext("2d")!.putImageData(out, 0, 0);
}

/** 사진 무대: 무대 크기에 맞춰 사진 좌표계(width×height)를 통째로 줄여 보인다. focus는 다 보이게, 무대는 safe 안의 사진으로 빈틈없이 채운다.
 * children은 사진 좌표로 놓는다(Face). 맨 위에 필름 입자를 아주 옅게 깔아 사진과 글자의 결을 맞춘다. */
function PhotoStage({ photo, color = null, label, children }: { photo: Photo; color?: string | null; label: [string, string]; children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ s: number; x: number; y: number } | null>(null);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { safe, focus: f } = photo;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (!w || !h) return;
      const s = Math.max(Math.min(w / f.w, h / f.h), w / safe.w, h / safe.h);
      const [vw, vh] = [w / s, h / s];
      setView({
        s,
        x: clamp(f.x + f.w / 2 - vw / 2, safe.x, safe.x + safe.w - vw),
        y: clamp(f.y + f.h / 2 - vh / 2, safe.y, safe.y + safe.h - vh),
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [photo]);

  useEffect(() => {
    let live = true;
    if (canvasRef.current) void paintPhoto(canvasRef.current, photo, color).then(() => live && setPainted(true));
    return () => {
      live = false;
    };
  }, [photo, color]);

  return (
    <div ref={stageRef} className="relative isolate h-full overflow-hidden rounded-[1.25rem] bg-bg-surface-strong">
      <div
        className={`absolute top-0 left-0 origin-top-left transition-opacity duration-300 ${painted && view ? "opacity-100" : "opacity-0"}`}
        style={{ width: photo.width, height: photo.height, transform: view ? `scale(${view.s}) translate(${-view.x}px, ${-view.y}px)` : undefined }}
      >
        <canvas ref={canvasRef} width={photo.width} height={photo.height} aria-hidden className="absolute inset-0" />
        {children}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[url(/mockups/grain.png)] bg-[length:256px] opacity-[0.35] mix-blend-soft-light" />
      <SceneLabel title={label[0]} place={label[1]} />
    </div>
  );
}

/** 사진 속 면에 맞춘 상자(faceBox) */
function Face({ box, className = "", style, children }: { box: ReturnType<typeof faceBox>; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className={`absolute top-0 left-0 origin-top-left ${className}`} style={{ width: box.w, height: box.h, transform: box.transform, ...style }}>
      {children}
    </div>
  );
}

// ---------- 장면 ----------

/** 간판 · 가게 앞. 간판 면·차양을 로고 대표색으로 칠하고, 글자는 간판 면에서 튀어나온 채널 글자처럼(옆면 두께 + 면에 지는 그림자).
 * 로고 색을 모르면 사진의 파랑 그대로 + 흰 글자. */
export function SignScene({ storeName, fontStyle, colors }: MockupProps) {
  const color = HEX.test(colors[0] ?? "") ? colors[0] : null;
  const ink = color ? palette(colors).onMain : "#FFFFFF";
  const fontSize = Math.min(SIGN_FACE.h * 0.58, (SIGN_FACE.w * 0.82) / chars(storeName));
  const depth = Math.max(2, Math.round(fontSize * 0.035)); // 옆면 두께(사진 화소)
  const side = mix(ink, "#000000", 0.38);
  const shadow = [
    ...Array.from({ length: depth }, (_, i) => `0 ${i + 1}px 0 ${side}`),
    `0 ${depth + 2}px ${depth + 1}px rgb(0 0 0 / 0.32)`,
    `0 ${depth * 3}px ${depth * 5}px rgb(0 0 0 / 0.2)`,
  ].join(", ");
  return (
    <PhotoStage photo={SIGN_PHOTO} color={color} label={["간판", "가게 앞"]}>
      <Face box={SIGN_FACE} className="grid place-items-center">
        <span className="leading-none whitespace-nowrap" style={{ ...fontStyle, fontSize, color: ink, textShadow: shadow, filter: "blur(0.35px)" }}>
          {storeName}
        </span>
      </Face>
    </PhotoStage>
  );
}

/** 메뉴판 · 식탁 위(아크릴 세움판). 종이 색은 그대로 두고 글자는 로고의 어두운 색을 종이 결과 곱해(multiply) 인쇄한 것처럼,
 * 그 위에 아크릴 반사를 한 겹 얹는다. */
export function MenuScene({ storeName, menu, fontStyle, colors }: MockupProps) {
  const ink = readableOn(MENU_PAPER, [palette(colors).dark], 4.5);
  const { w, h } = MENU_FACE;
  const nameSize = Math.min(h * 0.11, (w * 0.8 * 0.92) / chars(storeName));
  const longest = Math.max(...menu.map(([item, price]) => chars(item) + chars(won(price)) * 0.8));
  const itemSize = Math.min(h * 0.068, (w * 0.8 * 0.86) / longest);
  return (
    <PhotoStage photo={MENU_PHOTO} label={["메뉴판", "식탁 위"]}>
      <Face box={MENU_FACE} className="flex flex-col mix-blend-multiply" style={{ padding: `${h * 0.1}px ${w * 0.09}px ${h * 0.09}px`, color: ink, opacity: 0.94, filter: "blur(0.3px)" }}>
        <div className="text-center leading-tight" style={{ ...fontStyle, fontSize: nameSize }}>
          {storeName}
        </div>
        <div className="mx-auto opacity-60" style={{ width: w * 0.16, height: 3, background: ink, marginTop: h * 0.035 }} />
        <div className="flex flex-1 flex-col justify-evenly" style={{ paddingTop: h * 0.03 }}>
          {menu.map(([item, price]) => (
            <div key={item} className="flex items-baseline" style={{ gap: w * 0.03 }}>
              <span className="whitespace-nowrap" style={{ ...fontStyle, fontSize: itemSize }}>
                {item}
              </span>
              <span className="min-w-4 flex-1 border-b-[3px] border-dotted opacity-40" style={{ borderColor: ink }} />
              <span className="whitespace-nowrap" style={{ ...fontStyle, fontSize: itemSize * 0.86 }}>
                {won(price)}
              </span>
            </div>
          ))}
        </div>
      </Face>
      {/* 아크릴 판 반사: 종이 위를 비스듬히 지나는 옅은 빛 */}
      <Face box={MENU_FACE} className="pointer-events-none mix-blend-screen" style={{ background: "linear-gradient(112deg, rgb(255 255 255 / 0) 22%, rgb(255 255 255 / 0.16) 34%, rgb(255 255 255 / 0) 52%)" }} />
    </PhotoStage>
  );
}

/** 포장 · 계산대 위. 크라프트 봉투의 라벨 스티커를 로고 대표색으로 칠하고(종이 결·그늘은 그대로), 가게 이름과 한 줄 인사를 인쇄한 것처럼 얹는다.
 * 로고에 없던 새 문장이 이 폰트로 찍히는 자리. 로고 색을 모르면 흰 라벨 + 먹 글자. */
export function PackScene({ storeName, fontStyle, colors, slogan }: MockupProps) {
  const color = HEX.test(colors[0] ?? "") ? colors[0] : null;
  const ink = color ? palette(colors).onMain : "#141414";
  const darkInk = luminance(ink) < luminance(color ?? "#FFFFFF");
  const line = slogan && [...slogan].length <= 16 ? slogan : "찾아 주셔서 고맙습니다";
  const { w, h } = PACK_FACE;
  const nameSize = Math.min(h * 0.36, (w * 0.84) / chars(storeName));
  const lineSize = Math.min(h * 0.13, (w * 0.8) / chars(line));
  return (
    <PhotoStage photo={PACK_PHOTO} color={color} label={["포장", "계산대 위"]}>
      <Face
        box={PACK_FACE}
        className={`flex flex-col items-center justify-center ${darkInk ? "mix-blend-multiply" : ""}`}
        style={{ color: ink, gap: h * 0.07, padding: `${h * 0.1}px ${w * 0.06}px`, filter: "blur(0.3px)", opacity: darkInk ? 0.95 : 0.97 }}
      >
        <span className="leading-none whitespace-nowrap" style={{ ...fontStyle, fontSize: nameSize }}>
          {storeName}
        </span>
        <span className="h-[2px] opacity-50" style={{ width: w * 0.12, background: ink }} />
        <span className="leading-none whitespace-nowrap" style={{ ...fontStyle, fontSize: lineSize }}>
          {line}
        </span>
      </Face>
    </PhotoStage>
  );
}

/** SNS · 휴대폰. 손에 든 휴대폰 화면 가득 스토리형 게시물(로고 대표색 바탕 + 오늘의 추천 메뉴·가격·가게 이름)을 띄운다.
 * 계정 줄·메시지 칸 같은 앱 글씨는 화면 글꼴(SUIT) 그대로, 사장님이 만든 게시물 안 글씨만 폰트로 바뀐다. 특정 앱의 로고·아이콘은 쓰지 않는다. */
export function SocialScene({ storeName, menu, fontStyle, colors, logo }: MockupProps) {
  const c = palette(colors);
  const { w, h } = SNS_FACE;
  const [[item, price] = ["오늘의 메뉴", ""], ...rest] = menu;
  const headSize = Math.min(w * 0.3, (w * 0.86) / Math.min(chars(item), 6));
  const ui = "font-sans text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]";
  return (
    <PhotoStage photo={SNS_PHOTO} label={["SNS", "휴대폰"]}>
      <Face
        box={SNS_FACE}
        className="overflow-hidden"
        style={{ borderRadius: SNS_SCREEN_RADIUS, background: `linear-gradient(170deg, ${mix(c.main, "#FFFFFF", 0.1)}, ${c.main} 45%, ${mix(c.main, "#000000", 0.08)})`, color: c.onMain }}
      >
        <div className="flex h-full flex-col" style={{ padding: `${h * 0.03}px ${w * 0.07}px ${h * 0.025}px` }}>
          {/* 스토리 진행 줄과 계정 줄(앱 글씨) */}
          <div className="flex gap-1">
            <span className="h-[2.5px] flex-1 rounded-full bg-white/90" />
            <span className="h-[2.5px] flex-1 rounded-full bg-white/45" />
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL
              <img src={logo} alt="" className="h-[18px] w-[18px] rounded-full bg-white object-cover object-left" />
            ) : (
              <span className="h-[18px] w-[18px] rounded-full" style={{ background: c.light }} />
            )}
            <span className={`text-[9px] font-bold ${ui}`}>{storeName}</span>
            <span className={`text-[8px] opacity-80 ${ui}`}>1시간</span>
          </div>
          {/* 게시물(폰트): 오늘의 추천 · 메뉴 이름 · 가격, 함께 파는 메뉴 두 줄, 가게 이름 */}
          <div className="flex flex-1 flex-col justify-center" style={{ gap: h * 0.022 }}>
            <span className="leading-none opacity-85" style={{ ...fontStyle, fontSize: w * 0.09 }}>
              오늘의 추천
            </span>
            <span className="leading-[1.08] break-keep" style={{ ...fontStyle, fontSize: headSize }}>
              {item}
            </span>
            {price && (
              <span className="self-start rounded-full leading-none" style={{ ...fontStyle, fontSize: w * 0.09, background: c.light, color: c.onLight, padding: `${w * 0.035}px ${w * 0.055}px` }}>
                {won(price)}
              </span>
            )}
            {rest.length > 0 && (
              <div className="flex flex-col border-t" style={{ borderColor: `color-mix(in srgb, ${c.onMain} 35%, transparent)`, marginTop: h * 0.03, paddingTop: h * 0.025, gap: h * 0.012 }}>
                {rest.slice(0, 2).map(([name, p]) => (
                  <div key={name} className="flex items-baseline justify-between gap-2 leading-none" style={{ ...fontStyle, fontSize: w * 0.075 }}>
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 opacity-85">{won(p)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="leading-tight" style={{ ...fontStyle, fontSize: Math.min(w * 0.1, (w * 0.86) / chars(storeName)), marginBottom: h * 0.03 }}>
            {storeName}
          </span>
          <div className={`flex h-[22px] items-center rounded-full border border-white/70 px-2.5 text-[8px] ${ui}`}>메시지 보내기</div>
        </div>
      </Face>
      {/* 화면 유리 반사 */}
      <Face
        box={SNS_FACE}
        className="pointer-events-none mix-blend-screen"
        style={{ borderRadius: SNS_SCREEN_RADIUS, background: "linear-gradient(125deg, rgb(255 255 255 / 0.22) 0%, rgb(255 255 255 / 0.06) 30%, rgb(255 255 255 / 0) 46%)" }}
      />
    </PhotoStage>
  );
}

// ---------- 시안 탭 ----------

type SceneKey = "sign" | "menu" | "pack" | "sns";
const SCENES: { key: SceneKey; label: string }[] = [
  { key: "sign", label: "간판" },
  { key: "menu", label: "메뉴판" },
  { key: "pack", label: "포장" },
  { key: "sns", label: "SNS" },
];

function Scene({ kind, ...props }: MockupProps & { kind: SceneKey }) {
  if (kind === "menu") return <MenuScene {...props} />;
  if (kind === "pack") return <PackScene {...props} />;
  if (kind === "sns") return <SocialScene {...props} />;
  return <SignScene {...props} />;
}

/** 밀어서 비교: 같은 시안 두 장을 겹치고 위 장(내 폰트)을 clip-path로 잘라 보인다. 손잡이를 끌거나 화살표 키로 5%씩 옮긴다. */
export function CompareSlider({ top, bottom, topLabel, bottomLabel }: { top: ReactNode; bottom: ReactNode; topLabel: string; bottomLabel: string }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0;
    if (!step) return;
    e.preventDefault();
    setPos((v) => Math.min(100, Math.max(0, v + step)));
  };
  return (
    <div
      ref={box}
      className="relative h-full touch-pan-y overflow-hidden rounded-[1.25rem] select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => e.buttons && move(e)}
    >
      <div className="absolute inset-0">{bottom}</div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {top}
      </div>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-bg-inverse px-3 py-1 text-13 font-bold text-text-inverse">{topLabel}</span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-bg-canvas px-3 py-1 text-13 font-bold">{bottomLabel}</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-bg-canvas shadow-[0_0_0_1px_rgb(20_20_20/0.25)]" style={{ left: `${pos}%` }} />
      <button
        type="button"
        role="slider"
        aria-label="내 폰트와 기본 고딕 비교"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`내 폰트 ${Math.round(pos)}%`}
        onKeyDown={keys}
        className="absolute top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border-2 border-border-active bg-bg-canvas shadow-float"
        style={{ left: `${pos}%` }}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/** 시안 탭(11/6 ST2 v2 '시안 — 가게에 걸어 봐요', 549:402 · 561:513): 간판·메뉴판·포장·SNS 밑줄 탭 + 늘 켜진 기본 고딕 비교 손잡이.
 * 무대는 사진 장면(PhotoStage). 높이는 탭을 바꿔도 같다(데스크톱 440 · 휴대폰 240). */
export function MockupTabs({ fontName, ...props }: MockupProps & { fontName: string }) {
  const [kind, setKind] = useState<SceneKey>("sign");
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <UnderlineTabs label="시안 종류" idPrefix="mockup" tabs={SCENES.map((t) => ({ value: t.key, label: t.label }))} value={kind} onChange={setKind} />
      <div id={tabPanelId("mockup", kind)} role="tabpanel" aria-labelledby={tabId("mockup", kind)}>
        <div className="h-[15rem] sm:h-[22.5rem] lg:h-[27.5rem]">
          <CompareSlider
            topLabel={fontName}
            bottomLabel="기본 고딕"
            top={<Scene kind={kind} {...props} />}
            bottom={<Scene kind={kind} {...props} fontStyle={BASE_GOTHIC_STYLE} />}
          />
        </div>
      </div>
      <p className="text-13 text-text-secondary lg:text-sm">손잡이를 밀면 기본 고딕과 비교돼요.</p>
    </div>
  );
}
