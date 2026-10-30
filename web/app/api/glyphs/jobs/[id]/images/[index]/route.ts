import { RouteError, handle } from "@/lib/server/env";
import { readGlyph } from "@/lib/server/glyphs";

// 화면 3 참고 글자 그림(PNG). web/.data/glyphs/<작업 id>/<순서>.png를 돌려준다.
// 다시 그리면 같은 순서의 파일이 바뀌므로 주소에 ?v=(다시 그린 횟수)를 붙여 캐시를 나눈다.
export async function GET(_request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/images/[index]">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    if (!/^\d+$/.test(index)) throw new RouteError(404, "참고 글자를 찾을 수 없어요");
    const png = await readGlyph(id, Number(index));
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
