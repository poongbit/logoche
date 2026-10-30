import { handle } from "@/lib/server/env";
import { readSampleFile } from "@/lib/server/samples";

// 화면 2 견본 그림(PNG). 그린 뒤에는 바뀌지 않는다.
export async function GET(_request: Request, ctx: RouteContext<"/api/style/samples/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const png = await readSampleFile(id);
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  });
}
