// 알림 메일 본문 그림(11/6). 메일 앱이 로그인 없이 받아 가므로 열려 있고, 이름이 추측할 수 없는 무작위 토큰이다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MAIL_DIR } from "@/lib/server/mail";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[0-9a-f]{24}\.png$/.test(file)) return new Response("not found", { status: 404 });
  try {
    const body = await readFile(path.join(MAIL_DIR, file));
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
