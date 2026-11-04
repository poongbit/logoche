"use client";

// 만드는 중 화면(11/2 B안, YoFont 로딩 화면을 따름): 단계 표시 · 그린 글자가 하나씩 채워지는 판 · 창을 닫아도 된다는 안내.
// 로고 읽기 → 참고 글자 30자 → (확인은 Review.tsx) → 나머지 글자·숫자 → 폰트 파일·검사.

import { useState } from "react";
import Link from "next/link";
import { remainingLabel } from "@/components/fonts/shared";
import { CheckIcon, Notice, StepMark } from "@/components/ui";
import { InlineConfirm } from "@/components/InlineConfirm";
import { api, errorMessage } from "@/lib/api";
import { BUILD_STAGES } from "@/lib/constants";
import type { ProjectView } from "@/lib/types";

const STEPS = ["로고 읽기", "느낌 고르기", "30자 확인", "나머지 글자", "폰트 파일·검사"];

export function stepOf(view: ProjectView): number {
  if (view.phase === "analyzing") return 0;
  if (view.phase === "choosing") return 1;
  if (view.phase === "drawing" || view.phase === "reviewing") return 2;
  const draw = view.build?.stages.find((s) => s.key === "draw");
  return draw && draw.status !== "done" ? 3 : 4;
}

export function Steps({ current }: { current: number }) {
  return (
    <ol aria-label="만드는 단계" className="flex flex-wrap items-center gap-2 text-13 font-bold">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          {i === current ? (
            <span aria-current="step" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink pr-3.5 pl-1.5 text-bg">
              <span aria-hidden className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full border-2 border-bg text-12">
                {i + 1}
              </span>
              {label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-muted">
              {i < current ? (
                <span aria-hidden className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full bg-stage text-ink">
                  <CheckIcon />
                </span>
              ) : (
                <span aria-hidden className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-full border-2 border-edge text-12">
                  {i + 1}
                </span>
              )}
              {label}
            </span>
          )}
          {i < STEPS.length - 1 && <span aria-hidden className={`h-0.5 w-6 ${i < current ? "bg-ink" : "bg-track"}`} />}
        </li>
      ))}
    </ol>
  );
}

/** 만드는 중인 일을 멈춘다(11/4). 그린 글자는 남는다. 이미 완성한 폰트가 있으면 그 폰트로 돌아간다. */
function StopBox({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function stop() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelProject(view.id);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="self-start text-15 font-bold text-muted underline underline-offset-4 hover:text-ink">
        중단하기
      </button>
    );
  }
  return (
    <InlineConfirm label="중단 확인" className="flex flex-col gap-2 rounded-2xl bg-subtle p-4 text-15 leading-normal">
      <span className="font-bold">지금 멈출까요?</span>
      <span className="text-muted">
        지금까지 그린 글자는 남아 있어요. {view.rebuilding ? "이미 만든 폰트는 그대로 쓸 수 있어요." : "나중에 이어서 만들거나 그만둘 수 있어요."} 지금 그리는 중인 글자표는 끝까지 그려질 수 있어요.
      </span>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void stop()} className="h-10 rounded-full bg-ink px-4 font-bold text-bg hover:bg-hover disabled:bg-line disabled:text-muted">
          {busy ? "멈추는 중" : "멈추기"}
        </button>
        <button type="button" data-autofocus disabled={busy} onClick={() => setAsking(false)} className="h-10 rounded-full border-[1.5px] border-edge px-4 font-bold hover:border-ink">
          계속 만들기
        </button>
      </div>
    </InlineConfirm>
  );
}

export function Making({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const step = stepOf(view);
  const draw = view.build?.stages.find((s) => s.key === "draw");
  const engineStages = view.build?.stages.filter((s) => s.key !== "draw") ?? [];
  const refs = view.review?.items ?? [];

  const title =
    view.phase === "analyzing"
      ? "로고를 읽고 있어요"
      : view.phase === "drawing"
        ? "참고 글자 30자를 그리고 있어요"
        : step === 3
          ? view.rebuilding
            ? "빠진 글자를 그리고 있어요"
            : "나머지 글자를 그리고 있어요"
          : "폰트 파일을 만들고 검사하는 중이에요";
  const subtitle =
    view.phase === "analyzing"
      ? "로고와 가게 이야기를 읽어 서체 방향 세 가지를 정해요. 곧 가게 이름 견본을 그려 보여 드려요."
      : view.phase === "drawing"
        ? "고른 느낌으로 먼저 30자를 그려요. 다 그리면 결과를 보여 드려요. 나머지 글자를 그릴지는 그때 정해요."
        : step === 3
          ? view.rebuilding
            ? "이미 만든 폰트는 그대로예요. 빠진 글자만 같은 글씨로 그려서 폰트를 다시 만들어요. 중단하면 지금 폰트로 돌아가요."
            : "참고 글자와 같은 글씨로 30자씩 그리고 검사해요. 숫자와 문장부호도 그려요."
          : "외곽선을 따서 폰트 파일로 묶고, 상업용 검사와 AI 판독을 해요.";

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-7 px-5 pt-8 pb-16 lg:px-10 lg:pt-10">
      <Steps current={step} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">{view.name}</span>
        <h1 className="text-26 font-extrabold lg:text-32" aria-live="polite">
          {title}
        </h1>
        <p className="text-17 leading-normal font-medium text-muted">{subtitle}</p>
      </div>

      {view.phase === "building" && draw && (
        <div className="flex flex-wrap items-center gap-4">
          <div
            role="progressbar"
            aria-label="그린 글자"
            aria-valuemin={0}
            aria-valuemax={draw.total}
            aria-valuenow={draw.done}
            className="h-1.5 max-w-[32rem] min-w-[12rem] flex-1 overflow-hidden rounded-full bg-track"
          >
            <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${(draw.done / Math.max(1, draw.total)) * 100}%` }} />
          </div>
          <span className="text-15 font-extrabold">
            {draw.done.toLocaleString()} / {draw.total.toLocaleString()}자
          </span>
          <span className="text-15 text-muted">{remainingLabel(view.remainingSeconds)}</span>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section aria-label="그린 글자" className="flex min-w-0 flex-1 flex-col gap-4">
          {view.phase === "analyzing" && (
            <div className="grid h-56 place-items-center rounded-[1.25rem] bg-stage">
              {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 로고 */}
              <img src={view.logoUrl} alt={`${view.storeName} 로고`} className="max-h-36 max-w-[70%] object-contain motion-safe:animate-pulse" />
            </div>
          )}
          {view.phase === "drawing" && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
              {(refs.length ? refs : Array.from({ length: 30 }, () => null)).map((item, i) =>
                item?.status === "ready" && item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 글자 그림
                  <img key={i} src={item.imageUrl} loading="lazy" decoding="async" alt={item.char} className="aspect-square w-full rounded-xl border border-line bg-bg object-contain p-2 motion-safe:animate-[ds-pop_260ms_ease-out]" />
                ) : (
                  <span key={i} aria-hidden className="aspect-square rounded-xl border-[1.5px] border-dashed border-track bg-subtle" />
                ),
              )}
            </div>
          )}
          {view.phase === "building" && step === 3 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
              {view.recent.map((g) => (
                // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 글자 그림
                <img key={g.char} src={g.imageUrl} loading="lazy" decoding="async" alt={g.char} className="aspect-square w-full rounded-[0.625rem] border border-line bg-bg object-contain motion-safe:animate-[ds-pop_260ms_ease-out]" />
              ))}
              {Array.from({ length: Math.max(0, 40 - view.recent.length) }, (_, i) => (
                <span key={`wait-${i}`} aria-hidden className="aspect-square rounded-[0.625rem] border-[1.5px] border-dashed border-track bg-subtle" />
              ))}
            </div>
          )}
          {view.phase === "building" && step === 4 && (
            <ol className="flex flex-col rounded-[1.25rem] border border-line bg-bg">
              {engineStages.map((s) => (
                <li key={s.key} className="flex items-center gap-3 border-b border-line px-5 py-3.5 text-15 last:border-b-0">
                  <StepMark status={s.status === "active" ? "active" : s.status === "done" ? "done" : s.status === "failed" ? "failed" : "pending"} />
                  <span className="font-bold">{BUILD_STAGES.find((b) => b.key === s.key)?.label}</span>
                  {s.total > 1 && (
                    <span className="ml-auto text-muted">
                      {s.done.toLocaleString()} / {s.total.toLocaleString()}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-bg p-6 text-15 leading-normal lg:w-[20rem] lg:shrink-0">
          <span className="font-extrabold">창을 닫아도 돼요</span>
          <span className="text-muted">서버에서 계속 만들어요. 내 폰트에서 이어서 볼 수 있어요.</span>
          <Link href="/fonts" className="mt-1 inline-flex h-10 items-center self-start rounded-full border-[1.5px] border-edge bg-bg px-4 font-bold hover:border-ink">
            내 폰트로 가기
          </Link>
          <StopBox view={view} onChanged={onChanged} />
        </aside>
      </div>
    </div>
  );
}
