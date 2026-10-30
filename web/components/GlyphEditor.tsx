"use client";

// 글자 편집 화면(10/29 사용자 요청: 그림판처럼 고치기). 화면 3 참고 글자 '직접 고치기'와 화면 4 '글자 고치기'가 함께 쓴다.
// 그림은 흑백 두 값(잉크·바탕)만 둔다. 외곽선을 따는 그림이라 회색이 섞이면 획 가장자리가 흐려진다.
// 도구는 붓·지우개·직선·네모·동그라미·채우기·선택해 옮기기. 붓과 도형은 잉크나 바탕색으로 칠한다(X로 바꾼다).
// 되돌리기는 칠하기 한 번(누르고 뗄 때까지)이 한 단계다.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Button, Notice, Spinner } from "@/components/ui";
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

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 lg:items-center lg:p-6" onPointerDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex max-h-full w-full flex-col overflow-hidden bg-bg outline-none lg:max-w-[70rem] lg:rounded-[1.25rem] lg:shadow-[0_30px_80px_-30px_rgba(17,17,17,.6)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5 lg:px-6">
          <h2 className="text-lg font-extrabold lg:text-xl">{title}</h2>
          <span className="hidden text-sm font-medium text-muted lg:inline">
            {toolLabel} · {tool === "select" ? (floating ? "끌어서 옮기고 Enter로 내려놓기 · Delete로 지우기" : "옮길 부분을 네모로 둘러싸기") : `굵기 ${size}px`}
          </span>
          <button type="button" onClick={requestClose} aria-label="닫기" className="ml-auto grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-stage">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[6rem_minmax(0,1fr)_15rem] lg:overflow-hidden">
          {/* 도구 */}
          <div role="toolbar" aria-label="도구" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line px-4 py-2.5 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-2.5 lg:py-3">
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
                className={`flex min-w-[4rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-xs font-bold transition-colors duration-150 ${
                  tool === t.key ? "bg-ink text-bg" : "text-ink hover:bg-stage"
                }`}
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {t.icon}
                </svg>
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            ))}
            <span aria-hidden className="mx-1 w-px shrink-0 bg-line lg:mx-0 lg:my-1 lg:h-px lg:w-auto" />
            <button
              type="button"
              onClick={doUndo}
              disabled={history.undo === 0}
              title="되돌리기 (⌘Z)"
              className="flex min-w-[4rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-xs font-bold hover:bg-stage disabled:text-muted disabled:hover:bg-transparent"
            >
              <span aria-hidden className="text-lg leading-5">↶</span>
              되돌리기
            </button>
            <button
              type="button"
              onClick={doRedo}
              disabled={history.redo === 0}
              title="다시 하기 (⇧⌘Z)"
              className="flex min-w-[4rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-xs font-bold hover:bg-stage disabled:text-muted disabled:hover:bg-transparent"
            >
              <span aria-hidden className="text-lg leading-5">↷</span>
              다시 하기
            </button>
          </div>

          {/* 그림 */}
          <div className="flex shrink-0 flex-col items-center gap-3 bg-stage px-4 py-4 lg:min-h-0 lg:shrink lg:px-6">
            <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-semibold">
              <label className="flex items-center gap-2">
                굵기
                <input
                  type="range"
                  min={2}
                  max={120}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="ds-range w-28"
                  style={{ ["--fill" as string]: `${((size - 2) / 118) * 100}%` }}
                  aria-label="붓 굵기"
                />
                <span className="w-12 tabular-nums">{size}px</span>
              </label>
              <div role="radiogroup" aria-label="칠할 색" className="flex items-center gap-1 rounded-full bg-bg p-1" title="색 바꾸기 (X)">
                {[
                  { on: true, label: "검정" },
                  { on: false, label: "흰색" },
                ].map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    role="radio"
                    aria-checked={ink === c.on}
                    onClick={() => setInk(c.on)}
                    disabled={tool === "eraser" || tool === "select"}
                    className={`flex h-8 items-center gap-1.5 rounded-full px-3 transition-colors disabled:text-muted ${ink === c.on && tool !== "eraser" ? "bg-stage font-bold" : "font-medium"}`}
                  >
                    <span aria-hidden className={`h-3.5 w-3.5 rounded-full border-[1.5px] border-ink ${c.on ? "bg-ink" : "bg-bg"}`} />
                    {c.label}
                  </button>
                ))}
              </div>
              {SHAPE_TOOLS.has(tool) && (
                <div role="radiogroup" aria-label="도형" className="flex items-center gap-1 rounded-full bg-bg p-1">
                  {[
                    { on: true, label: "채우기" },
                    { on: false, label: "선만" },
                  ].map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      role="radio"
                      aria-checked={filled === c.on}
                      onClick={() => setFilled(c.on)}
                      className={`h-8 rounded-full px-3 transition-colors ${filled === c.on ? "bg-stage font-bold" : "font-medium"}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-full flex-1 overflow-auto lg:min-h-0">
              <div className="mx-auto" style={{ width: `min(${560 * zoom}px, ${100 * zoom}%)` }}>
                {!source ? (
                  <div className="grid aspect-square w-full place-items-center rounded-xl bg-bg">
                    {loadError ? <Notice tone="error">글자를 불러오지 못했어요: {loadError}</Notice> : <Spinner label="글자를 불러오는 중" />}
                  </div>
                ) : (
                  <div
                    ref={wrapRef}
                    className="relative aspect-square w-full touch-none overflow-hidden rounded-xl bg-bg shadow-[0_0_0_1px_rgba(17,17,17,.08)] select-none"
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
          </div>

          {/* 보기·미리보기 */}
          <div className="flex shrink-0 flex-col gap-4 border-t border-line px-5 py-4 lg:shrink lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-muted">실제 크기</h3>
              <div className="flex items-end gap-3 rounded-xl bg-subtle px-3 py-3">
                {[72, 40, 22].map((px) =>
                  previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 편집 중인 그림
                    <img key={px} src={previewUrl} alt="" width={px} height={px} className="mix-blend-multiply" />
                  ) : (
                    <span key={px} style={{ width: px, height: px }} />
                  ),
                )}
              </div>
            </section>
            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-bold text-muted">보기</h3>
              {guides && <Toggle checked={showGuides} onChange={setShowGuides} label="글자 틀" />}
              {source?.ghost && <Toggle checked={showGhost} onChange={setShowGhost} label={ghostLabel} />}
              <div className="flex items-center gap-2 pt-1 text-sm font-semibold">
                확대
                <div className="flex items-center rounded-full bg-stage p-1">
                  <button
                    type="button"
                    aria-label="축소"
                    disabled={zoom === ZOOMS[0]}
                    onClick={() => setZoom(ZOOMS[ZOOMS.indexOf(zoom) - 1])}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-bg disabled:text-muted disabled:hover:bg-transparent"
                  >
                    −
                  </button>
                  <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    aria-label="확대"
                    disabled={zoom === ZOOMS[ZOOMS.length - 1]}
                    onClick={() => setZoom(ZOOMS[ZOOMS.indexOf(zoom) + 1])}
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-bg disabled:text-muted disabled:hover:bg-transparent"
                  >
                    +
                  </button>
                </div>
              </div>
            </section>
            <section className="flex flex-col items-start gap-1.5">
              <h3 className="text-sm font-bold text-muted">처음으로</h3>
              <Button variant="outline" size="sm" className="h-9 px-4 text-sm" onClick={resetToStart} disabled={!source}>
                편집 전으로
              </Button>
              <Button variant="ghost" size="sm" className="h-9 px-2 text-sm" onClick={clearAll} disabled={!source}>
                모두 지우기
              </Button>
            </section>
            <p className="mt-auto hidden text-13 leading-relaxed font-medium text-muted lg:block">
              B 붓 · E 지우개 · L 직선 · R 네모 · O 동그라미 · G 채우기 · M 선택 · X 색 바꾸기 · [ ] 굵기 · ⌘Z 되돌리기 · Shift 반듯하게
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-line px-5 py-3.5 lg:flex-row lg:items-center lg:px-6">
          {confirmClose ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-15 font-medium">고친 내용이 사라져요.</span>
              <Button size="sm" onClick={onClose}>
                저장하지 않고 닫기
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmClose(false)}>
                계속 고치기
              </Button>
            </span>
          ) : error ? (
            <span role="alert" className="text-15 font-semibold text-bad">
              {error}
            </span>
          ) : (
            onRevert && (
              <Button variant="ghost" size="sm" className="self-start px-2" onClick={() => void revert()} disabled={saving !== null}>
                {saving === "revert" ? "되돌리는 중" : revertLabel}
              </Button>
            )
          )}
          <div className="flex items-center gap-2.5 [&>*:last-child]:flex-1 lg:ml-auto lg:[&>*:last-child]:flex-none">
            <Button variant="outline" onClick={requestClose} disabled={saving !== null}>
              취소
            </Button>
            <Button size="md" className="h-12 px-7" onClick={() => void save()} disabled={!source || saving !== null}>
              {saving === "save" ? "저장하는 중" : saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
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
