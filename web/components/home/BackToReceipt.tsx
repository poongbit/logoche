"use client";

import { PrimaryLink } from "@/components/ds";
import { isPlainClick, scrollToId } from "@/components/home/scrollTo";

/**
 * 마무리 띠 '접수증으로 올라가기'(B3 모양, 화살표는 위로). 같은 화면의 접수증(#make)으로 부드럽게 올라가고
 * 접수증의 첫 칸(로고 올리기)에 초점을 둔다. 자바스크립트가 없으면 /#make 주소 이동 그대로.
 */
export function BackToReceipt({ className = "" }: { className?: string }) {
  return (
    <PrimaryLink
      href="/#make"
      block
      className={`[&_svg]:-rotate-90 [&_svg]:translate-x-0! ${className}`}
      onClick={(e) => {
        if (isPlainClick(e) && scrollToId("make", () => document.querySelector<HTMLElement>("#make button, #make input"))) e.preventDefault();
      }}
    >
      접수증으로 올라가기
    </PrimaryLink>
  );
}
