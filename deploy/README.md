# 서버 배포 (11/2)

AWS EC2 한 대(c7i-flex.large, Ubuntu 24.04, 서울)에 웹과 엔진을 함께 올린다. Vercel 같은 서버리스에는 올리지 않는다:
작업 파일을 `web/.data`·`engine/data`에 쓰고, 폰트 한 벌을 서버 메모리에서 8~10분 이어서 만들기 때문이다(`web/lib/server/projects.ts`).

| 무엇 | 어디 |
|---|---|
| 주소 | https://logoche.my (가비아, A 레코드 @·www → 13.125.103.118). www와 처음 쓰던 13-125-103-118.sslip.io는 이 주소로 넘긴다 |
| 서버 | `ssh -i ~/.ssh/logoche-key.pem ubuntu@13.125.103.118`, 코드는 `~/logoche` |
| 웹 | `logoche-web` 서비스, 127.0.0.1:3000 |
| 엔진 | `logoche-engine` 서비스, 127.0.0.1:8000 (밖에서는 못 부른다) |
| HTTPS | Caddy가 인증서를 받아 웹으로 넘긴다. `/etc/caddy/Caddyfile` |
| 키 | 서버의 `~/logoche/web/.env.local` (깃에 없음). `BETTER_AUTH_URL`은 위 주소 |
| 메일 | 완성·멈춤 알림을 Resend로 보낸다(`web/lib/server/mail.ts`). `.env.local`에 `RESEND_API_KEY=re_...`(선택: `MAIL_FROM="로고체 <noreply@logoche.my>"`). DNS(가비아): resend._domainkey TXT, send·rsend CNAME, _dmarc TXT. 키가 없으면 보내지 않고 기록만 남는다 |

## 처음 한 번

```bash
git clone https://github.com/poongbit/logoche.git ~/logoche
# 노트북에서 web/.env.local을 서버 ~/logoche/web/.env.local로 복사하고 BETTER_AUTH_URL을 바꾼다
bash ~/logoche/deploy/setup.sh logoche.my 13-125-103-118.sslip.io
```

구글 콘솔(프로젝트 logoche-project → 사용자 인증 정보 → 웹 클라이언트)에 더한다:
- 승인된 JavaScript 원본: `https://logoche.my`
- 승인된 리디렉션 URI: `https://logoche.my/api/auth/callback/google`

## 코드를 바꾼 뒤

main에 푸시하고 서버에서 `bash ~/logoche/deploy/update.sh`. 다시 켜면 만들던 폰트가 끊기니 아무도 만들지 않을 때 돌린다.

## 구조 참고 폰트 (11/5)

서체를 그릴 때 무료 폰트 하나의 뼈대 위치를 참고한다(선택 규칙은 `web/lib/server/guidefont.ts`, 후보 풀은 `engine/compare/guide_pool.json`). 기본으로 켜져 있고 `web/.env.local`에 `LOGOCHE_GUIDE_FONT=0`을 주면 끈다.
폰트 파일은 깃에 없다. 서버에서 한 번 받는다:

```bash
cd ~/logoche/engine && uv run python scripts/fetch_guide_fonts.py   # 나눔손글씨·마루부리(네이버)
```
엔진에 파일이 없는 폰트는 후보에서 빠지고, 후보가 하나도 없으면 구조 참고 없이 그린다. 닮음 가드(`GUARD_REF_THRESHOLD` 기본 0.78, `GUARD_REF_ROUNDS` 기본 2)도 같이 켜져 있다.

## 살펴보기

```bash
systemctl status logoche-web logoche-engine caddy
journalctl -u logoche-web -n 100      # 웹 기록
journalctl -u logoche-engine -n 100   # 엔진 기록
```
