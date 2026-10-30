import { MOCK, RouteError, handle } from "@/lib/server/env";
import { engine } from "@/lib/server/engine";

// 기준 서체로 그린 글자 하나(PNG). 화면 3에서 실패한 참고 글자를 직접 그릴 때 밑그림으로 깐다.
export async function GET(request: Request) {
  return handle(async () => {
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 밑그림이 없어요");
    const char = new URL(request.url).searchParams.get("char") ?? "";
    const { image } = await engine.glyphSingle(char);
    return Response.json({ image });
  });
}
