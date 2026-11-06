"use client";

// 글자 편집 화면(10/29 사용자 요청: 그림판처럼 고치기). 화면 3 참고 글자 '직접 고치기'와 화면 4 '글자 고치기'가 함께 쓴다.
// 그림은 흑백 두 값(잉크·바탕)만 둔다. 외곽선을 따는 그림이라 회색이 섞이면 획 가장자리가 흐려진다.
// 도구는 붓·지우개·직선·네모·동그라미·채우기·선택해 옮기기. 붓과 도형은 잉크나 바탕색으로 칠한다(X로 바꾼다).
// 되돌리기는 칠하기 한 번(누르고 뗄 때까지)이 한 단계다.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import { Notice, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import type { GlyphGuides } from "@/lib/types";

export interface EditorSource {
  image: string; // 흰 바탕 검은 글씨(data URL이나 주소)
  ghost?: string | null; // 겹쳐 볼 그림(AI가 만든 그대로, 기준 글자 밑그림 등)
  guides?: GlyphGuides | null;
  size?: number; // 정사각형 한 변. 없으면 512
  fit?: boolean; // true면 그림을 여백을 두고 가운데에 맞춰 넣는다(잉크에 맞춰 자른 참고 글자)
  blank?: boolean; // 빈 바탕에서 시작한다(image는 겹쳐 보기에만 쓴다)
}

interface GlyphEditorProps {
  title: string;
  ghostLabel?: string; // 겹쳐 보기 칸 이름
  load: () => Promise<EditorSource>;
  onSave: (png: string) => Promise<void>;
  saveLabel?: string;
  /** 고친 것을 지우고 AI가 만든 그대로 돌린다(화면 4에서 고친 적이 있는 글자) */
  onRevert?: () => Promise<void>;
  revertLabel?: string;
  onClose: () => void;
}

type Tool = "brush" | "eraser" | "line" | "rect" | "ellipse" | "fill" | "select";

const TOOLS: { key: Tool; label: string; key2: string; icon: ReactNode }[] = [
  {
    key: "brush",
    label: "붓",
    key2: "B",
    icon: <path d="M14.5 3.5l2 2-7.8 7.8-2.6.6.6-2.6zM4 16.5c1.2 0 2-.8 2-2" />,
  },
  { key: "eraser", label: "지우개", key2: "E", icon: <path d="M8 16.5h8M3.8 12.2l7-7a1.5 1.5 0 012.1 0l3 3a1.5 1.5 0 010 2.1l-6.3 6.2H7.5z" /> },
  { key: "line", label: "직선", key2: "L", icon: <path d="M4 16L16 4" /> },
  { key: "rect", label: "네모", key2: "R", icon: <rect x="3.5" y="5" width="13" height="10" rx="1" /> },
  { key: "ellipse", label: "동그라미", key2: "O", icon: <ellipse cx="10" cy="10" rx="6.5" ry="5.5" /> },
  { key: "fill", label: "채우기", key2: "G", icon: <path d="M4.5 9.5l5-5 6 6-5 5zM9.5 4.5l-2-2M16 13.5c0 1 .6 2 1.2 2.6M4.5 9.5h11" /> },
  { key: "select", label: "선택해 옮기기", key2: "M", icon: <path d="M3.5 3.5h3M9 3.5h2M13.5 3.5h3v3M16.5 9v2M16.5 13.5v3h-3M11 16.5H9M6.5 16.5h-3v-3M3.5 11V9M3.5 6.5v-3" /> },
];
const KEY_TOOLS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key2.toLowerCase(), t.key]));
const PAINT_TOOLS = new Set<Tool>(["brush", "eraser", "line"]);
const SHAPE_TOOLS = new Set<Tool>(["rect", "ellipse"]);
const HISTORY = 60;
const ZOOMS = [1, 1.5, 2, 3];

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Floating {
  x: number; // 지금 자리(왼쪽 위)
  y: number;
  w: number;
  h: number;
  data: Uint8Array; // w*h, 1 = 잉크
}

// ---------- 그림 연산(잉크 1 · 바탕 0) ----------

const union = (a: Rect | null, b: Rect): Rect => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b);

function clampRect(r: Rect, n: number): Rect | null {
  const out = { x0: Math.max(0, Math.floor(r.x0)), y0: Math.max(0, Math.floor(r.y0)), x1: Math.min(n, Math.ceil(r.x1)), y1: Math.min(n, Math.ceil(r.y1)) };
  return out.x1 > out.x0 && out.y1 > out.y0 ? out : null;
}

/** 두 점을 잇는 둥근 끝 획(반지름 r) */
function capsule(m: Uint8Array, n: number, ax: number, ay: number, bx: number, by: number, r: number, v: number): Rect | null {
  const box = clampRect({ x0: Math.min(ax, bx) - r, y0: Math.min(ay, by) - r, x1: Math.max(ax, bx) + r + 1, y1: Math.max(ay, by) + r + 1 }, n);
  if (!box) return null;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const r2 = r * r;
  for (let y = box.y0; y < box.y1; y++) {
    const py = y + 0.5;
    for (let x = box.x0; x < box.x1; x++) {
      const px = x + 0.5;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const qx = px - (ax + t * dx);
      const qy = py - (ay + t * dy);
      if (qx * qx + qy * qy <= r2) m[y * n + x] = v;
    }
  }
  return box;
}

/** 네모(채움 또는 두께 t인 테두리) */
function rectShape(m: Uint8Array, n: number, r: Rect, t: number | null, v: number): Rect | null {
  const box = clampRect(r, n);
  if (!box) return null;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if (t !== null && x >= r.x0 + t && x < r.x1 - t && y >= r.y0 + t && y < r.y1 - t) continue;
      m[y * n + x] = v;
    }
  }
  return box;
}

/** 동그라미(채움 또는 두께 t인 테두리) */
function ellipseShape(m: Uint8Array, n: number, r: Rect, t: number | null, v: number): Rect | null {
  const box = clampRect(r, n);
  if (!box) return null;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const rx = (r.x1 - r.x0) / 2;
  const ry = (r.y1 - r.y0) / 2;
  const irx = rx - (t ?? rx);
  const iry = ry - (t ?? ry);
  for (let y = box.y0; y < box.y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = box.x0; x < box.x1; x++) {
      const dx = x + 0.5 - cx;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
      if (t !== null && irx > 0 && iry > 0 && (dx * dx) / (irx * irx) + (dy * dy) / (iry * iry) < 1) continue;
      m[y * n + x] = v;
    }
  }
  return box;
}

/** 같은 색으로 이어진 곳을 칠한다(상하좌우로 이어진 곳) */
function floodFill(m: Uint8Array, n: number, sx: number, sy: number, v: number): Rect | null {
  const start = sy * n + sx;
  const target = m[start];
  if (target === v) return null;
  let box: Rect | null = null;
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (m[i] !== target) continue;
    const y = Math.floor(i / n);
    let x0 = i - y * n;
    while (x0 > 0 && m[y * n + x0 - 1] === target) x0--;
    let x1 = x0;
    while (x1 < n && m[y * n + x1] === target) {
      m[y * n + x1] = v;
      if (y > 0 && m[(y - 1) * n + x1] === target) stack.push((y - 1) * n + x1);
      if (y < n - 1 && m[(y + 1) * n + x1] === target) stack.push((y + 1) * n + x1);
      x1++;
    }
    box = union(box, { x0, y0: y, x1, y1: y + 1 });
  }
  return box;
}

function toPng(m: Uint8Array, n: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < m.length; i++) {
    const c = m[i] ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = c;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

async function loadMask(src: EditorSource, n: number): Promise<Uint8Array> {
  const m = new Uint8Array(n * n);
  if (src.blank) return m;
  const img = new Image();
  img.src = src.image;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, n, n);
  if (src.fit) {
    // 잉크에 맞춰 자른 그림: 긴 변을 72%로 맞춰 가운데에 둔다(가장자리에 닿으면 저장할 때 걸린다)
    const scale = (n * 0.72) / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
  } else {
    ctx.drawImage(img, 0, 0, n, n);
  }
  const data = ctx.getImageData(0, 0, n, n).data;
  for (let i = 0; i < m.length; i++) m[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114 < 128 ? 1 : 0;
  return m;
}

// ---------- 편집 화면 ----------

export function GlyphEditor({ title, ghostLabel = "원래 글자 겹쳐 보기", load, onSave, saveLabel = "저장하기", onRevert, revertLabel = "AI가 만든 그대로", onClose }: GlyphEditorProps) {
  const [source, setSource] = useState<EditorSource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const n = source?.size ?? 512;

  const mask = useRef<Uint8Array | null>(null);
  const initial = useRef<Uint8Array | null>(null);
  const undo = useRef<Uint8Array[]>([]);
  const redo = useRef<Uint8Array[]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 }); // 되돌리기 단추 상태
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [tool, setTool] = useState<Tool>("brush");
  const [ink, setInk] = useState(true); // 칠할 색: 잉크(검정) · 바탕(흰색)
  const [size, setSize] = useState(24);
  const [filled, setFilled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [showGuides, setShowGuides] = useState(true);
  const [showGhost, setShowGhost] = useState(false);

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ select: boolean; x0: number; y0: number; x1: number; y1: number } | null>(null); // 도형·선택 끄는 중
  const [floating, setFloating] = useState<Floating | null>(null);
  const [saving, setSaving] = useState<"save" | "revert" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floatRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const imageData = useRef<ImageData | null>(null);
  const stroke = useRef<{ x: number; y: number; moved: boolean; mode: "paint" | "shape" | "select" | "move"; grabX: number; grabY: number } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef(load);

  const changed = history.undo > 0;
  const color = tool === "eraser" ? 0 : ink ? 1 : 0;

  // ---------- 불러오기 ----------

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then(async (src) => {
        const m = await loadMask(src, src.size ?? 512);
        if (cancelled) return;
        mask.current = m;
        initial.current = m.slice();
        setSource(src);
        setShowGhost(!!src.blank && !!src.ghost);
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshPreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => mask.current && setPreviewUrl(toPng(mask.current, n)), 120);
  }, [n]);

  /** 그림의 dirty 칸만 캔버스에 다시 그린다(바탕은 투명이라 밑의 겹쳐 보기가 비친다). */
  const paint = useCallback(
    (dirty: Rect | null = { x0: 0, y0: 0, x1: n, y1: n }) => {
      const canvas = canvasRef.current;
      const m = mask.current;
      if (!canvas || !m || !dirty) return;
      const ctx = canvas.getContext("2d")!;
      if (!imageData.current || imageData.current.width !== n) imageData.current = ctx.createImageData(n, n);
      const data = imageData.current.data;
      for (let y = dirty.y0; y < dirty.y1; y++) {
        for (let x = dirty.x0; x < dirty.x1; x++) {
          const i = y * n + x;
          data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 17; // #111
          data[i * 4 + 3] = m[i] ? 255 : 0;
        }
      }
      ctx.putImageData(imageData.current, 0, 0, dirty.x0, dirty.y0, dirty.x1 - dirty.x0, dirty.y1 - dirty.y0);
    },
    [n],
  );

  useEffect(() => {
    if (!source) return;
    paint();
    refreshPreview();
  }, [source, paint, refreshPreview]);

  // 떠 있는 선택 영역을 위 캔버스에 그린다
  useEffect(() => {
    const canvas = floatRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, n, n);
    if (!floating) return;
    const img = ctx.createImageData(floating.w, floating.h);
    for (let i = 0; i < floating.data.length; i++) {
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 17;
      img.data[i * 4 + 3] = floating.data[i] ? 255 : 0;
    }
    ctx.putImageData(img, Math.round(floating.x), Math.round(floating.y));
  }, [floating, n]);

  // ---------- 되돌리기 ----------

  const pushHistory = useCallback(() => {
    if (!mask.current) return;
    undo.current.push(mask.current.slice());
    if (undo.current.length > HISTORY) undo.current.shift();
    redo.current = [];
    setHistory({ undo: undo.current.length, redo: 0 });
  }, []);

  /** 떠 있는 선택 영역을 그 자리에 내려놓는다(잉크만 붙인다) */
  const commitFloating = useCallback(() => {
    const m = mask.current;
    if (!floating || !m) return;
    const fx = Math.round(floating.x);
    const fy = Math.round(floating.y);
    for (let y = 0; y < floating.h; y++) {
      for (let x = 0; x < floating.w; x++) {
        const tx = fx + x;
        const ty = fy + y;
        if (floating.data[y * floating.w + x] && tx >= 0 && ty >= 0 && tx < n && ty < n) m[ty * n + tx] = 1;
      }
    }
    setFloating(null);
    paint({ x0: Math.max(0, fx), y0: Math.max(0, fy), x1: Math.min(n, fx + floating.w), y1: Math.min(n, fy + floating.h) });
    refreshPreview();
  }, [floating, n, paint, refreshPreview]);

  const step = useCallback(
    (from: typeof undo, to: typeof redo) => {
      if (!mask.current) return;
      setFloating(null); // 떠 있는 것은 들어 올리기 전 그림(되돌리기 한 단계)으로 돌아가며 사라진다
      const prev = from.current.pop();
      if (!prev) return;
      to.current.push(mask.current.slice());
      mask.current = prev;
      setHistory({ undo: undo.current.length, redo: redo.current.length });
      paint();
      refreshPreview();
    },
    [paint, refreshPreview],
  );
  const doUndo = useCallback(() => step(undo, redo), [step]);
  const doRedo = useCallback(() => step(redo, undo), [step]);

  function resetToStart() {
    if (!initial.current || !mask.current) return;
    commitFloating();
    pushHistory();
    mask.current = initial.current.slice();
    paint();
    refreshPreview();
  }

  function clearAll() {
    if (!mask.current) return;
    setFloating(null);
    pushHistory();
    mask.current.fill(0);
    paint();
    refreshPreview();
  }

  // ---------- 그리기 ----------

  function point(e: ReactPointerEvent | PointerEvent): { x: number; y: number } {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * n, y: ((e.clientY - rect.top) / rect.height) * n };
  }

  /** Shift를 누르면 직선은 45° 단위, 도형은 정사각형·정원 */
  function constrain(x0: number, y0: number, x1: number, y1: number, shift: boolean) {
    if (!shift) return { x1, y1 };
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (tool === "line") {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return { x1: x0 + Math.cos(angle) * len, y1: y0 + Math.sin(angle) * len };
    }
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x1: x0 + Math.sign(dx || 1) * side, y1: y0 + Math.sign(dy || 1) * side };
  }

  const inFloating = (p: { x: number; y: number }) =>
    !!floating && p.x >= floating.x && p.y >= floating.y && p.x < floating.x + floating.w && p.y < floating.y + floating.h;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const m = mask.current;
    if (!m || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    setError(null);
    if (tool === "select") {
      if (inFloating(p)) {
        stroke.current = { ...p, moved: false, mode: "move", grabX: p.x - floating!.x, grabY: p.y - floating!.y };
        return;
      }
      commitFloating();
      stroke.current = { ...p, moved: false, mode: "select", grabX: 0, grabY: 0 };
      setDrag({ select: true, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    commitFloating();
    if (tool === "fill") {
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= n || y >= n || m[y * n + x] === color) return;
      pushHistory();
      paint(floodFill(m, n, x, y, color));
      refreshPreview();
      return;
    }
    if (PAINT_TOOLS.has(tool) && tool !== "line") {
      pushHistory();
      paint(capsule(m, n, p.x, p.y, p.x, p.y, size / 2, color));
      stroke.current = { ...p, moved: false, mode: "paint", grabX: 0, grabY: 0 };
      return;
    }
    stroke.current = { ...p, moved: false, mode: "shape", grabX: 0, grabY: 0 };
    setDrag({ select: false, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = point(e);
    setCursor(p);
    const s = stroke.current;
    const m = mask.current;
    if (!s || !m) return;
    s.moved = true;
    if (s.mode === "paint") {
      paint(capsule(m, n, s.x, s.y, p.x, p.y, size / 2, color));
      s.x = p.x;
      s.y = p.y;
    } else if (s.mode === "move" && floating) {
      setFloating({ ...floating, x: p.x - s.grabX, y: p.y - s.grabY });
    } else if (s.mode === "shape" || s.mode === "select") {
      const c = s.mode === "shape" ? constrain(s.x, s.y, p.x, p.y, e.shiftKey) : { x1: p.x, y1: p.y };
      setDrag({ select: s.mode === "select", x0: s.x, y0: s.y, ...c });
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const s = stroke.current;
    const m = mask.current;
    stroke.current = null;
    if (!s || !m) return;
    if (s.mode === "paint") {
      refreshPreview();
      return;
    }
    if (s.mode === "move") return;
    const p = point(e);
    const c = s.mode === "shape" ? constrain(s.x, s.y, p.x, p.y, e.shiftKey) : { x1: p.x, y1: p.y };
    setDrag(null);
    if (s.mode === "select") {
      const box = clampRect({ x0: Math.min(s.x, c.x1), y0: Math.min(s.y, c.y1), x1: Math.max(s.x, c.x1), y1: Math.max(s.y, c.y1) }, n);
      if (!box || box.x1 - box.x0 < 2 || box.y1 - box.y0 < 2) return;
      // 들어 올리기: 영역 안 잉크를 떼어 띄운다(되돌리면 들어 올리기 전으로 돌아간다)
      pushHistory();
      const w = box.x1 - box.x0;
      const h = box.y1 - box.y0;
      const data = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (box.y0 + y) * n + box.x0 + x;
          data[y * w + x] = m[i];
          m[i] = 0;
        }
      }
      paint(box);
      setFloating({ x: box.x0, y: box.y0, w, h, data });
      return;
    }
    pushHistory();
    let dirty: Rect | null;
    if (tool === "line") {
      dirty = capsule(m, n, s.x, s.y, c.x1, c.y1, size / 2, color);
    } else {
      const r = { x0: Math.min(s.x, c.x1), y0: Math.min(s.y, c.y1), x1: Math.max(s.x, c.x1), y1: Math.max(s.y, c.y1) };
      dirty = (tool === "rect" ? rectShape : ellipseShape)(m, n, r, filled ? null : size, color);
    }
    paint(dirty);
    refreshPreview();
  }

  // ---------- 단축키 ----------

  const requestClose = useCallback(() => {
    if (saving) return;
    if (changed || floating) setConfirmClose(true);
    else onClose();
  }, [changed, floating, onClose, saving]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" && (target as HTMLInputElement).type !== "range") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
        return;
      }
      if (mod) return;
      if (floating) {
        const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (move) {
          e.preventDefault();
          const k = e.shiftKey ? 10 : 1;
          setFloating({ ...floating, x: floating.x + move[0] * k, y: floating.y + move[1] * k });
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          setFloating(null); // 떼어 낸 잉크를 버린다
          refreshPreview();
          return;
        }
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          commitFloating();
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmClose) setConfirmClose(false);
        else requestClose();
        return;
      }
      const key = e.key.toLowerCase();
      if (KEY_TOOLS[key]) {
        commitFloating();
        setTool(KEY_TOOLS[key]);
      } else if (key === "x") setInk((v) => !v);
      else if (e.key === "[") setSize((v) => Math.max(2, v - (v > 20 ? 4 : 2)));
      else if (e.key === "]") setSize((v) => Math.min(120, v + (v >= 20 ? 4 : 2)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floating, commitFloating, doUndo, doRedo, refreshPreview, requestClose, confirmClose]);

  // 열려 있는 동안 뒤 화면이 스크롤되지 않게 하고, 편집 화면에 초점을 둔다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---------- 저장 ----------

  async function save() {
    commitFloating(); // 떠 있는 것을 그림에 바로 붙인다
    const m = mask.current;
    if (!m) return;
    const out = m.slice();
    if (!out.some((v) => v === 1)) {
      setError("글자가 비었어요. 획을 그려 주세요.");
      return;
    }
    setSaving("save");
    setError(null);
    try {
      await onSave(toPng(out, n));
    } catch (err) {
      setError(errorMessage(err));
      setSaving(null);
    }
  }

  async function revert() {
    if (!onRevert) return;
    setSaving("revert");
    setError(null);
    try {
      await onRevert();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(null);
    }
  }

  // ---------- 화면 ----------

  const guides = source?.guides;
  const shapePreview = useMemo(() => {
    if (!drag || drag.select) return null;
    if (tool === "line") return { kind: "line" as const, ...drag };
    const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
    return { kind: tool === "ellipse" ? ("ellipse" as const) : ("rect" as const), ...r };
  }, [drag, tool]);
  const selectRect = drag?.select ? drag : null;
  const brushCursor = cursor && (PAINT_TOOLS.has(tool) || (SHAPE_TOOLS.has(tool) && !filled)) && !drag;
  const cursorStyle = tool === "select" ? (cursor && inFloating(cursor) ? "move" : "crosshair") : PAINT_TOOLS.has(tool) && tool !== "line" ? "none" : "crosshair";
  const toolLabel = TOOLS.find((t) => t.key === tool)!.label;

  const segment = (on: boolean) =>
    `-m-[1.5px] rounded-full text-sm transition-colors duration-(--dur-fast) disabled:cursor-not-allowed disabled:text-text-disabled ${on ? "border-2 border-border-active bg-bg-surface-strong font-bold" : "font-medium text-text-secondary hover:text-text-primary"}`;
  const toolButton = (on: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full px-4 text-sm transition-[background-color,border-color] duration-(--dur-fast) max-lg:h-10 lg:w-full lg:flex-col lg:gap-1 lg:rounded-[0.875rem] lg:px-1.5 lg:py-2.5 lg:text-13 ${
      on ? "border-2 border-border-active bg-bg-surface-strong font-bold" : "border-[1.5px] border-border-default font-medium hover:bg-bg-surface lg:border-transparent"
    }`;
  const undoRedo = (className: string) => (
    <>
      <button type="button" onClick={doUndo} disabled={history.undo === 0} title="되돌리기 (⌘Z)" className={className}>
        <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 max-lg:hidden">
          <path d="M7 4.5L3.5 8 7 11.5M4 8h8a4 4 0 010 8H8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        되돌리기
      </button>
      <button type="button" onClick={doRedo} disabled={history.redo === 0} title="다시 하기 (⇧⌘Z)" className={className}>
        <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 max-lg:hidden">
          <path d="M13 4.5L16.5 8 13 11.5M16 8H8a4 4 0 000 8h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        다시 하기
      </button>
    </>
  );
  const status = `${toolLabel} · ${tool === "select" ? (floating ? "끌어서 옮기고 Enter로 내려놓기 · Delete로 지우기" : "옮길 부분을 네모로 둘러싸기") : `굵기 ${size}px`}`;

  // 11/6 그림판(피그마 데스크톱 563:731 · 모바일 564:708): 왼쪽 도구 · 가운데 그림 · 오른쪽 굵기·칠할 색·도형·겹쳐 보기·단축키, 아래 줄은 'AI가 만든 그대로 돌리기' + 저장.
  // 닫기는 오른쪽 위 X · Esc · 바깥 누르기 하나로(아래 '닫기'·'취소'는 X와 같은 일이라 지웠다). 고친 게 있으면 '저장하지 않고 닫을까요?'를 묻는다.
  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 lg:items-center lg:p-6" onPointerDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="ds-motion flex max-h-full w-full animate-ds-enter flex-col overflow-hidden bg-bg-canvas outline-none lg:max-h-[min(52.5rem,100%)] lg:max-w-[70rem] lg:rounded-[1.5rem] lg:shadow-float"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-border-default px-4 pt-4 pb-3.5 lg:items-center lg:px-8 lg:py-[1.125rem]">
          <div className="flex min-w-0 flex-1 flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-4">
            <h2 className="font-display text-2xl leading-[1.3] tracking-[-0.03em] lg:text-[1.875rem]">{title}</h2>
            <span className="truncate text-13 text-text-secondary lg:text-15">{status}</span>
          </div>
          <button type="button" onClick={requestClose} aria-label="닫기" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg-surface-strong hover:bg-bg-disabled">
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[8rem_minmax(0,1fr)_20rem] lg:grid-rows-[minmax(0,1fr)_auto] lg:overflow-hidden">
          {/* 그림 */}
          <div className="flex shrink-0 flex-col px-4 pt-4 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-auto lg:px-10 lg:pt-10 lg:pb-6">
            <div className="mx-auto w-full" style={{ width: `min(${560 * zoom}px, ${100 * zoom}%)` }}>
              {!source ? (
                <div className="grid aspect-square w-full place-items-center border border-border-strong bg-bg-canvas">
                  {loadError ? <Notice tone="error">글자를 불러오지 못했어요: {loadError}</Notice> : <Spinner label="글자를 불러오는 중" />}
                </div>
              ) : (
                <div
                  ref={wrapRef}
                  className="relative aspect-square w-full touch-none overflow-hidden border border-border-strong bg-bg-canvas select-none"
                  style={{ cursor: cursorStyle }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onPointerLeave={() => setCursor(null)}
                >
                  {showGhost && source.ghost && (
                    // eslint-disable-next-line @next/next/no-img-element -- 엔진이 준 data URL
                    <img src={source.ghost} alt="" className="pointer-events-none absolute inset-0 h-full w-full opacity-25" draggable={false} />
                  )}
                  <canvas ref={canvasRef} width={n} height={n} className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" aria-label={`${title} 그림`} />
                  <canvas ref={floatRef} width={n} height={n} className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
                  <svg viewBox={`0 0 ${n} ${n}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                    {showGuides && guides && (
                      <g stroke="#8A8A8A" strokeWidth={n / 512} strokeDasharray={`${n / 85} ${n / 85}`} fill="none">
                        <line x1={0} x2={n} y1={guides.ascender} y2={guides.ascender} />
                        <line x1={0} x2={n} y1={guides.descender} y2={guides.descender} />
                        <line y1={0} y2={n} x1={guides.left} x2={guides.left} />
                        <line y1={0} y2={n} x1={guides.right} x2={guides.right} />
                        <line y1={0} y2={n} x1={(guides.left + guides.right) / 2} x2={(guides.left + guides.right) / 2} opacity={0.5} />
                        <line x1={0} x2={n} y1={(guides.ascender + guides.descender) / 2} y2={(guides.ascender + guides.descender) / 2} opacity={0.5} />
                      </g>
                    )}
                    {shapePreview?.kind === "line" && (
                      <line
                        x1={shapePreview.x0}
                        y1={shapePreview.y0}
                        x2={shapePreview.x1}
                        y2={shapePreview.y1}
                        stroke={color ? "#111" : "#fff"}
                        strokeOpacity={0.6}
                        strokeWidth={size}
                        strokeLinecap="round"
                      />
                    )}
                    {shapePreview?.kind === "rect" && (
                      <rect
                        x={shapePreview.x + (filled ? 0 : size / 2)}
                        y={shapePreview.y + (filled ? 0 : size / 2)}
                        width={Math.max(0, shapePreview.w - (filled ? 0 : size))}
                        height={Math.max(0, shapePreview.h - (filled ? 0 : size))}
                        fill={filled ? (color ? "#111" : "#fff") : "none"}
                        fillOpacity={0.6}
                        stroke={filled ? "none" : color ? "#111" : "#fff"}
                        strokeOpacity={0.6}
                        strokeWidth={size}
                      />
                    )}
                    {shapePreview?.kind === "ellipse" && (
                      <ellipse
                        cx={shapePreview.x + shapePreview.w / 2}
                        cy={shapePreview.y + shapePreview.h / 2}
                        rx={Math.max(0, shapePreview.w / 2 - (filled ? 0 : size / 2))}
                        ry={Math.max(0, shapePreview.h / 2 - (filled ? 0 : size / 2))}
                        fill={filled ? (color ? "#111" : "#fff") : "none"}
                        fillOpacity={0.6}
                        stroke={filled ? "none" : color ? "#111" : "#fff"}
                        strokeOpacity={0.6}
                        strokeWidth={size}
                      />
                    )}
                    {(selectRect || floating) && (
                      <rect
                        x={selectRect ? Math.min(selectRect.x0, selectRect.x1) : floating!.x}
                        y={selectRect ? Math.min(selectRect.y0, selectRect.y1) : floating!.y}
                        width={selectRect ? Math.abs(selectRect.x1 - selectRect.x0) : floating!.w}
                        height={selectRect ? Math.abs(selectRect.y1 - selectRect.y0) : floating!.h}
                        fill="none"
                        stroke="#111"
                        strokeWidth={n / 340}
                        strokeDasharray={`${n / 100} ${n / 100}`}
                        className="motion-safe:animate-[ds-ants_0.6s_linear_infinite]"
                      />
                    )}
                    {brushCursor && (
                      <circle cx={cursor.x} cy={cursor.y} r={Math.max(1, size / 2)} fill="none" stroke={tool === "eraser" || !ink ? "#B3261E" : "#111"} strokeWidth={n / 400} />
                    )}
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* 도구: 휴대폰은 옆으로 미는 한 줄, 데스크톱은 왼쪽 세로 줄 */}
          <div className="shrink-0 px-4 pt-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:overflow-y-auto lg:border-r lg:border-border-default lg:px-3 lg:py-4">
            <div role="toolbar" aria-label="도구" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
              {TOOLS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={tool === t.key}
                  title={`${t.label} (${t.key2})`}
                  onClick={() => {
                    commitFloating();
                    setTool(t.key);
                  }}
                  className={toolButton(tool === t.key)}
                >
                  <svg viewBox="0 0 20 20" className="h-5 w-5 max-lg:hidden" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {t.icon}
                  </svg>
                  <span className="whitespace-nowrap">{t.label}</span>
                </button>
              ))}
              <span aria-hidden className="my-1 h-px shrink-0 bg-border-default max-lg:hidden" />
              <div className="flex flex-col gap-1 max-lg:hidden">
                {undoRedo("flex w-full flex-col items-center gap-1 rounded-[0.875rem] px-1.5 py-2 text-13 font-medium hover:bg-bg-surface disabled:text-text-disabled disabled:hover:bg-transparent")}
              </div>
            </div>
            <p className="pt-1.5 text-xs text-text-secondary lg:hidden">옆으로 밀면 도구가 더 있어요</p>
          </div>

          {/* 굵기 · 칠할 색 · 도형 · 보기 */}
          <div className="flex shrink-0 flex-col gap-4 px-4 pt-4 pb-5 lg:col-start-3 lg:row-start-1 lg:min-h-0 lg:gap-6 lg:overflow-y-auto lg:pt-10 lg:pr-8 lg:pb-6 lg:pl-0">
            <label className="flex items-center gap-4 lg:flex-col lg:items-stretch lg:gap-2">
              <span className="flex shrink-0 justify-between text-sm font-bold lg:text-15">
                <span className="w-12 lg:w-auto">굵기</span>
                <span className="tabular-nums max-lg:hidden">{size}px</span>
              </span>
              <input
                type="range"
                min={2}
                max={120}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="ds-range min-w-0 flex-1"
                style={{ ["--fill" as string]: `${((size - 2) / 118) * 100}%` }}
                aria-label="붓 굵기"
              />
              <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums lg:hidden">{size}px</span>
            </label>
            <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch lg:gap-2">
              <span className="text-15 font-bold max-lg:sr-only">칠할 색</span>
              <div role="radiogroup" aria-label="칠할 색" title="색 바꾸기 (X)" className="grid h-10 w-[9.5rem] grid-cols-2 rounded-full border-[1.5px] border-border-strong lg:w-full">
                {[
                  { on: true, label: "검정" },
                  { on: false, label: "흰색" },
                ].map((c) => (
                  <button key={c.label} type="button" role="radio" aria-checked={ink === c.on} onClick={() => setInk(c.on)} disabled={tool === "eraser" || tool === "select"} className={segment(ink === c.on && tool !== "eraser")}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 lg:hidden">{undoRedo("h-10 rounded-full border-[1.5px] border-border-default px-3 text-sm font-medium disabled:text-text-disabled")}</div>
            </div>
            <div className={`flex flex-col gap-2 ${SHAPE_TOOLS.has(tool) ? "" : "max-lg:hidden"}`}>
              <span className="text-sm font-bold lg:text-15">도형</span>
              <div role="radiogroup" aria-label="도형" className="grid h-10 grid-cols-2 rounded-full border-[1.5px] border-border-strong">
                {[
                  { on: true, label: "채우기" },
                  { on: false, label: "선만" },
                ].map((c) => (
                  <button key={c.label} type="button" role="radio" aria-checked={filled === c.on} onClick={() => setFilled(c.on)} disabled={!SHAPE_TOOLS.has(tool)} className={segment(filled === c.on && SHAPE_TOOLS.has(tool))}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {source?.ghost && <Toggle checked={showGhost} onChange={setShowGhost} label={ghostLabel} />}
              {guides && <Toggle checked={showGuides} onChange={setShowGuides} label="글자 틀" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                확대
                <span className="flex items-center rounded-full border-[1.5px] border-border-default p-0.5">
                  <button
                    type="button"
                    aria-label="축소"
                    disabled={zoom === ZOOMS[0]}
                    onClick={() => setZoom(ZOOMS[ZOOMS.indexOf(zoom) - 1])}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-bg-surface disabled:text-text-disabled disabled:hover:bg-transparent"
                  >
                    −
                  </button>
                  <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    aria-label="확대"
                    disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                    onClick={() => setZoom(ZOOMS[ZOOMS.indexOf(zoom) + 1])}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-bg-surface disabled:text-text-disabled disabled:hover:bg-transparent"
                  >
                    +
                  </button>
                </span>
              </span>
              <button type="button" onClick={resetToStart} disabled={!source} className="py-1 underline decoration-1 underline-offset-[0.25em] disabled:text-text-disabled">
                편집 전으로
              </button>
              <button type="button" onClick={clearAll} disabled={!source} className="py-1 underline decoration-1 underline-offset-[0.25em] disabled:text-text-disabled">
                모두 지우기
              </button>
            </div>
            <div className="flex items-end gap-3 max-lg:hidden" aria-label="실제 크기" role="img">
              {[56, 32, 18].map((px) =>
                previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 편집 중인 그림
                  <img key={px} src={previewUrl} alt="" width={px} height={px} className="mix-blend-multiply" />
                ) : (
                  <span key={px} style={{ width: px, height: px }} />
                ),
              )}
              <span className="text-13 text-text-secondary">실제 크기</span>
            </div>
            <p className="text-13 leading-relaxed text-text-secondary max-lg:hidden">
              단축키
              <br />B 붓 · E 지우개 · L 직선 · R 네모
              <br />O 동그라미 · G 채우기 · M 선택
              <br />X 색 바꾸기 · ⌘Z 되돌리기 · [ ] 굵기
            </p>
          </div>

          {/* 아래 줄: 휴대폰은 바닥에 붙는다 */}
          <div className="sticky bottom-0 mt-auto flex shrink-0 flex-col-reverse items-center gap-1 border-t border-border-default bg-bg-canvas px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:static lg:col-span-2 lg:col-start-2 lg:row-start-2 lg:flex-row lg:justify-between lg:gap-4 lg:px-10 lg:py-5">
            <div className="flex min-h-11 items-center">
              {confirmClose ? (
                <span className="flex flex-wrap items-center gap-2" role="group" aria-label="저장하지 않고 닫을까요?">
                  <span className="text-15 font-medium">저장하지 않고 닫을까요? 고친 내용이 사라져요.</span>
                  <SecondaryButton size="sm" onClick={onClose}>
                    닫기
                  </SecondaryButton>
                  <SecondaryButton size="sm" onClick={() => setConfirmClose(false)}>
                    계속 고치기
                  </SecondaryButton>
                </span>
              ) : error ? (
                <span role="alert" className="text-15 font-semibold text-text-error">
                  {error}
                </span>
              ) : (
                onRevert && (
                  <TextButton tone="primary" onClick={() => void revert()} disabled={saving !== null}>
                    {saving === "revert" ? "되돌리는 중" : revertLabel}
                  </TextButton>
                )
              )}
            </div>
            <PrimaryButton block className="lg:w-auto" onClick={() => void save()} disabled={!source || saving !== null}>
              {saving === "save" ? "저장하는 중" : saveLabel}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-15 font-semibold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-[1.125rem] w-[1.125rem] accent-ink" />
      {label}
    </label>
  );
}
