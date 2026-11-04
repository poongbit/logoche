"use client";

// 화면에 가까워질 때까지 안의 내용을 만들지 않는다(11/4 성능 점검). 스튜디오 아래쪽 시안은 사진을 불러와 픽셀을 읽는 무거운 일이라,
// 위에서 글자를 써 보는 동안에는 받지 않는다. 지원하지 않는 브라우저는 바로 보여 준다.

import { useEffect, useRef, useState, type ReactNode } from "react";

export function LazyMount({ children, minHeight = 320, rootMargin = "400px" }: { children: ReactNode; minHeight?: number; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (on || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on, rootMargin]);

  return (
    <div ref={ref} style={on ? undefined : { minHeight }}>
      {on ? children : null}
    </div>
  );
}
