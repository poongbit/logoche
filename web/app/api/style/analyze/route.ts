import { requireUser } from "@/lib/server/auth";
import { MOCK, handle } from "@/lib/server/env";
import { delay, mockStyleCard } from "@/lib/server/mock";
import { analyzeStyle } from "@/lib/server/style";
import type { AnalyzeStyleRequest } from "@/lib/types";

// 화면 2 스타일 카드
// - 로고 측정은 엔진(OpenCV)이, 분위기 해석(획 끝·시그니처 요소·톤 확인)은 Claude가 한다. 둘을 함께 부른다.
// - 분위기 사전의 톤 범위 안에서 측정값으로 7축을 정하고, 범위 밖이면 conflict에 3안을 담는다(lib/server/style.ts).
// 11/2 구글 로그인: 예전 화면(연결 끊음)용 API라 지금 화면은 부르지 않는다. AI·엔진을 부르는 길이라 로그인해야 부른다.
export async function POST(request: Request) {
  return handle(async () => {
    await requireUser(request);
    const body = (await request.json()) as AnalyzeStyleRequest;
    if (MOCK) {
      await delay(1200);
      return Response.json(mockStyleCard(body));
    }
    return Response.json(await analyzeStyle(body.upload));
  });
}
