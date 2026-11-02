import { requireUser } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { createSample } from "@/lib/server/samples";
import type { StyleSampleRequest } from "@/lib/types";

// 화면 2 표현 방식 견본: 가게 이름을 그 표현 방식으로 그린 그림 한 장(이미지 1장).
// 고른 견본의 id를 화면 3 작업에 넘기면 초안이 이 견본의 글씨를 따른다.
// 11/2 구글 로그인: 예전 화면(연결 끊음)용 API라 지금 화면은 부르지 않는다. AI·엔진을 부르는 길이라 로그인해야 부른다.
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser(request);
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 견본을 그리지 않아요");
    return Response.json(await createSample((await request.json()) as StyleSampleRequest));
  });
}
