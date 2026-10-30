import { GLYPH_FONT_STACK } from "@/lib/preview";
import type { GlyphItem } from "@/lib/types";

/** 참고 글자 하나. 이미지 API 결과가 없으면(모의 응답) 글자를 기본 글꼴로 그린다.
 * 그림은 잉크에 맞춰 잘라 가로세로 비가 제각각이라 size 정사각형 안에 맞춰 넣는다.
 * 흰 바탕은 곱하기로 섞어, 종이색(bg-stage) 칸에 놓으면 바탕이 칸 색이 된다. */
export function GlyphImage({ item, size = 56 }: { item: GlyphItem; size?: number }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- API가 돌려주는 임의 주소라 next/image 설정 없이 그린다
      <img
        src={item.imageUrl}
        alt={item.char}
        width={size}
        height={size}
        style={{ width: size, height: size }} // 기본 스타일의 height: auto가 height 속성을 덮어 세로로 긴 글자가 칸을 넘지 않게
        className="object-contain mix-blend-multiply"
      />
    );
  }
  return (
    <span aria-label={item.char} style={{ fontFamily: GLYPH_FONT_STACK, fontWeight: 800, fontSize: size * 0.8, lineHeight: 1 }}>
      {item.char}
    </span>
  );
}
