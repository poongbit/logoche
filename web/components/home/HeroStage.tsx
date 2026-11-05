"use client";

// 메인 첫 화면 오른쪽 무대(11/5 후보 A '무대 옆 입력'): 팀이 시험으로 만든 폰트(SHOWCASE_FONTS)로 쓴 글씨를 보여 준다.
// 폰트를 받기 전에는 기본 글꼴로 보이지 않게 글자를 숨긴다. 문구는 실제로 확인한 것만 쓴다(폰트 이름·글자 수).

import { Spinner } from "@/components/ui";
import { SHOWCASE_FONTS } from "@/lib/constants";
import { useGeneratedFont } from "@/lib/font";
import { GLYPH_FONT_STACK } from "@/lib/preview";

const TILES = ["냥", "이", "네", "빵", "집", "맛"];

export function HeroStage() {
  const font = SHOWCASE_FONTS[0];
  const { state, fontFamily } = useGeneratedFont(font.fontId);
  const style = { fontFamily: fontFamily ?? GLYPH_FONT_STACK };
  const hidden = state === "ready" ? "" : "invisible";
  return (
    <div className="relative flex min-h-[22rem] flex-col gap-5 overflow-hidden rounded-[1.25rem] bg-bg-canvas p-6 lg:min-h-[26rem] lg:p-8">
      <p className="flex flex-wrap items-baseline gap-x-3 text-13 text-text-secondary">
        <b className="font-bold">예시 · {font.name}</b>
        <span>로고체로 만든 폰트</span>
      </p>
      {state === "unavailable" ? (
        <p className="m-auto text-15 text-text-secondary">
          폰트를 불러오지 못했어요
        </p>
      ) : (
        <>
          <p
            className={`text-[clamp(3.5rem,9vw,7.5rem)] leading-[1.1] text-text-primary ${hidden}`}
            style={style}
          >
            냥이네
          </p>
          <div className={`flex flex-col gap-2 ${hidden}`} style={style}>
            <p className="text-[clamp(1.25rem,2.4vw,2rem)] leading-[1.3]">
              오늘의 신선한 빵 3,000원
            </p>
            <p className="text-[clamp(1rem,1.6vw,1.375rem)] leading-[1.4] text-text-secondary">
              주문은 가게 안쪽 계산대에서 해 주세요
            </p>
          </div>
          <div className="mt-auto flex flex-col gap-3">
            <ul
              aria-label="글자 예시"
              className={`grid grid-cols-6 divide-x divide-border-default border-t border-border-default pt-5 ${hidden}`}
            >
              {TILES.map((c) => (
                <li
                  key={c}
                  className="grid place-items-center py-2 text-[clamp(1.5rem,3.2vw,2.75rem)] leading-none"
                  style={style}
                >
                  {c}
                </li>
              ))}
            </ul>
            <p className="text-13 text-text-secondary">
              한글 2,350자 중 {font.hangul.toLocaleString()}자가 들어 있는 시험 폰트예요
            </p>
          </div>
          {state === "loading" && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner label="폰트 불러오는 중" />
            </span>
          )}
        </>
      )}
    </div>
  );
}
