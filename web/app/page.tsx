import Link from "next/link";
import type { ReactNode } from "react";
import { Hero } from "@/components/home/Hero";
import { Showcase } from "@/components/home/Showcase";
import { EXTRA_CHARS, RIGHTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";

// 메인 화면(11/2, YoFont 메인의 구성과 시각 문법을 따름: 크림 바탕 위 흰 카드, 꼬리표 알약, 넓은 검정 버튼, 번호 카드, 고정폭 꼬리표).
// 배경 장식(흐린 글자·모눈·지도)은 쓰지 않는다(11/2 사용자 결정). YoFont의 문구·모델 이름·색 값은 가져오지 않았다.
// 위에서 아래로: 꼬리표 · 제목 · 첫 칸(로고 → /new) · 받는 폰트 칩 · 만드는 순서 · 로고체로 만든 폰트 · 받는 것 · 자주 묻는 질문 · 아래 줄.
// 자주 묻는 질문의 답은 실제 동작과 맞춘다(로고는 서버에 저장된다, 폰트는 OFL이라 독점이 아니다). 권리 문구는 RIGHTS에서 가져와 권리 카드와 어긋나지 않게 한다.

const HANGUL = KSX1001_HANGUL.size.toLocaleString();

const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  { title: "로고 올리기", body: "로고 이미지와 가게 이름, 원하는 느낌을 적어요. 로고 글자를 그대로 옮기지 않고 느낌만 참고해요.", icon: <UploadIcon /> },
  { title: "참고 글자 확인", body: "AI가 먼저 30자를 그려 보여 드려요. 마음에 안 드는 글자는 눌러서 다시 그려요.", icon: <GridIcon /> },
  {
    title: "나머지 글자 그리기",
    body: `같은 느낌으로 한글 ${HANGUL}자와 숫자·문장부호 ${EXTRA_CHARS.length}자를 그려요. 창을 닫아도 계속 만들어요.`,
    icon: <PenIcon />,
  },
  { title: "받아서 쓰기", body: "TTF·OTF·WOFF2로 받아 컴퓨터에 설치하거나 홈페이지에 바로 써요.", icon: <DownloadIcon /> },
];

const DELIVERABLES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "폰트 파일",
    body: "컴퓨터·인쇄용 TTF, 디자인 프로그램용 OTF, 홈페이지용 WOFF2 가운데 필요한 것을 골라 받아요.",
    icon: <span className="text-22 leading-none font-extrabold">가</span>,
  },
  { title: "간판·메뉴판 시안", body: "간판, 메뉴판, 인스타그램 게시물에 내 폰트를 쓴 모습을 미리 봐요.", icon: <SignIcon /> },
  { title: "권리 카드와 제작 기록", body: "할 수 있는 일과 없는 일을 권리 카드로 정리하고, 무엇을 골라 만들었는지 제작 기록으로 남겨요.", icon: <CardIcon /> },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "간판이나 메뉴판에 써도 되나요?",
    a: (
      <>
        <p>네. 이런 곳에 쓸 수 있어요.</p>
        <ul className="mt-2 flex flex-col gap-1">
          {RIGHTS.allowed.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </>
    ),
  },
  {
    q: "우리 가게만 쓰는 폰트인가요?",
    a: (
      <p>
        아니요. 폰트는{" "}
        <a href={RIGHTS.licenseUrl} className="font-semibold text-ink underline underline-offset-4">
          {RIGHTS.license}
        </a>
        로 드려요. {RIGHTS.openNote} 다만 폰트 파일만 따로 파는 건 안 돼요.
      </p>
    ),
  },
  { q: "얼마나 걸리나요?", a: <p>약 5분이에요. 만드는 동안 창을 닫아도 서버에서 계속 만들고, 내 폰트에서 이어서 볼 수 있어요.</p> },
  {
    q: "어떤 글자가 들어가나요?",
    a: (
      <p>
        자주 쓰는 한글 {HANGUL}자와 숫자·문장부호 {EXTRA_CHARS.length}자예요. 영문 알파벳은 아직 들어가지 않아요. 그리지 못한 글자가 있으면 폰트 화면에서 알려 드리고,
        다시 그릴 수 있어요.
      </p>
    ),
  },
  {
    q: "올린 로고는 어떻게 쓰이나요?",
    a: <p>AI가 로고를 읽고 그 느낌을 참고해 글자를 그려요. 로고 글자를 그대로 폰트로 옮기지는 않아요. 올린 로고는 내 폰트 화면에 함께 보여 드리려고 저장해요.</p>,
  },
  { q: "로고에 상용 폰트를 썼다면요?", a: <p>로고체는 무료 폰트와 닮았는지만 검사해요. {RIGHTS.screening}</p> },
];

export default function HomePage() {
  const facts = [`한글 ${HANGUL}자`, `숫자·문장부호 ${EXTRA_CHARS.length}자`, "TTF · OTF · WOFF2", "간판 · 메뉴판 · SNS 시안", "약 5분"];
  return (
    <>
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-24 px-5 pt-10 lg:gap-32 lg:px-10 lg:pt-14">
        <section aria-labelledby="home-title" className="flex flex-col items-center gap-6">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-bg px-4 py-1.5 font-mono text-13 text-ink">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            로고 한 장 · 한글 {HANGUL}자 · 우리 가게 폰트
          </p>
          <h1 id="home-title" className="text-center text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-[1.2] font-extrabold tracking-[-0.01em] text-balance">
            로고 한 장으로 만드는 우리 가게 한글 폰트
          </h1>
          <p className="max-w-[38rem] text-center text-17 leading-relaxed text-muted lg:text-19">
            로고를 올리면 AI가 그 느낌으로 한글 {HANGUL}자를 그려 폰트 파일로 드려요.
          </p>
          <div className="mt-3 w-full">
            <Hero />
          </div>
          <ul aria-label="받는 폰트" className="flex flex-wrap justify-center gap-2">
            {facts.map((fact) => (
              <li key={fact} className="rounded-full border border-line bg-bg px-3.5 py-1.5 font-mono text-13">
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <Section id="how" eyebrow="만드는 순서" title="로고에서 폰트까지 네 단계">
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <NumberedCard key={step.title} number={i + 1} {...step} />
            ))}
          </ol>
        </Section>

        <Section id="showcase" eyebrow="로고체로 만든 폰트" title="글자를 바꿔 써 보세요" lead="팀이 시험으로 만든 폰트예요.">
          <Showcase />
        </Section>

        <Section id="deliverables" eyebrow="받는 것" title="폰트 파일과 함께 드려요">
          <ul className="grid gap-4 md:grid-cols-3">
            {DELIVERABLES.map((item, i) => (
              <NumberedCard key={item.title} number={i + 1} {...item} />
            ))}
          </ul>
        </Section>

        <Section id="faq" eyebrow="자주 묻는 질문" title="궁금한 점을 모았어요">
          <div className="flex flex-col divide-y divide-line rounded-[1.25rem] border border-line bg-bg">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-5 lg:px-6">
                <summary className="-mx-2 flex min-h-[3.75rem] cursor-pointer list-none items-center gap-4 rounded-lg px-2 py-4 text-17 font-bold focus-visible:shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ink)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg aria-hidden viewBox="0 0 16 16" className="ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180">
                    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </summary>
                <div className="max-w-[48rem] pb-5 text-15 leading-relaxed text-muted">{item.a}</div>
              </details>
            ))}
          </div>
        </Section>
      </div>

      <footer className="mt-24 border-t border-line lg:mt-32">
        <div className="mx-auto flex max-w-[76rem] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between lg:px-10">
          <div className="flex flex-col gap-1.5">
            <span className="text-18 font-extrabold">로고체</span>
            <span className="text-15 text-muted">로고 한 장으로 만드는 한글 브랜드 폰트</span>
          </div>
          <nav aria-label="아래 메뉴" className="flex flex-wrap gap-x-6 gap-y-2 text-15 font-semibold">
            <Link href="/new" className="hover:underline">
              새 폰트 만들기
            </Link>
            <Link href="/fonts" className="hover:underline">
              내 폰트
            </Link>
            <a href="#faq" className="hover:underline">
              자주 묻는 질문
            </a>
            <a href={RIGHTS.licenseUrl} className="hover:underline">
              폰트 라이선스
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function Section({ id, eyebrow, title, lead, children }: { id: string; eyebrow: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-8 flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <p className="font-mono text-13 font-semibold text-accent">{eyebrow}</p>
        <h2 id={`${id}-title`} className="text-26 font-extrabold lg:text-32">
          {title}
        </h2>
        {lead && <p className="text-17 text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/** 번호 카드: 검정 둥근 네모 아이콘 + 오른쪽 위 번호 + 제목 + 설명 */
function NumberedCard({ number, title, body, icon }: { number: number; title: string; body: string; icon: ReactNode }) {
  return (
    <li className="relative flex flex-col gap-3 rounded-[1.25rem] border border-line bg-bg p-5 lg:p-6">
      <span aria-hidden className="absolute top-5 right-5 font-mono text-13 text-muted lg:top-6 lg:right-6">
        {String(number).padStart(2, "0")}
      </span>
      <span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-bg">
        {icon}
      </span>
      <h3 className="mt-1 text-18 font-extrabold">{title}</h3>
      <p className="text-15 leading-normal text-muted">{body}</p>
    </li>
  );
}

const ICON = { viewBox: "0 0 24 24", className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function UploadIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4.5 14.5v3a2 2 0 002 2h11a2 2 0 002-2v-3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg {...ICON}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <path d="M14.5 16.8l1.8 1.8 3.2-3.6" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg {...ICON}>
      <path d="M15.5 4.5l4 4L9 19H5v-4L15.5 4.5z" />
      <path d="M13 7l4 4" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" />
      <path d="M4.5 14.5v3a2 2 0 002 2h11a2 2 0 002-2v-3" />
    </svg>
  );
}

function SignIcon() {
  return (
    <svg {...ICON}>
      <rect x="3.5" y="5" width="17" height="10" rx="2" />
      <path d="M8 19.5h8M12 15v4.5M7 10h10" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg {...ICON}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 8.5h8M8 12h8M8 15.5h4.5" />
    </svg>
  );
}
