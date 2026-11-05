import { requireUser } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { projectTweakHistory, saveProjectTweak } from "@/lib/server/projects";
import type { SaveGlyphTweakRequest } from "@/lib/types";

// 11/3 다듬기: 글자 하나(또는 전체 "*")의 조정을 저장한다. 조정 표는 프로젝트 보기(GET /api/projects/[id])의 tweaks에 실려 온다.
// - GET ?char=붕: 그 글자의 조정 기록(최대 100개)
// - PUT: { char, tweak, note? }. tweak이 null이면 조정을 지운다. 글자 하나는 지금 폰트에 바로 반영(patched), 전체는 바로 폰트를 다시 만든다(rebuild는 늘 false)
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/tweaks">) {
  return handle(async () => {
    const owner = await requireUser(request);
    const char = new URL(request.url).searchParams.get("char") ?? "";
    return Response.json({ history: await projectTweakHistory(owner, (await ctx.params).id, char) });
  });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/projects/[id]/tweaks">) {
  return handle(async () => {
    const owner = await requireUser(request);
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 다듬기가 없어요");
    const body = (await request.json()) as Partial<SaveGlyphTweakRequest>;
    if (typeof body.char !== "string" || body.tweak === undefined) throw new RouteError(400, "글자와 조정 값을 보내 주세요");
    return Response.json(await saveProjectTweak(owner, (await ctx.params).id, { char: body.char, tweak: body.tweak, note: body.note }));
  });
}
