"use client";

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BASE_GOTHIC_STACK } from "@/lib/preview";

// 화면 5 시안(Claude Design 'Logoche Final' 3k·3l·3s). 로고 색 [대표색, 어두운 색, 밝은 색]을 입힌다.
// 11/2 간판·메뉴판은 그림 대신 실제 사진(사용자가 AI로 만든 사진)을 쓴다(SignScene·MenuScene, PhotoStage). 인스타는 아직 그림이다.
// 11/2: 숫자·문장부호도 그리므로 가격도 만든 서체로 쓴다(숫자가 없는 예전 서체는 뒤에 붙은 기본 글꼴로 보인다).
// 11/2 점검: 시안 크기는 화면 폭이 아니라 시안 무대(@container/mock) 폭을 따른다. 스튜디오의 좁은 칸에서 메뉴판 가격·휴대폰이 잘렸다.
// 무대가 넓으면(72rem~, 예전 화면 5) 세 장을 한 줄에, 중간이면(42rem~, 스튜디오) 간판을 위에 넓게 두고 메뉴판·인스타를 나란히, 좁으면 위아래로 쌓는다.

export interface MockupProps {
  storeName: string;
  menu: [string, string][];
  fontStyle: CSSProperties;
  colors: string[];
  logo?: string | null;
}

export const BASE_GOTHIC_STYLE: CSSProperties = { fontFamily: BASE_GOTHIC_STACK, fontWeight: 400 };
const SHADOW = "shadow-[0_30px_70px_-30px_rgba(17,17,17,.55)]";

function luminance(hex: string): number {
  const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x808080;
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 바탕 위에서 min 대비를 넘는 첫 로고 색. 모두 모자라면 검정·흰색 중 대비가 큰 쪽(로고 색끼리 겹쳐 안 읽히는 간판을 막는다). */
function readableOn(bg: string, prefer: string[], min: number): string {
  return prefer.find((c) => contrast(c, bg) >= min) ?? (contrast("#111111", bg) >= contrast("#FFFFFF", bg) ? "#111111" : "#FFFFFF");
}

/** 로고 색 [대표색, 어두운 색, 밝은 색]과 그 위에 쓸 글자색. 간판 글자는 큰 글자(3:1), 메뉴판·인스타 글은 본문(4.5:1) 기준. */
function palette(colors: string[]) {
  const main = colors[0] ?? "#F26B3A";
  const dark = colors[1] ?? "#3B2A1E";
  const light = colors[2] ?? "#FFF5E8";
  return { main, dark, light, onMain: readableOn(main, [dark, light], 3), onLight: readableOn(light, [dark], 4.5) };
}

/** 글자 수에 맞춰 칸 폭 안에 들어가게 줄인다(칸에 container-type을 둔다). */
const fit = (text: string, max: number, share = 86): CSSProperties => ({ fontSize: `min(${max}px, ${share / Math.max(2, [...text].length)}cqw)` });

function SceneLabel({ title, place }: { title: string; place: string }) {
  return (
    <span className="absolute bottom-3 left-3 rounded-full bg-bg px-3 py-1.5 text-13 font-bold @6xl/mock:bottom-5 @6xl/mock:left-5 @6xl/mock:px-4 @6xl/mock:py-2 @6xl/mock:text-15">
      {title} <span className="font-medium text-muted">· {place}</span>
    </span>
  );
}

// 실제 사진 시안(11/2): 간판·메뉴판. 사진은 사용자가 AI로 만든 것이고, 원본은 engine/data/mockup-*-original.png,
// 꼭짓점·칠할 곳은 engine/scripts/mockups/(sign_map.py·menu_quad.py)로 다시 만든다.
// 글자는 AI가 그리지 않고 실제 폰트로 사진 속 면의 네 꼭짓점에 맞춰 원근대로 얹는다(CSS matrix3d).
// 칠할 곳 지도(회색+투명)가 있으면 로고 대표색 × 밝기 비율로 칠해 그늘·주름을 살린다. 회색 = 사진 밝기 ÷ 면 가운데 밝기 × 128, 투명도 = 칠할 정도.
type Point = [number, number];
type Box = { x: number; y: number; w: number; h: number };
interface Photo {
  src: string;
  map?: string;
  width: number;
  height: number;
  safe: Box; // 보여도 되는 곳. 이웃 가게 간판·Gemini 표시는 이 밖에 둔다
  focus: Box; // 꼭 보여야 하는 곳. 무대가 허락하는 한 다 보이게 줄이고 가운데에 둔다
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
  src: "/mockups/menu-board.webp",
  width: 1376,
  height: 768,
  safe: { x: 0, y: 0, w: 1225, h: 768 }, // 오른쪽 아래 테이블 위 Gemini 표시(x 1230~)는 보이지 않게
  focus: { x: 300, y: 90, w: 830, h: 510 },
  face: [
    [197.8, 207.1],
    [835.7, 37.1],
    [1240.1, 399.0],
    [484.2, 669.6],
  ],
};
const MENU_PAPER = "#F5E0BF"; // 종이 가운데 색(글자색 대비 계산용)

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

/** 사진을 캔버스에 그리고, 지도와 색이 있으면 지도대로 칠한다(100만 화소, 수 ms) */
async function paintPhoto(canvas: HTMLCanvasElement, photo: Photo, color: string | null) {
  const [img, map] = await Promise.all([pixels(photo.src), photo.map && color ? pixels(photo.map) : null]);
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  if (map && color) {
    const t = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
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
 * children은 사진 좌표로 놓는다(Face). */
function PhotoStage({
  photo,
  color = null,
  label,
  className,
  children,
}: {
  photo: Photo;
  color?: string | null;
  label: [string, string];
  className: string;
  children: ReactNode;
}) {
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
    <div ref={stageRef} className={`relative overflow-hidden bg-stage ${className}`}>
      <div
        className={`absolute top-0 left-0 origin-top-left transition-opacity duration-300 ${painted && view ? "opacity-100" : "opacity-0"}`}
        style={{ width: photo.width, height: photo.height, transform: view ? `scale(${view.s}) translate(${-view.x}px, ${-view.y}px)` : undefined }}
      >
        <canvas ref={canvasRef} width={photo.width} height={photo.height} aria-hidden className="absolute inset-0" />
        {children}
      </div>
      <SceneLabel title={label[0]} place={label[1]} />
    </div>
  );
}

/** 사진 속 면에 맞춘 상자(faceBox) */
function Face({ box, className = "", style, children }: { box: ReturnType<typeof faceBox>; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={`absolute top-0 left-0 origin-top-left ${className}`} style={{ width: box.w, height: box.h, transform: box.transform, ...style }}>
      {children}
    </div>
  );
}

/** 간판 · 가게 앞(실제 사진). 간판 면·차양을 로고 대표색으로 칠한다. 로고 색을 모르면 사진의 파랑 그대로 + 흰 글자. */
export function SignScene({ storeName, fontStyle, colors }: MockupProps) {
  const color = /^#[0-9a-f]{6}$/i.test(colors[0] ?? "") ? colors[0] : null;
  const fontSize = Math.min(SIGN_FACE.h * 0.6, (SIGN_FACE.w * 0.84) / Math.max(2, [...storeName].length));
  return (
    <PhotoStage
      photo={SIGN_PHOTO}
      color={color}
      label={["간판", "가게 앞"]}
      className="aspect-[920/520] rounded-2xl @2xl/mock:col-span-2 @2xl/mock:aspect-[1110/510] @6xl/mock:col-span-1 @6xl/mock:aspect-[920/520] @6xl/mock:rounded-none"
    >
      <Face box={SIGN_FACE} className="grid place-items-center">
        <span
          className="leading-none whitespace-nowrap"
          style={{
            ...fontStyle,
            fontSize,
            color: color ? palette(colors).onMain : "#FFFFFF",
            textShadow: "0 2px 0 rgb(0 0 0 / 0.16), 0 6px 14px rgb(0 0 0 / 0.22)",
          }}
        >
          {storeName}
        </span>
      </Face>
    </PhotoStage>
  );
}

/** 메뉴판 · 테이블 위(실제 사진). 종이 색은 그대로 두고, 글자는 로고의 어두운 색을 종이 결과 곱해 인쇄한 것처럼 얹는다.
 * 위·오른쪽·아래 집게가 종이 가장자리를 덮어서 글자는 안쪽(위아래 15%, 양옆 12%)에 둔다. */
export function MenuScene({ storeName, menu, fontStyle, colors }: MockupProps) {
  const ink = readableOn(MENU_PAPER, [palette(colors).dark], 4.5);
  const { w, h } = MENU_FACE;
  const nameSize = Math.min(h * 0.15, (w * 0.76 * 0.9) / Math.max(2, [...storeName].length));
  return (
    <PhotoStage photo={MENU_PHOTO} label={["메뉴판", "테이블 위"]} className="h-[18.75rem] rounded-2xl @2xl/mock:h-[22.5rem] @6xl/mock:h-full @6xl/mock:rounded-none">
      <Face box={MENU_FACE} className="flex flex-col justify-center mix-blend-multiply" style={{ padding: `${h * 0.15}px ${w * 0.12}px`, gap: h * 0.05, color: ink }}>
        <div className="text-center leading-none" style={{ ...fontStyle, fontSize: nameSize }}>
          {storeName}
        </div>
        <div className="h-[3px] opacity-30" style={{ background: ink }} />
        {menu.map(([item, price]) => (
          <div key={item} className="flex items-baseline justify-between" style={{ gap: w * 0.04 }}>
            <span style={{ ...fontStyle, fontSize: h * 0.085 }}>{item}</span>
            <span style={{ ...fontStyle, fontSize: h * 0.065 }}>{price}</span>
          </div>
        ))}
      </Face>
    </PhotoStage>
  );
}

/** 비교 보기(만든 폰트 · 기본 고딕)의 메뉴판 종이 */
function MenuPaper({ storeName, menu, fontStyle, colors }: MockupProps) {
  const c = palette(colors);
  return (
    <div className={`flex w-[16.875rem] flex-col gap-2 px-[1.375rem] py-4 [container-type:inline-size] ${SHADOW}`} style={{ background: c.light, color: c.onLight }}>
      <div className="text-center leading-none" style={{ ...fontStyle, ...fit(storeName, 30, 70) }}>
        {storeName}
      </div>
      {menu.map(([item, price]) => (
        <div key={item} className="flex items-baseline justify-between gap-3">
          <span className="text-19" style={fontStyle}>
            {item}
          </span>
          <span className="text-sm" style={fontStyle}>
            {price}
          </span>
        </div>
      ))}
    </div>
  );
}

function InstaPost({ storeName, menu, fontStyle, colors, large }: MockupProps & { large?: boolean }) {
  const c = palette(colors);
  return (
    <div className={`flex aspect-square flex-col justify-between ${large ? "p-3 @6xl/mock:p-[1.125rem]" : "w-[13.75rem] p-4"}`} style={{ background: c.light, color: c.onLight }}>
      <span className={large ? "text-13 @6xl/mock:text-17" : "text-15"} style={fontStyle}>
        오늘의 추천
      </span>
      <span className={`leading-[1.15] ${large ? "text-26 @6xl/mock:text-36" : "text-32"}`} style={fontStyle}>
        {menu[0]?.[0]}
      </span>
      <span className={large ? "text-sm @6xl/mock:text-19" : "text-17"} style={fontStyle}>
        {storeName}
      </span>
    </div>
  );
}

/** 인스타그램 · 휴대폰 */
export function InstaScene(props: MockupProps) {
  return (
    <div className="relative grid h-[22.5rem] place-items-center overflow-hidden rounded-2xl bg-[#E4E0D9] @6xl/mock:h-full @6xl/mock:rounded-none">
      <div className={`h-[18.75rem] w-[11.25rem] -translate-y-3.5 rounded-[1.75rem] bg-ink p-[0.4375rem] @6xl/mock:h-[31.875rem] @6xl/mock:w-[15.625rem] @6xl/mock:-translate-y-6 @6xl/mock:rounded-[2.5rem] @6xl/mock:p-2.5 ${SHADOW}`}>
        <div className="h-full w-full overflow-hidden rounded-[1.375rem] bg-white @6xl/mock:rounded-[2rem]">
          <div className="h-[1.625rem] @6xl/mock:h-10" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 @6xl/mock:gap-2 @6xl/mock:px-3 @6xl/mock:py-2">
            {props.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL
              <img src={props.logo} alt="" className="h-[1.375rem] w-[1.375rem] rounded-full object-cover object-left @6xl/mock:h-[1.875rem] @6xl/mock:w-[1.875rem]" />
            ) : (
              <span className="h-[1.375rem] w-[1.375rem] rounded-full bg-stage @6xl/mock:h-[1.875rem] @6xl/mock:w-[1.875rem]" />
            )}
            <span className="text-13 font-bold text-ink">{props.storeName}</span>
          </div>
          <InstaPost {...props} large />
        </div>
      </div>
      <SceneLabel title="인스타그램" place="휴대폰" />
    </div>
  );
}

/** 기본 보기: 시안 3종을 한 무대에. 크기는 이 무대(@container/mock)의 폭을 따른다. */
export const MockupStage = memo(function MockupStage(props: MockupProps) {
  return (
    <div className="@container/mock h-full">
      <div className="grid gap-2 @2xl/mock:grid-cols-2 @6xl/mock:h-full @6xl/mock:grid-cols-[1.2fr_1fr_0.9fr] @6xl/mock:overflow-hidden @6xl/mock:rounded-[1.25rem]">
        <SignScene {...props} />
        <MenuScene {...props} />
        <InstaScene {...props} />
      </div>
    </div>
  );
});

function CompareCell({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`grid min-h-[12.5rem] place-items-center overflow-hidden rounded-[0.875rem] p-4 ${className}`}>{children}</div>;
}

function CompareRow({ label, muted, props }: { label: string; muted?: boolean; props: MockupProps }) {
  const c = palette(props.colors);
  return (
    <>
      <div className={`flex items-center text-base leading-snug font-bold ${muted ? "text-muted" : ""} max-lg:pt-2`}>{label}</div>
      <CompareCell className="bg-[linear-gradient(#D7D1C7,#B9B1A4)]">
        <div className={`grid h-[7.5rem] w-[84%] place-items-center rounded-lg [container-type:inline-size] ${SHADOW}`} style={{ background: c.main }}>
          <span className="leading-none" style={{ ...props.fontStyle, ...fit(props.storeName, 76), color: c.onMain }}>
            {props.storeName}
          </span>
        </div>
      </CompareCell>
      <CompareCell className="bg-[radial-gradient(ellipse_at_40%_30%,#BE916A,#7E5737_80%)]">
        <MenuPaper {...props} />
      </CompareCell>
      <CompareCell className="bg-[#E4E0D9]">
        <div className={SHADOW}>
          <InstaPost {...props} />
        </div>
      </CompareCell>
    </>
  );
}

/** 비교 보기: 위는 만든 폰트, 아래는 기본 고딕. 색과 배치는 같다. 휴대폰 폭에서는 서체마다 시안을 위아래로 쌓는다. */
export function CompareStage({ fontName, ...props }: MockupProps & { fontName: string }) {
  return (
    <div className="grid gap-2 lg:h-full lg:grid-cols-[7rem_1.2fr_1fr_0.9fr] lg:grid-rows-2">
      <CompareRow label={fontName} props={props} />
      <CompareRow label="기본 고딕" muted props={{ ...props, fontStyle: BASE_GOTHIC_STYLE }} />
    </div>
  );
}
