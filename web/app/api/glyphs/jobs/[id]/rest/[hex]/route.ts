import { promises as fs } from "node:fs";
import { EXTRA_CHARS } from "@/lib/constants";
import { KSX1001_HANGUL } from "@/lib/hangul";
import { requireGlyphJob } from "@/lib/server/auth";
import { RouteError, handle } from "@/lib/server/env";
import { restGlyphFile } from "@/lib/server/rest";

// 나머지 글자 그림(PNG, 흰 바탕 검은 글씨, 폰트 틀에 자리 맞춘 것). 만드는 중 화면에서 방금 그린 글자를 보여 준다.
// 11/2 구글 로그인: 그 그림을 그린 폰트 작업의 주인만 본다(남의 것은 404).
export async function GET(request: Request, ctx: RouteContext<"/api/glyphs/jobs/[id]/rest/[hex]">) {
  return handle(async () => {
    const { id, hex } = await ctx.params;
    await requireGlyphJob(request, id);
    const char = /^[0-9a-f]{2,5}$/.test(hex) ? String.fromCodePoint(parseInt(hex, 16)) : "";
    if (!KSX1001_HANGUL.has(char) && !EXTRA_CHARS.includes(char)) throw new RouteError(404, "글자를 찾을 수 없어요");
    const png = await fs.readFile(restGlyphFile(id, char)).catch(() => {
      throw new RouteError(404, "아직 그리지 않은 글자예요");
    });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  });
}
