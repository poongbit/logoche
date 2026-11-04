import { requireUser } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { projectGlyphEditSource, saveProjectGlyphEdit } from "@/lib/server/projects";

// 11/4 다듬기의 "직접 그리기"(그림판). 10/29에 만든 글자 고치기(lib/server/edits.ts)를 프로젝트 화면에서 쓰는 길이다.
// - POST { char }: 편집 화면에 띄울 그림(현재 글자 · AI가 그린 그대로 · 글자 틀 자리)
// - PUT { char, image }: 그림 저장. image가 null이면 직접 고친 것을 지운다. 저장하면 지금 폰트에 그 글자만 바로 바꿔 끼우고 제작 기록에 남긴다.
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/glyph-edit">) {
  return handle(async () => {
    const owner = await requireUser(request);
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 글자 고치기가 없어요");
    const body = (await request.json()) as { char?: unknown };
    if (typeof body.char !== "string") throw new RouteError(400, "글자를 보내 주세요");
    return Response.json(await projectGlyphEditSource(owner, (await ctx.params).id, body.char));
  });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/projects/[id]/glyph-edit">) {
  return handle(async () => {
    const owner = await requireUser(request);
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 글자 고치기가 없어요");
    const body = (await request.json()) as { char?: unknown; image?: unknown };
    if (typeof body.char !== "string" || (body.image !== null && typeof body.image !== "string")) throw new RouteError(400, "글자와 그림을 보내 주세요");
    return Response.json(await saveProjectGlyphEdit(owner, (await ctx.params).id, { char: body.char, image: body.image as string | null }));
  });
}
