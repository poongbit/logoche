import { requireGlyphJob } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { saveRefEdit } from "@/lib/server/glyphs";
import type { SaveRefEditRequest } from "@/lib/types";

// 화면 3 참고 글자 '직접 고치기'. 편집 화면에서 고친 그림으로 바꾼다(검사 없이 받는다. 사람이 정한 모양이다).
// 바꾸기 전 글자는 남겨 두어 '되돌리기'로 돌아갈 수 있다.
// 11/2 구글 로그인: 예전 화면(연결 끊음)용 API라 지금 화면은 부르지 않는다. AI·엔진을 부르는 길이라 로그인해야 부른다.
export async function POST(request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/items/[index]/edit">) {
  return handle(async () => {
    const { id, index } = await ctx.params;
    await requireGlyphJob(request, id);
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 직접 고치기가 없어요");
    if (!/^\d+$/.test(index)) throw new RouteError(404, "참고 글자를 찾을 수 없어요");
    const body = (await request.json()) as SaveRefEditRequest;
    await saveRefEdit(id, Number(index), body.image);
    return Response.json({ ok: true });
  });
}
