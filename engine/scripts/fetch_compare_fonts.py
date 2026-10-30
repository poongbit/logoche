"""유사도 비교용 무료 폰트 받기: Google Fonts에서 한글을 지원하는 가족을 모두 받아 compare/free/에 둔다.

    uv run python scripts/fetch_compare_fonts.py

- 목록은 Google Fonts 메타데이터(subsets에 korean)에서 뽑고, 파일은 github.com/google/fonts의 ofl/ 폴더에서 받는다(모두 SIL OFL 1.1).
- 가족마다 가변 폰트는 그 파일 하나, 고정 굵기는 보통(없으면 Medium·첫 파일)과 Bold만 받는다. 같은 가족의 굵기끼리는 뼈대 점수가 0.95 안팎이라 다 받을 필요가 없다.
- 받은 목록과 해시는 compare/free/google-fonts.json에 남긴다. 비교에만 쓰고 생성 서체에는 들어가지 않는다.
- GitHub API는 토큰 없이 시간당 60번까지다. GITHUB_TOKEN이 있으면 쓴다.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from logoche_engine.paths import COMPARE_DIR  # noqa: E402

META_URL = "https://fonts.google.com/metadata/fonts"
CONTENTS_URL = "https://api.github.com/repos/google/fonts/contents/ofl/{dir}"
RAW_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/{dir}/{file}"


def fetch(url: str, api: bool = False) -> bytes:
    headers = {"User-Agent": "logoche-engine"}
    if api and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as res:
        return res.read()


def korean_families() -> list[str]:
    raw = fetch(META_URL).decode()
    meta = json.loads(raw[raw.index("{") :])  # 앞에 붙는 )]}' 를 뗀다
    return sorted(f["family"] for f in meta["familyMetadataList"] if "korean" in f.get("subsets", []))


def pick(files: list[str]) -> list[str]:
    variable = [f for f in files if "[" in f]
    if variable:
        return variable
    by_style = {re.sub(r"^.*-|\.(ttf|otf)$", "", f): f for f in files}
    regular = by_style.get("Regular") or by_style.get("Medium") or sorted(files)[0]
    return list(dict.fromkeys([regular, *([by_style["Bold"]] if "Bold" in by_style else [])]))


def main() -> None:
    out_dir = COMPARE_DIR / "free"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for family in korean_families():
        folder = family.lower().replace(" ", "")
        listing = json.loads(fetch(CONTENTS_URL.format(dir=folder), api=True))
        files = [item["name"] for item in listing if item["name"].endswith((".ttf", ".otf"))]
        for name in pick(files):
            url = RAW_URL.format(dir=folder, file=urllib.parse.quote(name))
            data = fetch(url)
            (out_dir / name).write_bytes(data)
            manifest.append({"family": family, "file": name, "sha256": hashlib.sha256(data).hexdigest(), "source": url, "license": "SIL OFL 1.1"})
            print(f"{family}: {name} ({len(data) / 1e6:.1f}MB)")
    record = {"fetched": datetime.date.today().isoformat(), "fonts": manifest}
    (out_dir / "google-fonts.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(manifest)}개 파일 → {out_dir}")


if __name__ == "__main__":
    main()
