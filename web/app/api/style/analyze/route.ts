import { MOCK, handle } from "@/lib/server/env";
import { delay, mockStyleCard } from "@/lib/server/mock";
import { analyzeStyle } from "@/lib/server/style";
import type { AnalyzeStyleRequest } from "@/lib/types";

// 화면 2 스타일 카드
// - 로고 측정은 엔진(OpenCV)이, 분위기 해석(획 끝·시그니처 요소·톤 확인)은 Claude가 한다. 둘을 함께 부른다.
// - 분위기 사전의 톤 범위 안에서 측정값으로 7축을 정하고, 범위 밖이면 conflict에 3안을 담는다(lib/server/style.ts).
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json()) as AnalyzeStyleRequest;
    if (MOCK) {
      await delay(1200);
      return Response.json(mockStyleCard(body));
    }
    return Response.json(await analyzeStyle(body.upload));
  });
}
