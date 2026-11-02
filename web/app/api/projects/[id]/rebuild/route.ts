import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { rebuildProject } from "@/lib/server/projects";

// 다시 만들기: 그린 글자는 그대로 두고 빠진 글자만 그려 폰트를 다시 만든다(멈춘 작업 이어 하기도 같다).
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/rebuild">) {
  return handle(async () => {
    await rebuildProject(await requireUser(request), (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
