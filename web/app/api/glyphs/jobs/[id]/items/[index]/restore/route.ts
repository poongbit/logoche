import { MOCK, RouteError, handle } from "@/lib/server/env";
import { restoreGlyph } from "@/lib/server/glyphs";

// 화면 3 참고 글자 '되돌리기': 다시 그리거나 직접 고치기 전 글자와 맞바꾼다.
export async function POST(_request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/items/[index]/restore">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 되돌리기가 없어요");
    if (!/^\d+$/.test(index)) throw new RouteError(404, "참고 글자를 찾을 수 없어요");
    await restoreGlyph(id, Number(index));
    return Response.json({ ok: true });
  });
}
