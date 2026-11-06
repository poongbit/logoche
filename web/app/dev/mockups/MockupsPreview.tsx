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

function Preview() {
  const q = useSearchParams();
  const css = q.get("css") ?? "/dev-fonts/jua/index.css";
  const family = q.get("font") ?? "Jua";
  const storeName = q.get("name") ?? "냥이네분식";
  const colors = (q.get("colors") ?? "#E8553D,#3A2418,#FFF1E2").split(",");
  const fontStyle: CSSProperties = { fontFamily: `'${family}', sans-serif` };
  const props: MockupProps = { storeName, menu: MENU, fontStyle, colors, logo: null, slogan: q.get("slogan") };
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
