"use client";

// 메인 '로고체로 만든 폰트'(11/2): 팀이 시험으로 만든 폰트(lib/constants.ts SHOWCASE_FONTS)에 같은 글을 써 보는 칸. 사용자 폰트는 올리지 않는다.
// 폰트를 받기 전에는 기본 글꼴로 보이지 않게 글자를 숨긴다(다른 글꼴이 잠깐 보이면 결과물로 오해한다).

import { useState } from "react";
import { Spinner, TextField } from "@/components/ui";
import { SHOWCASE_FONTS } from "@/lib/constants";
import { useGeneratedFont } from "@/lib/font";
import { GLYPH_FONT_STACK } from "@/lib/preview";

export function Showcase() {
  const [text, setText] = useState("우리 동네 빵집");
  return (
    <div className="flex flex-col gap-5">
      <TextField value={text} onChange={(e) => setText(e.target.value)} maxLength={24} aria-label="써 볼 글" placeholder="써 볼 글을 적어 보세요" className="max-w-[26rem]" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-5">
        {SHOWCASE_FONTS.map((font) => (
          <ShowcaseCard key={font.fontId} font={font} text={text} />
        ))}
      </div>
    </div>
  );
}

function ShowcaseCard({ font, text }: { font: (typeof SHOWCASE_FONTS)[number]; text: string }) {
  const { state, fontFamily } = useGeneratedFont(font.fontId);
  return (
    <article className="flex flex-col rounded-[1.25rem] border border-line bg-bg">
      <div className="relative grid min-h-[13rem] place-items-center rounded-t-[1.25rem] bg-stage px-6 py-10">
        {state === "unavailable" ? (
          <p className="text-15 text-muted">폰트를 불러오지 못했어요</p>
        ) : (
          <>
            <p
              className={`text-center text-[clamp(2.5rem,7vw,5rem)] leading-[1.25] [overflow-wrap:anywhere] ${state === "ready" ? "" : "invisible"}`}
              style={{ fontFamily: fontFamily ?? GLYPH_FONT_STACK }}
            >
              {text.trim() || " "}
            </p>
            {state === "loading" && (
              <span className="absolute inset-0 grid place-items-center">
                <Spinner label="폰트 불러오는 중" />
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="text-17 font-extrabold">{font.name}</span>
        <span className="font-mono text-13 text-muted">한글 {font.hangul.toLocaleString()}자</span>
      </div>
    </article>
  );
}
