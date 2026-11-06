"use client";

import { useState, type ReactNode } from "react";
import {
  CheckCircle,
  CheckMark,
  CompletionStamp,
  DisplayTitle,
  Highlight,
  BurstSticker,
  PrimaryButton,
  PrimaryLink,
  Receipt,
  SecondaryButton,
  SecondaryLink,
  SegmentedPair,
  SelectChip,
  SpeechBubble,
  TextButton,
  TextLink,
  Ticket,
  UnderlineTabs,
  tabId,
  tabPanelId,
  ticketTime,
} from "@/components/ds";
import { Chip, onRadioKeys, rovingTab } from "@/components/ui";

function Section({ id, title, children, mint }: { id: string; title: string; children: ReactNode; mint?: boolean }) {
  return (
    <section id={id} data-ds-section={id} className={`border-b border-border-default px-5 py-10 lg:px-10 ${mint ? "bg-bg-brand" : ""}`}>
      <h2 className="mb-6 text-13 font-bold text-text-secondary">{title}</h2>
      {children}
    </section>
  );
}

const Row = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`flex flex-wrap items-center gap-4 ${className}`}>{children}</div>;

const USES = ["간판", "메뉴판·가격표", "포장·스티커", "SNS·인스타", "홈페이지·쇼핑몰", "명함·전단"];
const PRESETS = ["원래대로", "굵게", "가늘게", "좁게", "넓게"];

export function DsPreview() {
  const [uses, setUses] = useState<string[]>(["간판", "메뉴판·가격표", "SNS·인스타"]);
  const [preset, setPreset] = useState("원래대로");
  const [edge, setEdge] = useState<"round" | "sharp" | undefined>("round");
  const [weight, setWeight] = useState<"thin" | "bold" | undefined>(undefined);
  const [tab, setTab] = useState<"sign" | "menu" | "insta">("sign");
  const [seconds, setSeconds] = useState<number | null>(14 * 60 + 5);
  const [replay, setReplay] = useState(0);

  return (
    <div className="flex flex-col">
      <Section id="buttons" title="주 버튼 B3 · 보조 버튼 · 글자 링크 (441:35 · 441:40 · 441:47)">
        <Row>
          <PrimaryButton>만들기 시작</PrimaryButton>
          <PrimaryButton disabled>이 느낌으로 만들기</PrimaryButton>
          <PrimaryLink href="/ds-preview#buttons">폰트 받기</PrimaryLink>
          <SecondaryButton>내 폰트로 가기</SecondaryButton>
          <SecondaryButton disabled>써 보기</SecondaryButton>
          <SecondaryButton size="sm">TTF 받기</SecondaryButton>
          <SecondaryLink size="sm" href="/ds-preview#buttons">
            열기
          </SecondaryLink>
          <TextButton>중단하기</TextButton>
          <TextLink href="/ds-preview#buttons">이전으로</TextLink>
        </Row>
        <div className="mt-6 flex max-w-[33.5rem] flex-col gap-3">
          <PrimaryButton block>다음: 글씨 취향</PrimaryButton>
          <PrimaryButton block labelAlign="center">
            다음: 업종 고르기
          </PrimaryButton>
          <PrimaryButton block disabled>
            이 느낌으로 만들기
          </PrimaryButton>
        </div>
      </Section>

      <Section id="chips" title="고르는 칩 중간 강도 · 토글 / 라디오 / 작은 프리셋 / 예전 ui Chip">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-3 text-15 font-bold">어디에 쓰세요? (여러 개 골라도 돼요)</legend>
          <div className="flex max-w-[33.5rem] flex-wrap gap-2">
            {USES.map((u, i) => {
              const on = uses.includes(u);
              return (
                <SelectChip key={u} selected={on} disabled={i === 5} onClick={() => setUses(on ? uses.filter((v) => v !== u) : [...uses, u])}>
                  {u}
                </SelectChip>
              );
            })}
          </div>
        </fieldset>
        <div role="radiogroup" aria-label="프리셋" onKeyDown={onRadioKeys} className="mt-6 flex flex-wrap gap-1.5">
          {PRESETS.map((p, i) => (
            <SelectChip key={p} mode="radio" size="sm" selected={preset === p} tabIndex={rovingTab(preset === p, i === 0, true)} onClick={() => setPreset(p)}>
              {p}
            </SelectChip>
          ))}
        </div>
        <Row className="mt-6">
          <Chip selected onClick={() => {}} badge="추천">
            예전 Chip 고름
          </Chip>
          <Chip selected={false} onClick={() => {}}>
            예전 Chip
          </Chip>
        </Row>
      </Section>

      <Section id="pair" title="양쪽 고르기 3/4 (552:608) · 체크 원 · 체크">
        <div className="flex max-w-[33.5rem] flex-col gap-3">
          <span className="text-15 font-bold">획 끝</span>
          <SegmentedPair
            label="획 끝"
            value={edge}
            onChange={setEdge}
            options={[
              { value: "round", label: "둥글게", visual: <span className="font-display text-[2.375rem] leading-[1.25]">우리 가게</span> },
              { value: "sharp", label: "각지게", visual: <span className="font-gothic text-[2.375rem] leading-[1.25] font-medium">우리 가게</span> },
            ]}
          />
          <span className="mt-3 text-15 font-bold">굵기 (아직 안 고름)</span>
          <SegmentedPair
            label="굵기"
            value={weight}
            onChange={setWeight}
            options={[
              { value: "thin", label: "가늘게", visual: <span className="font-gothic text-[2.375rem] leading-[1.25] font-normal">우리 가게</span> },
              { value: "bold", label: "굵게", visual: <span className="text-[2.375rem] leading-[1.25] font-black">우리 가게</span> },
            ]}
          />
        </div>
        <Row className="mt-8">
          <CheckCircle />
          <CheckCircle size={28} />
          <CheckCircle size={16} />
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            <CheckMark /> 한결국수_로고.png
          </span>
        </Row>
      </Section>

      <Section id="tabs" title="밑줄 탭 (549:402)">
        <UnderlineTabs
          label="시안"
          idPrefix="mock"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "sign", label: "간판" },
            { value: "menu", label: "메뉴판" },
            { value: "insta", label: "인스타" },
          ]}
        />
        <div role="tabpanel" id={tabPanelId("mock", tab)} aria-labelledby={tabId("mock", tab)} className="mt-4 rounded-[1.25rem] bg-bg-surface-strong p-6 text-15">
          {tab} 시안 자리
        </div>
      </Section>

      <Section id="receipt" title="접수증 (427:9 · 463:115) — 민트 면 위" mint>
        <div className="grid gap-8 lg:grid-cols-2">
          <Receipt
            className="max-w-[37.5rem]"
            top={
              <div className="ds-motion flex animate-ds-enter flex-col gap-3">
                <p className="text-15 font-bold">가게 이야기</p>
                <div className="h-24 rounded-[1.125rem] border-2 border-border-active" />
                <PrimaryButton block>다음: 글씨 취향</PrimaryButton>
                <TextButton className="self-start">이전으로</TextButton>
              </div>
            }
            bottom={
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-bold">지금까지 접수한 것</p>
                {[
                  ["로고", "한결국수_로고.png", true],
                  ["가게 이름", "한결국수", true],
                  ["가게 이야기", "지금 쓰는 중", false],
                ].map(([k, v, done]) => (
                  <div key={k as string} className="flex items-center gap-4">
                    <span className="w-[6.5rem] text-text-secondary">{k}</span>
                    <span className={done ? "font-bold" : "text-text-tertiary"}>{v}</span>
                    {done && <CheckMark className="ml-auto h-3.5 w-3.5" />}
                  </div>
                ))}
              </div>
            }
          />
          <Receipt
            perforation="ink"
            className="max-w-[37.5rem]"
            top={<div className="h-40 rounded-[1.125rem] border-2 border-dashed border-border-active" />}
            bottom={
              <div>
                <p className="text-15 font-bold">가게 이름 견본 세 가지를 먼저 보여 드려요</p>
                <p className="text-sm text-text-secondary">하나 고르면 약 15분 · 창을 닫아도 계속</p>
              </div>
            }
          />
        </div>
      </Section>

      <Section id="stickers" title="번호표 (424:300) · 완성 도장 (549:416) · 말풍선 · 별 터짐" mint>
        <Row className="gap-10">
          <Ticket {...ticketTime(15 * 60)} />
          <Ticket topLine="완성까지" bottomLine="다 되면 메일로 알려 드려요" {...ticketTime(seconds)} />
          <Ticket topLine="지금은" value="대기 중" bottomLine="차례가 오면 바로 시작해요" />
          <Ticket width={152} {...ticketTime(9 * 60)} />
        </Row>
        <Row className="mt-4">
          <SecondaryButton size="sm" onClick={() => setSeconds((s) => (s == null ? 5 * 60 : s - 60))}>
            남은 시간 −1분
          </SecondaryButton>
          <SecondaryButton size="sm" onClick={() => setSeconds(0)}>
            0초(확인 중)
          </SecondaryButton>
          <SecondaryButton size="sm" onClick={() => setReplay((r) => r + 1)}>
            도장 다시 붙이기
          </SecondaryButton>
          <span className="text-sm font-bold">seconds = {String(seconds)}</span>
        </Row>
        <Row className="mt-10 gap-12">
          <CompletionStamp key={`s${replay}`} name="한결국수체" shine />
          <CompletionStamp key={`t${replay}`} name="한결국수체" />
          <CompletionStamp key={`u${replay}`} name="한결국수체" size={96} shine />
          <SpeechBubble />
          <SpeechBubble width={148} rotate={6} />
          <BurstSticker />
          <BurstSticker size={96} />
        </Row>
      </Section>

      <Section id="title" title="큰 제목 + 흰 형광펜 (427:19 · 549:406)" mint>
        <DisplayTitle>
          로고 한 장으로
          <br />
          우리 가게 <Highlight>한글 서체</Highlight>
        </DisplayTitle>
      </Section>
      <Section id="title2" title="스튜디오 완성 띠 제목" mint>
        <DisplayTitle className="text-[2.5rem] lg:text-[4rem]">
          <Highlight>한결국수체가</Highlight>
          <br />
          나왔어요
        </DisplayTitle>
      </Section>
    </div>
  );
}
