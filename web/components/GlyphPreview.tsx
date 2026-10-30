"use client";

import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { GLYPH_FONT_STACK } from "@/lib/preview";
import { useApp } from "@/lib/store";
import type { PreviewRequest, PreviewResponse } from "@/lib/types";

const DEBOUNCE_MS = 150; // 슬라이더를 끄는 동안 요청이 몰리지 않게

/** 화면 4 견본에서 글자를 누르면 그 글자를 고친다. 누를 수 있는 글자에 씌우는 모양. */
export const PICKABLE_GLYPH =
  "cursor-pointer rounded-lg transition-[background-color,box-shadow] duration-150 hover:bg-bg/80 hover:shadow-[0_0_0_2px_var(--ink)] focus-visible:bg-bg/80";

/**
 * 화면 4의 실제 글자 미리보기. 그린 글자와 조절값으로 엔진이 만든 글자를 그린다(빌드와 같은 방법: 그린 글자 → 외곽선).
 * 서체에 없는 글자는 기본 글꼴로 흐리게 그린다. 글자 크기는 className의 글자 크기(1em)를 따른다.
 * onPick을 주면 서체에 있는 글자마다 누를 수 있다(화면 4 글자 고치기).
 * version이 바뀌면 다시 만든다(화면 4가 나머지 글자를 그리는 동안 그린 글자로 견본을 채워 간다, 10/30).
 */
export function GlyphPreview({
  text,
  className = "",
  onPick,
  version = "",
}: {
  text: string;
  className?: string;
  onPick?: (char: string) => void;
  version?: string | number;
}) {
  const { state } = useApp();
  const { glyphJobId, glyphItems } = state;
  const axes = state.style?.axes;
  // 참고 글자를 다시 그려 통과하면 그림 주소(버전)가 바뀐다. 그때 미리보기를 새로 만든다.
  // 화면 4에서 글자를 고쳐 저장해도 새로 만든다.
  const refsVersion = [
    ...glyphItems.flatMap((i) => (i.status === "ready" && i.imageUrl ? [i.imageUrl] : [])),
    `edits:${state.editsVersion}`,
    `v:${version}`,
  ].join("|");

  const body = useMemo(() => {
    if (!glyphJobId || !axes) return null;
    return JSON.stringify({ glyphJobId, axes, text, refsVersion } satisfies PreviewRequest);
  }, [glyphJobId, axes, text, refsVersion]);

  const [result, setResult] = useState<{ body: string; text: string; data: PreviewResponse } | null>(null);
  const [error, setError] = useState<{ body: string; message: string } | null>(null);

  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const req = JSON.parse(body) as PreviewRequest;
      api
        .preview(req, controller.signal)
        .then((data) => setResult({ body, text: req.text, data }))
        .catch((err) => {
          if (!controller.signal.aborted) setError({ body, message: errorMessage(err) });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body]);

  // 같은 글의 앞 결과는 새 결과가 올 때까지 흐리게 둔다(깜빡이지 않게). 글이 바뀌면 앞 결과를 쓰지 않는다.
  const data = result?.text === text ? result.data : null;
  const pending = !!body && result?.body !== body;
  const failed = error && error.body === body ? error.message : null;

  if (!data) {
    return (
      <div>
        <p className={`text-muted ${failed ? "" : "animate-pulse"} ${className}`} style={{ fontFamily: GLYPH_FONT_STACK }}>
          {text}
        </p>
        {failed && <p className="mt-1 text-xs text-bad">미리보기를 만들지 못했어요: {failed}</p>}
      </div>
    );
  }

  const height = data.ascender - data.descender;
  return (
    <div>
      <p
        role={onPick ? undefined : "img"}
        aria-label={onPick ? undefined : text}
        className={`flex flex-wrap items-center transition-opacity ${pending && !failed ? "opacity-60" : ""} ${className}`}
      >
        {data.glyphs.map((g, i) => {
          if (g.path === null || g.advance === null) {
            return (
              <span key={i} aria-hidden className="text-muted" style={{ fontFamily: GLYPH_FONT_STACK, fontSize: "0.86em", lineHeight: 1 }}>
                {g.char}
              </span>
            );
          }
          const glyph = (
            <svg
              aria-hidden
              viewBox={`0 0 ${g.advance} ${height}`}
              style={{ width: `${g.advance / data.unitsPerEm}em`, height: `${height / data.unitsPerEm}em` }}
            >
              {g.path && <path d={g.path} fill="currentColor" />}
            </svg>
          );
          return onPick && g.path ? (
            <button key={i} type="button" onClick={() => onPick(g.char)} aria-label={`'${g.char}' 고치기`} title={`'${g.char}' 고치기`} className={PICKABLE_GLYPH}>
              {glyph}
            </button>
          ) : (
            <span key={i} className="contents">
              {glyph}
            </span>
          );
        })}
      </p>
      {failed && <p className="mt-1 text-xs text-bad">미리보기를 새로 만들지 못했어요: {failed}</p>}
    </div>
  );
}
