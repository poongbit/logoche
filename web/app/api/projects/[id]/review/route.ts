import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { reviewProject } from "@/lib/server/projects";
import type { ReviewAction } from "@/lib/types";

// 참고 글자 확인 단계의 동작: 고르는 중(hold) · 다 풀기(release) · 계속(continue) · 고른 글자 다시 그리기(redraw)
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/review">) {
  return handle(async () => {
    await reviewProject(await requireUser(request), (await ctx.params).id, (await request.json()) as ReviewAction);
    return Response.json({ ok: true });
  });
}
