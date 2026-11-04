// 완성 알림 메일(11/3). Resend의 HTTP API로 보낸다(패키지 없이 fetch). 키는 web/.env.local:
//   RESEND_API_KEY=re_...   (없으면 보내지 않고 기록만 남긴다)
//   MAIL_FROM="로고체 <noreply@logoche.my>"   (Resend에 인증한 도메인의 주소여야 한다)
// 받는 주소는 구글 로그인으로 auth.sqlite에 저장된 메일이다. 로그인 없이 만든 작업(owner 'local'·'bench')은 보내지 않는다.
// 보내기에 실패해도 폰트 작업에는 영향이 없다(호출하는 쪽이 오류를 삼킨다).

import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MOCK } from "./env";

const API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.MAIL_FROM || "로고체 <noreply@logoche.my>";
export const SITE_URL = (process.env.BETTER_AUTH_URL || "https://logoche.my").replace(/\/$/, "");

/** 로그인한 사람(id)의 메일 주소. 없으면 null. 인증 모듈을 부르면 서로 물고 물려서 DB를 직접 읽는다. */
export function emailOf(userId: string): string | null {
  try {
    const db = new DatabaseSync(path.join(process.cwd(), ".data", "auth.sqlite"), { readOnly: true });
    try {
      const row = db.prepare("select email from user where id = ?").get(userId) as { email?: string } | undefined;
      return row?.email?.includes("@") ? row.email : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** 보냈으면 true, 키가 없어 건너뛰었으면 false. 보내기에 실패하면 던진다. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (MOCK || !API_KEY) {
    console.warn("[logoche] RESEND_API_KEY가 없어 메일을 보내지 않았어요:", mail.subject);
    return false;
  }
  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`메일 보내기 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

function layout(title: string, lines: string[], link: { href: string; label: string }): { text: string; html: string } {
  const text = [title, "", ...lines, "", `${link.label}: ${link.href}`, "", "로고체"].join("\n");
  const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${lines.map((l) => `<p style="font-size:15px;line-height:1.6;margin:0 0 8px">${escapeHtml(l)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escapeHtml(link.href)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700;font-size:15px">${escapeHtml(link.label)}</a></p>
<p style="font-size:13px;color:#777;margin:0">로고체 · ${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</p>
</div>`;
  return { text, html };
}

export function doneMail(to: string, name: string, id: string, glyphCount: number, extraCount: number): Mail {
  const lines = [`${name} 폰트를 다 만들었어요.`, `한글 ${glyphCount.toLocaleString()}자${extraCount ? `와 숫자·부호 ${extraCount}자` : ""}가 들어 있어요. 아래 버튼에서 써 보고 파일을 받으세요.`];
  return { to, subject: `${name} 폰트가 완성됐어요`, ...layout(`${name} 폰트가 완성됐어요`, lines, { href: `${SITE_URL}/fonts/${id}`, label: "폰트 보러 가기" }) };
}

export function failedMail(to: string, name: string, id: string): Mail {
  const lines = [`${name} 폰트를 만들다 멈췄어요.`, "그린 글자는 그대로 남아 있어요. 아래 버튼에서 '이어서 만들기'를 누르면 멈춘 곳부터 다시 시작해요."];
  return { to, subject: `${name} 폰트 만들기가 멈췄어요`, ...layout(`${name} 폰트 만들기가 멈췄어요`, lines, { href: `${SITE_URL}/fonts/${id}`, label: "이어서 만들기" }) };
}

/** 30자 초안이 나왔고 나머지를 그릴지 정하기를 기다린다는 알림(11/4) */
export function draftMail(to: string, name: string, id: string): Mail {
  const lines = [`${name} 폰트의 참고 글자 30자를 그렸어요.`, "결과를 보고 나머지 글자를 이어서 그릴지, 다른 느낌으로 다시 할지 골라 주세요. 고를 때까지 기다려요."];
  return { to, subject: `${name} 30자 초안이 나왔어요`, ...layout(`${name} 30자 초안이 나왔어요`, lines, { href: `${SITE_URL}/fonts/${id}`, label: "초안 보고 고르기" }) };
}
