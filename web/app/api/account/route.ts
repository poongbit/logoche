import { DELETE_CONFIRM, deleteAccount } from "@/lib/server/account";
import { requireUser } from "@/lib/server/auth";
import { MOCK, RouteError, handle } from "@/lib/server/env";
import { accountSummary } from "@/lib/server/projects";

// 11/4 탈퇴. 로그아웃은 /api/auth/sign-out(Better Auth).
// - GET: 탈퇴 안내에 보일 { fonts: 만든 폰트 수, building: 만드는 중인 수 }
// - DELETE: body { confirm: "탈퇴" }. 폰트·글자·로고를 모두 지우고 계정을 지운다(되돌릴 수 없다). 만드는 중인 폰트가 있으면 409.
export async function GET(request: Request) {
  return handle(async () => Response.json(await accountSummary(await requireUser(request))));
}

export async function DELETE(request: Request) {
  return handle(async () => {
    if (MOCK) throw new RouteError(501, "모의 응답 모드에서는 탈퇴가 없어요");
    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
    if (body?.confirm !== DELETE_CONFIRM) throw new RouteError(400, `확인 문구(${DELETE_CONFIRM})를 보내 주세요`);
    return deleteAccount(request);
  });
}
