// 11/6 밤: 같은 화면 안 이동('만드는 법' → 만드는 순서, '접수증으로 올라가기' → 접수증)을 부드럽게.
// 움직임 줄이기를 켠 사람에게는 바로 이동한다. 멈출 자리는 대상의 scroll-margin-top(scroll-mt-*)이 정한다
// (머리줄은 화면에 붙어 따라오지 않아서 가릴 일은 없고, 위에 숨 쉴 틈만 둔다).

/** 이 화면에 id가 있으면 그리로 스크롤하고 true. 없으면(다른 화면) false — 부르는 쪽이 주소 이동을 그대로 둔다. */
export function scrollToId(id: string, focus?: () => HTMLElement | null): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  // 키보드로 누른 사람도 그 자리에서 이어 가게 초점을 옮긴다. 초점 때문에 스크롤이 튀지 않게 preventScroll.
  (focus?.() ?? target).focus({ preventScroll: true });
  return true;
}

/** 새 탭·새 창으로 여는 누름(⌘·Ctrl·Shift·가운데 단추)은 가로채지 않는다 */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
