// 구글 로그인(11/2) 브라우저 쪽. 서버는 lib/server/auth.ts, 주소는 /api/auth/*.
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** 카카오톡·인스타그램 같은 앱 안 브라우저. 구글이 여기서는 로그인을 막는다(disallowed_useragent). */
export function inAppBrowser(ua: string): "kakao" | "other" | null {
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua)) return "other";
  return null;
}

/** 로그인을 마치고 돌아올 주소에 표시를 붙인다(예: 실패했을 때 ?login=failed) */
export function withParam(url: string, key: string, value: string): string {
  const [pathPart, hash = ""] = url.split("#");
  const sep = pathPart.includes("?") ? "&" : "?";
  return `${pathPart}${sep}${key}=${value}${hash ? `#${hash}` : ""}`;
}
