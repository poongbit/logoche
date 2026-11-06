"use client";

// 메인 (b) 로고체로 만든 폰트(11/6 피그마 436:48 데스크톱 · 436:68 모바일): 팀이 시험으로 만든 폰트(SHOWCASE_FONTS)로 세 크기를 써 보인다.
// '간판처럼 크게'는 회색 판 + 먹 글자(11/6 오후 2차 결정, 견본 칸 문법). 위 입력 칸 하나로 간판 줄을 우리 가게 문구로 바꿔 본다.
// 꼬리표 '세 줄 모두 예시 · 냥이네체'는 먹 알약(민트는 흰 바탕에서 버튼·배지로 읽혀서 쓰지 않음, screens.md 오후 피드백).
// 폰트를 받기 전에는 기본 글꼴로 번쩍이지 않게 글자를 숨긴다. 못 받으면 기본 글꼴로 보이고 그렇다고 알린다.

import { useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui";
import { SHOWCASE_FONTS } from "@/lib/constants";
import { useGeneratedFont } from "@/lib/font";
import { GLYPH_FONT_STACK } from "@/lib/preview";

const SIGN_DEFAULT = "오늘의 메뉴";

export function ExampleFont({ header }: { header: ReactNode }) {
  const font = SHOWCASE_FONTS[0];
  const { state, fontFamily } = useGeneratedFont(font.fontId);
  const [sign, setSign] = useState(SIGN_DEFAULT);
  const style = { fontFamily: fontFamily ?? GLYPH_FONT_STACK };
  const hidden = state === "loading" ? "invisible" : "";

  return (
    <>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        {header}
        <div className="flex w-full flex-col gap-1.5 lg:mb-1 lg:w-[27.5rem]">
          <label htmlFor="example-sign" className="text-sm font-bold text-text-secondary">
            우리 가게 문구로 써 보기
          </label>
          <input
            id="example-sign"
            value={sign}
            maxLength={12}
            onChange={(e) => setSign(e.target.value)}
            placeholder={SIGN_DEFAULT}
            autoComplete="off"
            className="h-[3.125rem] w-full rounded-[0.625rem] border-[1.5px] border-border-active bg-bg-canvas px-4 text-base outline-none focus:border-2 lg:h-[3.25rem] lg:px-5 lg:text-17"
          />
        </div>
      </div>

      <div className="relative mt-8 border-t border-border-active lg:mt-[3.25rem]" aria-busy={state === "loading"}>
        <Row label="간판처럼 크게" className="pt-4 pb-6 lg:pt-[1.375rem]">
          <div className="flex h-[6.5rem] items-center overflow-hidden rounded-[0.875rem] bg-bg-surface-strong px-5 lg:h-[11.25rem] lg:rounded-2xl lg:px-10">
            <p className={`truncate text-[3.5rem] leading-[1.25] text-text-primary lg:text-8xl ${hidden}`} style={style}>
              {sign.trim() || SIGN_DEFAULT}
            </p>
          </div>
        </Row>
        <Row label="가격표처럼" className="pt-4 pb-5 lg:pt-[1.125rem] lg:pb-10">
          <p className={`text-[1.625rem] leading-[1.25] lg:text-[2.5rem] ${hidden}`} style={style}>
            김치찌개 8,000원 <br className="lg:hidden" />
            <span className="hidden lg:inline">· </span>된장찌개 7,500원
          </p>
        </Row>
        <Row label="안내문처럼 작게" className="pt-4 pb-4 lg:pt-6 lg:pb-10">
          <p className={`text-15 leading-[1.25] lg:text-lg ${hidden}`} style={style}>
            포장 문의는 계산대에서 해 주세요. 영업시간 11:00-21:00 (월요일 쉬어요)
          </p>
        </Row>
        {state === "loading" && (
          <span className="absolute inset-0 grid place-items-center">
            <Spinner label="예시 폰트 불러오는 중" />
          </span>
        )}
      </div>

      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 lg:mt-7">
        <span className="inline-flex h-7 items-center rounded-full bg-bg-inverse px-3 text-13 font-bold text-text-inverse">
          세 줄 모두 예시 · {font.name}(같은 폰트)
        </span>
        {state === "unavailable" && <span className="text-13 text-text-secondary">예시 폰트를 불러오지 못해 기본 글꼴로 보여요</span>}
      </p>
    </>
  );
}

/** 한 줄: 왼쪽 이름표(데스크톱 200px 칸) + 오른쪽 견본. 줄 끝은 1px 먹 선. */
function Row({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <div className={`grid gap-2 border-b border-border-active lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-0 ${className}`}>
      <p className="text-13 font-bold text-text-secondary lg:pt-1.5 lg:text-sm">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
