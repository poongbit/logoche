"use client";

// 화면 5 브랜드 적용 키트(Claude Design 'Logoche Final' 3k·3l·3s). 로고 색으로 만든 시안 3종에 만든 서체를 입히고,
// '기본 고딕과 비교'를 누르면 같은 시안을 기본 고딕과 나란히 보인다.

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CompareStage, MockupStage } from "@/components/Mockups";
import { RequireStep } from "@/components/RequireStep";
import { Button, ButtonLink, Footer, Notice, Spinner } from "@/components/ui";
import { MENU_BY_INDUSTRY } from "@/lib/constants";
import { useGeneratedFont } from "@/lib/font";
import { approxFontStyle, axesToValues } from "@/lib/preview";
import { isBuildPassed, useApp } from "@/lib/store";

export default function KitPage() {
  const { state } = useApp();
  return (
    <RequireStep ready={isBuildPassed(state.build) && state.maxStep >= 4} message="화면 4에서 폰트 만들기와 검사를 먼저 마쳐 주세요." href="/build">
      <KitScreen />
    </RequireStep>
  );
}

function KitScreen() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [compare, setCompare] = useState(false);
  // 만든 TTF를 불러와 시안에 입힌다. 불러오지 못하면 근사 글씨로 보여 주고 다시 불러올 수 있게 한다.
  const [fontAttempt, setFontAttempt] = useState(0);
  const { state: fontState, fontFamily } = useGeneratedFont(state.build?.fontId ?? null, state.fontRevision, fontAttempt);

  if (!state.style || !state.upload.industry) return null;

  const fontName = `${state.upload.storeName}체`;
  const fontStyle: CSSProperties = fontFamily ? { fontFamily } : approxFontStyle(axesToValues(state.style.axes));
  const props = {
    storeName: state.upload.storeName,
    menu: MENU_BY_INDUSTRY[state.upload.industry],
    colors: state.style.colors,
    fontStyle,
    logo: state.upload.logoImage,
  };

  function next() {
    dispatch({ type: "reachStep", step: 5 });
    router.push("/download");
  }

  return (
    <>
      {/* 데스크톱에서는 위 단계 표시(72px)와 아래 동작 막대(88px) 사이를 꼭 채운다. 시안 무대가 남는 높이를 쓴다. */}
      <div className="flex w-full flex-1 flex-col lg:h-[calc(100dvh-10rem)] lg:min-h-[40rem] lg:flex-none">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3.5 px-5 pt-5 pb-3.5 lg:flex-row lg:items-end lg:gap-5 lg:px-12 lg:pt-1 lg:pb-[1.125rem]">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl leading-tight font-extrabold tracking-[-0.02em] lg:text-28">
              {compare ? "기본 고딕과 비교해 보세요" : `${fontName}를 가게에 입혀 봤어요`}
            </h1>
            <p className="text-sm font-medium text-muted lg:text-15">
              {compare ? `위는 ${fontName}, 아래는 기본 고딕이에요. 색과 배치는 같아요.` : "로고 색으로 만든 시안 3종 · 가격 숫자는 기본 글꼴"}
            </p>
          </div>
          <div role="tablist" aria-label="보기" className="grid grid-cols-2 rounded-full bg-stage p-1 text-15 font-bold lg:ml-auto lg:flex">
            {[
              { on: false, label: fontName },
              { on: true, label: "기본 고딕과 비교" },
            ].map((tab) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={compare === tab.on}
                onClick={() => setCompare(tab.on)}
                className={`rounded-full px-[1.125rem] py-2.5 transition-colors ${compare === tab.on ? "bg-bg shadow-[0_1px_2px_#0002]" : "text-muted hover:text-ink"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {(fontState === "unavailable" || fontState === "loading") && (
          <div className="mx-auto w-full max-w-[90rem] px-5 pb-3 lg:px-12">
            {fontState === "loading" ? (
              <Spinner label="폰트 파일을 불러오는 중" />
            ) : (
              <Notice tone="warn">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  폰트 파일을 불러오지 못해 비슷한 글씨로 보여 주고 있어요.
                  <Button variant="outline" size="sm" onClick={() => setFontAttempt((n) => n + 1)}>
                    다시 불러오기
                  </Button>
                </span>
              </Notice>
            )}
          </div>
        )}

        <div className="flex w-full flex-1 px-3 pb-4 lg:min-h-0 lg:px-6 lg:pb-4">
          <div className="mx-auto w-full max-w-[87rem]">{compare ? <CompareStage {...props} fontName={fontName} /> : <MockupStage {...props} />}</div>
        </div>
      </div>

      <Footer status={compare ? `비교 중이에요. 받는 파일은 ${fontName}예요.` : "시안 3종이 준비됐어요."}>
        <ButtonLink href="/build">이전</ButtonLink>
        <Button onClick={next}>받기</Button>
      </Footer>
    </>
  );
}
