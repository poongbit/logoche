"use client";

// 폰트 스튜디오(11/2 B안, YoFont 스튜디오 배치를 따름). 위 카드: 이름(바로 고치기) · 즐겨찾기 · 원하는 느낌 · 받기.
// 왼쪽: 써 보기(예문 탭 · 크기 · 글자 간격 · 줄 간격 · 색) · 시안(간판·메뉴판·인스타, 예전 화면 5) · 글자 표 · 설치·홈페이지.
// 오른쪽: 문자 세트와 검사 · 권리 카드 · 제작 기록 · 지우기.
// YoFont와 다르게 뺀 것: 공개 범위(늘 나만 쓴다), 키를 붙인 CDN 주소(원본이 새어 나간다), 언어 추가.
// 11/4: '글자' 카드의 글자 하나 옆에 다듬기 편집기(GlyphPolish: 슬라이더·끌어서 바꾸기·직접 그리기·조정 기록)를 둔다. 10/30에 뺀 글자 편집기를 사용자 결정으로 되살린 것이다.

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LazyMount } from "@/components/LazyMount";
import { MockupTabs } from "@/components/Mockups";
import { GlyphPolish } from "@/components/fonts/GlyphPolish";
import { InlineConfirm } from "@/components/InlineConfirm";
import { RecordLog } from "@/components/RecordLog";
import { RightsCard } from "@/components/RightsCard";
import {
  DownloadMenu,
  HeartButton,
  StatusPill,
  formatDate,
} from "@/components/fonts/shared";
import { CheckIcon, Notice, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import {
  CHECKS,
  EXTRA_CHARS,
  MENU_BY_INDUSTRY,
  PANGRAM,
  PREVIEW_SENTENCES,
} from "@/lib/constants";
import { saveBlob } from "@/lib/files";
import { useGeneratedFont } from "@/lib/font";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import { buildRecordText } from "@/lib/record";
import type { ProjectView } from "@/lib/types";

type TabKey = "name" | "menu" | "sentence" | "para" | "digits";
const TABS: { key: TabKey; label: string; size: number }[] = [
  { key: "name", label: "가게 이름", size: 96 },
  { key: "menu", label: "메뉴", size: 48 },
  { key: "sentence", label: "문장", size: 72 },
  { key: "para", label: "단락", size: 32 },
  { key: "digits", label: "숫자", size: 48 },
];
const DIGITS_TEXT =
  "영업 10:00~21:00 (월요일 휴무)\n가격 3,500원 · 2개 6,000원\n문의 02-123-4567 · 오늘만 20% 할인!";
const FIRST_CELLS = 120; // 글자 표 처음 칸 수: 휴대폰 6칸 × 20줄. 240칸이면 설치 안내까지 2,000px 넘게 내려가야 했다
const code = (ch: string) =>
  `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`;

/** stackAside: 휴대폰 폭에서 옆 조각(탭)을 제목 아래 한 줄로 넓게 둔다 */
function Card({
  title,
  aside,
  stackAside,
  children,
  id,
}: {
  title: string;
  aside?: ReactNode;
  stackAside?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="flex scroll-mt-6 flex-col gap-4 border-t border-border-default pt-6 lg:pt-7"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-22 font-extrabold">{title}</h2>
        {aside && (
          <div
            className={stackAside ? "w-full sm:ml-auto sm:w-auto" : "ml-auto"}
          >
            {aside}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/** 보기 바꾸기 단추 묶음. 탭 역할(role="tab")은 화살표 키·탭 패널까지 갖춰야 해서, 눌림 상태(aria-pressed) 단추로 둔다(11/2 점검). */
function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 overflow-x-auto rounded-full bg-bg-surface p-1 [scrollbar-width:none]"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={value === t.key}
          onClick={() => onChange(t.key)}
          className={`h-10 flex-1 shrink-0 rounded-full px-2.5 text-15 whitespace-nowrap transition-colors sm:flex-none sm:px-3.5 ${
            value === t.key
              ? "bg-bg-inverse font-bold text-text-inverse"
              : "font-semibold hover:bg-bg-surface-strong"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  shown,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  shown: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-13 font-bold">
      <span className="flex justify-between">
        {label}
        <span className="text-text-secondary">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ds-range"
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
    </label>
  );
}

type Swatch = { color: string; name: string };

/** 같은 색이 겹치면 앞의 이름 하나만 둔다(로고 색은 자리로 읽어서 검정·흰색과 겹칠 수 있다) */
const uniqueSwatches = (list: (Swatch | null)[]) =>
  list.filter(
    (s, i): s is Swatch =>
      !!s &&
      list.findIndex(
        (x) => x?.color.toUpperCase() === s.color.toUpperCase(),
      ) === i,
  );

/** 색 견본: 화면 읽기 프로그램에는 색 코드 대신 이름('로고 대표색', '검정')을 읽어 준다(11/2 다시 점검) */
function Swatches({
  label,
  swatches,
  value,
  onChange,
  square,
}: {
  label: string;
  swatches: Swatch[];
  value: string;
  onChange: (c: string) => void;
  square?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      {swatches.map(({ color, name }) => (
        <button
          key={color}
          type="button"
          aria-label={`${label} ${name}`}
          aria-pressed={value === color}
          title={name}
          onClick={() => onChange(color)}
          className={`h-7 w-7 border-[1.5px] border-border-strong ${square ? "rounded-[0.625rem]" : "rounded-full"}`}
          style={{
            background: color,
            boxShadow:
              value === color
                ? "0 0 0 2px var(--bg), 0 0 0 4px var(--ink)"
                : undefined,
          }}
        />
      ))}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
      <path
        d="M3 13l.6-2.7 7.2-7.2a1.4 1.4 0 0 1 2 2l-7.2 7.2zM9.6 4.3l2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 글자 표 한 칸. memo라서 예문 입력처럼 글자 표와 상관없는 상태가 바뀔 때 120칸을 다시 그리지 않는다(11/4 성능 점검). */
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
      aria-label={`${c} ${code(c)}${ok ? "" : " · 빠짐"}${pick ? " · 다시 그리기" : ""}`}
      aria-pressed={on}
      onClick={() => onSelect(c, pick)}
      className={`relative aspect-square rounded-[0.625rem] text-[1.5rem] transition-colors hover:border-border-active ${
        on
          ? "border-2 border-border-active"
          : ok
            ? "border border-border-default"
            : "border-[1.5px] border-dashed border-border-strong bg-bg-surface text-text-secondary"
      } ${pick && on ? "bg-bg-surface" : ""}`}
      style={{
        fontFamily: ok ? family : GLYPH_FONT_STACK,
        fontSize: ok ? undefined : "1.125rem",
      }}
    >
      {c}
      {mark && (
        <span
          aria-hidden
          className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-text-secondary"
        />
      )}
      {pick && on && (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-bg-inverse p-0.5 text-text-inverse"
        >
          <path
            d="M4 8.5l2.5 2.5L12 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
});

export function Studio({
  view,
  onChanged,
}: {
  view: ProjectView;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const { state: fontState, fontFamily } = useGeneratedFont(
    view.fontId,
    view.revision,
    attempt,
  ); // revision: 글자를 다듬어 파일이 바뀌면 다시 불러온다
  const family = fontFamily ?? GLYPH_FONT_STACK;
  const fontStyle = useMemo<CSSProperties>(
    () => ({ fontFamily: family }),
    [family],
  ); // 시안이 memo라 같은 값이면 다시 그리지 않는다

  const [name, setName] = useState(view.name);
  const [copied, setCopied] = useState<{ key: string; ok: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const deleteAsked = useRef(false);
  const [recordOpen, setRecordOpen] = useState(false);

  // 지우기 확인을 닫으면 키보드 위치를 '폰트 지우기' 단추로 돌려놓는다
  useEffect(() => {
    if (!confirmDelete && deleteAsked.current) deleteButton.current?.focus();
  }, [confirmDelete]);

  // 써 보기
  const industry = view.upload.industry;
  const menu = industry
    ? MENU_BY_INDUSTRY[industry]
    : MENU_BY_INDUSTRY.snack_korean;
  const defaults: Record<TabKey, string> = {
    name: view.storeName,
    menu: menu.map(([item, price]) => `${item}  ${price}`).join("\n"),
    // 11/4: AI가 가게에 맞게 쓴 문장이 있으면 그것을 먼저 보여 준다(없으면 이전처럼 업종별 고정 문장)
    sentence: view.slogans.length
      ? `${view.slogans.join("\n")}\n${PANGRAM}`
      : PANGRAM,
    para: `${view.slogans[0] ? `${view.slogans[0]}. ` : industry ? `${PREVIEW_SENTENCES[industry]}. ` : ""}매일 아침 직접 만든 재료로 정성껏 준비합니다. 오늘도 찾아 주셔서 고맙습니다.`,
    digits: DIGITS_TEXT,
  };
  const [tab, setTab] = useState<TabKey>("name");
  const [texts, setTexts] = useState<Partial<Record<TabKey, string>>>({});
  const [size, setSize] = useState(96);
  const [tracking, setTracking] = useState(0);
  const [leading, setLeading] = useState(140);
  const [fg, setFg] = useState("#111111");
  const [bg, setBg] = useState("#FFFFFF");
  const [main, dark, light] = view.colors; // 로고에서 뽑은 [대표색, 어두운 색, 밝은 색]
  const logoSwatch = (color: string | undefined, name: string) =>
    color ? { color, name } : null;
  const fgSwatches = uniqueSwatches([
    { color: "#111111", name: "검정" },
    logoSwatch(dark, "로고 어두운 색"),
    logoSwatch(main, "로고 대표색"),
    { color: "#FFFFFF", name: "흰색" },
  ]);
  const bgSwatches = uniqueSwatches([
    { color: "#FFFFFF", name: "흰색" },
    { color: "#EFEEEA", name: "연한 회색" },
    logoSwatch(light, "로고 밝은 색"),
    logoSwatch(dark, "로고 어두운 색"),
  ]);

  // 글자 표
  const missingSet = useMemo(() => new Set(view.missing), [view.missing]);
  const present = useMemo(
    () => [...KSX1001_HANGUL].filter((c) => !missingSet.has(c)),
    [missingSet],
  );
  // check: 다시 볼 글자(11/2 품질 개선 2-3). 획 두께·크기가 기준에서 가장 많이 벗어난 글자. 눌러 여러 개 고르고 한꺼번에 다시 그린다.
  type GlyphTab = "all" | "missing" | "extras" | "check";
  const [glyphTab, setGlyphTab] = useState<GlyphTab>("all");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(FIRST_CELLS);
  const source =
    glyphTab === "all"
      ? present
      : glyphTab === "missing"
        ? view.missing
        : glyphTab === "check"
          ? view.recheck
          : [...EXTRA_CHARS];
  const q = query.trim().toLowerCase().replace(/^u\+?/, "");
  const cells = q
    ? source.filter(
        (c) =>
          query.includes(c) || code(c).toLowerCase().slice(2).startsWith(q),
      )
    : source;
  const [selected, setSelected] = useState<string | null>(null);
  const sel =
    selected && cells.includes(selected) ? selected : (cells[0] ?? null);
  const inFont = (c: string) =>
    KSX1001_HANGUL.has(c) ? !missingSet.has(c) : view.extras.includes(c);
  const shown = cells.slice(0, limit);
  const glyphGrid = useRef<HTMLDivElement>(null);
  const onCell = useCallback((c: string, pick: boolean) => {
    setSelected(c);
    if (pick)
      setPicked((prev) => {
        const next = new Set(prev);
        if (!next.delete(c)) next.add(c);
        return next;
      });
  }, []);

  // 글자 표는 Tab 한 번으로 들어가고(고른 칸 하나만 Tab에 멈춘다) 안에서는 화살표로 옮긴다. 240칸을 Tab으로 다 지나지 않게(11/2 다시 점검).
  const tabCell = Math.max(0, sel ? shown.indexOf(sel) : 0);
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
      End: e.ctrlKey
        ? shown.length - 1
        : Math.min(shown.length - 1, rowStart + cols - 1),
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const next = moves[e.key];
    if (next < 0 || next >= shown.length) return;
    setSelected(shown[next]);
    (grid.children[next] as HTMLElement).focus();
  }

  // 설치
  const [install, setInstall] = useState<"pc" | "css">("pc");
  const css = `@font-face {\n  font-family: "${view.name}";\n  src: url("/fonts/${view.name}.woff2") format("woff2");\n  font-display: swap;\n}\nh1 { font-family: "${view.name}", sans-serif; }`;

  async function copy(key: string, text: string) {
    const ok = await navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
    setCopied({ key, ok });
    setTimeout(
      () => setCopied((c) => (c?.key === key ? null : c)),
      ok ? 1500 : 3000,
    );
  }
  const copyLabel = (key: string) =>
    copied?.key === key
      ? copied.ok
        ? "복사했어요"
        : "복사하지 못했어요"
      : "복사";

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

  function saveName() {
    const next = name.trim();
    if (!next) return setName(view.name);
    if (next !== view.name)
      void run(() => api.updateProject(view.id, { name: next }));
  }

  const build = view.build;
  const glyphCount = view.glyphCount ?? present.length;
  const canRedraw =
    view.missing.length > 0 || view.extras.length < EXTRA_CHARS.length;
  // 빠진 글자 그리기(11/4): 안 그린 글자만 그린다(rest.ts plan). 장 수와 시간은 어림(장 35초, 동시 8장, 폰트 만들기 약 1분)
  const [confirmFill, setConfirmFill] = useState(false);
  const extrasMissing = EXTRA_CHARS.length - view.extras.length;
  const fillCount = view.missing.length + extrasMissing;
  const fillSheets =
    Math.ceil(view.missing.length / 30) + (extrasMissing > 0 ? 1 : 0);
  const fillMinutes = Math.max(
    2,
    Math.ceil((Math.ceil(fillSheets / 8) * 35 + 70) / 60),
  );
  const meta = [
    "GPT Image",
    `한글 ${glyphCount.toLocaleString()}자`,
    `숫자·부호 ${view.extras.length}자`,
    formatDate(view.createdAt),
  ];

  return (
    <>
      <div className="bg-bg-theme-strong">
        <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-5 px-5 pt-6 pb-8 lg:px-10 lg:pb-10">
          <Link
            href="/fonts"
            className="-my-2.5 inline-flex items-center gap-1.5 self-start py-2.5 text-15 font-bold text-text-secondary hover:text-text-primary"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4">
              <path
                d="M10 3L5 8l5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            내 폰트
          </Link>

          <h1 className="sr-only">{view.name}</h1>
          <section
            aria-label="폰트 정보"
            className="flex flex-wrap items-center gap-5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 사용자가 올린 로고 */}
            <img
              src={view.logoUrl}
              alt={`${view.storeName} 로고`}
              className="h-14 w-28 shrink-0 rounded-[0.875rem] bg-bg-surface-strong object-contain p-1"
            />
            <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <input
                  id="font-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    e.currentTarget.blur()
                  }
                  maxLength={40}
                  style={{
                    width: `calc(${Math.max(3, [...name].length)}em + 1rem)`,
                  }}
                  className="peer -ml-1.5 h-12 max-w-full min-w-0 rounded-[0.625rem] border-[1.5px] border-transparent bg-transparent px-1.5 text-26 font-extrabold outline-none hover:border-border-strong focus:border-2 focus:border-border-active lg:text-32"
                />
                {/* 이름을 고칠 수 있다는 표시(휴대폰에는 마우스 올림이 없다). 누르면 이름 칸으로 간다. */}
                <label
                  htmlFor="font-name"
                  title="이름 고치기"
                  className="grid h-9 w-9 shrink-0 cursor-text place-items-center rounded-full text-text-secondary transition-colors hover:bg-bg-surface hover:text-text-primary peer-focus:invisible"
                >
                  <span className="sr-only">폰트 이름</span>
                  <PencilIcon />
                </label>
                <HeartButton
                  label={view.name}
                  on={view.favorite}
                  onToggle={() =>
                    void run(() =>
                      api.updateProject(view.id, { favorite: !view.favorite }),
                    )
                  }
                  size={20}
                />
                <StatusPill phase={view.phase} />
              </div>
              {view.desiredFeel && (
                <div className="flex flex-wrap items-center gap-2 text-15">
                  <span className="line-clamp-2 max-w-[60ch]">
                    {view.desiredFeel}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy("feel", view.desiredFeel)}
                    className="h-9 rounded-full border-[1.5px] border-border-strong px-3 text-13 font-bold hover:border-border-active"
                  >
                    {copyLabel("feel")}
                  </button>
                </div>
              )}
              <span className="text-13 text-text-secondary">
                {meta.join(" · ")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="#mockups"
                className="inline-flex h-12 items-center rounded-full border-[1.5px] border-border-strong px-5 text-15 font-bold hover:border-border-active hover:bg-bg-surface"
              >
                시안 보기
              </a>
              {view.fontId && (
                <DownloadMenu
                  fontId={view.fontId}
                  fontName={view.name}
                  loadRecord={async () => view.record}
                  primary
                  align="right"
                />
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-5 px-5 pt-6 pb-16 lg:px-10">
        {error && <Notice tone="error">{error}</Notice>}
        {fontState === "loading" && <Spinner label="폰트 파일을 불러오는 중" />}
        {fontState === "unavailable" && (
          <Notice tone="warn">
            <span className="flex flex-wrap items-center gap-3">
              폰트 파일을 불러오지 못해 기본 글꼴로 보여 주고 있어요.
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="font-bold underline underline-offset-4"
              >
                다시 불러오기
              </button>
            </span>
          </Notice>
        )}

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <Card
              title="써 보기"
              stackAside
              aside={
                <Tabs
                  label="예문"
                  tabs={TABS}
                  value={tab}
                  onChange={(key) => {
                    setTab(key);
                    setSize(TABS.find((t) => t.key === key)!.size);
                  }}
                />
              }
            >
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-x-6 gap-y-4">
                <Range
                  label="크기"
                  value={size}
                  min={18}
                  max={200}
                  shown={`${size}px`}
                  onChange={setSize}
                />
                <Range
                  label="글자 간격"
                  value={tracking}
                  min={-10}
                  max={30}
                  shown={`${tracking > 0 ? "+" : ""}${tracking}`}
                  onChange={setTracking}
                />
                <Range
                  label="줄 간격"
                  value={leading}
                  min={100}
                  max={200}
                  shown={(leading / 100).toFixed(2)}
                  onChange={setLeading}
                />
                <div className="flex flex-col gap-2 text-13 font-bold">
                  글자색 · 바탕색
                  <div className="flex flex-wrap items-center gap-3">
                    <Swatches
                      label="글자색"
                      swatches={fgSwatches}
                      value={fg}
                      onChange={setFg}
                    />
                    <span aria-hidden className="h-5 w-px bg-border-default" />
                    <Swatches
                      label="바탕색"
                      swatches={bgSwatches}
                      value={bg}
                      onChange={setBg}
                      square
                    />
                  </div>
                </div>
              </div>
              <label htmlFor="tester" className="sr-only">
                예문 (고쳐 쓸 수 있어요)
              </label>
              <textarea
                id="tester"
                value={texts[tab] ?? defaults[tab]}
                onChange={(e) => setTexts({ ...texts, [tab]: e.target.value })}
                rows={tab === "para" ? 5 : 4}
                className="min-h-[16rem] w-full resize-y rounded-[1.25rem] border border-border-default px-6 py-5 outline-none [field-sizing:content] focus:shadow-[inset_0_0_0_2px_var(--ink)]"
                style={{
                  ...fontStyle,
                  fontSize: size,
                  letterSpacing: `${tracking / 100}em`,
                  lineHeight: leading / 100,
                  color: fg,
                  background: bg,
                }}
              />
            </Card>

            <Card title="시안" id="mockups">
              <LazyMount>
                <MockupTabs
                  fontName={view.name}
                  storeName={view.storeName}
                  menu={menu}
                  fontStyle={fontStyle}
                  colors={view.colors}
                  logo={view.logoUrl}
                />
              </LazyMount>
            </Card>

            <Card
              title="글자"
              stackAside
              aside={
                <Tabs
                  label="글자 묶음"
                  tabs={[
                    {
                      key: "all" as const,
                      label: `한글 ${present.length.toLocaleString()}`,
                    },
                    {
                      key: "missing" as const,
                      label: `빠진 글자 ${view.missing.length}`,
                    },
                    {
                      key: "extras" as const,
                      label: `숫자·부호 ${view.extras.length}`,
                    },
                    ...(view.recheck.length
                      ? [
                          {
                            key: "check" as const,
                            label: `다시 볼 글자 ${view.recheck.length}`,
                          },
                        ]
                      : []),
                  ]}
                  value={glyphTab}
                  onChange={(key) => {
                    setGlyphTab(key);
                    setSelected(null);
                    setLimit(FIRST_CELLS);
                  }}
                />
              }
            >
              {glyphTab === "check" && (
                <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] bg-bg-surface px-5 py-4">
                  <span className="min-w-0 flex-[1_1_16rem] text-15 font-semibold">
                    획 두께나 크기가 다른 글자와 조금 다른 글자예요. 마음에 안
                    드는 글자를 눌러 고르면 다시 그려요. 다시 그린 글자가 더
                    낫지 않으면 지금 글자를 그대로 둬요.
                  </span>
                  <button
                    type="button"
                    disabled={busy || picked.size === 0}
                    onClick={() =>
                      void run(() => api.redrawGlyphs(view.id, [...picked]))
                    }
                    className="ml-auto h-10 rounded-full bg-bg-inverse px-4 text-15 font-bold text-text-inverse hover:bg-bg-inverse-hover disabled:bg-bg-disabled disabled:text-text-disabled"
                  >
                    {picked.size
                      ? `고른 ${picked.size}자 다시 그리기`
                      : "다시 그릴 글자를 골라 주세요"}
                  </button>
                </div>
              )}
              {canRedraw && glyphTab !== "check" && (
                <div className="flex flex-col gap-3 rounded-[1.25rem] bg-bg-surface px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-[1_1_16rem] text-15 font-semibold">
                      빠진 글자 {fillCount.toLocaleString()}자를 이 폰트
                      스타일로 그려요. 이미 그린 글자는 그대로 둬요.
                    </span>
                    {!confirmFill && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmFill(true)}
                        className="ml-auto h-10 rounded-full bg-bg-inverse px-4 text-15 font-bold text-text-inverse hover:bg-bg-inverse-hover disabled:bg-bg-disabled disabled:text-text-disabled"
                      >
                        빠진 글자 그리기
                      </button>
                    )}
                  </div>
                  {confirmFill && (
                    <InlineConfirm
                      label="빠진 글자 그리기 확인"
                      className="flex flex-col gap-3 rounded-[0.875rem] border-[1.5px] border-border-active bg-bg-canvas p-4 text-15 leading-normal"
                    >
                      <p>
                        <b>빠진 글자 {fillCount.toLocaleString()}자만</b>{" "}
                        그려요. 이미 그린 글자와 직접 다듬은 글자는 그대로
                        들어가고, 폰트 파일은 새로 만들어져요. 약 {fillMinutes}
                        분 걸려요.
                      </p>
                      <p className="text-text-secondary">
                        그리는 도중에 중단할 수 있어요. 중단하면 지금 폰트
                        그대로 돌아와요.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(() => api.rebuildProject(view.id))
                          }
                          className="h-10 rounded-full bg-bg-inverse px-4 text-15 font-bold text-text-inverse hover:bg-bg-inverse-hover disabled:bg-bg-disabled disabled:text-text-disabled"
                        >
                          {busy ? "시작하는 중" : "그리기 시작"}
                        </button>
                        <button
                          type="button"
                          data-autofocus
                          disabled={busy}
                          onClick={() => setConfirmFill(false)}
                          className="h-10 rounded-full border-[1.5px] border-border-strong px-4 text-15 font-bold hover:border-border-active"
                        >
                          취소
                        </button>
                      </div>
                    </InlineConfirm>
                  )}
                </div>
              )}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="글자나 U+ 코드로 찾기"
                aria-label="글자 찾기"
                className="h-10 w-full max-w-[18rem] rounded-full border-[1.5px] border-border-strong px-4 text-15 font-medium outline-none placeholder:text-text-secondary hover:border-border-active focus:border-2 focus:border-border-active"
              />
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  {cells.length === 0 ? (
                    <p className="text-15 text-text-secondary">
                      {glyphTab === "missing" && !q
                        ? "빠진 글자가 없어요."
                        : glyphTab === "check" && !q
                          ? "다시 볼 글자가 없어요."
                          : "찾는 글자가 없어요."}
                    </p>
                  ) : (
                    <div
                      ref={glyphGrid}
                      role="group"
                      aria-label="글자 표"
                      aria-describedby="glyph-keys"
                      onKeyDown={onGlyphKeys}
                      className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5"
                    >
                      {shown.map((c, i) => (
                        <GlyphCell
                          key={c}
                          c={c}
                          on={glyphTab === "check" ? picked.has(c) : sel === c}
                          ok={inFont(c)}
                          pick={glyphTab === "check"}
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
                    <button
                      type="button"
                      onClick={() => setLimit(limit + 480)}
                      className="h-10 self-center rounded-full border-[1.5px] border-border-strong px-4 text-15 font-bold hover:border-border-active hover:bg-bg-surface"
                    >
                      더 보기 · {(cells.length - limit).toLocaleString()}자 남음
                    </button>
                  )}
                </div>
                {sel && (
                  <div className="order-first min-w-0 lg:order-none lg:w-[22rem] lg:shrink-0">
                    <GlyphPolish
                      key={sel}
                      view={view}
                      char={sel}
                      family={family}
                      inFont={inFont(sel)}
                      tweakable={KSX1001_HANGUL.has(sel)}
                      onSaved={onChanged}
                    />
                  </div>
                )}
              </div>
            </Card>

            <Card
              title="설치 · 홈페이지"
              stackAside
              aside={
                <Tabs
                  label="쓰는 곳"
                  tabs={[
                    { key: "pc" as const, label: "컴퓨터에 설치" },
                    { key: "css" as const, label: "홈페이지 CSS" },
                  ]}
                  value={install}
                  onChange={setInstall}
                />
              }
            >
              {install === "pc" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Mac", "TTF 파일을 두 번 누르고 '설치'를 눌러요."],
                    [
                      "Windows",
                      "TTF 파일을 마우스 오른쪽으로 누르고 '설치'를 골라요.",
                    ],
                    [
                      "간판·인쇄 업체",
                      "'모두 받기' zip을 그대로 보내면 제작 기록까지 함께 가요.",
                    ],
                  ].map(([title, text]) => (
                    <div
                      key={title}
                      className="flex flex-col gap-1.5 rounded-[1.25rem] bg-bg-surface px-5 py-4 text-15 leading-normal"
                    >
                      <span className="font-extrabold">{title}</span>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-15">
                    받은 WOFF2 파일을 내 홈페이지에 올리고 아래처럼 쓰세요.
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-[1.25rem] bg-bg-inverse px-6 py-5 font-mono text-13 leading-relaxed text-text-inverse">
                      <code>{css}</code>
                    </pre>
                    <button
                      type="button"
                      onClick={() => void copy("css", css)}
                      className="absolute top-3 right-3 h-8 rounded-full border-[1.5px] border-border-strong px-3 text-13 font-bold text-text-inverse"
                    >
                      {copyLabel("css")}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <aside className="flex flex-col gap-5 lg:w-[22rem] lg:shrink-0">
            <Card title="문자 세트">
              <div className="flex items-baseline gap-1.5">
                <span className="text-26 font-extrabold">
                  {glyphCount.toLocaleString()}
                </span>
                <span className="text-15 font-semibold text-text-secondary">
                  / {KSX1001_HANGUL.size.toLocaleString()}자
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-sm bg-bg-inverse">
                <div
                  className="h-full bg-bg-brand"
                  style={{
                    width: `${(glyphCount / KSX1001_HANGUL.size) * 100}%`,
                  }}
                />
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-15">
                <dt className="text-text-secondary">숫자·문장부호</dt>
                <dd className="text-right font-semibold">
                  {view.extras.length} / {EXTRA_CHARS.length}자
                </dd>
              </dl>
              {build && (
                <ul
                  aria-label="검사"
                  className="flex flex-col border-t border-border-default text-15"
                >
                  {[
                    ...CHECKS.map((c) => {
                      const result = build.checks.find((x) => x.key === c.key);
                      return {
                        key: c.key,
                        label: c.label,
                        pass: result?.status === "pass",
                        detail: result?.detail,
                      };
                    }),
                    {
                      key: "ocr",
                      label: "AI 판독",
                      pass: build.ocrPassed,
                      detail: build.misreads.length
                        ? `${build.misreads.length}자 다르게 읽음`
                        : "모두 맞게 읽음",
                    },
                  ].map((c) => (
                    <li
                      key={c.key}
                      className="grid grid-cols-[1.25rem_1fr] gap-x-2.5 gap-y-0.5 border-b border-border-default py-2.5 last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className={`mt-px grid h-5 w-5 place-items-center rounded-full text-12 font-extrabold ${c.pass ? "bg-bg-surface-strong" : "border-[1.5px] border-border-strong text-text-secondary"}`}
                      >
                        {c.pass ? <CheckIcon className="h-2.5 w-2.5" /> : "!"}
                      </span>
                      <span className="font-bold">
                        {c.label}
                        <span className="sr-only">
                          {c.pass ? " 통과" : " 확인 필요"}
                        </span>
                      </span>
                      {c.detail && (
                        <span className="col-start-2 text-13 leading-snug break-words text-text-secondary">
                          {c.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="border-t border-border-default pt-6 lg:pt-7">
              <RightsCard bare />
            </div>

            <Card
              title="제작 기록"
              aside={
                <button
                  type="button"
                  onClick={() =>
                    saveBlob(
                      new Blob([buildRecordText(view.name, view.record)], {
                        type: "text/plain;charset=utf-8",
                      }),
                      `${view.name} 제작 기록.txt`,
                    )
                  }
                  className="h-8 rounded-full border-[1.5px] border-border-strong px-3 text-13 font-bold hover:border-border-active"
                >
                  받기
                </button>
              }
            >
              <div
                className={recordOpen ? "max-h-[28rem] overflow-y-auto" : ""}
              >
                <RecordLog
                  bare
                  events={recordOpen ? view.record : view.record.slice(-5)}
                />
              </div>
              {view.record.length > 5 && (
                <button
                  type="button"
                  onClick={() => setRecordOpen(!recordOpen)}
                  className="-my-1 inline-flex min-h-11 items-center self-start text-15 font-bold underline underline-offset-4"
                >
                  {recordOpen
                    ? "최근 것만 보기"
                    : `전체 보기 (${view.record.length})`}
                </button>
              )}
            </Card>

            {confirmDelete ? (
              <div
                role="group"
                aria-label="폰트 지우기 확인"
                onKeyDown={(e) => e.key === "Escape" && setConfirmDelete(false)}
                className="flex flex-col gap-3 rounded-[1.25rem] border-2 border-border-error bg-bg-canvas p-5"
              >
                <p className="text-15 font-semibold">
                  지우면 폰트 파일과 제작 기록을 다시 받을 수 없어요. 지울까요?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.deleteProject(view.id);
                        router.push("/fonts");
                      })
                    }
                    className="h-10 rounded-full bg-bg-error px-4 text-15 font-bold text-text-inverse disabled:opacity-60"
                  >
                    지우기
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmDelete(false)}
                    className="h-10 rounded-full border-[1.5px] border-border-strong px-4 text-15 font-bold hover:border-border-active hover:bg-bg-surface"
                  >
                    그만두기
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={deleteButton}
                type="button"
                onClick={() => {
                  deleteAsked.current = true;
                  setConfirmDelete(true);
                }}
                className="h-10 self-start rounded-full border-[1.5px] border-border-error px-4 text-15 font-bold text-text-error hover:bg-bg-surface"
              >
                폰트 지우기
              </button>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
