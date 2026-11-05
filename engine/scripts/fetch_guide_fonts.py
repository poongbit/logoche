"""구조 참고 폰트 받기(11/5): engine/compare/guide_pool.json의 후보 풀 중 compare 폴더에 없는 폰트를 네이버 한글한글아름답게에서 받는다.

    uv run python scripts/fetch_guide_fonts.py

- 나눔손글씨(클로바)는 compare/nanum-hand/<이름>.ttf, 마루부리는 compare/maru/MaruBuri-*.ttf로 둔다. 풀의 나머지(구글 폰트 등)는 fetch_compare_fonts.py가 compare/free에 받는다.
- 네이버 글꼴은 오픈 라이선스(상업 이용 가능, 글꼴 자체의 판매만 제외)이고 우리는 뼈대 위치를 참고만 한다. 약관 전문 확인은 사용자(11/5 결정으로 켬).
- 이미 있는 파일은 건너뛴다. 폰트 파일은 깃에 올리지 않는다(.gitignore).
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from logoche_engine.paths import COMPARE_DIR  # noqa: E402

CLOVA = "https://hangeul.naver.com/hangeul_static/webfont/clova/{name}.ttf"
MARU_ZIP = "https://hangeul.pstatic.net/0/hangeul/2022/zip_v2/maruburi.zip"


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "logoche-engine"}), timeout=120) as res:
        return res.read()


def main() -> None:
    pool = json.loads((COMPARE_DIR / "guide_pool.json").read_text(encoding="utf-8"))
    for entry in pool:
        stem, folder = entry["stem"], entry["dir"]
        target_dir = COMPARE_DIR / folder
        if any(target_dir.glob(f"{stem}.*")):
            continue
        target_dir.mkdir(parents=True, exist_ok=True)
        if folder == "nanum-hand":
            (target_dir / f"{stem}.ttf").write_bytes(get(CLOVA.format(name=stem)))
            print("받음", stem)
        elif folder == "maru":
            with zipfile.ZipFile(io.BytesIO(get(MARU_ZIP))) as z:
                for name in z.namelist():
                    if name.startswith("TTF/") and name.endswith(".ttf") and Path(name).stem == stem:
                        (target_dir / f"{stem}.ttf").write_bytes(z.read(name))
                        print("받음", stem)
        else:
            print(f"없음: {folder}/{stem} — scripts/fetch_compare_fonts.py로 compare/free를 채우세요")


if __name__ == "__main__":
    main()
