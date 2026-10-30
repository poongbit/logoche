import { engine, type FontFormat } from "@/lib/server/engine";
import { MOCK, RouteError, handle } from "@/lib/server/env";

// 화면 4~6 폰트 파일. 엔진이 만든 TTF를 그대로, 또는 TTF에서 만든 OTF·WOFF·WOFF2를 넘긴다(?format=). 이름 정보에 AI 생성 표시가 들어 있다(AI 기본법).
// 화면 4에서 글자를 고치면 파일이 바뀌므로 화면은 주소에 ?v=(고친 횟수)를 붙여 캐시를 나눈다.
// ?download=1이면 발급 대장에 올린다. 무엇을 내보냈는지 남기는 기록이고, 다른 서체의 검사에는 쓰지 않는다(10/30).
const TYPES: Record<FontFormat, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };

export async function GET(request: Request, ctx: RouteContext<"/api/font/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    if (MOCK) throw new RouteError(501, "모의 응답 모드(LOGOCHE_MOCK=1)에서는 폰트 파일이 없어요");
    if (!/^[0-9a-f]{32}$/.test(id)) throw new RouteError(404, "폰트를 찾을 수 없어요");
    const params = new URL(request.url).searchParams;
    const format = (params.get("format") ?? "ttf") as FontFormat;
    if (!(format in TYPES)) throw new RouteError(404, "그런 형식은 없어요");
    const download = params.get("download") === "1";
    const res = await engine.font(id, format);
    if (download) await engine.issue(id);
    return new Response(res.body, {
      headers: {
        "Content-Type": TYPES[format],
        "Cache-Control": "private, max-age=3600",
        ...(download ? { "Content-Disposition": `attachment; filename="logoche-${id.slice(0, 8)}.${format}"` } : {}),
      },
    });
  });
}
