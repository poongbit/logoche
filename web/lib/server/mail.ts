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

// 11/6 디자인 반영: 로고 → (완성은 초록 띠) → 이름·상태 → 제목 그림 → 본문 → 검은 알약 버튼 → 안내 → 바닥글.
// 메일 앱은 웹폰트를 못 써서 제목은 Black Han Sans로 미리 그린 그림(public/mail/head-*.png, 2배 크기)을 넣는다. 고치려면 그림을 다시 만든다.
type Kind = "done" | "failed" | "choose" | "draft";
const HEAD: Record<Kind, [number, number]> = { done: [217, 42], failed: [216, 42], choose: [227, 42], draft: [261, 42] };
const GREEN = "#35e0b2";
// 다크모드에서도 흰 바탕 그대로(11/6): 메일 앱(특히 Gmail)은 background-color만 보고 색을 뒤집는다. 같은 색의 단색 그라디언트(background-image)를 함께 주면
// 뒤집지 않는다. 글자색도 같이 뒤집히지 않도록 바탕과 글자를 늘 한 쌍으로 지정하고, 애플 메일 등은 color-scheme: light로 고정한다.
const solid = (c: string) => `background-color:${c};background-image:linear-gradient(${c},${c})`;
const FONT = "-apple-system,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";

interface Body {
  kind: Kind;
  title: string; // 문자 버전·접근성용 대체 텍스트
  label: string; // "이름 · 상태"
  lines: string[]; // 줄바꿈(\n)은 그대로 <br>
  button: { href: string; label: string };
  note: string;
}

// 줄바꿈은 화면 폭에 맡긴다(\n은 공백). 고정 줄바꿈을 넣으면 좁은 휴대폰에서 "느낌으 / 로"처럼 끊긴다. keep-all로 어절 단위로만 꺾는다.
const flat = (s: string) => escapeHtml(s.replace(/\s*\n\s*/g, " "));
const para = (l: string) => `<p style="font-size:16px;line-height:1.65;margin:0 0 10px;color:#111;word-break:keep-all">${flat(l)}</p>`;

function layout(b: Body): { text: string; html: string } {
  const text = [b.title, "", ...b.lines, "", `${b.button.label}: ${b.button.href}`, "", b.note, "", "로고체 · logoche.my"].join("\n");
  const [w, h] = HEAD[b.kind];
  const head = `<img src="${SITE_URL}/mail/head-${b.kind}.png" width="${w}" height="${h}" alt="${escapeHtml(b.title)}" style="display:block;border:0;height:${h}px;width:${w}px;max-width:100%;margin-left:-4px">`;
  const logo = `<img src="${SITE_URL}/logo.png" width="88" height="32" alt="로고체" style="display:block;border:0">`;
  const label = `<p style="font-size:13px;font-weight:700;color:#444;margin:0 0 10px">${escapeHtml(b.label)}</p>`;
  const top =
    b.kind === "done"
      ? `<tr><td class="pad" bgcolor="#ffffff" style="${solid("#fff")};padding:32px 40px 24px">${logo}</td></tr>
<tr><td class="pad band" bgcolor="${GREEN}" style="${solid(GREEN)};padding:28px 40px 30px">${label}${head}</td></tr>
<tr><td class="pad" bgcolor="#ffffff" style="${solid("#fff")};padding:32px 40px 0">`
      : `<tr><td class="pad" bgcolor="#ffffff" style="${solid("#fff")};padding:32px 40px 0">${logo}<div style="border-top:1px solid #777;margin:24px 0 28px"></div>${label}<div style="margin:0 0 22px">${head}</div>`;
  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 22px"><tr>
<td bgcolor="#111111" style="${solid("#111")};border-radius:999px;padding:8px 8px 8px 26px;white-space:nowrap"><a href="${escapeHtml(b.button.href)}" style="color:#ffffff;text-decoration:none;font-weight:800;font-size:17px;font-family:${FONT}">${escapeHtml(b.button.label)}<span style="display:inline-block;width:40px;height:40px;line-height:40px;border-radius:20px;${solid(GREEN)};color:#111111;text-align:center;font-weight:900;font-size:18px;margin-left:22px;vertical-align:middle">&rarr;</span></a></td>
</tr></table>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light}@media (prefers-color-scheme:dark){body,table,td,div{background-color:#fff!important}.band{background-color:#35e0b2!important}}[data-ogsc] .pad{color:#111111!important}@media (max-width:520px){.pad{padding-left:22px!important;padding-right:22px!important}}</style></head><body bgcolor="#ffffff" style="margin:0;${solid("#fff")}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="${solid("#fff")}"><tr><td align="center" bgcolor="#ffffff" style="${solid("#fff")}">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="${solid("#fff")};width:100%;max-width:600px;font-family:${FONT};color:#111111;text-align:left">
${top}
${b.lines.map(para).join("\n")}
${button}
<p style="font-size:13.5px;line-height:1.6;color:#555;margin:0 0 28px;word-break:keep-all">${flat(b.note)}</p>
<div style="${solid("#fff")};border-top:1px solid #e5e5e5;padding:18px 0 36px;word-break:keep-all">
<p style="font-size:12.5px;line-height:1.6;color:#666;margin:0">로고체 · ${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}<br>로고체에서 폰트를 만들 때 쓴 구글 계정으로 보내는 알림이에요.</p>
</div>
</td></tr></table>
</td></tr></table></body></html>`;
  return { text, html };
}

const SCOPE = "한글 약 2,350자 + 숫자·문장부호·영문 대소문자 82자";

export function doneMail(to: string, name: string, id: string, glyphCount: number, extraCount: number): Mail {
  const b: Body = {
    kind: "done",
    title: "폰트가 완성됐어요",
    label: `${name} · 완성`,
    lines: [
      `한글 ${glyphCount.toLocaleString()}자${extraCount ? ` + 숫자·문장부호·영문 대소문자 ${extraCount}자` : ""}가 들어 있어요.`,
      "스튜디오에서 우리 가게 문구로 써 보고,\n쓸 곳에 맞는 파일(TTF·OTF·WOFF2)을 받으세요.",
    ],
    button: { href: `${SITE_URL}/fonts/${id}`, label: "폰트 보러 가기" },
    note: "SIL OFL 1.1로 드려요. 이 가게만 쓰는 독점 권리는 아니에요.\n자세한 건 스튜디오의 권리 안내에 있어요.",
  };
  return { to, subject: `${name} 폰트가 완성됐어요`, ...layout(b) };
}

export function failedMail(to: string, name: string, id: string): Mail {
  const b: Body = {
    kind: "failed",
    title: "만들다가 멈췄어요",
    label: `${name} · 멈춤`,
    lines: ["서버에서 문제가 생겨 멈췄어요. 그린 글자는 그대로 남아 있어요.", "아래 버튼에서 '이어서 만들기'를 누르면 못 그린 글자만 이어서 그려요."],
    button: { href: `${SITE_URL}/fonts/${id}`, label: "이어서 만들기" },
    note: "그만두고 싶으면 같은 화면의 '그만두기'를 누르세요. 지우기 전에 한 번 더 물어봐요.",
  };
  return { to, subject: `${name} 폰트 만들기가 멈췄어요`, ...layout(b) };
}

/** 30자 초안이 나왔고 나머지를 그릴지 정하기를 기다린다는 알림(11/4) */
export function draftMail(to: string, name: string, id: string): Mail {
  const b: Body = {
    kind: "draft",
    title: "30자 초안이 나왔어요",
    label: `${name} · 초안`,
    lines: ["참고 글자 30자를 그렸어요.", "결과를 보고 나머지 글자를 이어서 그릴지,\n다른 느낌으로 다시 할지 골라 주세요. 고를 때까지 기다려요."],
    button: { href: `${SITE_URL}/fonts/${id}`, label: "초안 보고 고르기" },
    note: "창을 닫아도 작업은 그대로 남아 있어요.",
  };
  return { to, subject: `${name} 30자 초안이 나왔어요`, ...layout(b) };
}

/** 서체 방향 견본이 그려졌고 사용자가 고르기를 기다린다는 알림(11/4) */
export function chooseMail(to: string, name: string, id: string): Mail {
  const b: Body = {
    kind: "choose",
    title: "느낌을 골라 주세요",
    label: `${name} · 견본 세 가지`,
    lines: ["가게 이름을 세 가지 느낌으로 그렸어요.", `하나를 고르고 한 번 더 확인하면 그 느낌으로\n${SCOPE}를\n그려요. 고를 때까지 기다려요.`],
    button: { href: `${SITE_URL}/fonts/${id}`, label: "느낌 고르러 가기" },
    note: "만들기를 시작하면 12~17분 걸려요. 창을 닫아도 서버에서 계속 만들어요.",
  };
  return { to, subject: `${name} 느낌을 골라 주세요`, ...layout(b) };
}
