import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { cancelProject } from "@/lib/server/projects";

// 11/4 만드는 중인 일을 멈춘다. 그린 글자는 남는다. 완성한 폰트가 있으면(빠진 글자 그리기 도중) 그 폰트로 돌아가고, 아니면 멈춤 상태가 된다.
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/cancel">) {
  return handle(async () => {
    await cancelProject(await requireUser(request), (await ctx.params).id);
    return Response.json({ ok: true });
  });
}
