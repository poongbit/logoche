"use client";

// 위 단계 표시(Claude Design 'C Stepbar'). 지나온 단계는 눌러서 돌아간다. 1360px보다 좁으면 지금 단계 이름만 보이고(compact),
// 휴대폰 폭에서는 '3/6 AI 초안'과 여섯 칸 막대로 줄인다.
// 10/29 사용자 요청: 단계를 옮길 때 짧은 전환. 이 막대는 화면을 옮겨도 그대로 남아 있어(layout), 단계마다 같은 요소의 모양만 바꾸고
// CSS 전환으로 잇는다: 검은 알약이 다음 단계로 옮겨 가며 이름이 펼쳐지고, 잇는 선이 왼쪽부터 차고, 끝난 단계에 ✓가 톡 나타난다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { STEPS } from "@/lib/constants";
import { useApp } from "@/lib/store";

const EASE = "ease-[cubic-bezier(0.2,0.8,0.2,1)]";

export function StepNav() {
  const pathname = usePathname();
  const { state } = useApp();
  const current = Math.max(0, STEPS.findIndex((s) => s.path === pathname));
  const store = state.upload.storeName;

  return (
    <header className="border-b border-line bg-bg lg:border-b-0">
      {/* 휴대폰·태블릿 */}
      <div className="flex flex-col gap-2.5 px-5 pt-3.5 pb-3 lg:hidden">
        <div className="flex items-center">
          <span className="text-lg font-extrabold">로고체</span>
          <span key={current} className="ml-auto text-sm font-bold motion-safe:animate-[ds-rise_260ms_cubic-bezier(0.2,0.8,0.2,1)]">
            {current + 1}/{STEPS.length} {STEPS[current].label}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.path} className="h-1 overflow-hidden rounded-sm bg-track">
              <span
                className={`block h-full origin-left bg-ink transition-transform duration-300 ${EASE}`}
                style={{ transform: `scaleX(${i <= current ? 1 : 0})`, transitionDelay: i === current ? "90ms" : "0ms" }}
              />
            </span>
          ))}
        </div>
      </div>

      {/* 데스크톱 */}
      <div className="mx-auto hidden h-[4.5rem] max-w-[90rem] grid-cols-[8.75rem_minmax(0,1fr)_8.75rem] items-center px-10 lg:grid">
        <span className="text-xl font-extrabold">로고체</span>
        <nav aria-label="단계" className="flex items-center justify-center gap-2 text-sm font-semibold">
          {STEPS.map((step, i) => {
            const n = i + 1;
            const active = i === current;
            const done = i < current;
            const reachable = i <= state.maxStep || active;
            return (
              <span key={step.path} className="contents">
                {i > 0 && (
                  <span aria-hidden className="h-0.5 w-6 shrink-0 overflow-hidden bg-edge">
                    <span
                      className={`block h-full origin-left bg-ink transition-transform duration-300 ${EASE}`}
                      style={{ transform: `scaleX(${i <= current ? 1 : 0})` }}
                    />
                  </span>
                )}
                {/* 지금·지난·남은 단계 모두 같은 요소다(모양이 바뀌는 동안 이어서 움직이게). 갈 수 없는 단계는 누르지 못하게만 막는다. */}
                <Link
                  href={step.path}
                  aria-current={active ? "step" : undefined}
                  aria-disabled={!reachable || undefined}
                  tabIndex={reachable ? undefined : -1}
                  aria-label={`${n}단계 ${step.label}${done ? " · 돌아가기" : ""}`}
                  onClick={(e) => !reachable && e.preventDefault()}
                  className={`flex h-9 items-center rounded-full whitespace-nowrap transition-[background-color,color,padding] duration-300 ${EASE} ${
                    active
                      ? "pointer-events-none bg-ink pr-4 font-bold text-bg"
                      : `pr-2.5 pl-1 text-muted ${reachable ? "hover:bg-stage hover:text-ink hover:underline" : "cursor-default"}`
                  }`}
                >
                  <span className={`grid shrink-0 place-items-center transition-[width] duration-300 ${EASE} ${active ? "h-9 w-9" : "h-7 w-7"}`}>
                    {done ? (
                      <span key="done" className="grid h-7 w-7 place-items-center rounded-full bg-stage text-13 font-bold text-ink motion-safe:animate-[ds-pop_220ms_cubic-bezier(0.2,0.8,0.2,1)]">
                        ✓
                      </span>
                    ) : (
                      <span
                        key="n"
                        className={`grid h-7 w-7 place-items-center rounded-full text-13 transition-[border-color] duration-300 ${active ? "border-2 border-transparent text-sm" : "border-2 border-edge"}`}
                      >
                        {n}
                      </span>
                    )}
                  </span>
                  {/* 이름: 지금 단계는 늘 펼치고, 1360px보다 넓으면 모두 펼친다. 칸 너비를 0fr↔1fr로 바꿔 부드럽게 펼친다. */}
                  <span
                    className={`grid transition-[grid-template-columns,margin] duration-300 ${EASE} ${
                      active ? "ml-1 grid-cols-[1fr]" : "grid-cols-[0fr] min-[85rem]:ml-2 min-[85rem]:grid-cols-[1fr]"
                    }`}
                  >
                    <span className="overflow-hidden">{step.label}</span>
                  </span>
                </Link>
              </span>
            );
          })}
        </nav>
        <span className="truncate justify-self-end text-15 font-medium text-muted">{store}</span>
      </div>
    </header>
  );
}
