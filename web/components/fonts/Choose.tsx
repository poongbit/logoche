"use client";

// 느낌 고르기(11/4). 로고를 읽은 뒤 AI가 낸 서체 방향 3개를, 가게 이름을 그 방향으로 그린 견본 그림으로 보여 주고 하나를 고르게 한다.
// 사용자 결정(11/4): 저절로 고르지 않는다. 고를 때까지 서버가 기다리고, 창을 닫았으면 견본이 그려졌을 때 메일로 알린다.
// 견본은 느낌 시안일 뿐이라 최종 폰트가 똑같다고 약속하지 않는다.

import { useState } from "react";
import Link from "next/link";
import { StickyBar } from "@/components/fonts/shared";
import { Steps } from "@/components/fonts/Making";
import { Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { ChooseDirection, ProjectView } from "@/lib/types";

function Card({ d, index, busy, onPick }: { d: ChooseDirection; index: number; busy: boolean; onPick: (index: number) => void }) {
  return (
    <li className={`flex min-w-0 flex-col gap-3 rounded-[1.25rem] border-[1.5px] bg-bg p-4 ${d.recommended ? "border-ink" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className="text-17 font-extrabold">{d.familyLabel}</span>
        {d.recommended && <span className="rounded-full bg-ink px-2 py-0.5 text-12 font-extrabold text-bg">AI 추천</span>}
      </div>
      <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-stage">
        {d.status === "ready" && d.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 견본 그림
          <img src={d.imageUrl} alt={`${d.familyLabel} 느낌으로 그린 가게 이름 견본`} className="h-full w-full object-contain mix-blend-multiply" />
        ) : d.status === "drawing" ? (
          <span role="status" className="flex flex-col items-center gap-2 text-15 font-bold text-muted">
            <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-[3px] border-track border-t-ink" />
            그리는 중
          </span>
        ) : (
          <span className="px-4 text-center text-15 font-medium text-muted">견본을 그리지 못했어요. 이 느낌으로 만들 수는 있어요.</span>
        )}
      </div>
      <p className="text-15 font-bold">{d.expression}</p>
      {d.summary && <p className="line-clamp-3 text-14 leading-normal text-muted">{d.summary}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick(index)}
        className={`mt-auto h-12 rounded-full px-5 text-15 font-bold transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:bg-subtle disabled:text-muted ${
          d.recommended ? "bg-ink text-bg hover:bg-hover" : "border-[1.5px] border-edge bg-bg hover:border-ink hover:bg-subtle"
        }`}
      >
        이 느낌으로 만들기
      </button>
    </li>
  );
}

export function Choose({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const choose = view.choose;
  const directions = choose?.directions ?? [];
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settled = directions.length > 0 && directions.every((d) => d.status !== "drawing");

  async function pick(index: number) {
    setSending(true);
    setError(null);
    try {
      await api.chooseProject(view.id, { action: "pick", index });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const status = settled ? "마음에 드는 느낌을 골라 주세요. 고를 때까지 기다려요." : "가게 이름을 세 가지 느낌으로 그리고 있어요";

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-7 px-5 pt-8 lg:px-10 lg:pt-10">
      <Steps current={1} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">{view.name}</span>
        <h1 className="text-26 font-extrabold lg:text-32">{choose?.again ? "다른 느낌으로 골라 볼까요?" : "어떤 느낌의 글씨로 만들까요?"}</h1>
        <p className="text-17 leading-normal font-medium text-muted">
          {choose?.again
            ? "그렸던 30자는 지웠어요. 다른 느낌을 고르면 그 느낌으로 30자를 다시 그려 보여 드려요."
            : `가게 이름을 ${directions.length || 3}가지 느낌으로 그려 봤어요. 하나를 고르면 그 느낌으로 먼저 30자를 그려 보여 드려요. 견본과 최종 글자는 조금 다를 수 있어요.`}
        </p>
      </div>

      <ul aria-label="서체 느낌" className="grid gap-4 md:grid-cols-3">
        {directions.map((d, i) => (
          <Card key={`${d.family}-${i}`} d={d} index={i} busy={sending} onPick={(index) => void pick(index)} />
        ))}
      </ul>

      {error && <Notice tone="error">{error}</Notice>}

      <StickyBar className="flex flex-col gap-1">
        <span aria-live="polite" className="text-15 font-bold">
          {status}
        </span>
        <span className="text-13 text-muted">
          창을 닫아도 돼요. 견본이 그려지면 메일로 알려 드려요.{" "}
          <Link href="/fonts" className="inline-flex min-h-11 items-center font-bold underline underline-offset-4">
            나중에 고르기
          </Link>
        </span>
      </StickyBar>
    </div>
  );
}
