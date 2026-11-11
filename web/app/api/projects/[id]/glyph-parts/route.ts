import { requireUser } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { projectGlyphParts } from "@/lib/server/projects";

// 11/11 부분 끌어서 바꾸기: 글자 하나를 초성·중성·종성 영역으로 나눈 외곽선과 경계선.
// POST { char, cuts? }: cuts는 경계를 자동으로 찾은 자리에서 옮긴 만큼(폰트 단위 x·y·j). 경계선을 끄는 동안 다시 부른다.
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/glyph-parts">) {
  return handle(async () => {
    const owner = await requireUser(request);
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 부분 나누기가 없어요");
    const body = (await request.json()) as { char?: unknown; cuts?: unknown };
    if (typeof body.char !== "string") throw new RouteError(400, "글자를 보내 주세요");
    return Response.json(await projectGlyphParts(owner, (await ctx.params).id, body.char, body.cuts));
  });
}
