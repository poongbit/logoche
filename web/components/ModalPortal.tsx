"use client";

// 모달 공통 동작(11/4 접근성 점검): 대화상자를 body 맨 뒤에 그려 나머지 화면을 inert로 막고(Tab과 화면 읽기 프로그램이 뒤 화면으로 못 나간다),
// 대화상자 안에서 Tab이 맨 끝에서 처음으로 돌게 하고, 닫을 때 열었던 버튼으로 포커스를 돌려준다.
// 열릴 때 포커스를 안으로 옮기는 일(첫 칸·대화상자 자체)은 대화상자가 스스로 한다. 클릭으로 열리는 화면에서만 쓴다(서버 렌더 없음).

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** restoreTo: 열었던 버튼이 닫는 사이 사라졌을 때(메뉴 안 항목 등) 포커스를 돌려줄 곳 */
export function ModalPortal({ children, restoreTo }: { children: ReactNode; restoreTo?: () => HTMLElement | null }) {
  const [host] = useState(() => document.createElement("div"));

  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    document.body.appendChild(host);
    const others = [...document.body.children].filter((c): c is HTMLElement => c !== host && c instanceof HTMLElement && !c.inert && c.tagName !== "SCRIPT");
    for (const c of others) c.inert = true;

    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = [...host.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !host.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !host.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    }
    host.addEventListener("keydown", trap);
    return () => {
      host.removeEventListener("keydown", trap);
      for (const c of others) c.inert = false;
      host.remove();
      const target = opener && document.contains(opener) && opener !== document.body ? opener : (restoreTo?.() ?? null);
      target?.focus(); // 닫으면 연 버튼으로(없어졌으면 지정한 곳으로)
    };
  }, [host, restoreTo]);

  return createPortal(children, host);
}
