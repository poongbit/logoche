import { requireUser } from "@/lib/server/auth";
import { getBuild } from "@/lib/server/build";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { getJob } from "@/lib/server/jobs";
import { mockBuildJob } from "@/lib/server/mock";
import type { StartBuildJobRequest } from "@/lib/types";

// 화면 4 조합·빌드 진행 상황과 검사 결과. 엔진 작업이 끝나면 OCR 판독(Claude)을 한 번 돌린다.
// fontId는 7항목과 OCR을 모두 통과했을 때만 채운다.
// 11/2 구글 로그인: 예전 화면(연결 끊음)용 API라 지금 화면은 부르지 않는다. AI·엔진을 부르는 길이라 로그인해야 부른다.
export async function GET(request: Request, ctx: RouteContext<"/api/build/jobs/[id]">) {
  return handle(async () => {
    await requireUser(request);
    const { id } = await ctx.params;
    if (MOCK) {
      const job = getJob<StartBuildJobRequest>(id);
      if (!job) throw new RouteError(404, "작업을 찾을 수 없어요");
      return Response.json(mockBuildJob(job.id, Date.now() - job.createdAt, job.input));
    }
    return Response.json(await getBuild(id));
  });
}
