"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type CSSProperties } from "react";
import { BASE_GOTHIC_STYLE, MenuScene, MockupTabs, PackScene, SignScene, SocialScene, type MockupProps, type PackShot, type SnsShot } from "@/components/Mockups";

const MENU: [string, string][] = [
  ["떡볶이", "4,500"],
  ["김밥", "3,500"],
  ["순대", "5,000"],
];
const SCENES = { sign: SignScene, menu: MenuScene, pack: PackScene, sns: SocialScene };

// 비교판(?board=pack|sns): 사진 후보 × 로고 색 세 가게
const STORES: { name: string; colors: string[] }[] = [
  { name: "냥이네분식", colors: ["#E8553D", "#3A2418", "#FFF1E2"] },
  { name: "바다식당", colors: ["#1B3A6B", "#0E1E38", "#E8F0FA"] },
  { name: "숲속공방", colors: ["#4E7D3A", "#22361A", "#EEF3E6"] },
];
const SHOTS = { pack: ["front", "angle", "counter"] as PackShot[], sns: ["front", "hand", "stand"] as SnsShot[] };

function Board({ kind, fontStyle, tone }: { kind: "pack" | "sns"; fontStyle: CSSProperties; tone: "light" | "dark" }) {
  return (
    <div id="board" className="grid w-[1720px] grid-cols-[60px_repeat(3,1fr)] gap-2 bg-white p-3">
      <span />
      {STORES.map((s) => (
        <span key={s.name} className="text-15 font-bold">
          {s.name} <span className="font-normal text-text-secondary">{s.colors.join(" ")}</span>
        </span>
      ))}
      {SHOTS[kind].map((shot) => (
        <div key={shot} className="contents">
          <span className="self-center text-15 font-bold">{shot}</span>
          {STORES.map((s) => (
            <div key={s.name} className="h-[220px]">
              {kind === "pack" ? (
                <PackScene storeName={s.name} menu={MENU} fontStyle={fontStyle} colors={s.colors} shot={shot as PackShot} />
              ) : (
                <SocialScene storeName={s.name} menu={MENU} fontStyle={fontStyle} colors={s.colors} shot={shot as SnsShot} tone={tone} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Preview() {
  const q = useSearchParams();
  const board = q.get("board");
  const css = q.get("css") ?? "/dev-fonts/jua/index.css";
  const family = q.get("font") ?? "Jua";
  const storeName = q.get("name") ?? "냥이네분식";
  const colors = (q.get("colors") ?? "#E8553D,#3A2418,#FFF1E2").split(",");
  const fontStyle: CSSProperties = { fontFamily: `'${family}', sans-serif` };
  const props: MockupProps = { storeName, menu: MENU, fontStyle, colors, logo: null, slogan: q.get("slogan") };
  if (board === "pack" || board === "sns")
    return (
      <>
        <link rel="stylesheet" href={css} />
        <Board kind={board} fontStyle={fontStyle} tone={q.get("tone") === "dark" ? "dark" : "light"} />
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
