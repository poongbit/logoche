import { engine } from "@/lib/server/engine";
import { MOCK, RouteError, handle } from "@/lib/server/env";

// 화면 6 '모두 받기': TTF·OTF, 웹폰트(WOFF2·WOFF·CSS 예시), OFL 원문, 제작 기록을 zip 하나로. 받으면 발급 대장에 올린다.
export async function POST(request: Request, ctx: RouteContext<"/api/font/[id]/bundle">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (MOCK) throw new RouteError(501, "모의 응답 모드(LOGOCHE_MOCK=1)에서는 폰트 파일이 없어요");
    if (!/^[0-9a-f]{32}$/.test(id)) throw new RouteError(404, "폰트를 찾을 수 없어요");
    const body = (await request.json()) as { fontName: string; record: string };
    const fontName = body.fontName.trim() || "로고체";
    const res = await engine.bundle(id, { fileStem: fontName, family: fontName, files: [{ name: `${fontName} 제작 기록.txt`, text: body.record }] });
    await engine.issue(id);
    return new Response(res.body, { headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" } });
  });
}
