import Image from "next/image";
import type { ReactNode } from "react";
import { BurstSticker, CheckCircle, DisplayTitle, Highlight, SpeechBubble, Ticket } from "@/components/ds";
import { BackToReceipt } from "@/components/home/BackToReceipt";
import { ExampleFont } from "@/components/home/ExampleFont";
import { Hero } from "@/components/home/Hero";
import { EXTRA_CHARS, RIGHTS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";

// 메인 화면 — 11/6 R1 + B3(피그마 16 페이지 427:9 데스크톱 · 428:123 모바일, docs/design-1106/flow-1105.md).
// 위에서 아래로: 첫 화면(민트 면 + 흰 접수증 = '접수') → (a) 만드는 순서 → (b) 로고체로 만든 폰트 → (c) 받는 것 + 쓸 수 있는 범위 → (d) 자주 묻는 질문 → 마무리(민트) → 바닥(먹).
// 리듬 R1: 흰 띠 사이를 1px 먹 선으로 나누고, 큰 민트 면은 시작(접수)과 끝(마무리)에만. 스티커(말풍선·번호표·별 터짐)는 사실을 말하고 움직이지 않는다(11/6 밤: 등장 모션 뺌).
// 문구(11/6 결정): 시간은 '약 15분'(스티커·접수증) / '느낌을 고른 뒤 12~17분'(질문). 글자는 '한글 약 2,350자 + 숫자·문장부호·영문 대소문자 82자'. '무료'를 파는 말로 쓰지 않는다.
// 자주 묻는 질문의 답은 실제 동작과 맞춘다(로고는 서버에 저장된다, 폰트는 OFL이라 독점이 아니다). 권리 문구는 RIGHTS에서 가져와 권리 카드와 어긋나지 않게 한다.

const HANGUL = KSX1001_HANGUL.size.toLocaleString();
const EXTRA = EXTRA_CHARS.length;

// body는 문장 단위. 문장마다 한 줄로 시작한다(11/6 밤: 03의 '창을 닫아도 계속 그려요.'가 첫 문장 중간에서 이어 붙던 것).
const STEPS: { title: string; who: "owner" | "wait"; body: string[] }[] = [
  { title: "로고와 질문", who: "owner", body: ["로고와 가게 이름을 올리고, 업종·가게 이야기·글씨 취향·로고 권리를 답해요."] },
  { title: "견본 고르기", who: "owner", body: ["가게 이름으로 그린 견본 세 가지를 보고 하나를 골라요."] },
  { title: "글자 그리기", who: "wait", body: [`고른 느낌으로 한글 약 ${HANGUL}자와 영문·숫자·문장부호를 그려요.`, "창을 닫아도 계속 그려요."] },
  { title: "받기", who: "owner", body: ["무료 폰트와 닮지 않았는지 검사한 뒤 폰트 파일을 드려요."] },
];

const USES: { title: string; body: string; files: string }[] = [
  { title: "컴퓨터에 설치해 쓰기", body: "워드·한글·포토샵·캔바 같은 프로그램에서", files: "TTF" },
  { title: "홈페이지·쇼핑몰에 쓰기", body: "웹사이트에 바로 올리는 형식, CSS 코드도 복사해 가요", files: "WOFF2 · CSS" },
  { title: "간판·인쇄 업체에 보내기", body: "업체에 그대로 넘기는 묶음", files: "ZIP · OTF · 라이선스" },
  { title: "제작 기록", body: "어떤 로고로 어떻게 만들었는지, 닮음 검사 결과까지", files: "묶음에 함께" },
];

// 11/6 밤: 모두 닫힌 채로 시작한다(예전에는 '얼마나 걸리나요'·'어떤 글자'를 펼쳐 뒀다).
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
        <a href={RIGHTS.licenseUrl} className="font-semibold text-text-primary underline underline-offset-4">
          {RIGHTS.license}
        </a>
        로 드려요. {RIGHTS.openNote} 다만 {RIGHTS.summary.no}.
      </p>
    ),
  },
  {
    q: "다른 사람과 같은 서체가 나올 수 있나요?",
    a: (
      <p>
        같은 로고와 같은 선택으로 다시 만들어도 매번 새로 그려서 똑같은 파일은 나오지 않아요. 다만 비슷한 느낌을 고르면 닮은 서체가 나올 수 있어요. 로고체가 약속하는 건
        &quot;세상에 하나뿐&quot;이 아니라, 내 로고를 바탕으로 새로 그렸고, 무료 폰트와 닮았는지 검사했고, 만든 과정이 기록으로 남는다는 거예요.
      </p>
    ),
  },
  { q: "얼마나 걸리나요?", a: <p>느낌을 고른 뒤 12~17분쯤 걸려요. 창을 닫아도 계속 그려요.</p> },
  {
    q: "어떤 글자가 들어가나요?",
    a: (
      <p>
        자주 쓰는 한글 약 {HANGUL}자와 숫자·문장부호·영문 대소문자 {EXTRA}자를 함께 그려요.
      </p>
    ),
  },
  {
    q: "올린 로고는 어떻게 쓰이나요?",
    a: <p>AI가 로고를 읽고 그 느낌을 참고해 글자를 그려요. 로고 글자를 그대로 폰트로 옮기지는 않아요. 올린 로고는 내 폰트 화면에 함께 보여 드리려고 저장해요.</p>,
  },
  { q: "로고에 상용 폰트를 썼다면요?", a: <p>로고체는 무료 폰트와 닮았는지만 검사해요. {RIGHTS.screening}</p> },
];

// 모든 띠가 같은 폭·옆 여백을 쓴다(DESIGN.md 4장: 머리줄과 같은 max-w-page, 휴대폰 16px · lg 2.5rem)
const WRAP = "mx-auto w-full max-w-page px-4 lg:px-10";

export default function HomePage() {
  return (
    <>
      {/* 첫 화면: 큰 민트 면은 여기(접수)와 마무리에만(A 규칙) */}
      <section aria-labelledby="home-title" className="overflow-x-clip bg-bg-brand">
        <div className={`${WRAP} grid items-start gap-7 pt-6 pb-10 lg:grid-cols-[minmax(0,26fr)_minmax(0,30fr)] lg:gap-x-[clamp(2.5rem,5.5vw,5rem)] lg:py-20`}>
          <div className="flex flex-col lg:pt-10">
            <DisplayTitle className="text-[1.875rem] whitespace-nowrap lg:text-[clamp(2.5rem,4.45vw,4rem)]">
              <span id="home-title">
                로고 한 장으로
                <br />
                우리 가게 <Highlight>한글 서체</Highlight>
              </span>
            </DisplayTitle>
            <p className="mt-4 hidden max-w-[32.5rem] text-[1.1875rem] leading-normal font-medium lg:block">
              로고를 올리면 그 느낌으로 한글 약 {HANGUL}자와
              <br />
              영문·숫자를 그려 폰트 파일로 드려요.
            </p>
            {/* 데스크톱 말풍선(피그마 427:21, 280px · 4°). 모바일은 접수증 모서리(Hero) */}
            <div aria-hidden className="mt-11 hidden lg:block">
              <SpeechBubble width={280} rotate={4} />
            </div>
            <p className="mt-5 hidden text-base leading-normal lg:block">
              로고와 가게 이름만 있으면 돼요.
              <br />
              업종과 가게 이야기는 다음 화면에서 물어볼게요.
            </p>
          </div>
          <Hero />
        </div>
      </section>

      {/* (a) 만드는 순서 */}
      <section id="how" aria-labelledby="how-title" tabIndex={-1} className="scroll-mt-4 outline-none">
        <div className={`${WRAP} pt-12 pb-14 lg:pt-16 lg:pb-[4.5rem]`}>
          <SectionHead id="how-title" eyebrow="만드는 순서" title="이렇게 만들어요" lead="사장님은 답하고 고르기만 하면 돼요." />
          <ol className="mt-8 border-t border-border-active lg:mt-[3.25rem]">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="relative grid grid-cols-[3rem_minmax(0,1fr)] border-b border-border-active pt-[1.125rem] pb-5 lg:grid-cols-[5rem_17.5rem_minmax(0,35rem)] lg:pt-6 lg:pb-5"
              >
                <span aria-hidden className="row-span-2 font-display text-[1.875rem] leading-[1.25] tracking-[-0.03em] lg:row-span-1 lg:pt-1 lg:text-[2.75rem]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 lg:flex-col lg:items-start">
                  <h3 className="text-17 leading-normal font-bold lg:text-xl">
                    <span className="sr-only">{i + 1}단계: </span>
                    {step.title}
                  </h3>
                  <WhoTag who={step.who} />
                </div>
                <p className={`mt-1.5 text-15 leading-[1.6] lg:mt-0 lg:pt-1 lg:text-17 lg:leading-[1.65] ${step.who === "wait" ? "lg:max-w-[31.25rem] lg:pr-[12.5rem] xl:pr-0" : ""}`}>
                  {step.body.map((sentence) => (
                    <span key={sentence} className="block text-pretty">
                      {sentence}
                    </span>
                  ))}
                </p>
                {step.who === "wait" && (
                  <>
                    {/* '약 15분' 번호표: 글자 그리기 줄 오른쪽(모바일 152px · 10°). 데스크톱은 1,440에서 피그마와 같은 실제 폭 256px(228/16rem × 18px):
                        큰 화면 rem(18px)으로 키우면 288px가 되어 03 첫 문장 끝에 닿았다(11/6 밤). 그 뒤 212(1,440에서 약 238px)로 조금 줄이고 오른쪽으로 0.75rem 내 글과 띄웠다. */}
                    <div className="col-span-2 -mb-9 flex justify-end pt-2 pr-1 lg:hidden">
                      <Ticket prefix="약" value="15" unit="분" width={152} rotate={10} />
                    </div>
                    {/* 1,024~1,279는 글 칸이 좁아 번호표를 작게(160) 두고 글에 오른쪽 여백을 줘서 닿지 않게 한다 */}
                    <div className="absolute top-1/2 -right-3 hidden -translate-y-1/2 lg:block xl:hidden">
                      <Ticket prefix="약" value="15" unit="분" width={160} rotate={10} />
                    </div>
                    <div className="absolute top-1/2 -right-3 hidden -translate-y-1/2 xl:block">
                      <Ticket prefix="약" value="15" unit="분" width={212} rotate={10} />
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* (b) 로고체로 만든 폰트 */}
      <section aria-labelledby="example-title">
        <div className={`${WRAP} pt-12 pb-12 lg:pt-16 lg:pb-[3.625rem]`}>
          <ExampleFont
            header={
              <SectionHead
                id="example-title"
                eyebrow="예시 폰트"
                title="로고체로 만든 폰트"
                lead={
                  <>
                    같은 폰트를 간판처럼<span className="hidden lg:inline"> 크게</span>, 가격표처럼, 안내문처럼 써 봤어요.
                  </>
                }
              />
            }
          />
        </div>
      </section>

      {/* (c) 받는 것 + 쓸 수 있는 범위(요약 C: 한 줄 + ✓ × ! 세 줄 + 전문 링크) */}
      <section id="deliverables" aria-labelledby="deliverables-title">
        <div className={`${WRAP} relative pt-12 pb-14 lg:pt-16 lg:pb-[4.5rem]`}>
          <div className="pointer-events-none absolute top-7 right-3 lg:top-7 lg:right-10">
            <div className="lg:hidden">
              <BurstSticker size={96} rotate={-8} />
            </div>
            <div className="hidden lg:block">
              <BurstSticker size={150} rotate={-8} />
            </div>
          </div>
          <SectionHead id="deliverables-title" eyebrow="받는 것" title="받아서 이렇게 써요" lead="쓸 곳을 고르면 맞는 파일로 드려요." />
          <ul className="mt-8 border-t border-border-active lg:mt-[2.6875rem]">
            {USES.map((u) => (
              <li
                key={u.title}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-border-active pt-[1.125rem] pb-5 lg:grid-cols-[27.5rem_minmax(0,1fr)_12.5rem] lg:gap-0 lg:py-[1.3125rem]"
              >
                <h3 className="col-start-1 row-start-1 text-17 font-bold lg:text-[1.1875rem]">{u.title}</h3>
                <p className="col-span-2 col-start-1 row-start-2 text-sm text-text-secondary lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:text-base">{u.body}</p>
                <span className="col-start-2 row-start-1 lg:col-start-3 inline-flex h-6 items-center justify-center justify-self-end rounded-full border-[1.5px] border-border-active px-2.5 text-xs font-bold whitespace-nowrap lg:h-10 lg:w-full lg:text-sm">
                  <span className="sr-only">파일: </span>
                  {u.files}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-12 grid gap-5 border-b border-border-active pb-9 lg:mt-16 lg:grid-cols-[32.5rem_minmax(0,1fr)] lg:gap-0 lg:pb-12">
            <div className="flex flex-col gap-2 lg:gap-3">
              <p className="text-13 font-bold text-text-secondary lg:text-sm">쓸 수 있는 범위</p>
              <h3 id="rights-title" className="font-display text-[1.75rem] leading-[1.25] font-normal tracking-[-0.03em] lg:text-[2.5rem]">
                가게 일에는 <br className="hidden lg:block" />다 써도 돼요
              </h3>
            </div>
            <div className="flex flex-col lg:pt-[1.875rem]">
              <ul className="flex flex-col gap-3 lg:gap-[1.125rem]">
                {/* 스튜디오 줄 표(RightsCard)와 같은 사실의 세 줄 요약: RIGHTS.rows · RIGHTS.summary */}
                {RIGHTS.rows.map((row) => (
                  <RightsLine key={row.mark} mark={row.mark} label={row.title}>
                    {RIGHTS.summary[row.mark]}
                  </RightsLine>
                ))}
              </ul>
              <a
                href={RIGHTS.licenseUrl}
                className="mt-3 ml-8 self-start py-1 text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary lg:mt-[1.375rem] lg:ml-10"
              >
                자세히 보기 · {RIGHTS.licenseName}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* (d) 자주 묻는 질문: 모두 닫힌 채로 시작 */}
      <section id="faq" aria-labelledby="faq-title">
        <div className={`${WRAP} pt-12 pb-12 lg:pt-16 lg:pb-20`}>
          <SectionHead id="faq-title" eyebrow="궁금한 점" title="자주 묻는 질문" />
          <div className="mt-3.5 flex flex-col divide-y divide-border-default border-t-2 border-b border-t-border-active border-b-border-default lg:mt-7">
            {FAQ.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex min-h-[3.75rem] cursor-pointer list-none items-center gap-4 py-[1.125rem] text-base font-bold lg:min-h-[4.375rem] lg:py-[1.375rem] lg:text-lg [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <PlusMinus />
                </summary>
                <div className="-mt-2 max-w-[56.25rem] pb-5 text-sm leading-relaxed text-text-secondary lg:-mt-3 lg:pb-[1.375rem] lg:text-base">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 마무리: 민트 면(끝) */}
      <section aria-labelledby="closing-title" className="overflow-x-clip bg-bg-brand">
        <div className={`${WRAP} relative pt-14 pb-14 lg:pt-[5.75rem] lg:pb-[6.5rem]`}>
          <DisplayTitle as="h2" className="text-[2rem] lg:text-[3rem]">
            <span id="closing-title">
              로고와 가게 이름만 있으면 <br className="lg:hidden" />
              시작해요.
            </span>
          </DisplayTitle>
          {/* 접수증으로 올라가기: B3 모양, 화살표는 위로. 같은 화면의 접수증으로 부드럽게 올라가 첫 칸에 초점 */}
          <BackToReceipt className="mt-6 lg:mt-11 lg:w-auto lg:min-w-80" />
        </div>
      </section>

      <footer className="bg-bg-inverse">
        <div className={`${WRAP} flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between lg:py-7`}>
          {/* 로고 기본판(흰 스티커): 어두운 바탕이라 먹 로고 둘레에 흰 칼선을 둘러 붙인다 */}
          <Image
            src="/logo.png"
            alt="로고체"
            width={962}
            height={350}
            className="h-8 w-auto self-start [filter:drop-shadow(1.5px_0_0_#fff)_drop-shadow(-1.5px_0_0_#fff)_drop-shadow(0_1.5px_0_#fff)_drop-shadow(0_-1.5px_0_#fff)_drop-shadow(1.5px_1.5px_0_#fff)_drop-shadow(-1.5px_-1.5px_0_#fff)] lg:h-[2.125rem]"
          />
          <a href={RIGHTS.licenseUrl} className="self-start py-2 text-sm text-text-disabled hover:text-text-inverse hover:underline sm:self-auto">
            폰트 라이선스(OFL)
          </a>
        </div>
      </footer>
    </>
  );
}

function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: ReactNode }) {
  return (
    <div className="flex flex-col">
      <p className="text-13 font-bold text-text-secondary lg:text-sm">{eyebrow}</p>
      <DisplayTitle as="h2" className="mt-1 text-[2rem] lg:mt-1.5 lg:text-[3rem]">
        <span id={id}>{title}</span>
      </DisplayTitle>
      {lead && <p className="mt-2 text-15 text-text-secondary lg:text-lg">{lead}</p>}
    </div>
  );
}

/** 만드는 순서 꼬리표: 사장님이 할 일(외곽선) / 기다리기(먹 채움) */
function WhoTag({ who }: { who: "owner" | "wait" }) {
  return who === "owner" ? (
    <span className="inline-flex h-6 items-center rounded-full border-[1.5px] border-border-active px-3 text-xs font-bold lg:h-7 lg:px-3.5 lg:text-13">사장님</span>
  ) : (
    <span className="inline-flex h-6 items-center rounded-full bg-bg-inverse px-3 text-xs font-bold text-text-inverse lg:h-7 lg:px-3.5 lg:text-13">기다리기</span>
  );
}

function RightsLine({ mark, label, children }: { mark: "ok" | "no" | "note"; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-base leading-normal lg:gap-4 lg:text-17">
      <span className="mt-px shrink-0 lg:mt-0">
        {mark === "ok" ? <CheckCircle size={22} className="lg:size-6!" /> : <OutlineMark kind={mark} />}
      </span>
      <span>
        <span className="sr-only">{label}: </span>
        {children}
      </span>
    </li>
  );
}

/** × · ! 표시: 먹 선 동그라미(피그마 556:174 · 556:179) */
function OutlineMark({ kind }: { kind: "no" | "note" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[1.375rem] lg:size-6">
      <circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {kind === "no" ? (
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <>
          <path d="M12 6.8v6.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="16.9" r="1.3" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function PlusMinus() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="ml-auto size-4 shrink-0 text-text-primary">
      <path d="M3 8h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 3v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="group-open:hidden" />
    </svg>
  );
}
