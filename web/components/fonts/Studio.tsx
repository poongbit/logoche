"use client";

// 폰트 스튜디오(11/6 ST2 v2: 데스크톱 549:402 · 모바일 561:513 · 써 보기 조절 펼침 565:767 · 다시 들어왔을 때 564:769).
// 순서는 '쓰는 곳부터'(메인과 같음): 완성 띠 → 써 보기 → 시안 → 받기 → 쓸 수 있는 범위 → 글자와 검사 → 기록.
// - 완성 띠(큰 민트 면)는 완성 뒤 처음 이 폰트를 열 때만(바탕 A 규칙 ③ 완성 순간). 완성 도장은 붙은 뒤 빛이 한 번 지나간다.
//   다시 들어오면 흰 머리 줄로 접고 반짝이지 않는다. '봤음'은 브라우저(localStorage)에 폰트마다 남기고, 못 읽으면 처음으로 본다(motion.md '언제 재생하나').
// - 써 보기: 미리보기 판(줄을 눌러 바로 고침, 바탕색 적용)이 먼저, 조절(크기·글자 간격·줄 간격·글자색·바탕색)은 아래. 휴대폰은 조절을 한 줄로 접는다.
//   안내문 줄은 AI가 가게 이야기로 쓴 문장(slogans)만 쓴다(지어낸 기본 문장 없음). 가격표 줄은 업종 예시 메뉴, 업종을 직접 쓴 가게는 숫자 줄(영업시간·전화).
// - 글자와 검사: 밑줄 탭, 글자를 누르면 글자 다듬기 서랍(GlyphPolish). 다시 볼 글자는 눌러 여러 개 고르고 떠오르는 막대로 다시 그린다(562:561).
//   빠진 글자는 점선 칸 + 제자리 확인(562:596). 이름 고치기·지우기는 제자리에서(562:642).
// YoFont와 다르게 뺀 것: 공개 범위(늘 나만 쓴다), 키를 붙인 CDN 주소(원본이 새어 나간다), 언어 추가.

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, CheckMark, CompletionStamp, DisplayTitle, Highlight, PrimaryButton, SecondaryButton, TextButton, TextLink, UnderlineTabs, tabId, tabPanelId } from "@/components/ds";
import { LazyMount } from "@/components/LazyMount";
import { MockupTabs } from "@/components/Mockups";
import { GlyphPolish } from "@/components/fonts/GlyphPolish";
import { InlineConfirm } from "@/components/InlineConfirm";
import { RecordLog } from "@/components/RecordLog";
import { RightsCard } from "@/components/RightsCard";
import { SelectionBar } from "@/components/fonts/SelectionBar";
import { DownloadMenu, FONT_FILES, Spin, useFontDownloads } from "@/components/fonts/shared";
import { Notice, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { CHECKS, EXTRA_CHARS, MENU_BY_INDUSTRY, PANGRAM, RIGHTS } from "@/lib/constants";
import { saveBlob } from "@/lib/files";
import { useGeneratedFont } from "@/lib/font";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import { buildRecordText } from "@/lib/record";
import type { ProjectView } from "@/lib/types";

const FIRST_CELLS = 60; // 글자 표 처음 칸 수: 휴대폰 6칸 × 10줄 · 데스크톱 약 6줄
const code = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`;
const LATIN = [...EXTRA_CHARS].filter((c) => /[A-Za-z]/.test(c));
const DIGITS_PUNCT = [...EXTRA_CHARS].filter((c) => !/[A-Za-z]/.test(c));
const NUMBERS_LINE = "영업 10:00~21:00 · 문의 02-123-4567";

/** 받침이 있으면 '이', 없으면 '가'(한결국수체가 · 바다빵집이) */
function josa(word: string) {
  const c = word.codePointAt(word.length - 1) ?? 0;
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? "이" : "가";
}

function whenDone(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 완성 뒤 처음 여는지. 브라우저에 폰트마다 '봤음'을 남긴다. 못 읽으면(사생활 보호 창 등) 처음으로 본다. */
function useFirstVisit(id: string) {
  const key = `logoche:studio-seen:${id}`;
  const [first] = useState(() => {
    try {
      return window.localStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // 남기지 못해도 화면은 그대로
    }
  }, [key]);
  return first;
}

/** 어두운 바탕이면 판 안 이름표를 밝게 */
function isDark(hex: string) {
  const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

type Swatch = { color: string; name: string; logo?: boolean };

/** 같은 색이 겹치면 앞의 이름 하나만 둔다(로고 색은 자리로 읽어서 검정·흰색과 겹칠 수 있다) */
const uniqueSwatches = (list: (Swatch | null)[]) => list.filter((s, i): s is Swatch => !!s && list.findIndex((x) => x?.color.toUpperCase() === s.color.toUpperCase()) === i);

/** 색 동그라미 26px, 고른 것은 2px 띄운 먹 고리(34). 화면 읽기에는 색 코드 대신 이름('로고 대표색', '검정')을 읽어 준다. */
function Swatches({ label, swatches, value, onChange }: { label: string; swatches: Swatch[]; value: string; onChange: (c: string) => void }) {
  const firstLogo = swatches.findIndex((s) => s.logo);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-13 font-bold text-text-secondary">{label}</span>
      <div role="group" aria-label={label} className="flex items-center gap-2.5">
        {swatches.map(({ color, name }) => (
          <button
            key={color}
            type="button"
            aria-label={`${label} ${name}`}
            aria-pressed={value.toUpperCase() === color.toUpperCase()}
            title={name}
            onClick={() => onChange(color)}
            className="h-[1.625rem] w-[1.625rem] shrink-0 rounded-full border border-border-default transition-shadow duration-(--dur-fast)"
            style={{
              background: color,
              boxShadow: value.toUpperCase() === color.toUpperCase() ? "0 0 0 2px var(--bg), 0 0 0 4px var(--ink)" : undefined,
            }}
          />
        ))}
      </div>
      {firstLogo >= 0 && (
        <span className="-mt-1 text-[0.6875rem] text-text-tertiary" style={{ marginLeft: `${firstLogo * 2.25}rem` }}>
          로고 색
        </span>
      )}
    </div>
  );
}

function Range({ label, value, min, max, step = 1, shown, onChange }: { label: string; value: number; min: number; max: number; step?: number; shown: string; onChange: (v: number) => void }) {
  return (
    <label className="flex w-full flex-col gap-1.5 lg:w-[16.75rem]">
      <span className="flex justify-between text-13 font-bold">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ds-range"
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </label>
  );
}

/** 섹션 머리: 작은 이름(써 보기) + Black Han Sans 제목 + 설명 */
function Section({ id, eyebrow, title, desc, children }: { id: string; eyebrow: string; title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mx-auto w-full max-w-[76rem] scroll-mt-6 px-4 sm:px-5 lg:px-10">
      <p className="text-13 font-bold text-text-secondary lg:text-sm">{eyebrow}</p>
      <h2 id={`${id}-title`} className="mt-1.5 font-display text-[1.75rem] leading-[1.25] tracking-[-0.03em] lg:mt-2.5 lg:text-[2.75rem]">
        {title}
      </h2>
      {desc && <p className="mt-2 text-sm leading-[1.55] text-text-secondary lg:text-lg">{desc}</p>}
      {children}
    </section>
  );
}

/** 글자 표 한 칸. memo라서 써 보기처럼 글자 표와 상관없는 상태가 바뀔 때 120칸을 다시 그리지 않는다(11/4 성능 점검). */
const GlyphCell = memo(function GlyphCell({
  c,
  on,
  ok,
  pick,
  tab,
  family,
  mark,
  onSelect,
}: {
  c: string;
  on: boolean;
  ok: boolean;
  pick: boolean;
  tab: number;
  family: string;
  mark: boolean;
  onSelect: (c: string, pick: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-char={c}
      tabIndex={tab}
      aria-label={`${c} ${code(c)}${ok ? "" : " · 빠짐"}${pick ? "" : " · 다듬기"}`}
      aria-pressed={pick ? on : undefined}
      onClick={() => onSelect(c, pick)}
      className={`relative grid aspect-square place-items-center rounded-[0.75rem] bg-bg-canvas leading-none transition-[border-color] duration-(--dur-fast) hover:border-border-active ${
        pick ? "rounded-[1.0625rem] text-[2.5rem] lg:text-[3.5rem]" : "text-[1.75rem] lg:text-[2.5rem]"
      } ${on ? "border-[2.5px] border-border-active" : ok ? "border border-border-default" : "border-[1.5px] border-dashed border-border-strong text-text-tertiary"}`}
      style={{ fontFamily: ok ? family : GLYPH_FONT_STACK }}
    >
      {c}
      {mark && <span aria-hidden className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-text-secondary" />}
      {pick && on && <CheckCircle pop className="absolute top-1.5 right-1.5 lg:top-2.5 lg:right-2.5" />}
    </button>
  );
});

type GlyphTab = "all" | "digits" | "latin" | "missing" | "check";

export function Studio({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const { state: fontState, fontFamily } = useGeneratedFont(view.fontId, view.revision, attempt); // revision: 글자를 다듬어 파일이 바뀌면 다시 불러온다
  const family = fontFamily ?? GLYPH_FONT_STACK;
  const first = useFirstVisit(view.id);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // ---------- 이름 · 즐겨찾기 ----------
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(view.name);
  const nameInput = useRef<HTMLInputElement>(null);
  const renameLink = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (renaming) nameInput.current?.select();
  }, [renaming]);
  function closeRename() {
    setRenaming(false);
    requestAnimationFrame(() => renameLink.current?.focus());
  }
  function saveName() {
    const next = name.trim();
    if (!next || next === view.name) {
      setName(view.name);
      return closeRename();
    }
    void run(async () => {
      await api.updateProject(view.id, { name: next });
      closeRename();
    });
  }

  // ---------- 써 보기 ----------
  const industry = view.upload.industry;
  const ownIndustry = !industry || industry === "other"; // 업종을 직접 쓴 가게: 업종 예시 메뉴가 엉뚱해서 숫자 줄로
  const menu = MENU_BY_INDUSTRY[industry ?? "snack_korean"] ?? MENU_BY_INDUSTRY.snack_korean;
  const won = (p: string) => (/^[\d,]+$/.test(p) ? `${p}원` : p);
  const lines = [
    ownIndustry
      ? { key: "price", label: "숫자처럼", source: "영업시간·전화 예시", text: NUMBERS_LINE, size: "text-[calc(1.5rem*var(--k))] lg:text-[calc(2.5rem*var(--k))]" }
      : { key: "price", label: "가격표처럼", source: "업종 예시 메뉴", text: menu.map(([item, price]) => `${item} ${won(price)}`).join(" · "), size: "text-[calc(1.5rem*var(--k))] lg:text-[calc(2.5rem*var(--k))]" },
    view.slogans.length
      ? { key: "guide", label: "안내문처럼 작게", source: "가게 이야기로 쓴 문장", text: view.slogans.join(" · "), size: "text-[calc(1rem*var(--k))] lg:text-[calc(1.1875rem*var(--k))]" }
      : { key: "guide", label: "안내문처럼 작게", source: "자음이 다 든 문장", text: PANGRAM, size: "text-[calc(1rem*var(--k))] lg:text-[calc(1.1875rem*var(--k))]" },
  ];
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [scale, setScale] = useState(100);
  const [tracking, setTracking] = useState(0);
  const [leading, setLeading] = useState(140);
  const [fg, setFg] = useState("#141414");
  const [bg, setBg] = useState("#FFFFFF");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [main, dark, light] = view.colors; // 로고에서 뽑은 [대표색, 어두운 색, 밝은 색]
  const logoSwatch = (color: string | undefined, name: string): Swatch | null => (color ? { color, name, logo: true } : null);
  const fgSwatches = uniqueSwatches([{ color: "#141414", name: "검정" }, logoSwatch(dark, "로고 어두운 색"), logoSwatch(main, "로고 대표색"), { color: "#FFFFFF", name: "흰색" }]);
  const bgSwatches = uniqueSwatches([{ color: "#FFFFFF", name: "흰색" }, { color: "#ECECEA", name: "연한 회색" }, logoSwatch(light, "로고 밝은 색"), logoSwatch(dark, "로고 어두운 색")]);
  const colorName = (list: Swatch[], c: string) => list.find((s) => s.color.toUpperCase() === c.toUpperCase())?.name.replace("로고 ", "") ?? "";
  const trackingShown = `${tracking > 0 ? "+" : ""}${tracking}`;
  const boardDark = isDark(bg);
  const firstLine = useRef<HTMLTextAreaElement>(null);
  function goTry() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("try")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const el = firstLine.current;
    if (el) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }
  // 바꾼 글자 간격은 아래 시안에도 이어진다(시안은 글자 크기를 칸에 맞춰 스스로 정해서 크기·줄 간격은 넘기지 않는다)
  const mockStyle = useMemo<CSSProperties>(() => ({ fontFamily: family, letterSpacing: `${tracking / 100}em` }), [family, tracking]);

  // ---------- 받기 ----------
  const loadRecord = useCallback(async () => view.record, [view.record]);
  const dl = useFontDownloads(view.fontId ?? "", view.name, loadRecord);
  const [moreFormats, setMoreFormats] = useState(false);

  // ---------- 글자 ----------
  const missingSet = useMemo(() => new Set(view.missing), [view.missing]);
  const present = useMemo(() => [...KSX1001_HANGUL].filter((c) => !missingSet.has(c)), [missingSet]);
  const extrasSet = useMemo(() => new Set(view.extras), [view.extras]);
  const missingAll = useMemo(() => [...view.missing, ...[...EXTRA_CHARS].filter((c) => !extrasSet.has(c))], [view.missing, extrasSet]);
  const [glyphTab, setGlyphTab] = useState<GlyphTab>("all");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(FIRST_CELLS);
  const source = { all: present, digits: DIGITS_PUNCT, latin: LATIN, missing: missingAll, check: view.recheck }[glyphTab];
  const q = query.trim().toLowerCase().replace(/^u\+?/, "");
  const cells = q ? source.filter((c) => query.includes(c) || code(c).toLowerCase().slice(2).startsWith(q)) : source;
  const shown = cells.slice(0, limit);
  const inFont = useCallback((c: string) => (KSX1001_HANGUL.has(c) ? !missingSet.has(c) : extrasSet.has(c)), [missingSet, extrasSet]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [polish, setPolish] = useState<string | null>(null);
  const closePolish = useCallback(() => setPolish(null), [setPolish]);
  const glyphGrid = useRef<HTMLDivElement>(null);
  const onCell = useCallback((c: string, pick: boolean) => {
    setCursor(c);
    if (!pick) {
      setPolish(c);
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(c)) next.add(c);
      return next;
    });
  }, [setCursor, setPolish, setPicked]);
  const pickMode = glyphTab === "check";

  // 글자 표는 Tab 한 번으로 들어가고(한 칸만 Tab에 멈춘다) 안에서는 화살표로 옮긴다(11/2 다시 점검).
  const tabCell = Math.max(0, cursor ? shown.indexOf(cursor) : 0);
  function onGlyphKeys(e: KeyboardEvent<HTMLDivElement>) {
    const grid = glyphGrid.current;
    const at = shown.indexOf((e.target as HTMLElement).dataset.char ?? "");
    if (!grid || at < 0) return;
    const cols = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const rowStart = at - (at % cols);
    const moves: Record<string, number> = {
      ArrowLeft: at - 1,
      ArrowRight: at + 1,
      ArrowUp: at - cols,
      ArrowDown: at + cols,
      Home: e.ctrlKey ? 0 : rowStart,
      End: e.ctrlKey ? shown.length - 1 : Math.min(shown.length - 1, rowStart + cols - 1),
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = moves[e.key];
    if (next < 0 || next >= shown.length) return;
    setCursor(shown[next]);
    (grid.children[next] as HTMLElement).focus();
  }

  // 빠진 글자 그리기(11/4): 안 그린 글자만 그린다(rest.ts plan). 장 수와 시간은 어림(장 35초, 동시 8장, 폰트 만들기 약 1분)
  const [confirmFill, setConfirmFill] = useState(false);
  const extrasMissing = EXTRA_CHARS.length - view.extras.length;
  const fillCount = view.missing.length + extrasMissing;
  const fillSheets = Math.ceil(view.missing.length / 30) + (extrasMissing > 0 ? 1 : 0);
  const fillMinutes = Math.max(2, Math.ceil((Math.ceil(fillSheets / 8) * 35 + 70) / 60));

  // ---------- 검사 ----------
  const build = view.build;
  const glyphCount = view.glyphCount ?? present.length;
  const checkRows = build
    ? [
        ...CHECKS.map((c) => {
          const r = build.checks.find((x) => x.key === c.key);
          const pass = r?.status === "pass";
          const text: Record<string, string> = {
            glyph_set: `글자 수 ${(glyphCount + view.extras.length).toLocaleString()}자`,
            broken_glyphs: "깨진 글자 없음",
            embedding: "문서 포함 허용",
            naming_license: "이름·라이선스 정보 맞음",
            platform_render: "기기별 표시 같음",
            size_legibility: "12px~96px 크기 기준 맞음",
            similarity: build.similarity ? `무료 폰트와 닮지 않음 (가장 가까운 것 ${build.similarity.score.toFixed(2)})` : "무료 폰트와 닮지 않음",
          };
          return { key: c.key, pass, text: pass ? text[c.key] : `${c.label} — 확인 필요`, detail: pass ? null : (r?.detail ?? null) };
        }),
        {
          key: "ocr",
          pass: !!build.ocrPassed,
          text: build.misreads.length ? `AI 판독 — ${build.misreads.length}자 다르게 읽음` : "AI 판독 — 자주 쓰는 글자 모두 맞게 읽음",
          detail: null,
        },
      ]
    : [];
  const allPass = !!build && CHECKS.every((c) => build.checks.find((x) => x.key === c.key)?.status === "pass");

  // ---------- 기록 · 지우기 ----------
  const [recordOpen, setRecordOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteLink = useRef<HTMLButtonElement>(null);
  const deleteAsked = useRef(false);
  useEffect(() => {
    if (!confirmDelete && deleteAsked.current) deleteLink.current?.focus();
  }, [confirmDelete]);

  // 완성 시각: 서버에 따로 없어서 마지막 제작 기록 시각(없으면 만든 시각)
  const doneAt = view.record.reduce((t, e) => (Date.parse(e.at) > Date.parse(t) ? e.at : t), view.createdAt);
  const summaryLine = [whenDone(doneAt).replace(/ 오[전후] .*/, "") + " 완성", `한글 ${glyphCount.toLocaleString()}자 + ${view.extras.length}자`, allPass ? "검사 7항목 통과" : null].filter(Boolean).join(" · ");

  // ---------- 머리: 이름 고치기 · 링크 ----------
  const renameForm = (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          saveName();
        }}
      >
        <label htmlFor="font-name" className="sr-only">
          폰트 이름
        </label>
        <input
          ref={nameInput}
          id="font-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setName(view.name);
              closeRename();
            }
          }}
          className="h-14 w-full min-w-0 rounded-2xl border-2 border-border-active bg-bg-canvas px-4 font-display outline-none focus-visible:shadow-none text-2xl tracking-[-0.03em] outline-none sm:w-[28.75rem] lg:h-16 lg:text-[1.875rem]"
        />
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "저장하는 중" : "저장"}
        </PrimaryButton>
        <SecondaryButton
          onClick={() => {
            setName(view.name);
            closeRename();
          }}
        >
          취소
        </SecondaryButton>
      </form>
      <p className="text-sm">폰트 파일 안 이름도 함께 바뀌어요. 이미 받은 파일은 다시 받아야 바뀐 이름이 보여요.</p>
    </div>
  );
  const headLinks = (
    <p className="flex items-center gap-1.5 text-sm font-bold">
      <button ref={renameLink} type="button" onClick={() => setRenaming(true)} className="py-2 underline decoration-1 underline-offset-[0.25em]">
        이름 바꾸기
      </button>
      <span aria-hidden>·</span>
      <button
        type="button"
        aria-pressed={view.favorite}
        disabled={busy}
        onClick={() => void run(() => api.updateProject(view.id, { favorite: !view.favorite }))}
        className="inline-flex items-center gap-1 py-2 underline decoration-1 underline-offset-[0.25em]"
      >
        {view.favorite && <CheckMark className="h-3.5 w-3.5" />}
        즐겨찾기
      </button>
    </p>
  );
  const download = view.fontId && <DownloadMenu fontId={view.fontId} fontName={view.name} loadRecord={loadRecord} primary block />;
  const slogan = view.slogans[0];

  return (
    <>
      <h1 className="sr-only">{view.name}</h1>
      {first ? (
        /* 완성 띠: 처음 들어올 때만 큰 민트 면(549:402 · 561:513) */
        <section aria-label="완성" className="bg-bg-brand text-text-on-brand">
          <div className="mx-auto grid w-full max-w-[76rem] gap-6 px-4 pt-8 pb-8 sm:px-5 lg:grid-cols-[minmax(0,1fr)_37.5rem] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-0 lg:px-10 lg:py-20">
            <div className="flex flex-col">
              <p className="text-sm font-bold lg:-mt-1 lg:text-15">완성 · {whenDone(doneAt)}</p>
              {renaming ? (
                <div className="mt-4">{renameForm}</div>
              ) : (
                <DisplayTitle as="p" className="mt-2.5 text-[2.5rem] lg:mt-3.5 lg:text-[4rem]">
                  <Highlight>
                    {view.name}
                    {josa(view.name)}
                  </Highlight>
                  <br />
                  나왔어요
                </DisplayTitle>
              )}
              <p className="mt-2 text-15 leading-normal font-medium lg:mt-4 lg:text-[1.1875rem]">
                <span className="block">
                  한글 {glyphCount.toLocaleString()}자 + 숫자·문장부호·영문 <span className="max-lg:hidden">대소문자 </span>
                  {view.extras.length}자
                </span>
                <span className="block">{allPass ? "상업용 검사 7항목을 모두 통과했어요." : "검사 결과는 아래 ‘글자와 검사’에서 볼 수 있어요."}</span>
              </p>
            </div>

            {/* 견본 카드 + 완성 도장(카드 오른쪽 위 모서리에 걸침) */}
            <div className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <div className="flex h-60 flex-col overflow-hidden rounded-[1.125rem] bg-bg-canvas px-5 pt-4 text-text-primary lg:h-[27.5rem] lg:rounded-[1.375rem] lg:px-8 lg:pt-7">
                <p className="text-xs font-bold text-text-secondary lg:text-sm">{view.name}</p>
                <p className="mt-1 truncate text-[4.5rem] leading-[1.25] lg:mt-2 lg:text-[7.5rem]" style={{ fontFamily: family }}>
                  {view.storeName}
                </p>
                {slogan && (
                  <p className="mt-2 line-clamp-2 text-[1.375rem] leading-[1.35] lg:mt-4 lg:text-[2.125rem]" style={{ fontFamily: family }}>
                    {slogan}
                  </p>
                )}
                <p className="mt-auto mb-8 truncate text-17 max-lg:hidden" style={{ fontFamily: family }}>
                  가나다라마바사 아자차카타파하 0123456789 ABCabc
                </p>
              </div>
              <CompletionStamp name={view.name} size={150} shine className="absolute! -top-[4.1875rem] -right-[3.1875rem] max-lg:hidden" />
              <CompletionStamp name={view.name} size={96} shine className="absolute! -top-12 -right-1 lg:hidden" />
            </div>

            <div className="flex flex-col items-start lg:pt-14">
              <div className="flex w-full gap-3">
                {download}
                <SecondaryButton className="max-lg:hidden" onClick={goTry}>
                  써 보기
                </SecondaryButton>
              </div>
              {!renaming && <div className="mt-5 pl-6 lg:mt-6 lg:pl-0">{headLinks}</div>}
            </div>
          </div>
        </section>
      ) : (
        /* 다시 들어왔을 때: 흰 머리 줄로 접는다(564:769) */
        <section aria-label="폰트 정보" className="mx-auto w-full max-w-[76rem] px-4 pt-2 sm:px-5 lg:px-10 lg:pt-4">
          <TextLink href="/fonts">← 내 폰트</TextLink>
          {renaming ? (
            <div className="mt-2">{renameForm}</div>
          ) : (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="font-display text-[2.25rem] leading-[1.25] tracking-[-0.03em] lg:text-[3.5rem]">{view.name}</p>
              <div className="flex gap-3 max-lg:order-last">
                <SecondaryButton className="max-lg:hidden" onClick={goTry}>
                  써 보기
                </SecondaryButton>
                {download}
              </div>
              <p className="text-sm text-text-secondary lg:hidden">{summaryLine}</p>
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-4 lg:mt-2">
            <p className="text-base text-text-secondary max-lg:hidden">{summaryLine}</p>
            {!renaming && headLinks}
          </div>
          <div className="mt-6 h-px bg-border-active lg:mt-10" />
        </section>
      )}

      <div className={`flex flex-col gap-[4.5rem] pb-24 lg:gap-24 ${first ? "pt-12 lg:pt-16" : "pt-10 lg:pt-14"}`}>
        {(error || fontState !== "ready") && (
          <div className="mx-auto -mb-10 flex w-full max-w-[76rem] flex-col gap-3 px-4 sm:px-5 lg:px-10">
            {error && <Notice tone="error">{error}</Notice>}
            {fontState === "loading" && <Spinner label="폰트 파일을 불러오는 중" />}
            {fontState === "unavailable" && (
              <Notice tone="warn">
                <span className="flex flex-wrap items-center gap-3">
                  폰트 파일을 불러오지 못해 기본 글꼴로 보여 주고 있어요.
                  <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-bold underline underline-offset-4">
                    다시 불러오기
                  </button>
                </span>
              </Notice>
            )}
          </div>
        )}

        {/* ---------- 써 보기 ---------- */}
        <Section
          id="try"
          eyebrow="써 보기"
          title="우리 가게 문구로 써 봐요"
          desc={
            <>
              가게 이름과 답해 주신 내용으로 채웠어요. <br className="lg:hidden" />
              크기·간격·색을 바로 바꿔 볼 수 있어요.
            </>
          }
        >
          <div className="mt-6 h-px bg-border-active lg:mt-14" />
          <div
            className="mt-5 flex flex-col rounded-2xl border-[1.5px] border-border-default px-4 py-4 lg:mt-8 lg:rounded-[1.25rem] lg:px-[1.875rem] lg:py-6"
            style={{ background: bg, "--k": scale / 100 } as CSSProperties}
          >
            {lines.map((line, i) => (
              <div key={line.key} className={`grid gap-1 lg:grid-cols-[9.25rem_minmax(0,1fr)] lg:gap-x-0 ${i ? "mt-4 border-t pt-4 lg:mt-6 lg:pt-6" : ""}`} style={{ borderColor: boardDark ? "rgb(255 255 255 / 0.2)" : "var(--color-border-default)" }}>
                <label htmlFor={`try-${line.key}`} className={`flex gap-1 text-xs lg:flex-col lg:pt-2.5 ${boardDark ? "text-white/75" : "text-text-secondary"}`}>
                  <span className="lg:text-13 lg:font-bold">{line.label}</span>
                  <span aria-hidden className="lg:hidden">·</span>
                  <span className={boardDark ? "" : "lg:text-text-tertiary"}>{line.source}</span>
                </label>
                <textarea
                  ref={i === 0 ? firstLine : undefined}
                  id={`try-${line.key}`}
                  rows={1}
                  value={texts[line.key] ?? line.text}
                  onChange={(e) => setTexts({ ...texts, [line.key]: e.target.value })}
                  className={`w-full resize-none rounded-[0.625rem] bg-transparent px-1 outline-none [field-sizing:content] focus-visible:shadow-[0_0_0_2px_var(--ink)] ${line.size}`}
                  style={{ fontFamily: family, color: fg, letterSpacing: `${tracking / 100}em`, lineHeight: leading / 100 }}
                />
              </div>
            ))}
          </div>

          {/* 조절: 데스크톱은 판 폭 양 끝에 맞춘 한 줄, 휴대폰은 접은 한 줄(지금 값 요약) */}
          <div className="mt-3 lg:mt-7">
            <button
              type="button"
              aria-expanded={controlsOpen}
              aria-controls="try-controls"
              onClick={() => setControlsOpen(!controlsOpen)}
              className={`flex h-12 w-full items-center gap-3 rounded-[0.875rem] px-3.5 text-left lg:hidden ${controlsOpen ? "border-2 border-border-active bg-bg-surface-strong" : "border-[1.5px] border-border-strong"}`}
            >
              <span className="shrink-0 text-sm font-bold">크기·간격·색 바꾸기</span>
              {!controlsOpen && (
                <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                  {scale}% · {trackingShown} · {(leading / 100).toFixed(1)} · {colorName(fgSwatches, fg)}/{colorName(bgSwatches, bg)}
                </span>
              )}
              <svg aria-hidden viewBox="0 0 12 8" className={`ml-auto h-2 w-3 shrink-0 transition-transform duration-(--dur-base) ${controlsOpen ? "rotate-180" : ""}`}>
                <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div id="try-controls" className={`${controlsOpen ? "flex" : "max-lg:hidden"} flex-col gap-3.5 pt-4 lg:flex lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:pt-0`}>
              <Range label="크기" value={scale} min={50} max={175} step={5} shown={`${scale}%`} onChange={setScale} />
              <Range label="글자 간격" value={tracking} min={-20} max={20} shown={trackingShown} onChange={setTracking} />
              <Range label="줄 간격" value={leading} min={100} max={200} step={5} shown={(leading / 100).toFixed(1)} onChange={setLeading} />
              <div className="flex gap-10 pt-1 lg:gap-8 lg:pt-0">
                <Swatches label="글자색" swatches={fgSwatches} value={fg} onChange={setFg} />
                <Swatches label="바탕색" swatches={bgSwatches} value={bg} onChange={setBg} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-13 leading-normal text-text-secondary lg:mt-5 lg:text-sm">
            칸을 누르면 문구를 고칠 수 있어요. <br className="lg:hidden" />
            <span className="max-lg:hidden">여기서 바꾼 글자 간격은 아래 시안에도 그대로 이어져요.</span>
            <span className="lg:hidden">바꾼 글자 간격은 아래 시안에도 이어져요.</span>
          </p>
        </Section>

        {/* ---------- 시안 ---------- */}
        <Section
          id="mockups"
          eyebrow="시안"
          title="가게에 걸어 봐요"
          desc={
            <>
              <span className="max-lg:hidden">가게 앞 간판, 테이블 위 메뉴판, 인스타 게시물 사진에 폰트를 얹어 보여 드려요.</span>
              <span className="lg:hidden">가게 앞 간판, 메뉴판, 인스타 사진에 얹어 보여 드려요.</span>
            </>
          }
        >
          <div className="mt-4 lg:mt-14">
            <LazyMount>
              <MockupTabs fontName={view.name} storeName={view.storeName} menu={menu} fontStyle={mockStyle} colors={view.colors} logo={view.logoUrl} />
            </LazyMount>
          </div>
        </Section>

        {/* ---------- 받기 ---------- */}
        <Section
          id="get"
          eyebrow="받기"
          title={
            <>
              쓸 곳을 고르면 <br className="lg:hidden" />
              맞는 파일을 드려요
            </>
          }
        >
          <ul className="mt-6 border-t border-border-active lg:mt-10">
            {(
              [
                { title: "컴퓨터에 설치해 쓰기", note: "워드·한글·포토샵·캔바 같은 프로그램에서", actions: [{ key: "ttf", label: "TTF 받기", run: () => dl.one("ttf") }] },
                {
                  title: "홈페이지·쇼핑몰에 쓰기",
                  note: "웹사이트에 바로 올리는 형식, CSS 코드도 복사해 가요",
                  actions: [
                    { key: "woff2", label: "WOFF2 받기", run: () => dl.one("woff2") },
                    { key: "css", label: dl.copied ? "복사했어요" : "CSS 복사", run: dl.copyCss },
                  ],
                },
                { title: "간판·인쇄 업체에 보내기", note: "업체에 그대로 넘기는 묶음 (OTF·TTF·라이선스)", actions: [{ key: "zip", label: "ZIP 받기", run: dl.all }] },
                { title: "다른 형식 골라 받기", note: "OTF · WOFF · 라이선스 파일만", actions: [{ key: "more", label: moreFormats ? "접기" : "형식 고르기", run: async () => setMoreFormats(!moreFormats) }] },
              ] as const
            ).map((row) => (
              <li key={row.title} className="flex flex-col gap-1 border-b border-border-active py-4 lg:grid lg:grid-cols-[22.5rem_minmax(0,1fr)_auto] lg:items-center lg:gap-0 lg:py-[1.375rem]">
                <span className="text-base font-bold lg:text-lg">{row.title}</span>
                <span className="text-sm leading-normal text-text-secondary lg:text-base">{row.note}</span>
                <span className="mt-2 flex flex-wrap gap-2.5 lg:mt-0 lg:justify-end">
                  {row.actions.map((a) => (
                    <SecondaryButton key={a.key} size="sm" disabled={!view.fontId || (!!dl.busy && a.key !== "more")} aria-expanded={a.key === "more" ? moreFormats : undefined} onClick={() => void a.run()}>
                      {dl.busy === a.key && <Spin />}
                      {a.label}
                    </SecondaryButton>
                  ))}
                </span>
                {row.actions[0].key === "more" && moreFormats && (
                  <span className="col-span-3 mt-3 flex flex-wrap gap-2.5 lg:justify-end">
                    {FONT_FILES.filter((f) => f.format === "otf" || f.format === "woff").map((f) => (
                      <SecondaryButton key={f.format} size="sm" disabled={!!dl.busy} onClick={() => void dl.one(f.format)}>
                        {dl.busy === f.format && <Spin />}
                        {f.label} 받기
                      </SecondaryButton>
                    ))}
                    <a href={RIGHTS.licenseUrl} download="OFL-1.1.txt" className="inline-flex h-10 items-center rounded-full border-2 border-border-active px-[1.125rem] text-sm font-bold hover:bg-bg-surface">
                      라이선스 받기
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {dl.error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-text-error">
              {dl.error}
            </p>
          )}
        </Section>

        {/* ---------- 쓸 수 있는 범위 ---------- */}
        <div className="mx-auto -mt-6 w-full max-w-[76rem] px-4 sm:px-5 lg:-mt-6 lg:px-10">
          <RightsCard id="rights" />
        </div>

        {/* ---------- 글자와 검사 ---------- */}
        <Section id="glyphs" eyebrow="글자" title="들어 있는 글자와 검사">
          <div className="mt-6 h-px bg-border-active max-lg:hidden lg:mt-10" />
          <div className="mt-4 grid gap-10 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_23.75rem] lg:gap-x-[3.75rem]">
            <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <UnderlineTabs
                  label="글자 묶음"
                  idPrefix="glyphs"
                  className="gap-x-5 lg:gap-x-8"
                  value={glyphTab}
                  onChange={(key) => {
                    setGlyphTab(key);
                    setCursor(null);
                    setLimit(FIRST_CELLS);
                    setConfirmFill(false);
                  }}
                  tabs={[
                    { value: "all" as const, label: `한글 ${present.length.toLocaleString()}` },
                    { value: "digits" as const, label: `숫자·부호 ${DIGITS_PUNCT.filter((c) => extrasSet.has(c)).length}` },
                    { value: "latin" as const, label: `영문 ${LATIN.filter((c) => extrasSet.has(c)).length}` },
                    { value: "missing" as const, label: `빠진 글자 ${fillCount}` },
                    ...(view.recheck.length ? [{ value: "check" as const, label: `다시 볼 글자 ${view.recheck.length}` }] : []),
                  ]}
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="글자나 U+ 코드로 찾기"
                  aria-label="글자 찾기"
                  className="mb-2 h-10 w-full rounded-full border-[1.5px] border-border-default px-4 text-15 outline-none placeholder:text-text-tertiary hover:border-border-strong focus:border-2 focus:border-border-active sm:w-56"
                />
              </div>

              <div id={tabPanelId("glyphs", glyphTab)} role="tabpanel" aria-labelledby={tabId("glyphs", glyphTab)} className="flex flex-col gap-4">
                {glyphTab === "missing" && fillCount > 0 && <p className="text-sm leading-[1.6] text-text-secondary lg:text-base">검사에서 끝내 떨어져 폰트에 들어가지 못한 글자예요. 이 폰트 스타일로 다시 그려 채울 수 있어요.</p>}
                {pickMode && (
                  <p className="text-sm leading-[1.6] text-text-secondary lg:text-base">
                    획 두께나 크기가 다른 글자와 조금 다른 글자예요. 마음에 안 드는 글자를 눌러 고르면 다시 그려요. <br className="max-lg:hidden" />
                    다시 그린 글자가 더 낫지 않으면 지금 글자를 그대로 둬요.
                  </p>
                )}
                {cells.length === 0 ? (
                  <p className="text-15 text-text-secondary">{glyphTab === "missing" && !q ? "빠진 글자가 없어요." : glyphTab === "check" && !q ? "다시 볼 글자가 없어요." : "찾는 글자가 없어요."}</p>
                ) : (
                  <div
                    ref={glyphGrid}
                    role="group"
                    aria-label="글자 표"
                    aria-describedby="glyph-keys"
                    onKeyDown={onGlyphKeys}
                    className={`grid gap-1.5 lg:gap-[0.4375rem] ${
                      pickMode ? "grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(6.25rem,6.25rem))] lg:gap-3" : "grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(4.375rem,1fr))]"
                    }`}
                  >
                    {shown.map((c, i) => (
                      <GlyphCell
                        key={c}
                        c={c}
                        on={pickMode ? picked.has(c) : polish === c}
                        ok={inFont(c)}
                        pick={pickMode}
                        tab={i === tabCell ? 0 : -1}
                        family={family}
                        mark={!!view.tweaks[c] || view.edited.includes(c)}
                        onSelect={onCell}
                      />
                    ))}
                  </div>
                )}
                <span id="glyph-keys" className="sr-only">
                  화살표 키로 글자를 옮겨 볼 수 있어요.
                </span>
                {cells.length > limit && (
                  <SecondaryButton size="sm" className="self-center" onClick={() => setLimit(limit + 480)}>
                    더 보기 · {(cells.length - limit).toLocaleString()}자 남음
                  </SecondaryButton>
                )}
                <p className="text-13 text-text-secondary lg:text-sm">{pickMode ? "글자 하나를 직접 손보려면 ‘한글’ 탭에서 그 글자를 누르세요. 다듬는 창이 열려요." : "글자를 누르면 그 글자를 다듬을 수 있어요."}</p>

                {glyphTab === "missing" &&
                  fillCount > 0 &&
                  (confirmFill ? (
                    <InlineConfirm label="빠진 글자 그리기 확인" className="flex max-w-[47.5rem] flex-col gap-3 rounded-[1.25rem] border-2 border-border-active p-5 lg:p-6">
                      <p className="text-lg font-bold lg:text-xl">빠진 글자 {fillCount.toLocaleString()}자만 그려요</p>
                      <p className="text-sm leading-[1.65] text-text-secondary lg:text-15">
                        이미 그린 글자와 직접 다듬은 글자는 그대로 들어가고, 폰트 파일은 새로 만들어져요. <br className="max-lg:hidden" />약 {fillMinutes}분 걸려요. 그리는 도중에 멈출 수 있고, 멈추면 지금 폰트 그대로 돌아와요.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <PrimaryButton disabled={busy} onClick={() => void run(() => api.rebuildProject(view.id))}>
                          {busy ? "시작하는 중" : "그리기 시작"}
                        </PrimaryButton>
                        <SecondaryButton data-autofocus disabled={busy} onClick={() => setConfirmFill(false)}>
                          취소
                        </SecondaryButton>
                      </div>
                    </InlineConfirm>
                  ) : (
                    <SecondaryButton className="self-start" disabled={busy} onClick={() => setConfirmFill(true)}>
                      빠진 글자 {fillCount.toLocaleString()}자 그리기
                    </SecondaryButton>
                  ))}
              </div>
            </div>

            {build && (
              <aside aria-label="상업용 검사" className="flex flex-col">
                <h3 className="text-base font-bold lg:pt-1 lg:text-17">
                  상업용 검사 7항목<span className="lg:hidden">{allPass ? " — 모두 통과" : ""}</span>
                </h3>
                <ul className="mt-3 flex flex-col gap-2.5 lg:mt-5 lg:gap-[1.125rem]">
                  {checkRows.map((c) => (
                    <li key={c.key} className="grid grid-cols-[1.125rem_1fr] gap-x-2.5 text-sm leading-[1.3] lg:grid-cols-[0.875rem_1fr] lg:gap-x-2.5 lg:text-15">
                      <span aria-hidden className={`font-bold ${c.pass ? "text-text-success" : "text-text-error"}`}>
                        {c.pass ? <CheckMark className="mt-px h-[1.125rem] w-[1.125rem] lg:h-3.5 lg:w-3.5" /> : "!"}
                      </span>
                      <span>
                        {c.text}
                        <span className="sr-only">{c.pass ? " 통과" : ""}</span>
                        {c.detail && <span className="block pt-1 text-13 break-words text-text-secondary">{c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <TextButton className="self-start max-lg:hidden" onClick={() => setPolish(cursor && KSX1001_HANGUL.has(cursor) ? cursor : (present[0] ?? null))}>
                  글자 하나 다듬기
                </TextButton>
              </aside>
            )}
          </div>
        </Section>

        {/* ---------- 기록 · 지우기 ---------- */}
        <section aria-labelledby="record-title" className="mx-auto w-full max-w-[76rem] px-4 sm:px-5 lg:px-10">
          <div className="flex items-center justify-between gap-3 pb-4 lg:pb-5">
            <h2 id="record-title" className="text-xl font-bold">
              제작 기록
            </h2>
            <TextButton onClick={() => saveBlob(new Blob([buildRecordText(view.name, view.record)], { type: "text/plain;charset=utf-8" }), `${view.name} 제작 기록.txt`)} className="py-1!">
              기록 받기
            </TextButton>
          </div>
          <div className={recordOpen ? "max-h-[28rem] overflow-y-auto" : ""}>
            <RecordLog newestFirst events={recordOpen ? view.record : view.record.slice(-5)} />
          </div>
          {view.record.length > 5 && (
            <TextButton onClick={() => setRecordOpen(!recordOpen)}>{recordOpen ? "최근 것만 보기" : `전체 보기 (${view.record.length})`}</TextButton>
          )}
          <div className="mt-6 lg:mt-10">
            {confirmDelete ? (
              <div role="group" aria-label="폰트 지우기 확인" onKeyDown={(e) => e.key === "Escape" && setConfirmDelete(false)} className="flex max-w-[40rem] flex-col gap-2 rounded-[1.25rem] border-2 border-border-active p-5 lg:p-6">
                <p className="text-lg font-bold lg:text-xl">이 폰트를 지울까요?</p>
                <p className="text-15 text-text-secondary">지우면 폰트 파일과 제작 기록을 다시 받을 수 없어요.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <SecondaryButton autoFocus onClick={() => setConfirmDelete(false)}>
                    그대로 두기
                  </SecondaryButton>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.deleteProject(view.id);
                        router.push("/fonts");
                      })
                    }
                    className="inline-flex h-[3.25rem] items-center rounded-full border-[1.5px] border-border-error px-6 text-base font-bold text-text-error transition-[background-color,transform] duration-(--dur-fast) hover:bg-bg-surface motion-safe:active:scale-[0.97] disabled:opacity-60"
                  >
                    지우기
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={deleteLink}
                type="button"
                onClick={() => {
                  deleteAsked.current = true;
                  setConfirmDelete(true);
                }}
                className="inline-flex items-center py-3 text-15 font-bold text-text-secondary underline decoration-1 underline-offset-[0.25em] hover:text-text-primary"
              >
                이 폰트 지우기
              </button>
            )}
          </div>
        </section>
      </div>

      {pickMode && (
        <SelectionBar
          placement="page"
          chars={[...picked]}
          disabled={busy}
          onCancel={() => setPicked(new Set())}
          onRedraw={() =>
            void run(async () => {
              await api.redrawGlyphs(view.id, [...picked]);
              setPicked(new Set());
            })
          }
        />
      )}

      {polish && (
        <GlyphPolish
          key={polish}
          view={view}
          char={polish}
          family={family}
          inFont={inFont(polish)}
          tweakable={KSX1001_HANGUL.has(polish)}
          onSaved={onChanged}
          onClose={closePolish}
        />
      )}
    </>
  );
}
