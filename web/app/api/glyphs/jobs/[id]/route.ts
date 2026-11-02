import { requireGlyphJob } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { getGlyphJob } from "@/lib/server/glyphs";
import { getJob } from "@/lib/server/jobs";
import { mockGlyphJob } from "@/lib/server/mock";

// 화면 3 참고 글자 그리기 진행 상황. 글자마다 drawing → (redrawing) → ready, 계속 실패하면 failed.
// 11/2 구글 로그인: 예전 화면(연결 끊음)용 API라 지금 화면은 부르지 않는다. AI·엔진을 부르는 길이라 로그인해야 부른다.
export async function GET(request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireGlyphJob(request, id);
    if (MOCK) {
      const job = getJob(id);
      if (!job) throw new RouteError(404, "작업을 찾을 수 없어요");
      return Response.json(mockGlyphJob(job.id, Date.now() - job.createdAt));
    }
    return Response.json(await getGlyphJob(id));
  });
}
