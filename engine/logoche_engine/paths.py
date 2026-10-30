from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
DATA_DIR = Path(os.environ.get("LOGOCHE_DATA_DIR", ROOT / "data"))
BUILDS_DIR = DATA_DIR / "builds"
ISSUED_DIR = DATA_DIR / "issued"
# 유사도 비교 대상. free/ 와 commercial/ 에 .otf·.ttf를 넣는다. 기준 서체는 늘 무료 폰트로 들어간다.
COMPARE_DIR = Path(os.environ.get("LOGOCHE_COMPARE_DIR", ROOT / "compare"))
