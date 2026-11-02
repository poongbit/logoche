#!/usr/bin/env bash
# 코드 바꾼 뒤 서버에서: 받은 코드로 엔진 라이브러리·화면을 다시 빌드하고 다시 켠다.
#   bash ~/logoche/deploy/update.sh
# 만들던 폰트는 다시 켜면 끊긴다(진행이 메모리에 있다, lib/server/projects.ts). 아무도 만들지 않을 때 돌린다.
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

if [ ! -f "$APP/web/.env.local" ]; then
  echo "web/.env.local이 없어요. 키를 먼저 넣어 주세요." >&2
  exit 1
fi

git -C "$APP" pull --ff-only

echo "== 엔진"
(cd "$APP/engine" && "$UV" sync --frozen)

echo "== 웹"
(cd "$APP/web" && npm ci && npm run build)

sudo systemctl restart logoche-engine logoche-web
sleep 3
systemctl is-active logoche-engine logoche-web
