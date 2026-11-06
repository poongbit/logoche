"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { BASE_GOTHIC_STYLE, MenuScene, MockupTabs, PackScene, SignScene, SocialScene, type MockupProps } from "@/components/Mockups";

const MENU: [string, string][] = [
  ["떡볶이", "4,500"],
  ["김밥", "3,500"],
  ["순대", "5,000"],
];
const SCENES = { sign: SignScene, menu: MenuScene, pack: PackScene, sns: SocialScene };

// 색 확인판(?board=1): 네 장면 × 로고 색이 다른 세 가게(+ 로고 색 없음)
const STORES: { name: string; colors: string[] }[] = [
  { name: "냥이네분식", colors: ["#E8553D", "#3A2418", "#FFF1E2"] },
  { name: "바다식당", colors: ["#1B3A6B", "#0E1E38", "#E8F0FA"] },
  { name: "숲속공방", colors: ["#4E7D3A", "#22361A", "#EEF3E6"] },
  { name: "색모름상회", colors: [] },
];

function Board({ fontStyle }: { fontStyle: CSSProperties }) {
  return (
    <div id="board" className="grid w-[1720px] grid-cols-4 gap-2 bg-white p-3">
      {STORES.map((s) => (
        <span key={s.name} className="text-15 font-bold">
          {s.name} <span className="font-normal text-text-secondary">{s.colors.join(" ") || "로고 색 없음"}</span>
        </span>
      ))}
      {(Object.keys(SCENES) as (keyof typeof SCENES)[]).map((k) => {
        const S = SCENES[k];
        return STORES.map((s) => (
          <div key={`${k}-${s.name}`} className="h-[170px]">
            <S storeName={s.name} menu={MENU} fontStyle={fontStyle} colors={s.colors} />
          </div>
        ));
      })}
    </div>
  );
}

function Preview() {
  const q = useSearchParams();
  const css = q.get("css") ?? "/dev-fonts/jua/index.css";
  const family = q.get("font") ?? "Jua";
  const storeName = q.get("name") ?? "냥이네분식";
  const colors = (q.get("colors") ?? "#E8553D,#3A2418,#FFF1E2").split(",");
  const fontStyle: CSSProperties = { fontFamily: `'${family}', sans-serif` };
  const props: MockupProps = { storeName, menu: MENU, fontStyle, colors, logo: null, slogan: q.get("slogan") };
  if (q.get("board"))
    return (
      <>
        <link rel="stylesheet" href={css} />
        <Board fontStyle={fontStyle} />
      </>
    );
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-6">
      <link rel="stylesheet" href={css} />
      {(Object.keys(SCENES) as (keyof typeof SCENES)[]).map((k) => {
        const S = SCENES[k];
        return (
          <div key={k} id={`scene-${k}`} className="flex flex-col gap-2">
            {[fontStyle, BASE_GOTHIC_STYLE].map((fs, i) => (
              <div key={i} className="h-[27.5rem]">
                <S {...props} fontStyle={fs} />
              </div>
            ))}
          </div>
        );
      })}
      <div id="tabs">
        <MockupTabs fontName="냥이네체" {...props} />
      </div>
    </div>
  );
}

export function MockupsPreview() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
