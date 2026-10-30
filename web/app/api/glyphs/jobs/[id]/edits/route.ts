import { editSource, listEdits, saveEdit } from "@/lib/server/edits";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import type { GlyphEditSourceRequest, SaveGlyphEditRequest } from "@/lib/types";

// 화면 4 글자 고치기(그림판처럼)
// - POST: 편집 화면에 띄울 그림. 지금 조절값으로 만든 글자와 고친 그림, 글자 틀 자리를 준다.
// - PUT: 고친 그림 저장(image가 null이면 AI가 만든 그대로 돌린다). buildId가 있으면 그 폰트에서 이 글자만 바로 바꿔 끼운다.
export async function GET(_request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/edits">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ edits: MOCK ? [] : await listEdits(id) });
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/edits">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 글자 고치기가 없어요");
    return Response.json(await editSource(id, (await request.json()) as GlyphEditSourceRequest));
  });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/edits">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 글자 고치기가 없어요");
    return Response.json(await saveEdit(id, (await request.json()) as SaveGlyphEditRequest));
  });
}
