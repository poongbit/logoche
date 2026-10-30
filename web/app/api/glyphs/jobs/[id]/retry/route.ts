import { MOCK, RouteError, handle } from "@/lib/server/env";
import { retryFailedGlyphs, retryGlyph } from "@/lib/server/glyphs";
import type { RetryGlyphsRequest, StartJobResponse } from "@/lib/types";

// 화면 3 다시 그리기. 진행은 GET /api/glyphs/jobs/[id]로 본다. 요청 본문은 처음 작업과 같다(로고·조절값으로 프롬프트를 다시 만든다).
// - index가 있으면 그 글자만 한 번(글자 카드의 '다시 그리기', 글자당 3번까지). 처음 글자표를 스타일 참고로 붙인다.
//   통과한 글자를 다시 그리면 전 글자를 남겨 두고, 새 글자가 떨어지면 전 글자를 그대로 둔다.
// - 없으면 '실패한 글자 모두 다시 그리기': 실패한 글자를 글자당 2번까지 다시 그린다.
export async function POST(request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/retry">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 다시 그리기가 없어요");
    const body = (await request.json()) as RetryGlyphsRequest;
    if (typeof body.index === "number") await retryGlyph(id, body.index, body);
    else await retryFailedGlyphs(id, body);
    return Response.json({ jobId: id } satisfies StartJobResponse);
  });
}
