import { requireUser } from "@/lib/server/auth";
import { RouteError, handle } from "@/lib/server/env";
import { readLogo } from "@/lib/server/projects";

// 폰트를 만들 때 올린 로고 그림(목록 카드·스튜디오). 만든 사람만(11/2 구글 로그인).
export async function GET(request: Request, ctx: RouteContext<"/api/projects/[id]/logo">) {
  return handle(async () => {
    const dataUrl = await readLogo(await requireUser(request), (await ctx.params).id);
    const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
    if (!match) throw new RouteError(404, "로고를 찾을 수 없어요");
    return new Response(new Uint8Array(Buffer.from(match[2], "base64")), {
      headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
