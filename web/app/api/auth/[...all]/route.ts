import { toNextJsHandler } from "better-auth/next-js";
import { GOOGLE_READY, getAuth } from "@/lib/server/auth";

// 구글 로그인(11/2): 로그인 시작·구글 콜백·세션·로그아웃을 Better Auth가 처리한다(lib/server/auth.ts).
// 구글 키를 넣기 전에 로그인을 누르면 무엇이 빠졌는지 알린다(Better Auth는 500만 낸다).
export const { GET, POST } = toNextJsHandler(async (request: Request) => {
  if (!GOOGLE_READY && new URL(request.url).pathname.endsWith("/sign-in/social")) {
    return Response.json({ message: "구글 로그인 키가 아직 없어요. web/.env.local에 GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET를 넣고 개발 서버를 다시 켜 주세요." }, { status: 503 });
  }
  return (await getAuth()).handler(request);
});
