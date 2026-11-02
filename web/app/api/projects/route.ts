import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/env";
import { createProject, listProjects } from "@/lib/server/projects";
import type { CreateProjectRequest } from "@/lib/types";

// 내 폰트 목록(11/2 B안)과 새 폰트 만들기. 만들기는 바로 id를 돌려주고, 로고 읽기부터 폰트 파일까지 서버가 이어서 돌린다(lib/server/projects.ts).
// 11/2 구글 로그인: 로그인한 사람의 것만 보이고, 로그인 전이면 401이다.
export async function GET(request: Request) {
  return handle(async () => Response.json(await listProjects(await requireUser(request))));
}

export async function POST(request: Request) {
  return handle(async () => {
    const owner = await requireUser(request);
    const body = (await request.json()) as CreateProjectRequest;
    return Response.json({ id: await createProject(owner, body) });
  });
}
