import { MOCK, handle } from "@/lib/server/env";
import { startGlyphJob } from "@/lib/server/glyphs";
import { createJob } from "@/lib/server/jobs";
import type { StartGlyphJobRequest, StartJobResponse } from "@/lib/types";

// 화면 3 참고 글자 그리기 작업 시작(10/29: 자소 조합 대신 음절을 그린다)
// - 이미지 API에 로고(획 끝·질감을 가볍게 참고), 표현 방식·톤(글), 기준 글자표(철자·칸)를 주고 참고 글자 30자를 한 장에 그린다.
//   로고 글자는 잘라 쓰지 않고, 프롬프트에 "로고 글자 모양은 옮기지 마라"를 넣는다(lib/server/glyphs.ts).
// - 오래 걸리므로 작업 id만 바로 돌려주고, 진행은 GET /api/glyphs/jobs/[id]로 본다.
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json()) as StartGlyphJobRequest;
    const jobId = MOCK ? createJob(body).id : startGlyphJob(body);
    return Response.json({ jobId } satisfies StartJobResponse);
  });
}
