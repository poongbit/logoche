import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { readSampleFile } from "@/lib/server/samples";

// 화면 2 견본 그림(PNG). 그린 뒤에는 바뀌지 않는다.
// 11/2 구글 로그인: 예전 화면(연결 끊음)용 API라 지금 화면은 부르지 않는다. AI·엔진을 부르는 길이라 로그인해야 부른다.
export async function GET(request: Request, ctx: RouteContext<"/api/style/samples/[id]">) {
  return handle(async () => {
    await requireUser(request);
    const { id } = await ctx.params;
    const png = await readSampleFile(id);
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
