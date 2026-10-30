import { MOCK, RouteError, handle } from "@/lib/server/env";
import { getGlyphJob } from "@/lib/server/glyphs";
import { getJob } from "@/lib/server/jobs";
import { mockGlyphJob } from "@/lib/server/mock";

// 화면 3 참고 글자 그리기 진행 상황. 글자마다 drawing → (redrawing) → ready, 계속 실패하면 failed.
export async function GET(_request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (MOCK) {
      const job = getJob(id);
      if (!job) throw new RouteError(404, "작업을 찾을 수 없어요");
      return Response.json(mockGlyphJob(job.id, Date.now() - job.createdAt));
    }
    return Response.json(await getGlyphJob(id));
  });
}
