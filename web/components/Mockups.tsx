import type { CSSProperties, ReactNode } from "react";
import { BASE_GOTHIC_STACK } from "@/lib/preview";

// 화면 5 시안(Claude Design 'Logoche Final' 3k·3l·3s). 로고 색 [대표색, 어두운 색, 밝은 색]을 입힌다.
// 가격 숫자는 늘 기본 글꼴로 둔다(본선 서체에는 숫자가 없다).

export interface MockupProps {
  storeName: string;
  menu: [string, string][];
  fontStyle: CSSProperties;
  colors: string[];
  logo?: string | null;
}

export const BASE_GOTHIC_STYLE: CSSProperties = { fontFamily: BASE_GOTHIC_STACK, fontWeight: 400 };
const PRICE_STYLE: CSSProperties = { fontFamily: '"Noto Sans KR", sans-serif' };
const SHADOW = "shadow-[0_30px_70px_-30px_rgba(17,17,17,.55)]";

function palette(colors: string[]) {
  return { main: colors[0] ?? "#F26B3A", dark: colors[1] ?? "#3B2A1E", light: colors[2] ?? "#FFF5E8" };
}

/** 글자 수에 맞춰 칸 폭 안에 들어가게 줄인다(칸에 container-type을 둔다). */
const fit = (text: string, max: number, share = 86): CSSProperties => ({ fontSize: `min(${max}px, ${share / Math.max(2, [...text].length)}cqw)` });

function SceneLabel({ title, place }: { title: string; place: string }) {
  return (
    <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1.5 text-sm font-bold lg:bottom-5 lg:left-5 lg:px-4 lg:py-2 lg:text-15">
      {title} <span className="font-medium text-muted">· {place}</span>
    </span>
  );
}

/** 간판 · 가게 앞 */
export function SignScene({ storeName, fontStyle, colors }: MockupProps) {
  const c = palette(colors);
  return (
    <div className="relative h-[16.25rem] overflow-hidden rounded-2xl bg-[linear-gradient(#D7D1C7,#B9B1A4)] lg:h-full lg:rounded-none">
      <div
        className={`absolute inset-x-0 top-0 h-9 lg:h-14 ${SHADOW}`}
        style={{ background: `repeating-linear-gradient(90deg, ${c.main} 0 56px, ${c.light} 56px 112px)` }}
      />
      <div
        className={`absolute inset-x-5 top-16 grid h-[6.5rem] place-items-center rounded-lg [container-type:inline-size] lg:inset-x-10 lg:top-[6.25rem] lg:h-[10.625rem] lg:rounded-[0.625rem] ${SHADOW}`}
        style={{ background: c.main }}
      >
        <span className="leading-none" style={{ ...fontStyle, ...fit(storeName, 104), color: c.dark }}>
          {storeName}
        </span>
      </div>
      <div className="absolute inset-x-5 top-[11.625rem] bottom-0 grid grid-cols-[1.6fr_1fr] gap-3 lg:inset-x-10 lg:top-[18.75rem]">
        <div className="bg-[linear-gradient(135deg,#7B7168,#2E2925_55%,#5C534A)]" />
        <div className="bg-[#2E2925]" />
      </div>
      <SceneLabel title="간판" place="가게 앞" />
    </div>
  );
}

function MenuPaper({ storeName, menu, fontStyle, colors, tilted }: MockupProps & { tilted?: boolean }) {
  const c = palette(colors);
  return (
    <div
      className={`flex w-[16.875rem] flex-col [container-type:inline-size] ${
        tilted ? "-rotate-3 gap-2.5 px-[1.375rem] py-5 shadow-[0_22px_36px_rgba(0,0,0,.35)] lg:w-[19.375rem] lg:gap-4 lg:px-[1.875rem] lg:py-8" : `gap-2 px-[1.375rem] py-4 ${SHADOW}`
      }`}
      style={{ background: c.light, color: c.dark }}
    >
      <div className="text-center leading-none" style={{ ...fontStyle, ...fit(storeName, tilted ? 46 : 30, 70) }}>
        {storeName}
      </div>
      {tilted && <div className="h-px" style={{ background: `${c.dark}33` }} />}
      {menu.map(([item, price]) => (
        <div key={item} className="flex items-baseline justify-between gap-3">
          <span className={tilted ? "text-19 lg:text-22" : "text-19"} style={fontStyle}>
            {item}
          </span>
          <span className={tilted ? "text-15 lg:text-base" : "text-sm"} style={PRICE_STYLE}>
            {price}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 메뉴판 · 테이블 위 */
export function MenuScene(props: MockupProps) {
  return (
    <div className="relative grid h-[18.75rem] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_40%_30%,#BE916A,#7E5737_80%)] lg:h-full lg:rounded-none">
      <div className="-translate-y-[4%]">
        <MenuPaper {...props} tilted />
      </div>
      <SceneLabel title="메뉴판" place="테이블 위" />
    </div>
  );
}

function InstaPost({ storeName, menu, fontStyle, colors, large }: MockupProps & { large?: boolean }) {
  const c = palette(colors);
  return (
    <div className={`flex aspect-square flex-col justify-between ${large ? "p-3 lg:p-[1.125rem]" : "w-[13.75rem] p-4"}`} style={{ background: c.light, color: c.dark }}>
      <span className={large ? "text-13 lg:text-17" : "text-15"} style={fontStyle}>
        오늘의 추천
      </span>
      <span className={`leading-[1.15] ${large ? "text-26 lg:text-36" : "text-32"}`} style={fontStyle}>
        {menu[0]?.[0]}
      </span>
      <span className={large ? "text-sm lg:text-19" : "text-17"} style={fontStyle}>
        {storeName}
      </span>
    </div>
  );
}

/** 인스타그램 · 휴대폰 */
export function InstaScene(props: MockupProps) {
  return (
    <div className="relative grid h-[22.5rem] place-items-center overflow-hidden rounded-2xl bg-[#E4E0D9] lg:h-full lg:rounded-none">
      <div className={`h-[18.75rem] w-[11.25rem] -translate-y-3.5 rounded-[1.75rem] bg-ink p-[0.4375rem] lg:h-[31.875rem] lg:w-[15.625rem] lg:-translate-y-6 lg:rounded-[2.5rem] lg:p-2.5 ${SHADOW}`}>
        <div className="h-full w-full overflow-hidden rounded-[1.375rem] bg-white lg:rounded-[2rem]">
          <div className="h-[1.625rem] lg:h-10" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 lg:gap-2 lg:px-3 lg:py-2">
            {props.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL
              <img src={props.logo} alt="" className="h-[1.375rem] w-[1.375rem] rounded-full object-cover object-left lg:h-[1.875rem] lg:w-[1.875rem]" />
            ) : (
              <span className="h-[1.375rem] w-[1.375rem] rounded-full bg-stage lg:h-[1.875rem] lg:w-[1.875rem]" />
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

/** 기본 보기: 시안 3종을 한 무대에 */
export function MockupStage(props: MockupProps) {
  return (
    <div className="grid gap-2 lg:h-full lg:grid-cols-[1.2fr_1fr_0.9fr] lg:overflow-hidden lg:rounded-[1.25rem]">
      <SignScene {...props} />
      <MenuScene {...props} />
      <InstaScene {...props} />
    </div>
  );
}

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
          <span className="leading-none" style={{ ...props.fontStyle, ...fit(props.storeName, 76), color: c.dark }}>
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
