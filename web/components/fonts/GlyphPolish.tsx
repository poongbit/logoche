"use client";

// 글자 다듬기 편집기(11/4). 스튜디오 글자 표에서 고른 글자 한 자를 사용자가 직접 손본다: 슬라이더 · 이미지처럼 끌어 바꾸기(변형) · 그림판으로 직접 그리기.
// AI가 정한 값 위에 사용자가 더한 조정만 저장한다(lib/types GlyphTweak). 저장하면 서버가 지금 폰트 파일에서 그 글자만 바로 바꿔 끼우고 제작 기록(사용자 조정)에 남긴다.
// 미리보기는 브라우저 안에서 CSS로 그린다(서버를 부르지 않는다). 폰트 파일에 이미 들어 있는 저장값에서 지금 값으로 가는 차이만 건다(lib/tweak.ts deltaTransform).
// 굵기만은 윤곽을 옮기는 일이라 CSS로 어림하고(늘리는 쪽만), 저장하면 정확히 반영된다.
// 11/6(피그마 슬라이더 563:590 · 564:626, 끌어서 바꾸기 573:762 · 575:801): 데스크톱 오른쪽 서랍 560px, 휴대폰 아래에서 올라오는 창.
//  - 모드 탭은 무대 위(누른 탭이 손가락 밑에서 도망가지 않게). 끌어서 바꾸기에서는 무대가 남는 높이만큼 커지고 글자도 같이 커진다(세밀하게 끌기).
//  - 아래 버튼 줄(저장 · 모든 글자에 적용 · 직접 그리기)은 서랍 바닥에 고정해 두 모드에서 같은 자리. '원래대로' 버튼은 지웠다(프리셋 '원래대로'와 같은 일).
//  - 닫기: X · Esc · (데스크톱) 바깥 누르기. 휴대폰은 위 손잡이·X로만 닫고, 무대 안에서 끌어도 닫히지 않는다.

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { PrimaryButton, SelectChip, TextButton } from "@/components/ds";
import type { EditorSource } from "@/components/GlyphEditor";
import { InlineConfirm } from "@/components/InlineConfirm";
import { ModalPortal } from "@/components/ModalPortal";
import { CloseButton, backdropMotion, sheetMotion, usePresence } from "@/components/fonts/shared";
import { Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import { NO_PART, NO_TWEAK, PART_KEYS, PART_LABEL, TWEAK_FIELDS, TWEAK_PRESETS, CUT_RANGE, clampPartValue, clampTweakValue, cleanTweak, deltaTransform, isNoPart, isNoTweak, matString, outerMatrix, partMatrix, sameTweak, strokeFor } from "@/lib/tweak";
import type { CutKey, EditTweak, GlyphParts, GlyphTweak, PartKey, PartValues, ProjectView } from "@/lib/types";

// 그림판(934줄)은 "직접 그리기"를 누를 때만 받는다(11/4 성능 점검)
const GlyphEditor = dynamic(() => import("@/components/GlyphEditor").then((m) => m.GlyphEditor), { ssr: false });

const ADVANCE = 0.946; // 한글 글자 폭(em). 폰트 hmtx와 같다
const GLYPH_OF_STAGE = 0.646; // 글자 크기 = 무대 높이 × 이 값(피그마 260 → 168, 446 → 288)
const same = sameTweak;
const PART_COLOR: Record<PartKey, string> = { cho: "#e5484d", jung: "#3b6fe0", jong: "#2da05a" }; // 부분 나누기에서 초성 빨강 · 중성 파랑 · 종성 초록
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 64rem)").matches;

const fmt = (key: keyof GlyphTweak, v: number) => {
  const f = TWEAK_FIELDS.find((x) => x.key === key)!;
  return `${f.signed && v > 0 ? "+" : ""}${v}${f.unit}`;
};

/** 슬라이더 오른쪽 숫자 칸: 직접 입력해 고친다. 입력하는 동안은 글자 그대로 두고, Enter나 칸을 벗어날 때 범위에 맞춰 반영한다. */
function NumberBox({ value, min, max, step, unit, label, onCommit }: { value: number; min: number; max: number; step: number; unit: string; label: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  function commit() {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) return setText(String(value));
    onCommit(n);
    setText(String(Math.round(Math.min(max, Math.max(min, n)))));
  }
  return (
    <span className="flex h-[2.125rem] w-full items-center rounded-[0.625rem] border-[1.5px] border-border-strong bg-bg-canvas pr-2.5 focus-within:border-2 focus-within:border-border-active">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="h-full w-full min-w-0 bg-transparent text-right text-sm font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {unit && (
        <span aria-hidden className="shrink-0 text-sm font-medium">
          {unit}
        </span>
      )}
    </span>
  );
}

/** 기본값과 다른 항목만 한 줄로 */
function summary(t: EditTweak | null): string {
  if (!t || isNoTweak(t)) return "AI가 정한 값";
  const c = cleanTweak(t);
  const parts = PART_KEYS.filter((k) => c.parts?.[k]).map((k) => `${PART_LABEL[k]} 고침`);
  return [...TWEAK_FIELDS.filter((f) => c[f.key] !== NO_TWEAK[f.key]).map((f) => `${f.label} ${fmt(f.key, c[f.key])}`), ...parts].join(" · ");
}

type Mode = "slider" | "xform";
type Drag = { handle: string; x: number; y: number; start: EditTweak; w: number; h: number; size: number; part: PartKey | null }; // part: 부분을 끄는 중이면 그 부분(11/11)
type CutDrag = { id: CutKey; axis: "x" | "y"; x: number; y: number; start: number; size: number };

/** 작은 동작 칩('가운데로' · '크기 100%'): 고르는 칩이 아니라 누르면 바로 되는 단추라 체크가 없다 */
function ActionChip({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-border-default bg-bg-canvas px-3 text-sm font-medium transition-[background-color,border-color,transform] duration-(--dur-fast) ease-standard hover:border-border-strong hover:bg-bg-surface motion-safe:active:scale-[0.97]"
    >
      {children}
    </button>
  );
}

export const GlyphPolish = memo(function GlyphPolish({
  view,
  char,
  family,
  inFont,
  tweakable,
  onSaved,
  onClose,
}: {
  view: ProjectView;
  char: string;
  family: string;
  inFont: boolean;
  tweakable: boolean; // 한글 완성형이어야 조정을 건다(숫자·부호는 아직)
  onSaved: () => void;
  /** 닫히는 모션(200ms)이 끝난 뒤 부른다 */
  onClose: () => void;
}) {
  const saved = view.tweaks[char] ?? NO_TWEAK;
  const savedKey = JSON.stringify(saved);
  const [values, setValues] = useState<EditTweak>(saved);
  const [mode, setMode] = useState<Mode>("slider");
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null); // 저장했다는 알림(몇 초 뒤 사라진다)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function tell(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  // 열고 닫기
  const [open, setOpen] = useState(true);
  const { mounted, shown } = usePresence(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestClose = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!mounted) onClose();
  }, [mounted, onClose]);
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    if (drawing) return; // 그림판이 열려 있으면 Esc는 그림판 몫
    const esc = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drawing, requestClose]);

  // 무대 크기 → 글자 크기
  const stageRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const S = Math.round(stage ? Math.max(80, Math.min(stage.h * GLYPH_OF_STAGE, stage.w * 0.6)) : 168);

  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const cutDrag = useRef<CutDrag | null>(null);

  // 11/11 부분 나누기: 글자를 초성·중성·종성 덩어리로 나눠 따로 끌어 바꾼다. 기본 꺼짐.
  // 부분 조정이 있으면(저장된 것 포함) 끄더라도 글자를 덩어리 SVG로 그려 보여 준다(폰트 글자에는 부분 조정이 안 보이므로 저장 전에도 같게).
  const [split, setSplit] = useState(false);
  const [selected, setSelected] = useState<PartKey | null>(null);
  const [partsData, setPartsData] = useState<{ data: GlyphParts; cuts: Partial<Record<CutKey, number>> } | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const selRef = useRef<SVGGElement>(null);
  const allRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 저장값이 바뀌면(저장·되돌리기 뒤 화면을 다시 받았을 때) 편집값도 맞춘다(그리는 도중에 맞추는 React 권장 방식)
  const [seenKey, setSeenKey] = useState(savedKey);
  if (seenKey !== savedKey) {
    setSeenKey(savedKey);
    setValues(saved);
  }

  const dirty = !same(values, saved);
  const hasParts = PART_KEYS.some((k) => !isNoPart(values.parts?.[k]));
  const edited = view.edited.includes(char);
  const canTweak = tweakable && inFont;
  const needParts = canTweak && (split || hasParts);
  const cutsKey = JSON.stringify(values.cuts ?? {});
  const hadParts = partsData !== null;
  useEffect(() => {
    if (!needParts) return;
    let dead = false;
    const timer = setTimeout(
      async () => {
        try {
          const data = await api.projectGlyphParts(view.id, char, JSON.parse(cutsKey));
          if (dead) return;
          setPartsData({ data, cuts: JSON.parse(cutsKey) });
          setPartsError(null);
        } catch (err) {
          if (!dead) setPartsError(errorMessage(err));
        }
      },
      hadParts ? 150 : 0, // 경계선을 끄는 동안 서버를 덜 부른다
    );
    return () => {
      dead = true;
      clearTimeout(timer);
    };
  }, [needParts, view.id, char, cutsKey, savedKey, edited, hadParts]);
  const splitActive = split && mode === "xform" && canTweak;
  const useSvg = needParts && partsData !== null;
  const selPart = splitActive && selected && partsData?.data.parts[selected] ? selected : null;

  // 변형 모드의 네모: 지금 그려진 글자의 둘레
  useLayoutEffect(() => {
    if (mode !== "xform") return;
    const s = stageRef.current?.getBoundingClientRect();
    if (!s) return;
    let next: { left: number; top: number; width: number; height: number } | null = null;
    if (useSvg) {
      // 덩어리 SVG: 고른 부분(없으면 글자 전체)의 실제 둘레. 부분 나누기에서 아무것도 안 골랐으면 네모를 숨긴다.
      const g = splitActive && !selPart ? undefined : (selPart ? selRef.current : allRef.current)?.getBoundingClientRect();
      if (g) next = { left: g.left - s.left, top: g.top - s.top, width: g.width, height: g.height };
    } else {
      const g = glyphRef.current?.getBoundingClientRect();
      if (g) next = { left: g.left - s.left + g.width * 0.1, top: g.top - s.top + g.height * 0.1, width: g.width * 0.8, height: g.height * 0.8 };
    }
    setBox(next);
  }, [mode, values, S, useSvg, splitActive, selPart, partsData]);

  function set(key: keyof GlyphTweak, v: number) {
    setValues((prev) => ({ ...prev, [key]: clampTweakValue(key, v) }));
  }

  async function send(tweak: EditTweak | null, note: string) {
    setBusy(true);
    setError(null);
    try {
      await api.saveGlyphTweak(view.id, { char, tweak: tweak && !isNoTweak(tweak) ? cleanTweak(tweak) : null, note });
      await sleep(700); // 엔진이 다른 형식(woff2 등) 파일을 다시 만드는 동안 잠깐 기다린다
      onSaved();
      tell(tweak && !isNoTweak(tweak) ? "저장했어요. 폰트에 넣었어요." : "원래 모양으로 돌렸어요.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // 지금 값을 모든 글자에 건다(표의 "*"). 따로 손본 글자는 그 글자 값이 우선이라 그대로이고, 폰트는 새로 만들어진다.
  async function applyAll() {
    setBusy(true);
    setError(null);
    try {
      // 이동은 글자마다 모양이 달라 전체에는 걸지 않는다. 굵기는 숫자 그대로가 아니라 “{char}”에서 달라진 획 두께의 비율로 건다(rel).
      // 부분 조정(초·중·종성)은 글자마다 모양이 달라 전체에도 걸지 않는다.
      const glyphOnly = { ...values, parts: undefined, cuts: undefined };
      const all = { ...glyphOnly, tx: 0, ty: 0 };
      await api.saveGlyphTweak(view.id, { char: "*", tweak: isNoTweak(all) ? null : values.pull !== 0 ? { ...all, rel: char } : all, note: `모든 글자에 적용 (기준 '${char}')` });
      setConfirmAll(false);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // 변형: 네모 점을 끌어 크기·가로·세로, 안쪽을 끌어 이동
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation(); // 무대 바탕을 눌러 선택을 푸는 동작이 같이 일어나지 않게
    const handle = (e.target as HTMLElement).dataset.h ?? "move";
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = { handle, x: e.clientX, y: e.clientY, start: values, w: rect.width, h: rect.height, size: S, part: selPart };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onPointerMove(e: ReactPointerEvent<Element>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const k = 1000 / d.size; // px → 글꼴 단위(글자가 클수록 같은 손 움직임에 덜 바뀐다)
    const sx = d.handle.includes("e") ? 1 : -1;
    const sy = d.handle.includes("s") ? 1 : -1;
    if (d.part) {
      // 부분(초성·중성·종성) 하나를 끈다
      const from: PartValues = d.start.parts?.[d.part] ?? NO_PART;
      const p = { ...from };
      if (d.handle === "move") {
        p.tx = clampPartValue("tx", from.tx + dx * k);
        p.ty = clampPartValue("ty", from.ty - dy * k);
      } else if (d.handle.length === 2) {
        p.scale = clampPartValue("scale", from.scale * (1 + (sx * dx + sy * dy) / (d.w + d.h)));
      } else if (d.handle === "e" || d.handle === "w") {
        p.width = clampPartValue("width", from.width * (1 + ((d.handle === "e" ? 1 : -1) * dx * 2) / d.w));
      } else {
        p.height = clampPartValue("height", from.height * (1 + ((d.handle === "s" ? 1 : -1) * dy * 2) / d.h));
      }
      return setValues({ ...d.start, parts: { ...d.start.parts, [d.part]: p } });
    }
    const next = { ...d.start };
    if (d.handle === "move") {
      next.tx = clampTweakValue("tx", d.start.tx + dx * k);
      next.ty = clampTweakValue("ty", d.start.ty - dy * k);
    } else if (d.handle.length === 2) {
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
    cutDrag.current = null;
  };

  // 부분 나누기: 덩어리를 누르면 고르고 바로 끌 수 있다(고른 부분을 다시 누르면 그대로 끌기). 빈 곳을 누르면 선택이 풀린다.
  function onPartDown(e: ReactPointerEvent<SVGGElement>, key: PartKey) {
    if (!splitActive) return;
    e.stopPropagation();
    e.preventDefault();
    setSelected(key);
    drag.current = { handle: "move", x: e.clientX, y: e.clientY, start: values, w: 1, h: 1, size: S, part: key };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  // 경계선 끌기: 자동으로 찾은 경계를 사용자가 옮긴다(값은 폰트 단위, 서버가 새 경계로 다시 나눈다)
  function onCutDown(e: ReactPointerEvent<SVGLineElement>, id: CutKey, axis: "x" | "y") {
    e.stopPropagation();
    e.preventDefault();
    cutDrag.current = { id, axis, x: e.clientX, y: e.clientY, start: values.cuts?.[id] ?? 0, size: S };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onCutMove(e: ReactPointerEvent<SVGLineElement>) {
    const d = cutDrag.current;
    if (!d) return;
    const k = 1000 / d.size;
    const v = d.axis === "x" ? d.start + (e.clientX - d.x) * k : d.start - (e.clientY - d.y) * k; // 가로선은 위가 +
    const next = Math.round(Math.min(CUT_RANGE[1], Math.max(CUT_RANGE[0], v)));
    setValues((prev) => ({ ...prev, cuts: { ...prev.cuts, [d.id]: next } }));
  }

  // 가이드선: 글자 칸 가운데와 위아래 잉크 자리(피그마 '윗선 · 가운데 · 밑선')
  const centerY = stage ? stage.h / 2 : 130;
  const lines = [
    { y: centerY - 0.465 * S, name: "윗선" },
    { y: centerY, name: "가운데" },
    { y: centerY + 0.455 * S, name: "밑선" },
  ];
  const stroke = strokeFor(saved.pull, values.pull, S);
  const glyphStyle: CSSProperties = {
    fontFamily: inFont ? family : GLYPH_FONT_STACK,
    fontSize: S,
    lineHeight: 1,
    width: S * ADVANCE,
    height: S,
    textAlign: "center",
    transformOrigin: "50% 50%",
    transform: inFont ? deltaTransform(saved, values, S) : undefined,
    WebkitTextStroke: inFont ? `${stroke.width}px ${stroke.thin ? "var(--color-bg-surface-strong)" : "currentColor"}` : undefined, // 줄일 때는 무대 바탕색 선으로 깎는다
    color: inFont ? undefined : "var(--edge)",
  };

  const pressedPreset = (v: Partial<GlyphTweak>) => same({ ...values, parts: undefined, cuts: undefined }, { ...NO_TWEAK, ...v });
  const sub = edited ? "직접 그린 글자예요" : isNoTweak(saved) ? "AI가 정한 값 · 아직 고치지 않았어요" : `고친 값 · ${summary(saved)}`;
  const big = canTweak && mode === "xform";

  if (!mounted) return null;
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50">
        <div aria-hidden className={`absolute inset-0 bg-black/40 ${backdropMotion(shown)}`} onClick={() => isDesktop() && requestClose()} />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="polish-title"
          tabIndex={-1}
          className={`absolute flex flex-col bg-bg-canvas outline-none max-lg:inset-x-0 max-lg:top-9 max-lg:bottom-0 max-lg:rounded-t-[1.25rem] lg:inset-y-0 lg:right-0 lg:w-[35rem] lg:shadow-[-8px_0_32px_rgba(0,0,0,0.18)] ${sheetMotion(shown, "drawer")}`}
        >
          {/* 휴대폰 위 손잡이: 누르면 닫는다(무대 안 끌기로는 닫히지 않는다) */}
          <button type="button" tabIndex={-1} aria-hidden onClick={requestClose} className="grid h-6 w-full shrink-0 place-items-center pt-3 lg:hidden">
            <span className="h-1 w-10 rounded-sm bg-border-default" />
          </button>

          <div className="flex shrink-0 items-start gap-3 px-4 pt-3 lg:px-8 lg:pt-7">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id="polish-title" className="font-display text-2xl leading-[1.3] tracking-[-0.03em] lg:text-[1.875rem]">
                ‘{char}’ 다듬기
              </h2>
              <p className="truncate text-13 text-text-secondary max-lg:hidden">{sub}</p>
            </div>
            <CloseButton onClick={requestClose} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4 lg:gap-5 lg:px-8 lg:pt-6 lg:pb-5">
            {canTweak && (
              <div role="group" aria-label="편집 방식" className="grid h-10 shrink-0 grid-cols-2 rounded-full border-[1.5px] border-border-strong lg:h-11">
                {(
                  [
                    ["slider", "슬라이더"],
                    ["xform", "끌어서 바꾸기"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={`-m-[1.5px] rounded-full text-sm transition-colors duration-(--dur-fast) ${mode === m ? "border-2 border-border-active bg-bg-surface-strong font-bold" : "font-medium text-text-secondary hover:text-text-primary"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div
              ref={stageRef}
              onPointerDown={() => splitActive && setSelected(null)}
              className={`relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-bg-surface-strong ${big ? `min-h-[16.25rem] flex-1 ${splitActive ? "lg:min-h-[13rem]" : "lg:min-h-[20rem]"}` : "h-[11.25rem] lg:h-[16.25rem]"}`}
            >
              {/* 가이드선: HTML로 그려 라벨 글자가 늘어나지 않게 한다 */}
              {lines.map((l) => (
                <div key={l.name} aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-border-strong" style={{ top: l.y }}>
                  <span className="absolute -top-4 left-2.5 text-[0.6875rem] leading-none text-text-tertiary max-lg:hidden">{l.name}</span>
                </div>
              ))}
              {useSvg && partsData ? (
                // 부분 조정이 있거나 부분 나누기를 켰을 때: 글자를 초·중·종성 덩어리 SVG로 그린다(엔진이 저장할 때 거는 변환과 같은 순서: 부분 → 글자 전체 → 너비·기울기·자간)
                <svg
                  ref={svgRef}
                  role="img"
                  aria-label={`${char} 미리보기`}
                  viewBox={`0 0 ${partsData.data.advance} 1000`}
                  width={(S * partsData.data.advance) / 1000}
                  height={S}
                  className="relative z-[1] block touch-none overflow-visible select-none"
                >
                  <g transform={matString(outerMatrix(partsData.data, values))}>
                    <g ref={allRef}>
                      {PART_KEYS.map((k) => {
                        const part = partsData.data.parts[k];
                        if (!part) return null;
                        const isSel = selPart === k;
                        const dim = splitActive && selPart !== null && !isSel;
                        return (
                          <g
                            key={k}
                            ref={isSel ? selRef : undefined}
                            transform={matString(partMatrix(values.parts?.[k], part.bounds))}
                            onPointerDown={(e) => onPartDown(e, k)}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            style={{ cursor: splitActive ? (isSel ? "move" : "pointer") : undefined, pointerEvents: splitActive ? "auto" : "none" }}
                          >
                            <title>{`${PART_LABEL[k]} ${partsData.data.labels[k]}`}</title>
                            <path
                              d={part.d}
                              fill={splitActive ? PART_COLOR[k] : "currentColor"}
                              fillOpacity={dim ? 0.3 : 1}
                              stroke={stroke.width > 0.05 ? (stroke.thin ? "var(--color-bg-surface-strong)" : "currentColor") : "none"}
                              strokeWidth={stroke.width}
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                            />
                            {splitActive && <path d={part.d} fill="none" stroke="transparent" strokeWidth={36} vectorEffect="non-scaling-stroke" pointerEvents="stroke" />}
                          </g>
                        );
                      })}
                    </g>
                    {splitActive &&
                      !selPart && // 부분을 골랐을 때는 선을 숨긴다: 네모 점과 겹쳐 잘못 잡히고, 경계를 고치는 일과 부분을 끄는 일이 섞이지 않게
                      partsData.data.lines.map((l) => {
                        const pos = l.pos + (values.cuts?.[l.id] ?? 0) - (partsData.cuts[l.id] ?? 0); // 서버가 새 경계로 나누기 전에도 선이 손을 따라온다
                        const [x1, y1, x2, y2] = l.axis === "x" ? [pos, l.lo, pos, l.hi] : [l.lo, pos, l.hi, pos];
                        return (
                          <g key={l.id}>
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="transparent"
                              strokeWidth={30}
                              vectorEffect="non-scaling-stroke"
                              pointerEvents="stroke"
                              style={{ cursor: l.axis === "x" ? "col-resize" : "row-resize" }}
                              onPointerDown={(e) => onCutDown(e, l.id, l.axis)}
                              onPointerMove={onCutMove}
                              onPointerUp={endDrag}
                              onPointerCancel={endDrag}
                            >
                              <title>경계선: 끌어서 초성·중성·종성 나뉜 자리를 고쳐요</title>
                            </line>
                          </g>
                        );
                      })}
                  </g>
                </svg>
              ) : (
                <span ref={glyphRef} role="img" className="relative z-[1] block select-none" style={glyphStyle} aria-label={`${char} 미리보기`}>
                  {char}
                </span>
              )}
              {big && box && (
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`absolute z-[2] touch-none border-[1.5px] border-border-active ${selPart ? "pointer-events-none" : "cursor-move"}`}
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
                    // 보이는 점은 14px, 누르는 범위는 44px(after:-inset-[15px])
                    <i
                      key={h as string}
                      data-h={h}
                      className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-[3px] border-[1.5px] border-border-active bg-bg-canvas after:absolute after:-inset-[15px] after:content-['']"
                      style={{ left: `${x}%`, top: `${y}%`, cursor: `${cur}-resize` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {!inFont && <Notice tone="info">{tweakable ? "이 글자는 폰트에 아직 없어요. 직접 그려서 채울 수 있어요." : "숫자·부호는 아직 직접 그리기만 지원해요."}</Notice>}
            {inFont && !tweakable && <Notice tone="info">숫자·부호·영문은 아직 직접 그리기만 지원해요.</Notice>}

            {canTweak &&
              (mode === "slider" ? (
                <>
                  {/* 휴대폰은 옆으로 미는 줄(564:626), 데스크톱은 일곱 개가 서랍 폭 안에 한 줄로(스크롤 없음, 563:590) */}
                  <div role="group" aria-label="프리셋" className="-mx-4 flex shrink-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:gap-1 lg:overflow-visible lg:px-0">
                    {TWEAK_PRESETS.map((p) => (
                      <SelectChip key={p.label} size="sm" selected={pressedPreset(p.values)} onClick={() => setValues({ ...NO_TWEAK, ...p.values, ...(p.label === "원래대로" ? {} : { parts: values.parts, cuts: values.cuts }) })}>
                        {p.label}
                      </SelectChip>
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5 lg:gap-2.5">
                    {TWEAK_FIELDS.map((f) => {
                      const [lo, hi] = [clampTweakValue(f.key, -1e9), clampTweakValue(f.key, 1e9)];
                      const changed = values[f.key] !== NO_TWEAK[f.key];
                      return (
                        <label key={f.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.875rem] items-center gap-x-3 text-sm lg:grid-cols-[5rem_minmax(0,1fr)_4.75rem] lg:gap-x-6">
                          <span className={changed ? "font-extrabold" : "font-bold"}>
                            {f.label}
                            {changed && <span className="sr-only"> (고침)</span>}
                          </span>
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
                          <NumberBox value={values[f.key]} min={lo} max={hi} step={f.step} unit={f.unit} label={`${f.label} 값`} onCommit={(n) => set(f.key, n)} />
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="flex shrink-0 flex-col gap-3 lg:gap-4">
                  <p className="text-13 leading-5 text-text-secondary">
                    {splitActive ? (
                      <>
                        {selPart ? (
                          <span className="block">네모 점이나 안쪽을 끌어요. 빈 곳을 누르면 선택이 풀려요.</span>
                        ) : (
                          <span className="block">덩어리를 눌러 고르면 그 부분만 끌 수 있어요. 점선이 어긋났으면 점선을 끌어 경계를 고쳐요.</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="block">글자 둘레의 네모 점을 끌면 크기와 가로·세로가 바뀌고, 안쪽을 끌면 옮겨져요.</span>
                        <span className="block">굵기와 기울기는 ‘슬라이더’에서 바꿔요.</span>
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SelectChip
                      size="sm"
                      selected={split}
                      onClick={() => {
                        setSplit((v) => !v);
                        setSelected(null);
                      }}
                    >
                      부분 나누기
                    </SelectChip>
                    {splitActive &&
                      partsData &&
                      PART_KEYS.map(
                        (k) =>
                          partsData.data.parts[k] && (
                            <SelectChip key={k} size="sm" selected={selPart === k} onClick={() => setSelected(selPart === k ? null : k)}>
                              <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PART_COLOR[k] }} />
                              {PART_LABEL[k]} {partsData.data.labels[k]}
                              {!isNoPart(values.parts?.[k]) && <span className="sr-only"> (고침)</span>}
                            </SelectChip>
                          ),
                      )}
                  </div>
                  {split && !partsData && <p className="text-13 text-text-secondary">{partsError ?? "글자를 나누는 중이에요…"}</p>}
                  {split && partsData && partsError && <Notice tone="error">{partsError}</Notice>}
                  <dl className="grid grid-cols-4 rounded-[0.875rem] bg-bg-surface py-3.5">
                    {(
                      [
                        ["크기", `${selPart ? (values.parts?.[selPart] ?? NO_PART).scale : values.scale}%`],
                        ["가로", `${selPart ? (values.parts?.[selPart] ?? NO_PART).width : values.width}%`],
                        ["세로", `${selPart ? (values.parts?.[selPart] ?? NO_PART).height : values.height}%`],
                        ["이동", selPart ? `${(values.parts?.[selPart] ?? NO_PART).tx}, ${(values.parts?.[selPart] ?? NO_PART).ty}` : `${values.tx}, ${values.ty}`],
                      ] as const
                    ).map(([k, v], i) => (
                      <div key={k} className={`flex flex-col gap-1 px-3.5 lg:px-5 ${i ? "border-l border-border-default" : ""}`}>
                        <dt className="text-xs text-text-secondary">{k}</dt>
                        <dd className="text-base font-bold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex gap-1.5">
                    {selPart ? (
                      <>
                        <ActionChip onClick={() => setValues((v) => ({ ...v, parts: { ...v.parts, [selPart]: { ...(v.parts?.[selPart] ?? NO_PART), tx: 0, ty: 0 } } }))}>제자리로</ActionChip>
                        <ActionChip onClick={() => setValues((v) => ({ ...v, parts: { ...v.parts, [selPart]: { ...(v.parts?.[selPart] ?? NO_PART), scale: 100, width: 100, height: 100 } } }))}>크기 100%</ActionChip>
                        <ActionChip onClick={() => setValues((v) => ({ ...v, parts: { ...v.parts, [selPart]: NO_PART } }))}>이 부분 되돌리기</ActionChip>
                      </>
                    ) : (
                      <>
                        <ActionChip onClick={() => setValues((v) => ({ ...v, tx: 0, ty: 0 }))}>가운데로</ActionChip>
                        <ActionChip onClick={() => setValues((v) => ({ ...v, scale: 100, width: 100, height: 100 }))}>크기 100%</ActionChip>
                      </>
                    )}
                  </div>
                </div>
              ))}
            {canTweak && values.pull !== saved.pull && <p className="text-xs text-text-secondary">굵기는 저장하면 정확히 반영돼요. 지금 보이는 것은 어림이에요.</p>}
          </div>

          {/* 아래 버튼 줄: 두 모드에서 같은 자리(서랍 바닥에 고정) */}
          <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:px-8 lg:pb-8">
            <div className="flex flex-col gap-3 pt-4 lg:border-t lg:border-border-default lg:pt-5">
              {error && <Notice tone="error">{error}</Notice>}
              <p role="status" className={notice ? "text-13 font-bold text-text-success" : "sr-only"}>
                {notice}
              </p>
              {confirmAll && (
                <InlineConfirm label="모든 글자에 적용 확인" className="flex flex-col gap-3 rounded-[0.875rem] border-2 border-border-active p-4 text-sm leading-normal">
                  <p>
                    <b>{summary(values)}</b>을(를) 폰트에 들어 있는 모든 글자에 걸어요. 굵기는 “{char}”에서 달라진 획 두께의 비율만큼 걸고, 가로·세로 이동은 빼요. 따로 손본 글자는 그 글자 값이 우선이에요. 폰트 파일만 새로 만들어져
                    몇 분 걸리고, 그동안 이 화면은 만드는 중으로 바뀌어요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void applyAll()}
                      className="h-10 flex-1 rounded-full bg-bg-inverse px-3 text-sm font-bold text-text-inverse hover:bg-bg-inverse-strong disabled:cursor-not-allowed disabled:bg-bg-disabled disabled:text-text-disabled"
                    >
                      {busy ? "시작하는 중" : "모두 적용"}
                    </button>
                    <button type="button" data-autofocus disabled={busy} onClick={() => setConfirmAll(false)} className="h-10 flex-1 rounded-full border-2 border-border-active px-3 text-sm font-bold hover:bg-bg-surface">
                      취소
                    </button>
                  </div>
                </InlineConfirm>
              )}
              {canTweak ? (
                <>
                  <PrimaryButton block disabled={busy || !dirty} onClick={() => void send(values, mode === "xform" ? "끌어서 바꾸기" : "슬라이더")}>
                    {busy ? "저장하는 중" : "저장하고 폰트에 넣기"}
                  </PrimaryButton>
                  <div className="flex justify-center gap-8 lg:gap-6">
                    <TextButton tone="primary" disabled={busy || isNoTweak({ ...values, parts: undefined, cuts: undefined })} onClick={() => setConfirmAll(true)} className="py-1.5! lg:py-2!">
                      <span className="lg:hidden">모든 글자에 적용</span>
                      <span className="max-lg:hidden">이 조정을 모든 글자에 적용</span>
                    </TextButton>
                    <TextButton tone="primary" disabled={busy} onClick={() => setDrawing(true)} className="py-1.5! lg:py-2!">
                      직접 그리기
                    </TextButton>
                  </div>
                  <p className="text-center text-13 text-text-secondary max-lg:hidden">저장하면 지금 폰트 파일에서 이 글자만 바로 바꿔 끼우고 제작 기록에 남겨요.</p>
                </>
              ) : (
                <PrimaryButton block disabled={busy} onClick={() => setDrawing(true)}>
                  {inFont ? "직접 그리기" : "직접 그려서 채우기"}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      </div>

      {drawing && (
        <GlyphEditor
          key={char}
          title={`‘${char}’ 직접 그리기`}
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
          revertLabel="AI가 만든 그대로 돌리기"
          onClose={() => setDrawing(false)}
        />
      )}
    </ModalPortal>
  );
});
