import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { redrawGlyphs } from "@/lib/server/projects";

// 다시 볼 글자 중 고른 글자를 다시 그려 폰트를 다시 만든다(11/2 품질 개선 2-3). body: { chars: string[] }
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[id]/redraw">) {
  return handle(async () => {
    const owner = await requireUser(request);
    const { chars } = (await request.json()) as { chars?: unknown };
    await redrawGlyphs(owner, (await ctx.params).id, Array.isArray(chars) ? chars.filter((c): c is string => typeof c === "string") : []);
    return Response.json({ ok: true });
  });
}
