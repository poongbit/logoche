// 구글 로그인(11/2). Better Auth가 /api/auth/*(로그인·콜백·세션·로그아웃)를 맡고, 계정·세션은 web/.data/auth.sqlite에 둔다.
// 폰트 작업의 주인은 로그인한 사람의 id다(lib/server/projects.ts). 라우트 핸들러는 requireUser로 주인을 확인한다.
// 키는 web/.env.local: BETTER_AUTH_SECRET · BETTER_AUTH_URL · GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET. 표는 처음 쓸 때 만든다.

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { SHOWCASE_FONTS } from "@/lib/constants";
import { RouteError } from "./env";
import { ownsFont } from "./projects";

const DATA = path.join(process.cwd(), ".data");
mkdirSync(DATA, { recursive: true });

const google = { clientId: process.env.GOOGLE_CLIENT_ID ?? "", clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "" };
export const GOOGLE_READY = !!(google.clientId && google.clientSecret);
if (!GOOGLE_READY) console.warn("[logoche] GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET가 web/.env.local에 없어 구글 로그인이 되지 않아요.");

const options = {
  appName: "로고체",
  database: new DatabaseSync(path.join(DATA, "auth.sqlite")),
  socialProviders: { google: { ...google, prompt: "select_account" } },
  session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true, maxAge: 5 * 60 } },
} satisfies BetterAuthOptions;

type Auth = ReturnType<typeof betterAuth<typeof options>>;

// 표를 먼저 만들고 Better Auth를 연다(먼저 열면 빈 DB에서 '표가 없다'는 검사 오류가 찍힌다). 이미 있는 표는 건너뛴다.
// 다른 요청이 같은 때 표를 만들어 실패했으면 한 번 더 확인한다.
const migrate = () => getMigrations(options).then((m) => m.runMigrations());
const migrated: Promise<void> = migrate().catch(migrate);
let instance: Auth | null = null;

export async function getAuth(): Promise<Auth> {
  await migrated;
  return (instance ??= betterAuth(options));
}

/** 로그인한 사람의 id. 없으면 null */
export async function currentUser(headers: Headers): Promise<string | null> {
  const session = await (await getAuth()).api.getSession({ headers });
  return session?.user.id ?? null;
}

/** 로그인한 사람의 id. 로그인 전이면 401 */
export async function requireUser(request: Request): Promise<string> {
  const user = await currentUser(request.headers);
  if (!user) throw new RouteError(401, "구글로 로그인해 주세요");
  return user;
}

/** 폰트 파일을 받을 수 있는지: 메인에 진열하는 폰트는 누구나, 나머지는 만든 사람만 */
export async function requireFont(request: Request, fontId: string): Promise<void> {
  if (SHOWCASE_FONTS.some((f) => f.fontId === fontId)) return;
  const user = await requireUser(request);
  if (!(await ownsFont(user, fontId))) throw new RouteError(404, "폰트를 찾을 수 없어요");
}
