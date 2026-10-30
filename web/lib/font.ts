"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { GENERATED_FONT_FAMILY, GLYPH_FONT_STACK } from "./preview";

export type FontState = "loading" | "ready" | "unavailable";

/**
 * 만든 TTF를 FontFace로 불러온다. 화면 4 견본과 화면 5·6 시안이 쓴다.
 * 빌드마다, 글자를 고쳐 바꿔 끼울 때마다(revision) 글꼴 이름을 달리한다. 같은 이름이면 고친 폰트가 앞 폰트에 가려질 수 있다.
 * 새 파일을 불러오는 동안에는 앞 파일로 그린다(고칠 때마다 글씨가 기본 글꼴로 깜빡이지 않게).
 * fontFamily는 서체에 없는 글자(팬그램 모드)를 기본 글꼴로 그리도록 뒤에 기본 글꼴을 붙인 값이다.
 */
/** attempt를 올리면 같은 파일을 다시 불러온다(불러오기에 실패했을 때 '다시 불러오기'). */
export function useGeneratedFont(fontId: string | null, revision = 0, attempt = 0): { state: FontState; fontFamily: string | null } {
  const [loaded, setLoaded] = useState<{ key: string; fontId: string; ok: boolean } | null>(null);
  const key = fontId ? `${fontId}-${revision}-${attempt}` : null;

  useEffect(() => {
    if (!fontId || !key) return;
    const face = new FontFace(familyOf(key), `url(${api.fontUrl(fontId, { revision })})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        setLoaded({ key, fontId, ok: true });
      })
      .catch(() => setLoaded({ key, fontId, ok: false }));
  }, [fontId, key, revision]);

  // 같은 빌드의 앞 판이 불러와져 있으면 새 판이 올 때까지 그것으로 그린다.
  const shown = loaded && loaded.fontId === fontId ? loaded : null;
  const state: FontState = !fontId ? "unavailable" : !shown ? "loading" : shown.ok ? "ready" : shown.key === key ? "unavailable" : "loading";
  return { state, fontFamily: shown?.ok ? `"${familyOf(shown.key)}", ${GLYPH_FONT_STACK}` : null };
}

const familyOf = (key: string) => `${GENERATED_FONT_FAMILY}-${key}`;
