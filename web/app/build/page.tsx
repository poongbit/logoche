"use client";

// 화면 4 폰트 만들기·다듬기(Claude Design 'Logoche Final' 3g~3j, 10/29). 무대에 만든 폰트 견본과 검사 카드, 아래에 전체 다듬기와 글자 고치기.
// 10/29 사용자 요청: 말로 고치기를 빼고, 마음에 안 드는 글자를 그림판처럼 직접 고친다(components/GlyphEditor).
// 견본에서 글자를 누르거나 글자를 써 넣어 연다. 고친 글자는 만든 폰트에 바로 바꿔 끼우고, 다시 만들 때도 들어간다(lib/server/edits.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildProgress, formatSeconds } from "@/components/BuildProgress";
import { GlyphEditor, type EditorSource } from "@/components/GlyphEditor";
import { GlyphPreview, PICKABLE_GLYPH } from "@/components/GlyphPreview";
import { RefineSliders } from "@/components/Refine";
import { RequireStep } from "@/components/RequireStep";
import { Button, ButtonLink, Footer, Notice, TextField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CHECKS, FREQUENT_CHARS, MENU_BY_INDUSTRY, NEAREST_KIND_LABELS, PANGRAM, similarityScope } from "@/lib/constants";
import { useGeneratedFont } from "@/lib/font";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import { isBuildPassed, isGlyphsDone, specimenLines, useApp } from "@/lib/store";
import type { BuildJob } from "@/lib/types";

const POLL_MS = 500;
// 서버의 OCR 글자와 같은 목록이다(lib/server/build.ts OCR_CHARS). 다르게 읽은 글자가 10%까지면 통과(OCR_MAX_MISREAD_RATIO).
const OCR_COUNT = new Set([...FREQUENT_CHARS, ...PANGRAM.replace(/ /g, "")]).size;
const OCR_ALLOWED = Math.max(1, Math.floor(OCR_COUNT * 0.1));

export default function BuildPage() {
  const { state } = useApp();
  return (
    <RequireStep ready={isGlyphsDone(state) && state.maxStep >= 3} message="화면 3에서 참고 글자를 먼저 그려 주세요." href="/draft">
      <BuildScreen />
    </RequireStep>
  );
}

function BuildScreen() {
  const { state, dispatch, record } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sendSeconds, setSendSeconds] = useState<number | null>(null);
  const [proceed, setProceed] = useState(false); // '적용해 보기'를 눌러 다듬은 내용으로 다시 만드는 중. 통과하면 바로 화면 5로 간다.
  const [editing, setEditing] = useState<string | null>(null); // 고치는 글자
  const started = useRef(false);
  const recordedJob = useRef<string | null>(null);

  const { buildJobId, build, buildDirty } = state;
  const finished = !!build && (build.phase === "done" || build.phase === "failed");
  const passed = isBuildPassed(build);
  // 엔진이 TTF를 다 만들었으면(OCR 중이거나 검사에 떨어졌어도) 그 파일로 견본을 그린다. 받기는 통과한 fontId로만 한다.
  const fontFile = build && (build.phase === "checking" || build.phase === "done") ? build.jobId : null;
  const font = useGeneratedFont(fontFile, state.fontRevision);

  useEffect(() => {
    // 결과가 오면 표시를 푼다. Cache Components는 화면을 떠나도 이 컴포넌트를 숨겨 둘 뿐이라(ref가 남는다), 다른 화면에서
    // 작업을 지우고 돌아왔을 때(화면 4 '이 방향으로 다시 그리기' 등) 다시 시작해야 한다. 표시는 요청이 가는 동안 두 번 보내지 않으려고 둔다.
    if (buildJobId) {
      started.current = false;
      return;
    }
    if (error || started.current || !state.style) return;
    started.current = true;
    const sentAt = performance.now();
    const run = state.run;
    api
      .startBuildJob({
        upload: state.upload,
        style: state.style,
        storeName: state.upload.storeName,
        logoHash: state.upload.logoHash,
        glyphJobId: state.glyphJobId,
        axes: state.style.axes,
      })
      .then(({ jobId }) => {
        setSendSeconds((performance.now() - sentAt) / 1000);
        dispatch({ type: "setBuildJob", jobId, run });
      })
      .catch((err) => {
        setProceed(false);
        setError(errorMessage(err));
      });
  }, [buildJobId, error, state.style, state.upload, state.glyphJobId, state.run, dispatch]);

  useEffect(() => {
    if (!buildJobId || finished || error) return;
    const timer = setInterval(() => {
      api
        .getBuildJob(buildJobId)
        .then((job) => {
          dispatch({ type: "setBuild", build: job });
          if (job.phase === "done" || job.phase === "failed") {
            clearInterval(timer);
            if (recordedJob.current !== job.jobId) {
              recordedJob.current = job.jobId;
              for (const m of job.models) record("ai_model", `생성·검사: ${m}`);
              record("check", summarize(job));
            }
            // 다시 만드는 동안 또 다듬었으면 넘어가지 않는다(그 내용은 아직 파일에 없다).
            if (proceed) {
              setProceed(false);
              if (isBuildPassed(job) && !buildDirty) {
                dispatch({ type: "reachStep", step: 4 });
                router.push("/kit");
              }
            }
          }
        })
        .catch((err) => {
          clearInterval(timer);
          setProceed(false);
          setError(errorMessage(err));
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [buildJobId, finished, error, dispatch, record, proceed, buildDirty, router]);

  function rebuild() {
    started.current = false;
    setError(null);
    setSendSeconds(null);
    dispatch({ type: "setBuildJob", jobId: null });
  }

  /** 유사도를 넘으면 참고 글자를 처음부터 다시 그린다(화면 3). */
  function redraw() {
    dispatch({ type: "setGlyphJob", jobId: null });
    router.push("/draft");
  }

  // ---------- 글자 고치기 ----------

  // 만든 폰트가 다듬기를 반영한 상태면 고친 글자를 그 폰트에 바로 바꿔 끼운다. 아니면 '적용해 보기'로 다시 만들 때 들어간다.
  const patchTarget = !buildDirty && fontFile ? fontFile : null;
  const canEdit = !!state.glyphJobId && !!fontFile; // 폰트 파일을 다 만든 뒤(검사 중이어도)
  const editingEdited = !!editing && state.glyphEdits.includes(editing);

  const loadEditing = useCallback(async (): Promise<EditorSource> => {
    if (!editing || !state.glyphJobId || !state.style) throw new Error("고칠 글자가 없어요");
    const src = await api.glyphEditSource(state.glyphJobId, { char: editing, axes: state.style.axes });
    return { image: src.image, ghost: src.original, guides: src.guides, size: src.size };
  }, [editing, state.glyphJobId, state.style]);

  async function saveEditing(image: string | null) {
    if (!editing || !state.glyphJobId || !state.style) return;
    const res = await api.saveGlyphEdit(state.glyphJobId, { char: editing, image, axes: state.style.axes, buildId: patchTarget });
    dispatch({ type: "setGlyphEdits", edits: res.edits, patched: res.patched });
    // 빠진 글자를 그려 넣었으면 엔진이 글자 세트 검사를 다시 했다. 검사 카드를 새로 받는다.
    if (res.patched && buildJobId) api.getBuildJob(buildJobId).then((job) => dispatch({ type: "setBuild", build: job })).catch(() => {});
    record("selection", image ? `글자 직접 고침: ${editing} (그림판 편집)` : `고친 글자 되돌림: ${editing} (AI가 만든 그대로)`);
    setEditing(null);
  }

  function pick(char: string) {
    if (canEdit && KSX1001_HANGUL.has(char)) setEditing(char);
  }

  /** 다듬은 내용이 있으면 폰트를 다시 만들고 검사해, 통과하면 넘어간다. 슬라이더마다 빌드·OCR을 돌리지 않고 여기서 한 번만 한다. */
  function next() {
    if (buildDirty) {
      record("selection", "다듬은 내용으로 폰트를 다시 만듦");
      setProceed(true);
      rebuild();
      return;
    }
    dispatch({ type: "reachStep", step: 4 });
    router.push("/kit");
  }
  const proceeding = proceed && !buildDirty && !finished;

  const similarity = build?.similarity;
  const misreads = build?.misreads ?? [];
  const simBad = !!similarity && !similarity.passed;
  const failedChecks = build?.checks.filter((c) => c.status === "fail") ?? [];
  const isBuilding = !finished && !error;
  // 나머지 글자를 그리는 동안 30자(글자표 한 장)마다 견본을 다시 만들어, 그린 글자부터 보여 준다(10/30 검토: 5분 동안 빈 화면).
  const drawStage = build?.stages.find((s) => s.key === "draw");
  const previewVersion = drawStage?.status === "active" ? Math.floor(drawStage.done / 30) : (drawStage?.status ?? "");
  const fromFile = !buildDirty && !!font.fontFamily;
  const drawing = isBuilding && drawStage?.status === "active";

  const pill: { text: string; bad?: boolean } = error
    ? { text: "폰트를 만들지 못했어요", bad: true }
    : isBuilding
      ? {
          text: proceeding
            ? "미리보기 · 다듬은 내용으로 폰트 파일을 다시 만드는 중"
            : drawing
              ? `미리보기 · 그린 글자부터 채우는 중 (${(drawStage?.done ?? 0).toLocaleString()} / ${(drawStage?.total ?? 0).toLocaleString()}자)`
              : "미리보기 · 폰트 파일을 만드는 중",
        }
      : buildDirty
        ? { text: "미리보기 · 다듬은 내용은 '적용해 보기'를 누르면 파일에 반영돼요" }
        : simBad
          ? { text: "받을 수 없어요 · 유사도 기준을 넘었어요", bad: true }
          : passed
            ? { text: `다 만들었어요 · ${(build?.totalGlyphs ?? 2350).toLocaleString()}자 · ${formatSeconds(build?.elapsedSeconds ?? 0, true)}` }
            : { text: "통과하지 못한 항목이 있어요", bad: true };

  const status = buildDirty
    ? "다듬은 내용은 '적용해 보기'를 누르면 폰트 파일에 반영하고 다시 검사해요."
    : proceeding
      ? "다듬은 내용으로 폰트를 다시 만들고 검사하는 중이에요. 통과하면 바로 넘어가요."
      : drawing
        ? "나머지 글자를 그리는 중이에요. 그동안 아래에서 굵기·너비를 미리 다듬어 볼 수 있어요."
        : isBuilding
          ? "폰트를 만들고 검사하는 중이에요."
        : passed
          ? misreads.length > 0
            ? `AI가 ${misreads.length}자를 다르게 읽었어요. 그대로 진행할 수 있어요.`
            : "모두 통과했어요. 적용해 보기를 누르면 시안으로 가요."
          : simBad
            ? "초안을 다시 그려 주세요."
            : "통과하지 못한 항목이 있어요.";

  return (
    <>
      {/* 데스크톱에서는 위 단계 표시(72px)와 아래 동작 막대(88px) 사이를 꼭 채운다. 무대가 남는 높이를 쓰고 검사 카드는 안에서 스크롤한다. */}
      <div className="flex w-full flex-1 flex-col lg:h-[calc(100dvh-10rem)] lg:min-h-[40rem] lg:flex-none">
        {/* 무대: 견본 + 검사 카드 */}
        <div className="flex w-full flex-1 lg:min-h-0 lg:px-6">
          <div className="mx-auto flex w-full max-w-[87rem] flex-col gap-5 bg-stage p-5 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:gap-6 lg:rounded-[1.25rem] lg:py-6 lg:pr-6 lg:pl-12">
            <section className="flex min-w-0 flex-col gap-5 lg:gap-[1.375rem]">
              <div
                role={pill.bad ? "alert" : undefined}
                className={`self-start rounded-full bg-bg font-bold ${pill.bad ? "border-2 border-bad px-[1.125rem] py-2.5 text-base text-bad" : "px-3.5 py-[0.4375rem] text-sm"}`}
              >
                {pill.text}
              </div>
              <div className="flex flex-1 flex-col justify-center gap-5 lg:gap-[1.375rem]">
                {specimenLines(state).map((line) => {
                  const size = line.kind === "name" ? "text-[clamp(3.5rem,9vw,9.75rem)] leading-none" : "text-[clamp(1.5rem,2.8vw,2.5rem)] leading-[1.3]";
                  return fromFile ? (
                    <p key={line.text} className={`flex flex-wrap ${size}`} style={{ fontFamily: font.fontFamily! }}>
                      {[...line.text].map((ch, i) =>
                        canEdit && KSX1001_HANGUL.has(ch) ? (
                          <button key={i} type="button" onClick={() => pick(ch)} aria-label={`'${ch}' 고치기`} title={`'${ch}' 고치기`} className={PICKABLE_GLYPH}>
                            {ch}
                          </button>
                        ) : (
                          <span key={i} className="whitespace-pre">
                            {ch}
                          </span>
                        ),
                      )}
                    </p>
                  ) : (
                    <GlyphPreview key={line.text} text={line.text} className={size} onPick={canEdit ? pick : undefined} version={previewVersion} />
                  );
                })}
                <TypeTester fontFamily={font.fontFamily} />
              </div>
            </section>

            <aside className="flex flex-col gap-3 rounded-2xl bg-bg p-5 lg:min-h-0 lg:overflow-y-auto lg:p-[1.375rem]">
              {error ? (
                <div className="flex flex-col items-start gap-3">
                  <Notice tone="error">폰트 만들기 작업에 문제가 생겼어요: {error}</Notice>
                  <Button variant="outline" size="sm" onClick={rebuild}>
                    다시 만들기
                  </Button>
                </div>
              ) : isBuilding ? (
                <BuildProgress build={build} sendSeconds={sendSeconds} sendFailed={false} />
              ) : (
                <>
                  <div className="flex items-baseline">
                    <h2 className="text-lg font-bold">검사</h2>
                    <span className={`ml-auto text-15 font-bold ${failedChecks.length ? "text-bad" : "text-good"}`}>
                      {failedChecks.length ? `7항목 중 ${failedChecks.length}개 넘음` : "7항목 모두 통과"}
                    </span>
                  </div>
                  {buildDirty && <p className="text-13 font-medium text-muted">다듬기 전 폰트의 결과예요.</p>}
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm font-semibold">
                    {CHECKS.map((c) => {
                      const r = build?.checks.find((x) => x.key === c.key);
                      return (
                        <div key={c.key} className="contents" title={r?.detail}>
                          <dt>{c.label}</dt>
                          <dd className={r?.status === "pass" ? "font-bold text-good" : r?.status === "fail" ? "font-extrabold text-bad" : "text-muted"}>
                            {r?.status === "pass" ? "통과" : r?.status === "fail" ? "기준 넘음" : "검사 전"}
                          </dd>
                        </div>
                      );
                    })}
                    <dt>AI 판독</dt>
                    <dd className={build?.ocrPassed ? "font-bold text-good" : build?.ocrPassed === false ? "font-extrabold text-bad" : "text-muted"}>
                      {build?.ocrPassed == null ? "검사 전" : build.ocrPassed ? "통과" : "기준 넘음"}
                    </dd>
                  </dl>
                  {similarity &&
                    (similarity.passed ? (
                      <div className="flex flex-col gap-1 rounded-xl bg-subtle px-3.5 py-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-28 font-extrabold">{similarity.score.toFixed(2)}</span>
                          <span className="text-sm font-medium text-muted">유사도 · 기준 {similarity.threshold.toFixed(2)} 미만</span>
                        </div>
                        <p className="text-13 leading-normal font-medium text-muted">
                          가장 가까운 폰트: {similarity.nearestFont} ({NEAREST_KIND_LABELS[similarity.nearestKind]})
                          <br />
                          {similarityScope(similarity.compared)}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 rounded-xl border-2 border-bad px-3.5 py-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-28 font-extrabold text-bad">{similarity.score.toFixed(2)}</span>
                          <span className="text-sm font-bold">유사도 · 기준 {similarity.threshold.toFixed(2)}를 넘었어요</span>
                        </div>
                        <p className="text-13 leading-normal font-medium text-muted">
                          가장 가까운 폰트: {similarity.nearestFont} ({NEAREST_KIND_LABELS[similarity.nearestKind]})
                          <br />
                          {similarityScope(similarity.compared)}
                        </p>
                        <p className="text-sm leading-snug font-medium">
                          참고 글자를 다시 그리면 덜 닮게 바뀌어요.
                          {similarity.nearestKind === "commercial" && " 로고에 상용 폰트를 썼다면 그 폰트의 라이선스도 확인해 주세요."}
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-10 px-4 text-sm" onClick={redraw}>
                            초안 다시 그리기
                          </Button>
                          <Button variant="outline" size="sm" className="h-10 px-4 text-sm" onClick={rebuild}>
                            다시 만들기
                          </Button>
                        </div>
                      </div>
                    ))}
                  {build?.ocrPassed != null &&
                    (misreads.length === 0 ? (
                      <p className="mt-auto text-sm font-semibold text-muted">AI가 {OCR_COUNT}자를 모두 바르게 읽었어요.</p>
                    ) : (
                      <div className="mt-auto flex flex-col gap-2">
                        <p className="text-sm font-bold">
                          AI가 다르게 읽은 글자 {misreads.length}개{" "}
                          <span className="font-medium text-muted">
                            · {OCR_COUNT}자 중 {OCR_ALLOWED}자까지 통과
                          </span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {misreads.slice(0, 6).map((m) => (
                            <button
                              key={m.char}
                              type="button"
                              disabled={!canEdit}
                              onClick={() => pick(m.char)}
                              aria-label={`'${m.char}'을 AI가 ${readLabel(m.read)}(으)로 읽음 · 고치기`}
                              className="flex items-center gap-2 rounded-xl border-[1.5px] border-edge px-3 py-2.5 text-left transition-colors hover:border-ink hover:bg-subtle disabled:hover:border-edge disabled:hover:bg-transparent"
                            >
                              <span className="text-36 leading-none" style={{ fontFamily: font.fontFamily ?? GLYPH_FONT_STACK }}>
                                {m.char}
                              </span>
                              <span className="text-base">→</span>
                              <span className="text-28 leading-none font-semibold text-muted">{readLabel(m.read)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  {build?.phase === "done" && build.error && <p className="text-13 font-medium text-bad">{build.error}</p>}
                </>
              )}
            </aside>
          </div>
        </div>

        {/* 전체 다듬기 + 글자 고치기 */}
        <div className="mx-auto grid w-full max-w-[90rem] gap-6 px-5 pt-[1.125rem] pb-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12 lg:px-12">
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold">전체 다듬기</h2>
            <RefineSliders />
          </section>
          <EditPanel canEdit={canEdit} edits={state.glyphEdits} fontFamily={font.fontFamily} pending={!!buildDirty} onPick={pick} />
        </div>
      </div>

      {editing && (
        <GlyphEditor
          key={editing}
          title={`'${editing}' 고치기`}
          ghostLabel="AI가 만든 글자 겹쳐 보기"
          load={loadEditing}
          onSave={(png) => saveEditing(png)}
          saveLabel={patchTarget ? "저장하고 폰트에 넣기" : "저장하기"}
          onRevert={editingEdited ? () => saveEditing(null) : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      <Footer status={status}>
        <ButtonLink href="/draft">이전</ButtonLink>
        <Button disabled={!(passed || buildDirty) || proceeding} onClick={next}>
          {proceeding ? "다시 만드는 중" : "적용해 보기"}
        </Button>
      </Footer>
    </>
  );
}

/** 글자 고치기: 견본에서 글자를 누르거나 써 넣어 편집 화면을 연다. 고친 글자는 눌러서 다시 연다. */
function EditPanel({
  canEdit,
  edits,
  fontFamily,
  pending,
  onPick,
}: {
  canEdit: boolean;
  edits: string[];
  fontFamily: string | null;
  pending: boolean;
  onPick: (char: string) => void;
}) {
  const [value, setValue] = useState("");
  const char = [...value.trim()].at(-1) ?? "";
  const invalid = !!char && !KSX1001_HANGUL.has(char);

  function open() {
    if (!char || invalid) return;
    onPick(char);
    setValue("");
  }

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-base font-bold">글자 고치기</h2>
        <span className="text-sm font-medium text-muted">{canEdit ? "견본에서 글자를 누르거나 써 넣으세요" : "폰트 파일을 다 만들면 고칠 수 있어요"}</span>
      </div>
      <form
        className="flex items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          open();
        }}
      >
        <TextField
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={4}
          placeholder="예: 그"
          aria-label="고칠 글자"
          disabled={!canEdit}
          className="max-w-28 text-center text-xl"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!canEdit || !char || invalid}>
          고치기
        </Button>
        {invalid && <span className="text-sm font-semibold text-bad">완성형 한글 2,350자 안의 글자만 고칠 수 있어요</span>}
      </form>
      {edits.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">
            고친 글자 {edits.length}자{pending && <span className="font-medium text-muted"> · &apos;적용해 보기&apos;를 누르면 폰트 파일에 들어가요</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {edits.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!canEdit}
                onClick={() => onPick(c)}
                aria-label={`고친 글자 '${c}' 다시 열기`}
                className="grid h-12 w-12 place-items-center rounded-xl border-[1.5px] border-edge text-28 leading-none transition-colors hover:border-ink hover:bg-subtle disabled:hover:border-edge disabled:hover:bg-transparent"
                style={{ fontFamily: fontFamily ?? GLYPH_FONT_STACK }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 직접 쳐 보기: 만든 폰트 파일로 그린다. 폰트를 만들기 전에는 기본 글꼴이다. */
function TypeTester({ fontFamily }: { fontFamily: string | null }) {
  const { state } = useApp();
  const menu = state.upload.industry ? MENU_BY_INDUSTRY[state.upload.industry].map(([item]) => item).join(" ") : "";
  const [text, setText] = useState(() => `${state.upload.storeName} ${menu}`.trim());
  return (
    <label className="flex max-w-[55rem] items-center gap-3.5 rounded-[1.125rem] border-[1.5px] border-edge-stage bg-bg px-[1.125rem] py-2 transition-colors focus-within:border-2 focus-within:border-ink">
      <span className="shrink-0 text-13 font-bold text-muted">직접 쳐 보기</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="직접 쳐 보기"
        className="min-w-0 flex-1 bg-transparent text-26 leading-tight outline-none focus-visible:shadow-none lg:text-32"
        style={{ fontFamily: fontFamily ?? GLYPH_FONT_STACK }}
      />
    </label>
  );
}

const readLabel = (read: string) => (!read || read === "?" ? "못 읽음" : read);

function summarize(job: BuildJob): string {
  const failed = job.checks.filter((c) => c.status !== "pass").map((c) => CHECKS.find((x) => x.key === c.key)?.label);
  const misread = job.misreads.map((m) => `${m.char}→${readLabel(m.read)}`).join(", ");
  const parts = [failed.length === 0 ? "7항목 통과" : `실패: ${failed.join(", ")}`, `OCR ${job.ocrPassed ? "통과" : "실패"}${misread ? `(다르게 읽음: ${misread})` : ""}`];
  if (job.similarity) {
    const s = job.similarity;
    parts.push(
      `유사도 ${s.score.toFixed(2)} (기준 ${s.threshold.toFixed(2)}, 가장 가까운 ${NEAREST_KIND_LABELS[s.nearestKind]} '${s.nearestFont}', ${similarityScope(s.compared)})`,
    );
  }
  return parts.join(" · ");
}
