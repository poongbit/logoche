"use client";

// 화면 3 AI 초안(Claude Design 'Logoche Final' 3e·3f를 참고 글자 30자에 맞춤). AI가 참고 글자를 그리면 초안을 보고 폰트를 만든다.
// 10/30 결정: MX-Font를 뺐다. 참고 글자는 그대로 폰트에 들어가고, 다음 화면에서 AI가 이 글자표를 보며 나머지 글자를 그린 뒤
// 만든 폰트를 보며 다듬는다.
// 10/29 사용자 제안: 글자 카드를 누르면 다시 그리기(글자당 3번) · 직접 고치기(그림판처럼) · 되돌리기.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GlyphEditor, type EditorSource } from "@/components/GlyphEditor";
import { GlyphImage } from "@/components/Glyphs";
import { RequireStep } from "@/components/RequireStep";
import { Button, ButtonLink, Footer, Notice, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { MIN_REFERENCE_READY, REFERENCE_CHARS } from "@/lib/constants";
import { draftInputOf, isGlyphsDone, useApp } from "@/lib/store";
import type { GlyphItem } from "@/lib/types";

const POLL_MS = 800;

export default function DraftPage() {
  const { state } = useApp();
  return (
    <RequireStep ready={!!state.style && state.maxStep >= 2} message="화면 2에서 표현 방식을 먼저 정해 주세요." href="/style">
      <DraftScreen />
    </RequireStep>
  );
}

function DraftScreen() {
  const { state, dispatch, record } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pollRound, setPollRound] = useState(0); // 실패한 글자를 다시 그리면 진행 상황 받기를 다시 시작한다
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null); // 다시 그리기 요청이 서버에 닿지 못했을 때
  const [confirmRedraw, setConfirmRedraw] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null); // 메뉴를 연 글자 카드
  const [editing, setEditing] = useState<GlyphItem | null>(null); // 직접 고치는 글자
  const started = useRef(false);
  const recordedJob = useRef<string | null>(null);

  const { glyphJobId, glyphItems } = state;
  const draftInput = draftInputOf(state);
  const draftChanged = !!glyphJobId && state.draftInput !== null && state.draftInput !== draftInput;
  const settled = glyphItems.length > 0 && glyphItems.every((i) => i.status === "ready" || i.status === "failed");
  const done = isGlyphsDone(state);

  // 작업 시작
  useEffect(() => {
    // 결과가 오면 표시를 푼다. Cache Components는 화면을 떠나도 이 컴포넌트를 숨겨 둘 뿐이라(ref가 남는다), 다른 화면에서
    // 작업을 지우고 돌아왔을 때(화면 4 '이 방향으로 다시 그리기' 등) 다시 시작해야 한다. 표시는 요청이 가는 동안 두 번 보내지 않으려고 둔다.
    if (glyphJobId) {
      started.current = false;
      // 초안을 그린 뒤 화면 2에서 표현 방식·견본·톤을 바꿨으면 그 초안은 지난 입력으로 그린 것이다. 새로 그린다(10/30).
      if (draftChanged) {
        record("selection", "화면 2에서 표현 방식·견본을 바꿔 참고 글자 초안을 새로 그림");
        dispatch({ type: "setGlyphJob", jobId: null });
      }
      return;
    }
    if (error || started.current || !state.style) return;
    started.current = true;
    const chosen = state.styleSamples[state.style.expression.trim()];
    const run = state.run;
    api
      .startGlyphJob({ upload: state.upload, style: state.style, sampleId: chosen?.status === "ready" ? chosen.sampleId : null })
      .then(({ jobId }) => dispatch({ type: "setGlyphJob", jobId, input: draftInput, run }))
      .catch((err) => setError(errorMessage(err)));
  }, [glyphJobId, draftChanged, draftInput, error, state.upload, state.style, state.styleSamples, state.run, dispatch, record]);

  // 진행 상황 받기. 글자 카드의 '다시 그리기'는 작업이 끝난 뒤에 한 글자만 다시 그리므로, 작업 상태가 아니라 글자마다 정해졌는지로 멈춘다.
  useEffect(() => {
    if (!glyphJobId || settled || error) return;
    const timer = setInterval(() => {
      api
        .getGlyphJob(glyphJobId)
        .then((job) => {
          dispatch({ type: "setGlyphItems", jobId: glyphJobId, items: job.items });
          if (job.items.every((i) => i.status === "ready" || i.status === "failed")) clearInterval(timer);
          if (job.status !== "running" && recordedJob.current !== job.jobId) {
            recordedJob.current = job.jobId;
            for (const m of job.models) record("ai_model", `참고 글자 그리기·검사: ${m}`);
            record(
              "ai_scope",
              `참고 글자 ${job.items.length}자를 AI가 새로 그림. 로고는 획 끝·질감 참고 이미지로만 쓰고, 로고 글자는 쓰지 않음. 나머지 글자도 AI가 참고 글자를 보며 같은 글씨로 그림`,
            );
          }
        })
        .catch((err) => {
          clearInterval(timer);
          setError(errorMessage(err));
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [glyphJobId, settled, error, dispatch, record, pollRound]);

  function retry() {
    started.current = false;
    setError(null);
    setConfirmRedraw(false);
    dispatch({ type: "setGlyphJob", jobId: null });
  }

  /** 다 그린 초안을 버리고 처음부터 다시 그린다(글자표 이미지 1장 + 검사). */
  function redrawAll() {
    record("selection", "참고 글자 초안을 처음부터 다시 그림");
    retry();
  }

  async function retryFailed() {
    if (!glyphJobId || !state.style) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await api.retryGlyphs(glyphJobId, { upload: state.upload, style: state.style });
      record("selection", `실패한 참고 글자 모두 다시 그리기: ${failed.map((i) => i.char).join(", ")}`);
      setPollRound((n) => n + 1);
      dispatch({ type: "setGlyphItems", jobId: glyphJobId, items: glyphItems.map((i) => (i.status === "failed" ? { ...i, status: "redrawing", problem: null } : i)) });
    } catch (err) {
      setRetryError(errorMessage(err));
    } finally {
      setRetrying(false);
    }
  }

  /** 글자 카드의 '다시 그리기': 그 글자만 한 번 다시 그린다(이미지 1장). 통과한 글자는 새 글자가 떨어지면 전 글자를 그대로 둔다. */
  async function retryOne(item: GlyphItem) {
    if (!glyphJobId || !state.style) return;
    setMenuFor(null);
    setRetryError(null);
    try {
      await api.retryGlyphs(glyphJobId, { upload: state.upload, style: state.style, index: Number(item.id) });
      record("selection", `참고 글자 다시 그리기: ${item.char}${item.status === "ready" ? " (통과한 글자를 사용자가 다시 그림)" : ""}`);
      setPollRound((n) => n + 1);
      dispatch({ type: "setGlyphItems", jobId: glyphJobId, items: glyphItems.map((i) => (i.id === item.id ? { ...i, status: "redrawing", problem: null, note: null } : i)) });
    } catch (err) {
      setRetryError(errorMessage(err));
    }
  }

  async function refreshItems() {
    if (!glyphJobId) return;
    const job = await api.getGlyphJob(glyphJobId);
    dispatch({ type: "setGlyphItems", jobId: glyphJobId, items: job.items });
  }

  async function restoreOne(item: GlyphItem) {
    if (!glyphJobId) return;
    setMenuFor(null);
    setRetryError(null);
    try {
      await api.restoreGlyph(glyphJobId, item.id);
      record("selection", `참고 글자 되돌리기: ${item.char}`);
      await refreshItems();
    } catch (err) {
      setRetryError(errorMessage(err));
    }
  }

  /** 직접 고치기: 통과한 글자는 그 그림을, 실패한 글자는 기준 서체 밑그림을 깔고 빈 바탕에서 시작한다. */
  const loadEditing = useCallback(async (): Promise<EditorSource> => {
    if (!editing) throw new Error("고칠 글자가 없어요");
    if (editing.status === "ready" && editing.imageUrl) {
      const blob = await (await fetch(editing.imageUrl)).blob();
      const image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      return { image, fit: true };
    }
    const { image } = await api.structureGlyph(editing.char);
    return { image, ghost: image, blank: true };
  }, [editing]);

  async function saveEditing(png: string) {
    if (!glyphJobId || !editing) return;
    await api.saveRefEdit(glyphJobId, editing.id, png);
    record("selection", `참고 글자 직접 고침: ${editing.char} (그림판 편집)`);
    await refreshItems();
    setEditing(null);
  }

  const total = glyphItems.length || REFERENCE_CHARS.length;
  const readyCount = glyphItems.filter((i) => i.status === "ready").length;
  const failed = glyphItems.filter((i) => i.status === "failed");
  const redrawing = glyphItems.filter((i) => i.status === "redrawing");
  const notes = glyphItems.filter((i) => i.status === "ready" && i.note);
  const sheetDrawn = glyphItems.length > 0 && !glyphItems.some((i) => i.status === "drawing");
  const enough = readyCount >= MIN_REFERENCE_READY;
  const expression = state.style?.expression.trim() ?? "";
  const chosenSample = state.styleSamples[expression];

  const checkLine = !sheetDrawn
    ? null
    : redrawing.length > 0
      ? `${redrawing.map((i) => i.char).join("·")}을(를) 다시 그리고 있어요.`
      : failed.length > 0
        ? `${failed.length}자가 검사를 통과하지 못했어요. 글자를 누르면 다시 그려요.`
        : `${readyCount}자 모두 검사를 통과했어요.`;

  function next() {
    record("selection", `참고 글자 초안 확정: AI 초안 ${readyCount}자로 폰트를 만듦`);
    dispatch({ type: "reachStep", step: 3 });
    router.push("/build");
  }

  return (
    <>
      <div className="mx-auto grid w-full max-w-[90rem] flex-1 gap-6 px-5 pt-3 pb-5 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-8 lg:px-12">
        <section className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <h1 className="text-26 font-extrabold tracking-[-0.02em] lg:text-28">AI가 그린 참고 글자 초안</h1>
            <span className="text-base font-bold">
              {readyCount} / {total}
            </span>
          </div>
          <p className="text-15 leading-normal font-medium text-muted">화면 2에서 고른 표현 방식으로 그렸어요. 이 글자들의 스타일로 나머지 한글 2,350자를 만들어요.</p>

          {error && (
            <div className="flex flex-col items-start gap-3">
              <Notice tone="error">참고 글자 그리기 작업에 문제가 생겼어요: {error}</Notice>
              <Button variant="outline" onClick={retry}>
                다시 그리기
              </Button>
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,4.5rem)] gap-2 pt-1">
            {(glyphItems.length ? glyphItems : [...REFERENCE_CHARS].map((char, i) => ({ id: String(i), char, status: "drawing", imageUrl: null, problem: null }) as GlyphItem)).map(
              (item) => (
                <GlyphCard
                  key={item.id}
                  item={item}
                  open={menuFor === item.id}
                  onToggle={() => setMenuFor((v) => (v === item.id ? null : item.id))}
                  onClose={() => setMenuFor(null)}
                  onRetry={() => void retryOne(item)}
                  onEdit={() => {
                    setMenuFor(null);
                    setEditing(item);
                  }}
                  onRestore={() => void restoreOne(item)}
                />
              ),
            )}
          </div>
          {sheetDrawn && failed.length === 0 && <p className="text-sm font-medium text-muted">마음에 안 드는 글자를 누르면 다시 그리거나 직접 고칠 수 있어요.</p>}
          {notes.length > 0 && (
            <Notice>
              {notes.map((i) => (
                <span key={i.id} className="block">
                  &apos;{i.char}&apos; {i.note}
                </span>
              ))}
            </Notice>
          )}

          {sheetDrawn && failed.length > 0 && (
            <div className="flex flex-col items-start gap-3 pt-2">
              <Notice tone={enough ? "warn" : "error"}>
                검사를 통과하지 못한 글자: {failed.map((i) => (i.problem ? `${i.char}(${i.problem})` : i.char)).join(", ")}.{" "}
                {/* 10/30 사용자 문의(꽃·원이 다시 그려도 계속 떨어짐): 참고 글자는 스타일 견본이라, 빠져도 그 글자는 폰트에 들어간다. */}
                {enough
                  ? `이대로 폰트를 만들어도 ${failed.map((i) => `'${i.swappedFrom ?? i.char}'`).join("·")}은(는) 폰트에 들어가요. 다시 그리면 같은 자모가 든 더 쉬운 글자로 바꿔 그려요. 직접 그려도 돼요.`
                  : `글자를 누르면 다시 그리거나(이미지 1장) 직접 그릴 수 있어요. 폰트를 만들려면 참고 글자가 ${MIN_REFERENCE_READY}자 이상 필요해요.`}
              </Notice>
              {failed.length >= 2 && (
                <Button variant="outline" size="sm" onClick={retryFailed} disabled={retrying}>
                  {retrying ? "요청하는 중" : `실패한 글자 모두 다시 그리기 (${failed.length}자)`}
                </Button>
              )}
            </div>
          )}
          {retryError && <Notice tone="error">다시 그리기를 요청하지 못했어요: {retryError}</Notice>}
        </section>

        <aside className="flex flex-col gap-3.5">
          {/* 10/30 사용자 결정: 여기 있던 'MX-Font로 만든 가게 이름 미리보기'는 초안을 따르지 않아(작업마다 거의 같은 글씨) 빼고,
              초안을 견줘 볼 수 있게 화면 2에서 고른 견본을 둔다. */}
          <div className="flex min-h-[20rem] flex-1 flex-col gap-4 rounded-[1.25rem] bg-stage p-6 lg:p-7">
            <h2 className="text-15 font-bold text-muted">화면 2에서 고른 견본</h2>
            {chosenSample?.status === "ready" && (
              <span className="grid aspect-[7/3] w-full place-items-center overflow-hidden rounded-[0.625rem] bg-bg shadow-[0_0_0_1px_rgba(17,17,17,.08)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- 서버가 그린 견본 */}
                <img src={chosenSample.imageUrl} alt={`${state.upload.storeName || "가게 이름"} 견본`} className="h-full w-full object-contain p-2" />
              </span>
            )}
            {expression && <p className="text-15 leading-normal font-semibold">{expression}</p>}
            {checkLine && <p className="mt-auto text-15 font-semibold">{checkLine}</p>}
          </div>

          {!sheetDrawn && !error && (
            <div className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-edge px-5 py-[1.125rem]">
              <Spinner label={<span className="font-bold">참고 글자표 그리는 중</span>} />
              <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden>
                <div className="h-full w-2/5 rounded-full bg-ink motion-safe:animate-[ds-indeterminate_1.4s_ease-in-out_infinite]" />
              </div>
              <p className="text-sm font-medium text-muted">글자표 한 장에 30초쯤 걸려요. 검사에 떨어진 글자는 한 자씩 다시 그려요.</p>
            </div>
          )}

          {settled && !confirmRedraw && (
            <div className="flex items-center gap-3 p-1">
              <Button variant="outline" size="sm" onClick={() => setConfirmRedraw(true)}>
                처음부터 다시 그리기…
              </Button>
            </div>
          )}
          {settled && confirmRedraw && (
            <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-edge px-5 py-4">
              <p className="text-15 font-medium leading-normal">참고 글자 {total}자를 새로 그려요. 지금 초안은 사라지고 이미지 1장 이상이 들어요.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={redrawAll}>
                  새로 그리기
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmRedraw(false)}>
                  그대로 두기
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {editing && (
        <GlyphEditor
          key={editing.id}
          title={`참고 글자 '${editing.char}' ${editing.status === "ready" ? "고치기" : "그리기"}`}
          ghostLabel="기준 글자 밑그림"
          load={loadEditing}
          onSave={saveEditing}
          saveLabel="이 글자로 바꾸기"
          onClose={() => setEditing(null)}
        />
      )}

      <Footer
        status={
          !glyphJobId && !error ? (
            <Spinner label="참고 글자 그리기 작업을 시작하는 중" />
          ) : !sheetDrawn ? (
            `참고 글자 그리는 중 · ${readyCount}/${total}`
          ) : redrawing.length > 0 ? (
            `다시 그리는 중 · ${readyCount}/${total}`
          ) : done ? (
            "초안을 다 그렸어요. 폰트를 만들면 이 초안을 보며 나머지 글자를 그려요(처음 약 5분)."
          ) : (
            `폰트를 만들려면 참고 글자가 ${MIN_REFERENCE_READY}자 이상 필요해요.`
          )
        }
      >
        <ButtonLink href="/style">이전</ButtonLink>
        <Button disabled={!done} onClick={next}>
          폰트 만들기
        </Button>
      </Footer>
    </>
  );
}

/** 참고 글자 카드(4.5rem, 기본 72px. 글자 크기 설정을 따라 커진다). 누르면 메뉴: 다시 그리기(남은 횟수) · 직접 고치기 · 되돌리기. 실패한 글자는 빨간 테두리. */
function GlyphCard({
  item,
  open,
  onToggle,
  onClose,
  onRetry,
  onEdit,
  onRestore,
}: {
  item: GlyphItem;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onRestore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = `glyph-menu-${item.id}`;

  // 펼침 버튼 + 버튼 목록(10/30 접근성 검토: role="menu"는 화살표 키 이동을 기대하게 해서 뺐다). Tab으로 항목을 돌고, Esc로 닫으면 카드로 돌아간다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (item.status === "redrawing") {
    return (
      <div
        role="img"
        aria-label={`${item.char}, 다시 그리는 중`}
        className="relative flex h-18 w-18 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-muted"
        title="다시 그리는 중"
      >
        <span className="absolute top-[0.25rem] left-[0.375rem] text-13 font-bold">{item.char}</span>
        <span aria-hidden className="mt-2.5 h-[1.125rem] w-[1.125rem] animate-spin rounded-full border-[3px] border-track border-t-ink" />
        <span className="text-13 font-bold">다시</span>
      </div>
    );
  }
  if (item.status === "drawing") {
    return (
      <div role="img" aria-label={`${item.char}, 그리는 중`} className="relative h-18 w-18 rounded-xl border-[1.5px] border-dashed border-edge" title="그리는 중">
        <span className="absolute top-[0.3125rem] left-[0.4375rem] text-13 font-bold text-muted">{item.char}</span>
      </div>
    );
  }

  const failed = item.status === "failed";
  const left = item.redrawsLeft ?? 0;
  return (
    <div ref={ref} className="relative">
      <button
        ref={toggleRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={failed && item.problem ? `실패: ${item.problem}` : undefined}
        aria-label={`${item.char} ${failed ? `실패${item.problem ? `: ${item.problem}` : ""} · ` : item.handEdited ? "직접 고침 · " : ""}고치기 메뉴`}
        className={`relative grid h-18 w-18 place-items-center rounded-xl transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.97] ${
          failed ? "border-2 border-bad bg-bg hover:bg-subtle" : "bg-stage hover:shadow-[0_0_0_2px_var(--ink)]"
        } ${open ? "shadow-[0_0_0_2px_var(--ink)]" : ""}`}
      >
        <span className={`absolute top-[0.3125rem] left-[0.4375rem] text-13 font-bold ${failed ? "text-bad" : "text-muted"}`}>{item.char}</span>
        {item.handEdited && <span className="absolute top-[0.3125rem] right-[0.375rem] text-xs font-bold text-ink">고침</span>}
        {failed ? (
          <span className="mt-3 text-13 font-bold text-bad">고치기</span>
        ) : (
          <span className="mt-2">
            <GlyphImage item={item} size={44} />
          </span>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          aria-label={`${item.char} 고치기`}
          className="absolute top-[4.875rem] left-0 z-20 flex w-[11.75rem] origin-top-left flex-col gap-0.5 rounded-2xl border-[1.5px] border-line bg-bg p-1.5 shadow-[0_18px_40px_-18px_rgba(17,17,17,.45)] motion-safe:animate-[ds-pop_140ms_ease-out]"
        >
          <MenuItem onClick={onRetry} disabled={left === 0}>
            다시 그리기 <span className="font-medium text-muted">{left > 0 ? `남은 ${left}번` : "다 씀"}</span>
          </MenuItem>
          <MenuItem onClick={onEdit}>{failed ? "직접 그리기" : "직접 고치기"}</MenuItem>
          {item.canRestore && <MenuItem onClick={onRestore}>되돌리기</MenuItem>}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 items-center lg:h-10 justify-between gap-2 rounded-xl px-3 text-left text-15 font-bold hover:bg-stage disabled:text-muted disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
