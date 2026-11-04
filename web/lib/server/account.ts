// 탈퇴(11/4). 로그아웃은 Better Auth(/api/auth/sign-out)가 맡고, 탈퇴는 여기서 한다.
// 순서: 이 사람의 폰트 작업·글자·폰트 파일을 모두 지운 뒤(projects.deleteAllProjects), 로그인 세션과 쿠키를 지우고, 계정(구글 토큰 포함)을 지운다.
// 만드는 중인 폰트가 있으면 아무것도 지우지 않는다. 이미 내려받은 폰트 파일은 사용자 것이라 그대로 쓸 수 있다.
// 엔진의 발급 기록(폰트 번호·가게 이름·로고 해시)은 남는다. 같은 로고로 만든 폰트를 가려내는 데 쓴다.

import { getAuth, requireUser } from "./auth";
import { deleteAllProjects } from "./projects";

export const DELETE_CONFIRM = "탈퇴";

export async function deleteAccount(request: Request): Promise<Response> {
  const user = await requireUser(request);
  const fonts = await deleteAllProjects(user);
  const auth = await getAuth();
  // 세션 쿠키 캐시(5분)가 남으면 지운 계정으로 계속 들어와지므로, 쿠키를 지우는 응답을 먼저 받아 둔다.
  const out = await auth.api.signOut({ headers: request.headers, asResponse: true });
  await (await auth.$context).internalAdapter.deleteUser(user); // 세션·구글 계정 연결(토큰)·사용자
  const response = Response.json({ ok: true, fonts });
  for (const cookie of out.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
