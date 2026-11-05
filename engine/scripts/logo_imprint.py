"""로고 고유 요소가 글자에 남는가(11/5): 같은 로고·다른 속성 쌍, 같은 속성·다른 로고 쌍, 둘 다 다른 쌍의 점수를 견준다. 새 호출 없음.

    engine/.venv/bin/python scripts/logo_imprint.py docs/main-20261105-runs.jsonl [견본.png]
"""

from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR  # noqa: E402


def main(runs: str, sheet: str | None) -> None:
    rows = [r for r in (json.loads(l) for l in open(runs, encoding="utf-8") if l.strip()) if r.get("phase") == "done"]
    paths = [BUILDS_DIR / r["buildId"] / "font.ttf" for r in rows]
    hs = [{chr(c) for c in TTFont(p, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3} for p in paths]
    chars = "".join(sorted(set.intersection(*hs)))
    S = [checks._shape_set(p, p.stat().st_mtime, chars) for p in paths]
    n = len(rows)
    groups = {"같은 로고·다른 속성": [], "같은 속성·다른 로고": [], "둘 다 다름": [], "같은 입력 반복": []}
    for i, j in itertools.combinations(range(n), 2):
        a, b = rows[i], rows[j]
        s = checks.shape_similarity(S[i], S[j])
        sl, sa = a["logoId"] == b["logoId"], a["attrName"] == b["attrName"]
        if sl and sa:
            groups["같은 입력 반복"].append(s)
        elif sl:
            groups["같은 로고·다른 속성"].append(s)
        elif sa:
            groups["같은 속성·다른 로고"].append(s)
        else:
            groups["둘 다 다름"].append(s)
    print(f"서체 {n}개, 공통 {len(chars)}자 (B안)\n{'쌍 종류':<20}{'쌍':>5}{'평균':>7}{'≥0.85':>8}")
    for k, v in groups.items():
        v = np.array(v)
        print(f"{k:<20}{len(v):>5}{v.mean():>7.2f}{(v >= 0.85).mean() * 100:>7.0f}%")
    if sheet:
        # 로고별(행) × 속성(열)로 같은 글자 하나('한' 또는 공통 글자 중 첫 번째)를 그린다
        ch = "한" if "한" in chars else chars[0]
        logos = sorted({r["logoId"] for r in rows})
        attrs = sorted({r["attrName"] for r in rows})
        cell = 110
        im = Image.new("RGB", (80 + cell * len(attrs), 24 + cell * len(logos)), "white")
        d = ImageDraw.Draw(im)
        lab = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 11)
        for c, a in enumerate(attrs):
            d.text((80 + c * cell + 4, 4), a, fill="black", font=lab)
        for r_, lg in enumerate(logos):
            d.text((6, 24 + r_ * cell + 45), lg, fill="black", font=lab)
            for c, a in enumerate(attrs):
                hit = [k for k, r in enumerate(rows) if r["logoId"] == lg and r["attrName"] == a and not r.get("repeat")]
                if hit:
                    f = ImageFont.truetype(str(paths[hit[0]]), 84)
                    d.text((80 + c * cell + 10, 24 + r_ * cell + 4), ch, font=f, fill="black")
        im.save(sheet)
        print("견본:", sheet, "글자", ch)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
