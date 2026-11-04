"use client";

// 글자 다듬기 편집기(11/4). 스튜디오 '글자' 카드에서 고른 글자 한 자를 사용자가 직접 손본다: 슬라이더 · 이미지처럼 끌어 바꾸기(변형) · 그림판으로 직접 그리기.
// AI가 정한 값 위에 사용자가 더한 조정만 저장한다(lib/types GlyphTweak). 저장하면 서버가 지금 폰트 파일에서 그 글자만 바로 바꿔 끼우고 제작 기록(사용자 조정)에 남긴다.
// 미리보기는 브라우저 안에서 CSS로 그린다(서버를 부르지 않는다). 폰트 파일에 이미 들어 있는 저장값에서 지금 값으로 가는 차이만 건다(lib/tweak.ts deltaTransform).
// 굵기만은 윤곽을 옮기는 일이라 CSS로 어림하고(늘리는 쪽만), 저장하면 정확히 반영된다.
// 아직 없는 것: 전체 글자에 한 번에 적용(폰트를 다시 만들어야 해서 따로 만든다), AI로 다시 그리기(프롬프트 탭).

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import type { EditorSource } from "@/components/GlyphEditor";
import { Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import { NO_TWEAK, TWEAK_FIELDS, TWEAK_PRESETS, clampTweakValue, deltaTransform, isNoTweak, strokeFor } from "@/lib/tweak";
import type { GlyphTweak, ProjectView } from "@/lib/types";

// 그림판(934줄)은 "직접 그리기"를 누를 때만 받는다(11/4 성능 점검)
const GlyphEditor = dynamic(() => import("@/components/GlyphEditor").then((m) => m.GlyphEditor), { ssr: false });

const SIZE = 190; // 글자 칸 높이(px). 1em = SIZE
const ADVANCE = 0.946; // 한글 글자 폭(em). 폰트 hmtx와 같다
const same = (a: GlyphTweak, b: GlyphTweak) => (Object.keys(NO_TWEAK) as (keyof GlyphTweak)[]).every((k) => a[k] === b[k]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const code = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`;

const fmt = (key: keyof GlyphTweak, v: number) => {
  const f = TWEAK_FIELDS.find((x) => x.key === key)!;
  return `${f.signed && v > 0 ? "+" : ""}${v}${f.unit}`;
};

/** 기본값과 다른 항목만 한 줄로 */
function summary(t: GlyphTweak | null): string {
  if (!t || isNoTweak(t)) return "AI가 정한 값";
  return TWEAK_FIELDS.filter((f) => t[f.key] !== NO_TWEAK[f.key])
    .map((f) => `${f.label} ${fmt(f.key, t[f.key])}`)
    .join(" · ");
}

function clock(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Mode = "slider" | "xform";
type Drag = { handle: string; x: number; y: number; start: GlyphTweak; w: number; h: number };

export const GlyphPolish = memo(function GlyphPolish({
  view,
  char,
  family,
  inFont,
  tweakable,
  onSaved,
}: {
  view: ProjectView;
  char: string;
  family: string;
  inFont: boolean;
  tweakable: boolean; // 한글 완성형이어야 조정을 건다(숫자·부호는 아직)
  onSaved: () => void;
}) {
  const saved = view.tweaks[char] ?? NO_TWEAK;
  const savedKey = JSON.stringify(saved);
  const [values, setValues] = useState<GlyphTweak>(saved);
  const [mode, setMode] = useState<Mode>("slider");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ at: string; tweak: GlyphTweak | null; note: string }[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // 저장했다는 알림(몇 초 뒤 사라진다)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function tell(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }
  const stageRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  // 저장값이 바뀌면(저장·되돌리기 뒤 화면을 다시 받았을 때) 편집값도 맞춘다(그리는 도중에 맞추는 React 권장 방식)
  const [seenKey, setSeenKey] = useState(savedKey);
  if (seenKey !== savedKey) {
    setSeenKey(savedKey);
    setValues(saved);
  }

  // 이 글자의 조정 기록
  useEffect(() => {
    if (!tweakable) return;
    let on = true;
    api
      .glyphTweakHistory(view.id, char)
      .then((r) => on && setHistory(r.history))
      .catch(() => on && setHistory([]));
    return () => {
      on = false;
    };
  }, [view.id, char, tweakable, savedKey]);

  const dirty = !same(values, saved);
  const edited = view.edited.includes(char);

  // 변형 모드의 네모: 지금 그려진 글자의 둘레
  useLayoutEffect(() => {
    if (mode !== "xform") return;
    const g = glyphRef.current?.getBoundingClientRect();
    const s = stageRef.current?.getBoundingClientRect();
    if (!g || !s) return;
    setBox({ left: g.left - s.left + g.width * 0.1, top: g.top - s.top + g.height * 0.1, width: g.width * 0.8, height: g.height * 0.8 });
  }, [mode, values]);

  function set(key: keyof GlyphTweak, v: number) {
    setValues((prev) => ({ ...prev, [key]: clampTweakValue(key, v) }));
  }

  async function send(tweak: GlyphTweak | null, note: string) {
    setBusy(true);
    setError(null);
    try {
      await api.saveGlyphTweak(view.id, { char, tweak: tweak && !isNoTweak(tweak) ? tweak : null, note });
      await sleep(700); // 엔진이 다른 형식(woff2 등) 파일을 다시 만드는 동안 잠깐 기다린다
      onSaved();
      tell(tweak && !isNoTweak(tweak) ? "저장했어요. 폰트에 넣었어요." : "원래 모양으로 돌렸어요.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // 변형: 네모 점을 끌어 크기·가로·세로, 안쪽을 끌어 이동
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const handle = (e.target as HTMLElement).dataset.h ?? "move";
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { handle, x: e.clientX, y: e.clientY, start: values, w: rect.width, h: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const next = { ...d.start };
    const k = 1000 / SIZE; // px → 글꼴 단위
    if (d.handle === "move") {
      next.tx = clampTweakValue("tx", d.start.tx + dx * k);
      next.ty = clampTweakValue("ty", d.start.ty - dy * k);
    } else if (d.handle.length === 2) {
      const sx = d.handle.includes("e") ? 1 : -1;
      const sy = d.handle.includes("s") ? 1 : -1;
      next.scale = clampTweakValue("scale", d.start.scale * (1 + (sx * dx + sy * dy) / (d.w + d.h)));
    } else if (d.handle === "e" || d.handle === "w") {
      next.width = clampTweakValue("width", d.start.width * (1 + ((d.handle === "e" ? 1 : -1) * dx * 2) / d.w));
    } else {
      next.height = clampTweakValue("height", d.start.height * (1 + ((d.handle === "s" ? 1 : -1) * dy * 2) / d.h));
    }
    setValues(next);
  }
  const endDrag = () => {
    drag.current = null;
  };

  const H = SIZE * 1.3;
  const baseline = H / 2 + 0.38 * SIZE; // 글자 칸 가운데가 축(글꼴 단위 y=380)이다
  const lines = [
    { y: baseline - 0.7 * SIZE, name: "cap" },
    { y: baseline - 0.47 * SIZE, name: "x-height" },
    { y: baseline, name: "baseline" },
    { y: baseline + 0.24 * SIZE, name: "descender" },
  ];
  const glyphStyle: CSSProperties = {
    fontFamily: inFont ? family : GLYPH_FONT_STACK,
    fontSize: SIZE,
    lineHeight: 1,
    width: SIZE * ADVANCE,
    height: SIZE,
    textAlign: "center",
    transformOrigin: "50% 50%",
    transform: inFont ? deltaTransform(saved, values, SIZE) : undefined,
    WebkitTextStroke: inFont ? `${strokeFor(saved.pull, values.pull, SIZE)}px currentColor` : undefined,
    color: inFont ? undefined : "var(--edge)",
  };

  const history5 = useMemo(() => [...history].reverse(), [history]);
  const pressedPreset = (v: Partial<GlyphTweak>) => same(values, { ...NO_TWEAK, ...v });
  const tab = "h-9 flex-1 rounded-full px-3 text-14 font-bold transition-colors";

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-bg p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-17 font-extrabold">
          {char} <span className="font-medium text-muted">{code(char)}</span>
        </span>
        {(!isNoTweak(saved) || edited) && <span className="rounded-full bg-ink px-2 py-0.5 text-12 font-extrabold text-bg">손봤어요</span>}
      </div>

      <div ref={stageRef} className="relative grid place-items-center overflow-hidden rounded-2xl bg-stage" style={{ height: H }}>
        {/* 가이드선: HTML로 그려 라벨 글자가 늘어나지 않게 한다(이전 SVG는 가로로 늘려 글자가 찌그러졌다) */}
        {lines.map((l) => (
          <div
            key={l.name}
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 border-t ${l.name === "baseline" ? "border-dashed border-ink/50" : "border-accent/45"}`}
            style={{ top: l.y }}
          >
            <span className="absolute -top-4 left-2 font-mono text-12 text-accent">{l.name}</span>
          </div>
        ))}
        <span ref={glyphRef} role="img" className="relative z-[1] block select-none" style={glyphStyle} aria-label={`${char} 미리보기`}>
          {char}
        </span>
        {mode === "xform" && box && tweakable && inFont && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute z-[2] cursor-move touch-none border-[1.5px] border-accent"
            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
          >
            {[
              ["nw", 0, 0, "nwse"],
              ["n", 50, 0, "ns"],
              ["ne", 100, 0, "nesw"],
              ["e", 100, 50, "ew"],
              ["se", 100, 100, "nwse"],
              ["s", 50, 100, "ns"],
              ["sw", 0, 100, "nesw"],
              ["w", 0, 50, "ew"],
            ].map(([h, x, y, cur]) => (
              <i
                key={h as string}
                data-h={h}
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-[3px] border-[1.5px] border-accent bg-bg after:absolute after:-inset-3 after:content-['']"
                style={{ left: `${x}%`, top: `${y}%`, cursor: `${cur}-resize` }}
              />
            ))}
          </div>
        )}
      </div>

      {!inFont && (
        <Notice tone="info">
          {tweakable ? "이 글자는 폰트에 아직 없어요. 직접 그려서 채울 수 있어요." : "숫자·부호는 아직 직접 그리기만 지원해요."}
        </Notice>
      )}

      {tweakable && inFont && (
        <>
          <div role="group" aria-label="편집 방식" className="flex gap-1 rounded-full bg-subtle p-1">
            <button type="button" aria-pressed={mode === "slider"} onClick={() => setMode("slider")} className={`${tab} ${mode === "slider" ? "bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "hover:bg-stage"}`}>
              슬라이더
            </button>
            <button type="button" aria-pressed={mode === "xform"} onClick={() => setMode("xform")} className={`${tab} ${mode === "xform" ? "bg-bg shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "hover:bg-stage"}`}>
              끌어서 바꾸기
            </button>
          </div>

          {mode === "slider" ? (
            <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="프리셋">
                {TWEAK_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={pressedPreset(p.values)}
                    onClick={() => setValues({ ...NO_TWEAK, ...p.values })}
                    className={`h-10 rounded-full border px-3 text-13 font-semibold transition-colors ${pressedPreset(p.values) ? "border-ink bg-ink text-bg" : "border-line bg-subtle hover:border-ink"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2.5">
                {TWEAK_FIELDS.map((f) => {
                  const [lo, hi] = [clampTweakValue(f.key, -1e9), clampTweakValue(f.key, 1e9)];
                  const changed = values[f.key] !== NO_TWEAK[f.key];
                  return (
                    <label key={f.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-13">
                      <span className={changed ? "font-extrabold text-accent" : "font-semibold"}>{f.label}</span>
                      <input
                        type="range"
                        min={lo}
                        max={hi}
                        step={f.step}
                        value={values[f.key]}
                        onChange={(e) => set(f.key, Number(e.target.value))}
                        className="ds-range"
                        style={{ "--fill": `${((values[f.key] - lo) / (hi - lo)) * 100}%` } as CSSProperties}
                      />
                      <output className="text-right font-mono text-12 text-muted">{fmt(f.key, values[f.key])}</output>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-13 leading-normal text-muted">글자 둘레의 네모 점을 끌면 크기와 가로·세로가 바뀌고, 안쪽을 끌면 옮겨져요. 윤곽을 늘이고 옮기는 방식이라 선이 뭉개지지 않아요.</p>
              <p className="rounded-xl bg-subtle px-3 py-2 font-mono text-12 text-muted">
                크기 {values.scale}% · 가로 {values.width}% · 세로 {values.height}% · 이동 {values.tx}, {values.ty}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setValues((v) => ({ ...v, tx: 0, ty: 0 }))} className="h-10 rounded-full border border-line bg-subtle px-3 text-13 font-semibold hover:border-ink">
                  가운데로
                </button>
                <button type="button" onClick={() => setValues((v) => ({ ...v, scale: 100, width: 100, height: 100 }))} className="h-10 rounded-full border border-line bg-subtle px-3 text-13 font-semibold hover:border-ink">
                  크기 100%
                </button>
              </div>
            </div>
          )}
          {values.pull > saved.pull ? <p className="text-12 text-muted">굵기는 저장하면 정확히 반영돼요. 지금 보이는 것은 어림이에요.</p> : values.pull < saved.pull ? <p className="text-12 text-muted">가늘게 하는 모양은 저장하면 보여요.</p> : null}
        </>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <p role="status" className={notice ? "text-13 font-bold text-good" : "sr-only"}>
        {notice}
      </p>

      <div className="flex gap-2">
        {tweakable && inFont && (
          <>
            <button
              type="button"
              disabled={busy || isNoTweak(values)}
              onClick={() => setValues(NO_TWEAK)}
              className="h-11 flex-1 rounded-full border-[1.5px] border-edge bg-bg px-3 text-14 font-bold hover:border-ink disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted"
            >
              원래대로
            </button>
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => void send(values, mode === "xform" ? "끌어서 바꾸기" : "슬라이더")}
              className="h-11 flex-[1.5] rounded-full bg-ink px-3 text-14 font-bold text-bg hover:bg-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            >
              {busy ? "저장하는 중" : "저장하고 폰트에 넣기"}
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => setDrawing(true)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-edge bg-bg px-3 text-14 font-bold hover:border-ink hover:bg-subtle disabled:cursor-not-allowed disabled:text-muted"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
          <path d="M3 13l.6-2.7 7.2-7.2a1.4 1.4 0 0 1 2 2l-7.2 7.2zM9.6 4.3l2 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        직접 그리기{edited ? " (고친 적 있어요)" : ""}
      </button>

      {tweakable && inFont && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <span className="text-12 font-bold text-muted">조정 기록 · 최대 100개</span>
          <div className="rounded-xl border-[1.5px] border-good bg-subtle px-3 py-2 text-13">
            <b className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-good" />현재 버전</b> <span className="text-muted">지금 폰트에 들어 있는 것</span>
            <div className="text-12 text-muted">{summary(isNoTweak(saved) ? null : saved)}</div>
          </div>
          {history5.slice(1, 5).map((h, i) => (
            <div key={h.at} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-13">
              <div className="min-w-0 flex-1">
                <div className="font-bold">
                  v{history.length - 1 - i} · {clock(h.at)}
                </div>
                <div className="truncate text-12 text-muted">{summary(h.tweak)}</div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send(h.tweak, `v${history.length - 1 - i}로 되돌림`)}
                className="h-10 shrink-0 rounded-full border border-edge px-3 text-13 font-bold hover:border-ink disabled:text-muted"
              >
                되돌리기
              </button>
            </div>
          ))}
          {history.length === 0 && <span className="text-12 text-muted">아직 손본 적이 없어요.</span>}
        </div>
      )}

      {drawing && (
        <GlyphEditor
          key={char}
          title={`'${char}' 직접 그리기`}
          ghostLabel="AI가 만든 글자 겹쳐 보기"
          load={async (): Promise<EditorSource> => {
            const s = await api.projectGlyphEditSource(view.id, char);
            return { image: s.image, ghost: s.original, guides: s.guides, size: s.size };
          }}
          onSave={async (png) => {
            await api.saveProjectGlyphEdit(view.id, { char, image: png });
            await sleep(700);
            setDrawing(false);
            onSaved();
            tell("그린 글자를 폰트에 넣었어요.");
          }}
          saveLabel="저장하고 폰트에 넣기"
          onRevert={
            edited
              ? async () => {
                  await api.saveProjectGlyphEdit(view.id, { char, image: null });
                  await sleep(700);
                  setDrawing(false);
                  onSaved();
                  tell("직접 고친 것을 지우고 AI가 그린 모양으로 돌렸어요.");
                }
              : undefined
          }
          onClose={() => setDrawing(false)}
        />
      )}
    </div>
  );
});
