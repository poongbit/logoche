"use client";

import { useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Highlight } from "./DisplayTitle";

// 11/6 스티커(피그마 12 '스티커 팩 3차', 메인 427:9, 스튜디오 549:402).
// 스티커는 사실을 말할 때만 쓴다(README 2장). 11/6 밤: 등장 모션('붙기')은 완성 도장에만(첫 방문, 붙기 + 빛 한 번).
// 번호표·말풍선·별 터짐은 처음부터 붙어 있고, 번호표만 남은 시간이 바뀔 때 숫자를 세로로 넘긴다(바뀐 걸 알리는 모션).
// 크기는 width(px, 16px 기준 rem으로 바꿈) 하나로 정하고, 안쪽은 컨테이너 단위(cqw)로 피그마 비율 그대로 줄어든다.
// rotate는 화면에서 보이는 기울기(CSS 각도, 양수 = 시계 방향). 피그마의 rotation과 부호가 반대다.

const rem = (px: number) => `${px / 16}rem`;

/** 스티커 바깥 틀: 크기·기울기. animate는 완성 도장의 '붙기'에만 쓴다. */
function stickerRoot(width: number, aspect: number, rotate: number, animate: boolean, extra?: CSSProperties) {
  return {
    className: `relative inline-block shrink-0 select-none [container-type:inline-size] ${animate ? "ds-motion animate-ds-stick" : ""}`,
    style: {
      width: rem(width),
      aspectRatio: aspect,
      "--sticker-rot": `${rotate}deg`,
      transform: "rotate(var(--sticker-rot))",
      ...extra,
    } as CSSProperties,
  };
}

/** 별 모양 clip-path(점 수, 안쪽 반지름 비율). 모서리 둥글림(피그마 3px)은 크기에 비해 작아 뺐다. */
function starPolygon(points: number, inner: number) {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 50 : 50 * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    out.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${out.join(",")})`;
}
const STAMP_STAR = starPolygon(28, 0.9);
const BURST_STAR = starPolygon(16, 0.8);

/* ---------- 번호표 ---------- */

export type TicketTime = {
  prefix?: string;
  value: string;
  unit?: string;
  /** 0 이하일 때만 '남은 시간'(위 줄을 바꾼다). 평소엔 키가 없어 화면이 넘긴 위 줄이 남는다. */
  topLine?: string;
  /** 화면 읽기용 한 줄('약 15분', '확인 중') */
  srValue: string;
};

/**
 * 서버 남은 시간(초) → 번호표 큰 글자. 분 단위 올림('약 N분'). 0 이하·없음이면 '남은 시간 / 확인 중'(screens.md '번호표').
 * 쓰는 법: <Ticket topLine="완성까지" bottomLine="다 되면 메일로 알려 드려요" {...ticketTime(remainingSeconds)} /> — 펼침을 뒤에 둔다.
 */
export function ticketTime(seconds: number | null | undefined): TicketTime {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return { value: "확인 중", topLine: "남은 시간", srValue: "확인 중" };
  const m = Math.ceil(seconds / 60);
  return { prefix: "약", value: String(m), unit: "분", srValue: `약 ${m}분` };
}

export type TicketProps = {
  /** 위 줄. 메인 '폰트 나오는 데', 만드는 중 '완성까지', 차례 기다림 '지금은' */
  topLine?: string;
  /** 큰 글자 앞 작은 말('약') */
  prefix?: string;
  /** 큰 글자('15', '확인 중', '대기 중') */
  value: string;
  /** 큰 글자 뒤('분') */
  unit?: string;
  /** 아래 줄. 메인 '호출하면 받아 가세요', 만드는 중 '다 되면 메일로 알려 드려요' */
  bottomLine?: string;
  /** 떼는 칸 두 줄('로고' / '1장') */
  stubTop?: string;
  stubValue?: string;
  /** 화면 읽기용 큰 글자(ticketTime의 srValue). 없으면 prefix+value+unit */
  srValue?: string;
  /** 폭 px — 메인 데스크톱 256 · 모바일 152 */
  width?: number;
  /** 보이는 기울기(deg). 메인 10° */
  rotate?: number;
  className?: string;
};

/** 번호표(피그마 424:300 '약 15분 번호표'). 민트 몸통 + 먹 떼는 칸 + 양쪽 반원 홈 + 흰 칼선. 숫자가 바뀌면 200ms 세로로 넘긴다. */
export function Ticket({
  topLine = "폰트 나오는 데",
  prefix,
  value,
  unit,
  bottomLine = "호출하면 받아 가세요",
  stubTop = "로고",
  stubValue = "1장",
  srValue,
  width = 256,
  rotate = 10,
  className = "",
}: TicketProps) {
  const maskId = `ticket-${useId().replace(/:/g, "")}`;
  // 값이 바뀐 뒤에만 넘김 모션(처음 나타날 때는 움직이지 않는다). React의 '이전 값 기억' 방식.
  const [shown, setShown] = useState(value);
  const [changed, setChanged] = useState(false);
  if (shown !== value) {
    setShown(value);
    setChanged(true);
  }
  const word = !prefix && !unit; // '확인 중'처럼 글자만 있을 때는 조금 작게
  const root = stickerRoot(width, 532 / 272, rotate, false, { "--u": "calc(100cqw / 532)" } as CSSProperties);
  const u = (n: number) => `calc(var(--u) * ${n})`;
  return (
    <div {...root} className={`${root.className} ${className}`} role="img" aria-label={`${topLine} ${srValue ?? `${prefix ?? ""} ${value}${unit ?? ""}`.trim()}, ${bottomLine}. ${stubTop} ${stubValue}`}>
      <svg aria-hidden viewBox="0 0 532 272" className="absolute inset-0 h-full w-full overflow-visible [filter:var(--sticker-shadow)]">
        <defs>
          <mask id={maskId}>
            <rect x="31" y="31" width="470" height="210" rx="18" fill="white" />
            <circle cx="31" cy="136" r="20" fill="black" />
            <circle cx="501" cy="136" r="20" fill="black" />
          </mask>
        </defs>
        {/* 칼선(흰 테두리 25) */}
        <rect x="6" y="6" width="520" height="260" rx="43" className="fill-bg-canvas" />
        <g mask={`url(#${maskId})`}>
          <rect x="31" y="31" width="470" height="210" className="fill-bg-brand" />
          <rect x="31" y="31" width="140" height="210" className="fill-bg-inverse" />
        </g>
      </svg>
      <div aria-hidden className="absolute inset-0">
        {/* 떼는 칸 */}
        <div className="absolute flex flex-col items-center" style={{ left: u(36), width: u(130), top: u(91) }}>
          <span className="font-black whitespace-nowrap text-text-inverse" style={{ fontSize: u(20), lineHeight: 1.2 }}>
            {stubTop}
          </span>
          <span className="mt-[calc(var(--u)*6)] font-display whitespace-nowrap text-bg-brand" style={{ fontSize: u(60), lineHeight: 1 }}>
            {stubValue}
          </span>
        </div>
        {/* 몸통 */}
        <div className="absolute flex flex-col items-center text-text-on-brand" style={{ left: u(176), width: u(300), top: u(63) }}>
          <span className="font-black whitespace-nowrap" style={{ fontSize: u(21), lineHeight: 1.2 }}>
            {topLine}
          </span>
          <span className="flex items-center justify-center overflow-hidden" style={{ height: u(92), marginTop: u(4), width: "100%" }}>
            <span
              key={value}
              className={`flex items-baseline font-display leading-none tracking-[-0.03em] whitespace-nowrap ${changed ? "ds-motion animate-ds-roll" : ""}`}
            >
              {prefix && <span style={{ fontSize: u(36) }}>{prefix}&nbsp;</span>}
              <span style={{ fontSize: u(word ? 64 : 92) }}>{value}</span>
              {unit && <span style={{ fontSize: u(52) }}>{unit}</span>}
            </span>
          </span>
          <span className="font-black whitespace-nowrap" style={{ fontSize: u(17), lineHeight: 1.2, marginTop: u(6) }}>
            {bottomLine}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 완성 도장 ---------- */

export type CompletionStampProps = {
  /** 도장 위쪽 작은 글자(폰트 이름 '한결국수체'). 없으면 '완성'만 */
  name?: string;
  /** 폭 px — 스튜디오 데스크톱 150 · 모바일 96 */
  size?: number;
  /** 보이는 기울기(deg). 스튜디오 −8° */
  rotate?: number;
  /** 빛이 한 번 지나가기(붙은 뒤 600ms). 완성 '순간'에만 true — 다시 들어올 때는 false(motion.md '언제 재생하나'). */
  shine?: boolean;
  /** 처음 나타날 때 '붙기' 한 번(스튜디오 첫 방문에만 도장을 그린다) */
  animate?: boolean;
  className?: string;
};

/**
 * '완성' 도장(피그마 186:21 '3차/완성 도장', 스튜디오 549:416). 민트 28각 별 + 먹 고리 + 흰 칼선.
 * 빛: shine이면 한 번 훑고 멈춘다. 마우스가 있는 기기에서는 올렸을 때 빛이 포인터를 따라간다. 움직임 줄이기에서는 멈춘 빛 한 줄.
 */
export function CompletionStamp({ name, size = 150, rotate = -8, shine = false, animate = true, className = "" }: CompletionStampProps) {
  const sheen = useRef<HTMLSpanElement>(null);
  const root = stickerRoot(size, 1, rotate, animate, { "--u": "calc(100cqw / 150)" } as CSSProperties);
  const u = (n: number) => `calc(var(--u) * ${n})`;
  const nameSize = name && name.length > 7 ? (11.2 * 7) / name.length : 11.2;

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !sheen.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    sheen.current.style.setProperty("--sheen-x", `${x.toFixed(1)}%`);
    sheen.current.style.setProperty("--sheen-a", `${(90 + (y - 50) * 0.8).toFixed(1)}deg`);
  };

  return (
    <div {...root} onPointerMove={onPointerMove} className={`ds-stamp ${root.className} ${className}`} role="img" aria-label={name ? `${name} 완성` : "완성"}>
      <span aria-hidden className="absolute inset-[1.47%] rounded-full bg-bg-canvas [filter:var(--stamp-shadow)]" />
      <span aria-hidden className="absolute inset-[8%] bg-bg-brand" style={{ clipPath: STAMP_STAR }} />
      <span aria-hidden className="absolute inset-[16%] rounded-full border-border-active" style={{ borderWidth: u(1.87) }} />
      <span aria-hidden className="absolute inset-x-0 flex flex-col items-center text-text-on-brand" style={{ top: name ? u(41) : u(47) }}>
        {name && (
          <span className="font-black whitespace-nowrap" style={{ fontSize: u(nameSize), lineHeight: 1.16 }}>
            {name}
          </span>
        )}
        <span className="font-display whitespace-nowrap" style={{ fontSize: u(44), lineHeight: 1.25 }}>
          완성
        </span>
      </span>
      {/* 빛 층: 별 모양으로 잘라 도장 밖으로 새지 않게 */}
      <span aria-hidden className="pointer-events-none absolute inset-[8%] overflow-hidden" style={{ clipPath: STAMP_STAR }}>
        <span className="ds-shine-band absolute inset-0" data-play={shine ? "true" : undefined} />
        <span ref={sheen} className="ds-sheen absolute inset-0" />
      </span>
    </div>
  );
}

/* ---------- 말풍선 ---------- */

// 피그마 187:2 '3차/말풍선 로고만 주세요' 몸통 외곽선(꼬리 포함). 원본 컴포넌트처럼 기울지 않은 모양이고, 기울기는 스티커 전체(rotate)에만 준다.
// (11/6 저녁: 예전 경로는 인스턴스에서 4° 돌아간 채로 뽑혀 있어서 몸통만 rotate + 4°로 더 기울고 글자와 어긋나 보였다.)
const BUBBLE_PATH =
  "M20.282 0L226.078 0C231.457 0 236.616 2.137 240.42 5.941C244.223 9.744 246.361 14.903 246.361 20.282L246.36 50.954C246.361 56.333 244.223 61.492 240.42 65.296C236.616 69.1 231.457 71.236 226.077 71.236L69.752 71.236C57.569 71.236 45.8 78.202 34.42 91.615C36.365 84.287 36.457 77.808 34.549 72.239L34.205 71.236L20.282 71.236C14.903 71.236 9.744 69.1 5.94 65.296C2.137 61.492 0 56.333 0 50.954L0 20.282C0 14.903 2.137 9.744 5.94 5.94C9.744 2.137 14.903 0 20.282 0Z";

/** 말풍선 스티커(메인 '로고만 주세요!'). highlight 부분 뒤에 민트 형광펜. 메인 데스크톱 280px·4°, 모바일 148px·6°. 꼬리는 왼쪽 아래. 움직이지 않는다. */
export function SpeechBubble({
  highlight = "로고만",
  children = " 주세요!",
  width = 280,
  rotate = 4,
  className = "",
}: {
  highlight?: string;
  children?: ReactNode;
  width?: number;
  rotate?: number;
  className?: string;
}) {
  const root = stickerRoot(width, 280 / 131.6, rotate, false, { "--u": "calc(100cqw / 280)" } as CSSProperties);
  return (
    <div {...root} className={`${root.className} ${className}`}>
      <svg aria-hidden viewBox="0 0 280 131.6" className="absolute inset-0 h-full w-full overflow-visible">
        <g transform="translate(15.34 15.34)">
          <path d={BUBBLE_PATH} strokeWidth="24.7" strokeLinejoin="round" className="fill-bg-canvas stroke-bg-canvas [filter:var(--sticker-shadow)]" />
          <path d={BUBBLE_PATH} strokeWidth="2.97" className="fill-bg-canvas stroke-border-active" />
        </g>
      </svg>
      <p
        className="absolute font-display whitespace-nowrap text-text-primary"
        style={{ left: "calc(var(--u) * 42)", top: "calc(var(--u) * 33)", fontSize: "calc(var(--u) * 34.6)", lineHeight: 1.24 }}
      >
        <Highlight tone="brand" tilt={-2}>
          {highlight}
        </Highlight>
        {children}
      </p>
    </div>
  );
}

/* ---------- 별 터짐 '약 2,350자' ---------- */

/** 별 터짐 스티커(피그마 378:300 '약 2,350 별 터짐', 메인 (c) 제목 오른쪽). 먹 16각 별 + 흰 칼선. 데스크톱 150px · 모바일 96px, −8°. */
export function BurstSticker({
  topLine = "한글 약",
  value = "2,350자",
  bottomLine = "들어 있음",
  size = 150,
  rotate = -8,
  className = "",
}: {
  topLine?: string;
  value?: string;
  bottomLine?: string;
  size?: number;
  rotate?: number;
  className?: string;
}) {
  const root = stickerRoot(size, 1, rotate, false, { "--u": "calc(100cqw / 150)" } as CSSProperties);
  const u = (n: number) => `calc(var(--u) * ${n})`;
  return (
    <div {...root} className={`${root.className} ${className}`} role="img" aria-label={`${topLine} ${value} ${bottomLine}`}>
      <span aria-hidden className="absolute inset-[1.47%] rounded-full bg-bg-canvas [filter:var(--burst-shadow)]" />
      <span aria-hidden className="absolute inset-[7.33%] bg-bg-inverse" style={{ clipPath: BURST_STAR }} />
      <span aria-hidden className="absolute inset-x-0 flex flex-col items-center" style={{ top: u(48) }}>
        <span className="font-black whitespace-nowrap text-text-inverse" style={{ fontSize: u(10.2), lineHeight: 1.16 }}>
          {topLine}
        </span>
        <span className="font-display whitespace-nowrap text-bg-brand" style={{ fontSize: u(27.1), lineHeight: 1.25 }}>
          {value}
        </span>
        <span className="font-black whitespace-nowrap text-text-inverse" style={{ fontSize: u(10.2), lineHeight: 1.16 }}>
          {bottomLine}
        </span>
      </span>
    </div>
  );
}
