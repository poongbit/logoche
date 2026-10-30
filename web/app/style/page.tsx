"use client";

// 화면 2 AI가 읽은 방향(Claude Design 'Logoche Final' 3c·3d). 왼쪽 무대에 로고와 AI가 읽은 것, 오른쪽에 표현 방식 고르기.
// 10/29 사용자 제안: '리본처럼 휘어진 획' 같은 말만으로는 모양이 떠오르지 않아, 제안마다 가게 이름을 그 방식으로 그린 견본을 보여 주고
// 그림을 보고 고르게 한다. 고른 견본은 화면 3 초안의 참고 이미지가 된다(lib/server/samples.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireStep } from "@/components/RequireStep";
import { Button, ButtonLink, Footer, Notice, Spinner } from "@/components/ui";
import { AXES, BRAND_TONES, REFERENCE_CHARS, formatAxis as fmt } from "@/lib/constants";
import { api, errorMessage } from "@/lib/api";
import { isImitationRequest, isUploadComplete } from "@/lib/rules";
import { useApp, type SampleState } from "@/lib/store";

export default function StylePage() {
  const { state } = useApp();
  return (
    <RequireStep ready={isUploadComplete(state.upload) && state.maxStep >= 1} message="화면 1에서 로고와 가게 정보를 먼저 입력해 주세요." href="/">
      <StyleScreen />
    </RequireStep>
  );
}

function StyleScreen() {
  const { state, dispatch, record } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  const style = state.style;
  const analyzing = !style && !error;

  useEffect(() => {
    // 결과가 오면 표시를 푼다. Cache Components는 화면을 떠나도 이 컴포넌트를 숨겨 둘 뿐이라(ref가 남는다), 다른 화면에서
    // 작업을 지우고 돌아왔을 때(화면 1에서 로고·톤을 바꾸면 스타일 카드가 지워진다) 다시 시작해야 한다. 표시는 요청이 가는 동안 두 번 보내지 않으려고 둔다.
    if (style) {
      requested.current = false;
      return;
    }
    if (error || requested.current) return;
    requested.current = true;
    const run = state.run;
    api
      .analyzeStyle({ upload: state.upload })
      .then((card) => {
        dispatch({ type: "setStyle", style: card, run });
        for (const m of card.models) record("ai_model", `스타일 분석: ${m}`);
        record("selection", `AI 제안 조절값: ${card.axes.map((a) => `${AXES[a.key].label} ${fmt(a.key, a.value)}`).join(" · ")}`);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [style, error, state.upload, state.run, dispatch, record]);

  function retry() {
    requested.current = false;
    setError(null);
  }

  const samples = useStyleSamples();
  const chosenSample = style ? state.styleSamples[style.expression.trim()] : undefined;
  const sampleOptions = style?.expressionOptions ?? [];
  const samplesDrawing = sampleOptions.filter((o) => state.styleSamples[o]?.status === "drawing").length;
  const waitingChosen = chosenSample?.status === "drawing";

  function confirm() {
    if (!style) return;
    const summary = style.axes
      .map((a) => `${AXES[a.key].label} ${fmt(a.key, a.value)}${a.value !== a.suggested ? `(AI ${fmt(a.key, a.suggested)})` : ""}`)
      .join(" · ");
    record("selection", `AI가 정한 초안 조절값으로 그리기: ${summary}`);
    if (style.expression?.trim()) {
      record("creative_intent", `표현 방식 확정: ${style.expression.trim()}${chosenSample?.status === "ready" ? " (가게 이름 견본을 보고 고름)" : ""}`);
    }
    dispatch({ type: "reachStep", step: 2 });
    router.push("/draft");
  }

  const imitationExpression = isImitationRequest(style?.expression ?? "");
  const tones = state.upload.brandTones.map((t) => BRAND_TONES.find((b) => b.value === t)?.label).filter(Boolean).join("·");
  const colors = [...new Set(style?.colors ?? [])];

  return (
    <>
      <div className="flex w-full flex-1 lg:px-6 lg:pb-6">
        <div className="mx-auto grid w-full max-w-[87rem] overflow-hidden lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:rounded-[1.25rem]">
          {/* 로고에서 읽은 것 */}
          <section className="flex flex-col gap-6 bg-stage px-5 py-6 lg:gap-7 lg:px-12 lg:py-10">
            <h2 className="text-15 font-bold text-muted">로고에서 읽은 것</h2>
            <div className="relative self-center">
              {state.upload.logoImage && (
                // eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 data URL
                <img
                  src={state.upload.logoImage}
                  alt={`${state.upload.storeName} 로고`}
                  className="block max-h-[20rem] w-full max-w-[32.5rem] rounded-2xl object-contain shadow-[0_0_0_1px_rgba(17,17,17,.12),0_18px_40px_-26px_rgba(17,17,17,.45)]"
                />
              )}
              {analyzing && <div aria-hidden className="absolute inset-0 rounded-2xl shadow-[inset_0_0_0_3px_var(--muted)]" />}
            </div>
            {style ? (
              <dl className="grid grid-cols-[1.75rem_minmax(0,auto)_1fr] items-center gap-x-3 gap-y-3.5 text-base lg:text-17">
                {style.signature && (
                  <>
                    <Num n={1} />
                    <dt className="font-bold">시그니처 요소</dt>
                    <dd className="font-medium">{style.signature}</dd>
                  </>
                )}
                <Num n={style.signature ? 2 : 1} />
                <dt className="font-bold">획 끝</dt>
                <dd className="font-medium">{style.strokeEnd}</dd>
                <span />
                <dt className="font-bold">색</dt>
                <dd className="flex flex-wrap items-center gap-4 text-sm font-semibold">
                  {colors.map((c) => (
                    <span key={c} className="flex items-center gap-1.5">
                      <span className="h-[1.625rem] w-[1.625rem] rounded-full shadow-[0_0_0_1.5px_var(--bg),0_0_0_3px_var(--edge)]" style={{ background: c }} />
                      <span className="font-medium text-muted uppercase">{c}</span>
                    </span>
                  ))}
                  <span className="font-medium text-muted">적용 시안에만 써요</span>
                </dd>
              </dl>
            ) : analyzing ? (
              <div className="flex flex-col gap-3.5 text-base font-bold lg:text-17">
                <Spinner label={<span>로고를 재고 분위기를 읽는 중 <span className="font-medium text-muted">획 굵기·획 끝·시그니처 요소·색</span></span>} size={24} />
                <span className="flex items-center gap-3 font-semibold text-muted">
                  <span aria-hidden className="h-6 w-6 rounded-full border-2 border-edge" />
                  표현 방식 제안
                </span>
              </div>
            ) : null}
          </section>

          {/* 표현 방식 */}
          <section className="flex flex-col gap-[1.125rem] px-5 py-6 lg:px-12 lg:py-10">
            <div className="flex flex-col gap-2">
              <h1 className="text-26 font-extrabold tracking-[-0.02em] lg:text-30">어떤 획으로 그릴까요?</h1>
              <p className="text-15 leading-normal font-medium text-muted lg:text-base">
                로고와 고른 톤({tones})을 보고 AI가 {style?.expressionOptions.length ? `${style.expressionOptions.length}가지를` : ""} 제안했어요. 고르거나 직접
                써 주세요.
              </p>
            </div>
            {error && (
              <div className="flex flex-col items-start gap-3">
                <Notice tone="error">스타일 분석에 실패했어요: {error}</Notice>
                <Button variant="outline" onClick={retry}>
                  다시 시도
                </Button>
              </div>
            )}
            {style?.toneMismatch && <Notice>{style.toneMismatch}</Notice>}
            {style ? (
              <ExpressionChoices requestSample={samples.request} />
            ) : (
              analyzing && (
                <div className="flex flex-col gap-2.5" aria-hidden>
                  <div className="h-[3.875rem] rounded-[0.875rem] bg-subtle" />
                  <div className="h-[3.875rem] rounded-[0.875rem] bg-subtle" />
                  <div className="h-[3.875rem] rounded-[0.875rem] bg-subtle" />
                  <p className="text-15 font-medium text-muted">분위기를 다 읽으면 제안이 여기에 나와요.</p>
                </div>
              )
            )}
          </section>
        </div>
      </div>

      <Footer
        status={
          analyzing ? (
            <Spinner label="로고를 재고 분위기를 읽는 중이에요 · 약 10초" />
          ) : imitationExpression ? (
            "표현 방식에서 폰트 이름을 빼 주세요."
          ) : samplesDrawing > 0 ? (
            <Spinner label={`가게 이름으로 견본을 그리는 중이에요 · ${sampleOptions.length - samplesDrawing}/${sampleOptions.length}`} />
          ) : waitingChosen ? (
            <Spinner label="고른 방향의 견본을 그리는 중이에요" />
          ) : style ? (
            `이 방향으로 AI가 참고 글자 초안 ${REFERENCE_CHARS.length}자를 그려요.`
          ) : undefined
        }
      >
        <ButtonLink href="/">이전</ButtonLink>
        <Button disabled={!style || imitationExpression || waitingChosen} onClick={confirm}>
          초안 그리기
        </Button>
      </Footer>
    </>
  );
}

function Num({ n }: { n: number }) {
  return <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-sm font-bold text-bg">{n}</span>;
}

// 이 탭에서 그리는 중인 견본(작업 회차:표현 방식). 새로 고침하면 비어, 저장된 '그리는 중'을 다시 요청한다.
// 회차를 붙여, 새 작업이 지난 작업의 같은 표현 방식 요청이 끝나기를 기다리지 않게 한다.
const inflight = new Set<string>();

/** 표현 방식 견본: 스타일 카드가 오면 AI 제안 셋을 함께 그린다(이미지 3장). 직접 쓴 방식은 '그려 보기'로 한 장. */
function useStyleSamples() {
  const { state, dispatch } = useApp();
  const { style, upload, styleSamples, run } = state;

  const request = useCallback(
    (expression: string) => {
      const text = expression.trim();
      const key = `${run}:${text}`;
      if (!style || !text || inflight.has(key) || isImitationRequest(text)) return;
      inflight.add(key);
      dispatch({ type: "setSample", expression: text, sample: { status: "drawing" }, run });
      api
        .styleSample({ upload, style, expression: text })
        .then((s) => dispatch({ type: "setSample", expression: text, sample: { status: "ready", sampleId: s.sampleId, imageUrl: s.imageUrl }, run }))
        .catch((err) => dispatch({ type: "setSample", expression: text, sample: { status: "failed", error: errorMessage(err) }, run }))
        .finally(() => inflight.delete(key));
    },
    [style, upload, run, dispatch],
  );

  useEffect(() => {
    for (const option of style?.expressionOptions ?? []) {
      const current = styleSamples[option];
      if (!current || (current.status === "drawing" && !inflight.has(`${run}:${option}`))) request(option);
    }
  }, [style?.expressionOptions, styleSamples, run, request]);

  return { request };
}

/** 견본 그림 칸. 그리는 중 · 못 그림 · 그림. onRetry가 없으면(고르기 단추 안) 칸을 누르면 다시 그린다. */
function SampleBox({ sample, label, onRetry }: { sample: SampleState | undefined; label: string; onRetry?: () => void }) {
  return (
    <span className="relative grid h-[5rem] w-[9.375rem] shrink-0 place-items-center overflow-hidden rounded-[0.625rem] bg-bg shadow-[0_0_0_1px_rgba(17,17,17,.08)] lg:h-[6.75rem] lg:w-[14.375rem]">
      {sample?.status === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 견본
        <img src={sample.imageUrl} alt={`${label} 견본`} className="h-full w-full object-contain p-1.5 motion-safe:animate-[ds-fade_240ms_ease-out]" />
      ) : sample?.status === "failed" ? (
        <span className="flex flex-col items-center gap-1 px-2 text-center text-13 font-semibold text-muted">
          견본을 못 그렸어요
          {onRetry ? (
            <button type="button" onClick={onRetry} className="rounded-full px-2 font-bold text-ink underline hover:bg-stage">
              다시 그리기
            </button>
          ) : (
            <span className="font-bold text-ink underline">눌러서 다시 그리기</span>
          )}
        </span>
      ) : (
        <span className="flex flex-col items-center gap-1.5 text-13 font-semibold text-muted">
          <span aria-hidden className="h-[1.125rem] w-[1.125rem] animate-spin rounded-full border-[3px] border-track border-t-ink" />
          그리는 중
        </span>
      )}
    </span>
  );
}

/** 참고 글자 초안의 표현 방식. 견본을 보고 AI 제안에서 고르거나 직접 쓴다. 사람이 정한 디자인 방향이라 창작 의도로 기록된다. */
function ExpressionChoices({ requestSample }: { requestSample: (expression: string) => void }) {
  const { state, dispatch, record } = useApp();
  const options = state.style?.expressionOptions ?? [];
  const value = state.style?.expression ?? "";
  const committed = useRef(value.trim());
  const [recorded, setRecorded] = useState<string | null>(null);
  const imitation = isImitationRequest(value);
  const typed = value.trim() && !options.includes(value.trim()) ? value : "";
  const typedSample = typed ? state.styleSamples[typed.trim()] : undefined;

  function commit(next: string) {
    const text = next.trim();
    if (!text || text === committed.current || isImitationRequest(text)) return;
    committed.current = text;
    setRecorded(text);
    record("creative_intent", `표현 방식(${options.includes(text) ? "AI 제안에서 고름" : "직접 씀"}): ${text}`);
  }

  return (
    <div role="radiogroup" aria-label="표현 방식" className="flex flex-col gap-2.5">
      {options.map((o) => {
        const selected = value.trim() === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              dispatch({ type: "setExpression", value: o });
              commit(o);
              if (state.styleSamples[o]?.status === "failed") requestSample(o);
            }}
            className={`flex w-full items-center gap-3.5 rounded-[0.875rem] p-2.5 pr-4 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] lg:gap-4 lg:p-3 lg:pr-5 ${
              selected ? "border-2 border-ink bg-subtle" : "border-[1.5px] border-edge bg-bg hover:border-ink hover:bg-subtle"
            }`}
          >
            <span aria-hidden className={`ml-1 grid h-[1.375rem] w-[1.375rem] shrink-0 place-items-center rounded-full border-2 ${selected ? "border-ink" : "border-edge"}`}>
              {selected && <span className="h-[0.6875rem] w-[0.6875rem] rounded-full bg-ink motion-safe:animate-[ds-pop_140ms_ease-out]" />}
            </span>
            <SampleBox sample={state.styleSamples[o]} label={o} />
            <span className="flex min-w-0 flex-col gap-1">
              <span className={`text-base leading-snug lg:text-17 ${selected ? "font-bold" : "font-semibold"}`}>{o}</span>
              {selected && recorded === o && <span className="text-13 font-bold text-good">기록됨</span>}
            </span>
          </button>
        );
      })}
      <div
        className={`flex flex-col gap-2.5 rounded-[0.875rem] px-4 py-3 transition-colors lg:px-5 ${
          typed ? "border-2 border-ink bg-subtle" : "border-[1.5px] border-edge hover:border-ink"
        } focus-within:border-2 focus-within:border-ink`}
      >
        <label className="flex min-h-[2.125rem] items-center gap-3.5 text-17">
          <span className="shrink-0 font-bold">직접 쓰기</span>
          <input
            value={typed}
            maxLength={40}
            onChange={(e) => dispatch({ type: "setExpression", value: e.target.value })}
            onBlur={(e) => commit(e.target.value)}
            placeholder="예: 풍선처럼 부풀린 획"
            aria-label="표현 방식 직접 쓰기"
            className="min-w-0 flex-1 bg-transparent font-medium outline-none placeholder:text-muted focus-visible:shadow-none"
          />
          {typed && recorded === typed.trim() && <span className="shrink-0 text-13 font-bold text-good">기록됨</span>}
          {typed.trim() && !imitation && !typedSample && (
            <Button variant="outline" size="sm" className="h-9 shrink-0 px-3.5 text-sm" onClick={() => requestSample(typed)}>
              견본 그려 보기
            </Button>
          )}
        </label>
        {typedSample && <SampleBox sample={typedSample} label={typed.trim()} onRetry={() => requestSample(typed)} />}
      </div>
      {imitation && <Notice tone="error">특정 폰트는 따라 하지 않아요. 원하는 획 모양을 말로 적어 주세요.</Notice>}
    </div>
  );
}
