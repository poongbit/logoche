import Image from "next/image";
import type { ReactNode } from "react";
import { Hero } from "@/components/home/Hero";
import { HeroStage } from "@/components/home/HeroStage";
import { EXTRA_CHARS, RIGHTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";

// 메인 화면(11/5 후보 A '무대 옆 입력' 시안: 왼쪽 제목 · 별 스티커 · 로고 올리기 · 가게 이름 / 오른쪽 예시 폰트 무대 → 만드는 법 · 받는 것 · 질문).
// 배경 장식(흐린 글자·모눈·지도)은 쓰지 않는다(11/2 사용자 결정). YoFont의 문구·모델 이름·색 값은 가져오지 않았다.
// 위에서 아래로: 제목 · 첫 칸(로고 → 질문 페이지) · 한 줄 요약 · 로고체로 만든 폰트 · 이렇게 만들어요 · 받는 것 · 자주 묻는 질문 · 아래 줄.
// 자주 묻는 질문의 답은 실제 동작과 맞춘다(로고는 서버에 저장된다, 폰트는 OFL이라 독점이 아니다). 권리 문구는 RIGHTS에서 가져와 권리 카드와 어긋나지 않게 한다.

const HANGUL = KSX1001_HANGUL.size.toLocaleString();

const STEPS: { title: string; body: string }[] = [
  {
    title: "로고 올리기",
    body: "로고 이미지와 가게 이름을 적어요. 로고 글자를 그대로 옮기지 않고 느낌만 참고해요.",
  },
  {
    title: "느낌 고르기",
    body: "AI가 가게 이름을 세 가지 느낌으로 그려 보여 드려요. 마음에 드는 하나를 골라요.",
  },
  {
    title: "글자 그리기",
    body: `같은 느낌으로 한글 ${HANGUL}자를 그려요. 창을 닫아도 계속 만들어요.`,
  },
  {
    title: "받아서 쓰기",
    body: "간판·메뉴판 시안으로 미리 보고, 컴퓨터에 설치하거나 홈페이지에 바로 써요.",
  },
];

const DELIVERABLES: { title: string; body: string }[] = [
  {
    title: "폰트 파일",
    body: "컴퓨터·인쇄용 TTF, 디자인 프로그램용 OTF, 홈페이지용 WOFF2 가운데 필요한 것을 골라 받아요.",
  },
  {
    title: "간판·메뉴판 시안",
    body: "간판, 메뉴판, 인스타그램 게시물에 내 폰트를 쓴 모습을 미리 봐요.",
  },
  {
    title: "권리 카드와 제작 기록",
    body: "할 수 있는 일과 없는 일을 권리 카드로, 무엇을 골라 만들었는지 제작 기록으로 남겨요.",
  },
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
        <a
          href={RIGHTS.licenseUrl}
          className="font-semibold text-text-primary underline underline-offset-4"
        >
          {RIGHTS.license}
        </a>
        로 드려요. {RIGHTS.openNote} 다만 폰트 파일만 따로 파는 건 안 돼요.
      </p>
    ),
  },
  {
    q: "다른 사람과 같은 서체가 나올 수 있나요?",
    a: (
      <p>
        같은 로고와 같은 선택으로 다시 만들어도 매번 새로 그려서 똑같은 파일은
        나오지 않아요. 다만 비슷한 느낌을 고르면 닮은 서체가 나올 수 있어요.
        로고체가 약속하는 건 &quot;세상에 하나뿐&quot;이 아니라, 내 로고를
        바탕으로 새로 그렸고, 무료 폰트와 닮았는지 검사했고, 만든 과정이
        기록으로 남는다는 거예요.
      </p>
    ),
  },
  {
    q: "얼마나 걸리나요?",
    a: (
      <p>
        느낌을 고른 뒤 약 8분이에요(기준 글자 1~2분, 나머지 약 6분). 창을 닫아도
        서버에서 계속하고 메일로 알려 드려요.
      </p>
    ),
  },
  {
    q: "어떤 글자가 들어가나요?",
    a: (
      <p>
        자주 쓰는 한글 {HANGUL}자와 숫자·문장부호·영문 {EXTRA_CHARS.length}자예요.
        영문 알파벳은 아직 들어가지 않아요. 그리지 못한 글자가 있으면 폰트
        화면에서 알려 드리고, 다시 그릴 수 있어요.
      </p>
    ),
  },
  {
    q: "올린 로고는 어떻게 쓰이나요?",
    a: (
      <p>
        AI가 로고를 읽고 그 느낌을 참고해 글자를 그려요. 로고 글자를 그대로
        폰트로 옮기지는 않아요. 올린 로고는 내 폰트 화면에 함께 보여 드리려고
        저장해요.
      </p>
    ),
  },
  {
    q: "로고에 상용 폰트를 썼다면요?",
    a: <p>로고체는 무료 폰트와 닮았는지만 검사해요. {RIGHTS.screening}</p>,
  },
];

export default function HomePage() {
  return (
    <>
      <div className="bg-bg-theme-strong">
        <div className="mx-auto w-full max-w-[76rem] px-5 py-8 lg:px-10 lg:py-10">
          <section
            aria-labelledby="home-title"
            className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14"
          >
            <div className="relative flex flex-col gap-5">
              <h1
                id="home-title"
                className="text-[clamp(2rem,1.2rem+2.6vw,3.25rem)] leading-[1.25] font-display font-normal tracking-[-0.01em] text-balance"
              >
                로고 한 장으로 우리 가게 한글 서체
              </h1>
              <p className="max-w-[34rem] text-17 leading-relaxed text-text-secondary">
                로고 느낌 그대로 한글 {HANGUL}자를 그려 드려요. 무료 폰트와
                닮지 않았는지 검사하고, 만든 과정은 기록으로 남겨요.
              </p>
              <div className="mt-2 w-full">
                <Hero />
              </div>
            </div>
            <div className="relative">
            <HeroStage />
            <Image
              src="/sticker-2350.png"
              alt={`한글 ${HANGUL}자 들어 있음`}
              width={374}
              height={374}
              priority
              className="pointer-events-none absolute -top-5 -right-2 h-auto w-20 sm:w-24 lg:-top-8 lg:-right-5 lg:w-32"
            />
          </div>
          </section>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-20 px-5 pt-16 lg:gap-28 lg:px-10 lg:pt-24">
        <Section
          id="how"
          title="이렇게 만들어요"
          lead="로고를 올리고 받기까지 한 화면씩 이어져요."
        >
          <ol className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Step key={step.title} number={i + 1} {...step} />
            ))}
          </ol>
        </Section>

        <Section id="deliverables" title="받는 것">
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-3">
            {DELIVERABLES.map((item) => (
              <Deliverable key={item.title} {...item} />
            ))}
          </ul>
        </Section>

        <Section id="faq" title="자주 묻는 질문">
          <div className="flex flex-col divide-y divide-border-default border-y border-border-default">
            {FAQ.map((item) => (
              <details key={item.q} className="group">
                <summary className="-mx-2 flex min-h-[3.75rem] cursor-pointer list-none items-center gap-4 rounded-[0.625rem] px-2 py-4 text-17 font-bold focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="ml-auto h-4 w-4 shrink-0 text-text-secondary group-open:hidden"
                  >
                    <path
                      d="M8 3v10M3 8h10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="ml-auto hidden h-4 w-4 shrink-0 text-text-secondary group-open:block"
                  >
                    <path
                      d="M3 8h10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </summary>
                <div className="max-w-[48rem] pb-5 text-15 leading-relaxed text-text-secondary">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </Section>
      </div>

      <footer className="mt-24 border-t border-border-default lg:mt-32">
        <div className="mx-auto flex max-w-[76rem] flex-col gap-3 px-5 py-8 text-13 text-text-secondary sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <span>로고체 · /eli30 · 2026 청년취업사관학교 해커톤</span>
          <a
            href={RIGHTS.licenseUrl}
            className="font-semibold hover:text-text-primary hover:underline"
          >
            폰트 라이선스(OFL)
          </a>
        </div>
      </footer>
    </>
  );
}

function Section({
  id,
  title,
  lead,
  aside,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-8 flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id={`${id}-title`} className="text-22 font-extrabold lg:text-26">
            {title}
          </h2>
          {aside && (
            <p className="shrink-0 text-13 font-semibold text-text-secondary">
              {aside}
            </p>
          )}
        </div>
        {lead && <p className="text-15 text-text-secondary">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/** 만드는 순서 한 칸: 번호는 순서가 실제 정보라 남긴다 */
function Step({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-1.5 border-t-2 border-border-active pt-4">
      <span aria-hidden className="text-13 font-semibold text-text-secondary">
        {number}
      </span>
      <h3 className="text-17 font-extrabold">{title}</h3>
      <p className="text-15 leading-normal text-text-secondary">{body}</p>
    </li>
  );
}

/** 받는 것 한 칸: 순서가 없으므로 번호 없이 제목과 설명만 */
function Deliverable({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex flex-col gap-1.5 border-t-2 border-border-active pt-4">
      <h3 className="text-17 font-extrabold">{title}</h3>
      <p className="text-15 leading-normal text-text-secondary">{body}</p>
    </li>
  );
}
