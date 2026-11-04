"use client";

// 폰트 하나의 화면(11/2 B안). 서버가 돌리는 단계에 따라 바뀐다:
// 로고 읽기 → 느낌 고르기(Choose, 11/4) → 참고 글자·나머지 글자·폰트 파일(Making) → 스튜디오(Studio). 11/4 이전 작업은 참고 글자 확인(Review)도 거친다. 멈추면 이어서 만들기.
// 다 만들 때까지 1.5초마다 진행을 새로 받는다. 창을 닫았다가 내 폰트에서 다시 열어도 같은 화면이 이어진다.
// 11/2 구글 로그인: 만든 사람만 열린다. 로그인 전이면 로그인 안내, 남의 폰트면 '찾을 수 없어요'.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Choose } from "@/components/fonts/Choose";
import { Making, Steps } from "@/components/fonts/Making";
import { Review } from "@/components/fonts/Review";
import { isRunning } from "@/components/fonts/shared";
import { Studio } from "@/components/fonts/Studio";
import { SignInPrompt } from "@/components/GoogleSignIn";
import { Notice, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { ProjectView } from "@/lib/types";

export function FontView() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean; signedOut?: boolean } | null>(null);
  const [resuming, setResuming] = useState(false);

  const load = useCallback(() => {
    api
      .getProject(id)
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((err) =>
        setError({ message: errorMessage(err), notFound: err instanceof ApiError && err.status === 404, signedOut: err instanceof ApiError && err.status === 401 }),
      );
  }, [id]);

  useEffect(load, [load]);
  const running = view ? isRunning(view.phase) : false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [running, load]);

  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-4 px-5 py-10 lg:px-10">
        {error?.signedOut ? (
          <SignInPrompt title="로그인하면 이 폰트를 볼 수 있어요" body="폰트는 만든 사람의 구글 계정에서만 열려요." callbackURL={`/fonts/${id}`} />
        ) : error ? (
          <>
            <Notice tone="error">{error.notFound ? "폰트를 찾을 수 없어요. 지웠거나 주소가 틀렸어요." : `불러오지 못했어요: ${error.message}`}</Notice>
            <Link href="/fonts" className="self-start font-bold underline underline-offset-4">
              내 폰트로 가기
            </Link>
          </>
        ) : (
          <Spinner label="불러오는 중" />
        )}
      </div>
    );
  }

  if (view.phase === "choosing") return <Choose view={view} onChanged={load} />;
  if (view.phase === "reviewing") return <Review view={view} onChanged={load} />;
  if (view.phase === "done") return <Studio key={view.fontId} view={view} onChanged={load} />;
  if (view.phase !== "failed") return <Making view={view} />;

  return (
    <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-5 pt-8 pb-16 lg:px-10 lg:pt-10">
      <Steps current={view.build ? 4 : 2} />
      <div className="flex flex-col gap-2">
        <span className="text-15 font-bold text-muted">{view.name}</span>
        <h1 className="text-26 font-extrabold lg:text-32">만들다가 멈췄어요</h1>
        <p className="text-17 leading-normal font-medium text-muted">{view.error ?? "이유를 알 수 없어요."}</p>
      </div>
      {error && <Notice tone="error">{error.message}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={resuming}
          onClick={() => {
            setResuming(true);
            api
              .rebuildProject(view.id)
              .then(load)
              .catch((err) => setError({ message: errorMessage(err), notFound: false }))
              .finally(() => setResuming(false));
          }}
          className="h-12 rounded-full bg-ink px-6 text-15 font-bold text-bg hover:bg-hover disabled:bg-line disabled:text-muted"
        >
          {resuming ? "다시 시작하는 중" : "이어서 만들기"}
        </button>
        <Link href="/fonts" className="inline-flex h-12 items-center rounded-full border-[1.5px] border-edge px-6 text-15 font-bold hover:border-ink">
          내 폰트로 가기
        </Link>
      </div>
      <p className="text-15 text-muted">이미 그린 글자는 그대로 쓰고, 못 그린 글자만 이어서 그려요.</p>
    </div>
  );
}
