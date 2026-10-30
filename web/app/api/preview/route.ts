import { MOCK, handle } from "@/lib/server/env";
import { mockPreview, previewGlyphs } from "@/lib/server/preview";
import type { PreviewRequest } from "@/lib/types";

// 화면 4 미리보기
// - 그린 글자와 조절값으로 글 몇 자만 엔진에서 만들어(그린 글자 → 외곽선) 글자별 SVG 패스로 돌려준다.
// - 아직 그리지 않은 글자와 서체에 없는 글자(한글 2,350자 밖)는 path가 null이고, 화면이 기본 글꼴로 그린다.
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await request.json()) as PreviewRequest;
    return Response.json(MOCK ? mockPreview(body) : await previewGlyphs(body));
  });
}
