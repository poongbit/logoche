"use client";

// 내 폰트 목록(11/2 B안, YoFont 목록 배치를 따름): 찾기 · 상태 필터 · 정렬, 카드마다 미리보기(8자까지 바꿔 쓰기) · 즐겨찾기 · 상태 · 받기.
// 만드는 중인 폰트가 있으면 3초마다 진행을 새로 받는다.
// 11/2 메인 화면을 만들며 주소를 /에서 /fonts로 옮겼다. 만든 폰트가 없으면 만들기로 보내던 것을 빈 목록 안내로 바꿨다(메인에서 들어오는 곳이 됐다).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@/components/AppHeader";
import { DownloadMenu, HeartButton, StatusPill, formatDate, isRunning, remainingLabel } from "@/components/fonts/shared";
import { SignInPrompt } from "@/components/GoogleSignIn";
import { Notice, Spinner } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useGeneratedFont } from "@/lib/font";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import type { ProjectSummary } from "@/lib/types";

type Filter = "all" | "done" | "making" | "failed" | "fav";
const FILTERS: { key: Filter; label: string; test: (f: ProjectSummary) => boolean }[] = [
  { key: "all", label: "모든 상태", test: () => true },
  { key: "done", label: "완성", test: (f) => f.phase === "done" },
  { key: "making", label: "만드는 중", test: (f) => isRunning(f.phase) },
  { key: "failed", label: "멈춤", test: (f) => f.phase === "failed" },
  { key: "fav", label: "즐겨찾기", test: (f) => f.favorite },
];
type Sort = "new" | "old" | "name";

export function FontList() {
  const [fonts, setFonts] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("new");

  const load = useCallback(() => {
    api
      .listProjects()
      .then((list) => {
        setFonts(list);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return setSignedOut(true);
        setError(errorMessage(err));
      });
  }, []);

  useEffect(load, [load]);
  const running = !!fonts?.some((f) => isRunning(f.phase));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running, load]);

  const shown = useMemo(() => {
    if (!fonts) return [];
    const q = query.trim();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    const list = fonts.filter((f) => test(f) && (!q || `${f.name} ${f.storeName} ${f.desiredFeel}`.includes(q)));
    if (sort === "old") list.reverse();
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return list;
  }, [fonts, filter, query, sort]);

  function patch(id: string, change: Partial<ProjectSummary>) {
    setFonts((list) => list?.map((f) => (f.id === id ? { ...f, ...change } : f)) ?? null);
  }

  if (signedOut) {
    return (
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-5 pt-8 pb-16 lg:px-10 lg:pt-10">
        <h1 className="text-28 font-extrabold lg:text-32">내 폰트</h1>
        <SignInPrompt title="로그인하면 내 폰트가 보여요" body="만든 폰트는 구글 계정에 저장돼서 나만 볼 수 있어요." callbackURL="/fonts" />
      </div>
    );
  }

  if (!fonts) {
    return (
      <div className="mx-auto w-full max-w-[90rem] px-5 py-10 lg:px-10">
        {error ? <Notice tone="error">내 폰트를 불러오지 못했어요: {error}</Notice> : <Spinner label="불러오는 중" />}
      </div>
    );
  }

  if (fonts.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-5 pt-8 pb-16 lg:px-10 lg:pt-10">
        <h1 className="text-28 font-extrabold lg:text-32">내 폰트</h1>
        <div className="flex flex-col items-center gap-4 rounded-[1.25rem] border-[1.5px] border-dashed border-edge bg-bg px-6 py-14 text-center">
          <p className="text-17 font-bold">아직 만든 폰트가 없어요</p>
          <p className="text-15 text-muted">로고 한 장으로 첫 폰트를 만들어 보세요.</p>
          <Link href="/#make" className="inline-flex h-12 items-center gap-1.5 rounded-full bg-ink px-6 text-15 font-bold text-bg transition-colors hover:bg-hover">
            <PlusIcon />새 폰트 만들기
          </Link>
        </div>
      </div>
    );
  }

  const done = fonts.filter((f) => f.phase === "done").length;
  return (
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-5 pt-8 pb-16 lg:px-10 lg:pt-10">
      <h1 className="text-28 font-extrabold lg:text-32">내 폰트</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block min-w-0 flex-[1_1_18rem] lg:max-w-[26rem]">
          <span className="sr-only">폰트 찾기</span>
          <svg aria-hidden viewBox="0 0 20 20" className="absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-muted">
            <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M13.2 13.2L17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="폰트 이름 · 가게 이름 · 느낌"
            className="h-11 w-full rounded-full border-[1.5px] border-edge bg-bg pr-5 pl-11 text-15 font-medium outline-none placeholder:text-muted hover:border-ink focus:border-2 focus:border-ink"
          />
        </label>
        <div role="group" aria-label="상태" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.key)}
                className={`flex h-10 items-center gap-1.5 rounded-full text-15 transition-colors ${
                  on ? "border-2 border-ink pr-4 pl-3 font-bold" : "border-[1.5px] border-edge px-4 font-semibold hover:border-ink hover:bg-subtle"
                }`}
              >
                {on && (
                  <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {f.label} <span className="text-muted">{fonts.filter(f.test).length}</span>
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-15 font-bold text-muted lg:ml-auto">
          정렬
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-10 rounded-full border-[1.5px] border-edge bg-bg px-3.5 text-15 font-semibold text-ink hover:border-ink"
          >
            <option value="new">최신순</option>
            <option value="old">오래된순</option>
            <option value="name">이름순</option>
          </select>
        </label>
      </div>

      <p className="text-15 text-muted">
        {shown.length}개 · 완성 {done}개
      </p>
      {error && <Notice tone="warn">진행 상황을 새로 받지 못했어요: {error}</Notice>}

      {shown.length === 0 ? (
        <div className="rounded-[1.25rem] border-[1.5px] border-dashed border-edge px-6 py-12 text-center text-15 text-muted">찾는 폰트가 없어요.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-5">
          {shown.map((f) => (
            <FontCard key={f.id} font={f} onPatch={(change) => patch(f.id, change)} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function FontCard({ font, onPatch, onChanged }: { font: ProjectSummary; onPatch: (c: Partial<ProjectSummary>) => void; onChanged: () => void }) {
  const [preview, setPreview] = useState(font.storeName.slice(0, 8));
  const [busy, setBusy] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const { fontFamily } = useGeneratedFont(font.fontId);
  const href = `/fonts/${font.id}`;

  function toggleFavorite() {
    onPatch({ favorite: !font.favorite });
    api.updateProject(font.id, { favorite: !font.favorite }).catch(() => onPatch({ favorite: font.favorite }));
  }

  function resume() {
    setBusy(true);
    setResumeError(null);
    api
      .rebuildProject(font.id)
      .then(onChanged)
      .catch((err) => setResumeError(`다시 시작하지 못했어요: ${errorMessage(err)}`))
      .finally(() => setBusy(false));
  }

  const meta =
    font.phase === "done"
      ? [`GPT Image`, `한글 ${font.glyphCount?.toLocaleString()}자`, font.extraCount ? `숫자·부호 ${font.extraCount}자` : "", formatDate(font.createdAt)]
      : [formatDate(font.createdAt)];

  return (
    <article className="flex flex-col rounded-[1.25rem] border border-line bg-bg">
      <div className="relative flex h-[10.5rem] items-center justify-center rounded-t-[1.25rem] bg-stage px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 로고(서버가 그대로 돌려줌) */}
        <img src={font.logoUrl} alt={`${font.storeName} 로고`} className="absolute top-3 left-3 h-[1.875rem] w-[3.75rem] rounded-md bg-bg object-contain" />
        {font.phase === "done" ? (
          <input
            type="text"
            maxLength={8}
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            aria-label={`${font.name} 미리보기 글 (8자까지)`}
            className="w-full rounded-lg bg-transparent text-center text-[2.75rem] leading-[1.3] outline-none hover:bg-white/45 focus:bg-bg focus:shadow-[0_0_0_2px_var(--ink)]"
            style={{ fontFamily: fontFamily ?? GLYPH_FONT_STACK }}
          />
        ) : (
          <Link href={href} className="text-[2.75rem] leading-[1.3] text-muted" style={{ fontFamily: GLYPH_FONT_STACK }}>
            {font.storeName.slice(0, 8)}
          </Link>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-5 pt-4 pb-5">
        <div className="flex items-center gap-1">
          <h2 className="min-w-0 truncate text-18 font-extrabold">
            <Link href={href} className="hover:underline">
              {font.name}
            </Link>
          </h2>
          <HeartButton label={font.name} on={font.favorite} onToggle={toggleFavorite} />
          <span className="ml-auto">
            <StatusPill phase={font.phase} />
          </span>
        </div>
        {font.desiredFeel && <p className="truncate text-15">{font.desiredFeel}</p>}
        <p className="text-13 text-muted">{meta.filter(Boolean).join(" · ")}</p>
        {font.progress && isRunning(font.phase) && (
          <div className="mt-1.5 flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="그린 글자"
              aria-valuemin={0}
              aria-valuemax={font.progress.total}
              aria-valuenow={font.progress.done}
              className="h-1 flex-1 overflow-hidden rounded-sm bg-track"
            >
              <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${(font.progress.done / Math.max(1, font.progress.total)) * 100}%` }} />
            </div>
            <span className="text-13 font-bold">
              {font.progress.done.toLocaleString()} / {font.progress.total.toLocaleString()}자
            </span>
          </div>
        )}
        {isRunning(font.phase) && font.remainingSeconds !== null && <p className="text-13 text-muted">{remainingLabel(font.remainingSeconds)}</p>}
        {font.phase === "failed" && font.error && <p className="line-clamp-2 text-13 text-muted">{font.error}</p>}
        {resumeError && (
          <p role="alert" className="text-13 font-semibold text-bad">
            {resumeError}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-3.5">
          {font.phase === "done" && font.fontId ? (
            <>
              <Link href={href} className="inline-flex h-10 items-center rounded-full border-[1.5px] border-edge px-4 text-15 font-bold hover:border-ink hover:bg-subtle">
                스튜디오
              </Link>
              <DownloadMenu fontId={font.fontId} fontName={font.name} loadRecord={async () => (await api.getProject(font.id)).record} />
            </>
          ) : font.phase === "failed" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={resume}
                className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-15 font-bold text-bg hover:bg-hover disabled:bg-line disabled:text-muted"
              >
                {busy ? "다시 시작하는 중" : "이어서 만들기"}
              </button>
              <Link href={href} className="inline-flex h-10 items-center rounded-full px-3 text-15 font-bold underline underline-offset-4 hover:bg-stage">
                자세히
              </Link>
            </>
          ) : (
            <Link
              href={href}
              className={`inline-flex h-10 items-center rounded-full px-4 text-15 font-bold ${
                font.phase === "reviewing" ? "bg-ink text-bg hover:bg-hover" : "border-[1.5px] border-edge hover:border-ink hover:bg-subtle"
              }`}
            >
              {font.phase === "reviewing" ? "참고 글자 확인하기" : "진행 보기"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
