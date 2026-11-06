"use client";

// 폰트 하나의 화면(11/2 B안). 서버가 돌리는 단계에 따라 바뀐다:
// 로고 읽기 → 느낌 고르기(Choose, 11/4) → 기준 글자·나머지 글자·폰트 파일(Making) → 스튜디오(Studio). 기준 글자를 그리다 멈춘 뒤 이어서 만들면 기준 글자 확인(Review)도 거친다.
// 다 만들 때까지 1.5초마다 진행을 새로 받는다. 창을 닫았다가 내 폰트에서 다시 열어도 같은 화면이 이어진다.
// 11/2 구글 로그인: 만든 사람만 열린다. 로그인 전이면 로그인 안내, 남의 폰트면 '찾을 수 없어요'.
// 11/6 멈춤 화면(흰 바탕, 피그마 17 '남은 상태 ②' 486:6215 · 486:6292 · 486:6369, 20 '로고 읽기 실패' 482:197 · 482:251):
// 직접 멈춤 / 오류로 멈춤은 같은 틀에 제목·첫 줄만 다르다. 로고 읽기에서 멈췄으면 오른쪽에 받아 둔 것(로고·답)만 보인다. 그만두기 확인 문구는 단계별로.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CheckMark, DisplayTitle, PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import { Choose } from "@/components/fonts/Choose";
import { Making } from "@/components/fonts/Making";
import { GLYPH_TOTAL, GlyphTile, ProgressBar } from "@/components/fonts/MakingMeter";
import { Review } from "@/components/fonts/Review";
import { InlineConfirm } from "@/components/InlineConfirm";
import { isWorking } from "@/components/fonts/shared";
import { Studio } from "@/components/fonts/Studio";
import { SignInPrompt } from "@/components/GoogleSignIn";
import { Notice, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { ATTRIBUTE_PAIRS, LOGO_SOURCES, attributeLabel } from "@/lib/constants";
import { industryText } from "@/lib/rules";
import type { ProjectView } from "@/lib/types";

/** 서버가 직접 멈춤에 적는 문구(lib/server/projects.ts cancelProject)로 직접 멈춤과 오류를 가른다. */
const USER_STOP = "직접 멈췄어요";

/** 그만두기 제자리 확인(482:251). 첫 초점은 '계속 두기', 위험 버튼은 오류색 테두리. */
function QuitConfirm({ early, busy, onKeep, onQuit }: { early: boolean; busy: boolean; onKeep: () => void; onQuit: () => void }) {
  return (
    <InlineConfirm label="그만두기 확인" className="ds-motion flex animate-ds-enter flex-col gap-4 rounded-[1.25rem] border-2 border-border-active bg-bg-canvas p-5 lg:max-w-[30rem]">
      <div className="flex flex-col gap-2">
        <p className="text-17 font-bold">이 폰트를 그만둘까요?</p>
        <p className="text-15 leading-normal text-text-secondary">
          {early ? "올린 로고와 답한 내용이 지워지고 되돌릴 수 없어요." : "그린 글자와 폰트가 모두 지워지고 되돌릴 수 없어요."}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 lg:flex-row">
        <SecondaryButton data-autofocus block disabled={busy} onClick={onKeep} className="lg:flex-1">
          계속 두기
        </SecondaryButton>
        <button
          type="button"
          disabled={busy}
          onClick={onQuit}
          className="inline-flex h-[3.25rem] w-full items-center justify-center rounded-full border-2 border-border-error bg-bg-canvas px-6 text-base font-bold text-text-error transition-[background-color,transform] duration-(--dur-fast) ease-standard hover:bg-bg-error-subtle motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:border-dashed disabled:text-text-disabled lg:flex-1"
        >
          {busy ? "지우는 중" : "지우고 그만두기"}
        </button>
      </div>
    </InlineConfirm>
  );
}

/** 멈춤 화면(흰 바탕). 주 버튼 '이어서 만들기'(로고 읽기 실패는 '다시 만들기'), 글자 링크 '그만두기'. 번호표·스티커는 없다(남은 시간이 사실이 아님). */
export function Stopped({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const router = useRouter();
  const [resuming, setResuming] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const email = session?.user.email;
  const byUser = !!view.error?.startsWith(USER_STOP);
  // 글자 작업이 아직 없으면(drawnCount === null) 로고 읽기·느낌 고르기에서 멈춘 것이다. 예전 서버(키 없음)는 글자 쪽 틀로 본다.
  const early = view.drawnCount === null;
  const drawn = view.drawnCount ?? 0;

  function resume() {
    setResuming(true);
    setError(null);
    api
      .rebuildProject(view.id)
      .then(onChanged)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setResuming(false));
  }
  function quit() {
    setQuitting(true);
    api
      .deleteProject(view.id)
      .then(() => router.push("/fonts"))
      .catch((err) => {
        setError(errorMessage(err));
        setQuitting(false);
      });
  }

  const title: [string, string] = early && !byUser ? ["로고를", "읽지 못했어요"] : byUser ? ["만들기를", "멈췄어요"] : ["만들다가", "멈췄어요"];
  const where = early ? "로고 읽기에서 멈춤" : "멈춤";
  const lead = early
    ? byUser
      ? "로고를 읽는 중에 직접 멈췄어요."
      : (view.error ?? "로고에서 서체 느낌을 정하지 못했어요. 잠시 뒤 다시 만들어 주세요.")
    : byUser
      ? `그린 글자 ${drawn.toLocaleString()}자는 그대로 있어요. 이어서 만들면 멈춘 곳부터 그려요.`
      : `${view.error ?? "서버에서 문제가 생겨 멈췄어요."} 그린 글자 ${drawn.toLocaleString()}자는 그대로 있어요. 이어서 만들면 못 그린 글자만 이어서 그려요.`;
  const note = early
    ? "올린 로고와 답한 내용은 그대로 있어요. 다시 만들기를 누르면 로고를 처음부터 다시 읽어요. 아직 글자를 그리기 전이라 비용이 들지 않아요."
    : byUser
      ? "직접 멈춘 거라 메일은 보내지 않았어요. 내 폰트에서 언제든 이어서 만들 수 있어요."
      : `${view.upload.notifyByEmail === false ? "" : `${email ? `${email}으로도` : "메일로도"} 알려 드렸어요. `}언제든 내 폰트에서 이어서 만들 수 있어요.`;

  return (
    <div className="mx-auto grid w-full max-w-page flex-1 content-start gap-8 px-5 pt-8 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,33.5rem)] lg:gap-12 lg:px-10 lg:pt-20 lg:pb-24">
      <div className="ds-motion flex min-w-0 animate-ds-enter flex-col">
        <span className="text-15 font-bold text-text-secondary">
          {view.storeName} · {where}
        </span>
        <DisplayTitle className="mt-3 text-[2.5rem] lg:mt-4 lg:text-[4rem]">
          {title[0]}
          <br />
          {title[1]}
        </DisplayTitle>
        <p className="mt-3 text-15 leading-normal font-medium lg:mt-6 lg:max-w-[33rem] lg:text-[1.125rem]">{lead}</p>
        <p className="mt-2 text-13 leading-normal text-text-secondary lg:mt-4 lg:max-w-[33rem]">{note}</p>
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <div className="mt-7 flex flex-col gap-1 lg:mt-12 lg:flex-row lg:items-center lg:gap-6">
          <PrimaryButton block className="lg:w-auto" disabled={resuming || quitting} onClick={resume}>
            {resuming ? "다시 시작하는 중" : early ? "다시 만들기" : "이어서 만들기"}
          </PrimaryButton>
          {!confirmQuit && (
            <TextButton className="self-start" disabled={resuming || quitting} onClick={() => setConfirmQuit(true)}>
              그만두기
            </TextButton>
          )}
        </div>
        {confirmQuit && (
          <div className="mt-5 flex flex-col gap-3">
            <QuitConfirm early={early} busy={quitting} onKeep={() => setConfirmQuit(false)} onQuit={quit} />
            <p className="text-13 text-text-secondary">창을 닫아도 이 상태 그대로 내 폰트에 남아 있어요.</p>
          </div>
        )}
      </div>
      {early ? <Received view={view} /> : <StoppedAt view={view} drawn={drawn} />}
    </div>
  );
}

/** 오른쪽 '멈춘 곳': 그린 개수 · 막대 · 마지막으로 그린 글자(보기 전용 회색 칸) */
function StoppedAt({ view, drawn }: { view: ProjectView; drawn: number }) {
  const last = view.recent.slice(0, 21);
  return (
    <aside aria-label="멈춘 곳" className="flex flex-col gap-4 self-start rounded-[1.25rem] border-[1.5px] border-border-default bg-bg-canvas p-5 lg:p-7">
      <span className="text-13 font-bold text-text-secondary">멈춘 곳</span>
      <div className="flex flex-col gap-2">
        <span className="text-17 font-bold tabular-nums">
          글자 {drawn.toLocaleString()} / {GLYPH_TOTAL.toLocaleString()}자
        </span>
        <ProgressBar value={drawn} max={GLYPH_TOTAL} label="그린 글자" valueText={`${GLYPH_TOTAL.toLocaleString()}자 가운데 ${drawn.toLocaleString()}자`} />
        <span className="text-13 font-medium text-text-secondary">한글 2,350 + 숫자·문장부호·영문 대소문자 82</span>
      </div>
      <div className="flex flex-col gap-3 border-t border-border-default pt-4">
        <span className="text-13 font-bold text-text-secondary">마지막으로 그린 글자</span>
        {last.length ? (
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-7 lg:gap-2.5">
            {last.map((g, i) => (
              <GlyphTile key={g.char} char={g.char} src={g.imageUrl} className={i >= 18 ? "max-lg:hidden" : ""} />
            ))}
          </div>
        ) : (
          <span className="text-15 text-text-secondary">아직 그린 글자가 없어요.</span>
        )}
      </div>
    </aside>
  );
}

/** 로고 읽기에서 멈춤: 받아 둔 것(로고 · 답 여섯 가지)이 그대로라는 사실만(482:197) */
function Received({ view }: { view: ProjectView }) {
  const u = view.upload;
  const attrs = u.attributes
    ? ATTRIBUTE_PAIRS.map((p) => attributeLabel(p.key, u.attributes![p.key]))
        .filter(Boolean)
        .join(" · ")
    : "";
  const rows = [
    { label: "로고", value: u.logoFileName ?? "올린 로고" },
    { label: "가게 이름", value: u.storeName },
    { label: "업종", value: industryText(u) },
    { label: "가게 이야기", value: u.desiredFeel.trim() ? `${[...u.desiredFeel.trim()].length.toLocaleString()}자` : "" },
    { label: "글씨 취향", value: attrs },
    { label: "로고 권리", value: LOGO_SOURCES.find((s) => s.value === u.logoSource)?.label ?? "" },
  ].filter((r) => r.value);
  return (
    <aside aria-label="받아 둔 것" className="flex flex-col self-start rounded-[1.25rem] border-[1.5px] border-border-default bg-bg-canvas p-5 max-lg:hidden lg:p-8">
      <span className="text-13 font-bold text-text-secondary">받아 둔 것</span>
      <div className="relative mt-4 h-[9.5rem] rounded-[1.25rem] bg-bg-surface-strong">
        {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 로고 */}
        <img src={view.logoUrl} alt={`${view.storeName} 로고`} className="absolute inset-0 m-auto h-[78%] w-[70%] object-contain" />
      </div>
      <dl className="mt-5 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[6.25rem_minmax(0,1fr)_auto] items-center gap-x-3 text-13">
            <dt className="text-text-secondary">{r.label}</dt>
            <dd className="min-w-0 truncate font-bold">{r.value}</dd>
            <CheckMark className="h-3.5 w-3.5" />
          </div>
        ))}
      </dl>
      <p className="mt-5 border-t border-border-default pt-4 text-13 leading-normal text-text-secondary">
        로고가 흐리거나 글자가 아주 작으면 읽기 어려울 수 있어요. 다시 만들어도 같은 일이 생기면 로고를 다시 올려 새로 시작해 주세요.
      </p>
    </aside>
  );
}

export function FontView() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<ProjectView | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean; signedOut?: boolean } | null>(null);

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
  // 11/4 성능 점검: 서버가 일하는 동안과, 일하는 장(견본·다시 그리는 글자)이 남은 동안만 1.5초마다 받는다.
  // 사용자의 결정을 기다리는 동안은 받지 않는다(누르면 그 동작이 화면을 새로 받는다). 이전에는 기다리는 동안에도 계속 불러 서버가 매번 일을 다시 돌려 봤다.
  const polling =
    !!view &&
    (isWorking(view.phase) ||
      (view.phase === "choosing" && !!view.choose?.directions.some((d) => d.status === "drawing")) ||
      (view.phase === "reviewing" && !!view.review?.items.some((i) => i.status === "drawing" || i.status === "redrawing")));
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [polling, load]);

  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-col gap-4 px-5 py-10 lg:px-10">
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
  if (view.phase !== "failed") return <Making view={view} onChanged={load} />;
  return <Stopped view={view} onChanged={load} />;
}
