import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { deleteProject, getProject, updateProject } from "@/lib/server/projects";
import type { UpdateProjectRequest } from "@/lib/types";

// 폰트 하나: 진행 상황·스튜디오에 보일 것(GET), 이름·즐겨찾기 바꾸기(PATCH), 지우기(DELETE). 만든 사람만(11/2 구글 로그인).
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => Response.json(await getProject(await requireUser(request), (await ctx.params).id)));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    await updateProject(await requireUser(request), (await ctx.params).id, (await request.json()) as UpdateProjectRequest);
    return Response.json({ ok: true });
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    await deleteProject(await requireUser(request), (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
