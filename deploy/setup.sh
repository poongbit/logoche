#!/usr/bin/env bash
# 서버 한 대 배포(11/2, AWS EC2 c7i-flex.large · Ubuntu 24.04 · 서울). 웹(next start)과 엔진(uvicorn)을 같은 서버에서 돌리고
# Caddy가 HTTPS 인증서를 받아 웹으로 넘긴다. 엔진은 127.0.0.1에만 열어 밖에서는 못 부른다.
# 작업 파일은 지금처럼 web/.data와 engine/data에 둔다(서버 디스크). 키는 web/.env.local에 따로 넣는다(깃에 없음).
#
#   git clone https://github.com/poongbit/logoche.git ~/logoche
#   bash ~/logoche/deploy/setup.sh <도메인> [옛 주소...]     예: logoche.my 13-125-103-118.sslip.io
# www.<도메인>과 옛 주소로 들어오면 https://<도메인>으로 넘긴다.
#
# 다시 돌려도 된다(이미 깔린 것은 건너뛴다). 코드만 바꿨을 때는 deploy/update.sh.
set -euo pipefail

DOMAIN="${1:?도메인을 적어 주세요. 예: bash deploy/setup.sh logoche.my}"
shift
REDIRECTS="$(printf ', %s' "www.$DOMAIN" "$@" | cut -c3-)"
APP="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
# 설치 중에 묻는 창(서비스 다시 켤지 등)이 뜨지 않게
APT="sudo DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a apt-get"

echo "== 패키지"
$APT update -y
$APT install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

# 화면 빌드(next build)가 메모리를 많이 쓴다. 4GB에 스왑 2GB를 더한다.
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
fi

# Node 24(노트북 개발 환경과 같은 판). node:sqlite를 쓴다.
if ! node --version 2>/dev/null | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  $APT install -y nodejs
fi

# uv: 엔진의 파이썬 3.12와 라이브러리를 깐다.
if ! command -v uv >/dev/null && [ ! -x "$HOME/.local/bin/uv" ]; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

# Caddy(HTTPS 인증서 자동)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  $APT update -y
  $APT install -y caddy
fi

echo "== 서비스"
sudo tee /etc/systemd/system/logoche-engine.service >/dev/null <<EOF
[Unit]
Description=로고체 서체 엔진
After=network.target

[Service]
User=$USER_NAME
WorkingDirectory=$APP/engine
ExecStart=$UV run --frozen uvicorn logoche_engine.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/logoche-web.service >/dev/null <<EOF
[Unit]
Description=로고체 웹
After=network.target logoche-engine.service

[Service]
User=$USER_NAME
WorkingDirectory=$APP/web
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

$REDIRECTS {
	redir https://$DOMAIN{uri} permanent
}
EOF

sudo systemctl daemon-reload
sudo systemctl enable logoche-engine logoche-web caddy

bash "$APP/deploy/update.sh"
sudo systemctl reload caddy

echo "== 끝: https://$DOMAIN"
