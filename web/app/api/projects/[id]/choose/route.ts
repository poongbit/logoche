import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { chooseProject } from "@/lib/server/projects";
import type { ChooseAction } from "@/lib/types";

// 느낌 고르기 단계(11/4)의 동작: 기다리기(hold) · 다시 시간 세기(release) · 방향 고르기(pick, index)
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/choose">) {
  return handle(async () => {
    await chooseProject(await requireUser(request), (await ctx.params).id, (await request.json()) as ChooseAction);
    return Response.json({ ok: true });
  });
}
