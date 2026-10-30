import { startBuild } from "@/lib/server/build";
import { MOCK, handle } from "@/lib/server/env";
import { createJob } from "@/lib/server/jobs";
import type { StartBuildJobRequest, StartJobResponse } from "@/lib/types";

// 화면 4 생성·빌드 작업 시작
// - 10/30: 먼저 이미지 API가 참고 글자를 보며 나머지 글자를 그리고(lib/server/rest.ts), 참고 글자와 함께 엔진에 넘긴다.
//   엔진은 굵기·너비·기울기·자간을 맞춰 외곽선을 딴 뒤 fontTools로 TTF를 만들고 구조 검사와 유사도 검사를 한다.
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json()) as StartBuildJobRequest;
    const jobId = MOCK ? createJob(body).id : await startBuild(body);
    return Response.json({ jobId } satisfies StartJobResponse);
  });
}
