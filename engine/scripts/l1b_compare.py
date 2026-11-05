"""L1b 시험 결과(11/5): 구조 지시 변형과 지시 없음의 뼈대 점수(B안), 글자 비율·속공간 같은 측정값, 견본 이미지.

    engine/.venv/bin/python scripts/l1b_compare.py docs/structure-20261105-runs.jsonl [견본.png]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402


def main(runs: str, sheet: str | None) -> None:
    rows = [r for r in (json.loads(l) for l in open(runs, encoding="utf-8") if l.strip()) if r.get("phase") == "done"]
    names = [r["variant"] for r in rows]
    paths = [BUILDS_DIR / r["buildId"] / "font.ttf" for r in rows]
    hs = [{chr(c) for c in TTFont(p, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3} for p in paths]
    chars = "".join(sorted(set.intersection(*hs)))
    S = [checks._shape_set(p, p.stat().st_mtime, chars) for p in paths]
    free = [checks._shape_set(p, p.stat().st_mtime, chars) for p in checks._font_files(COMPARE_DIR / "free")]
    n = len(names)
    M = np.array([[checks.shape_similarity(S[i], S[j]) for j in range(n)] for i in range(n)])
    print(f"변형 {n}개, 공통 {len(chars)}자, 무료 폰트 {len(free)}개\n")
    print(f"{'':<12}" + "".join(f"{x:>12}" for x in names) + "   무료와 최대")
    for i in range(n):
        print(f"{names[i]:<12}" + "".join(f"{M[i, j]:>12.2f}" for j in range(n)) + f"   {max(checks.shape_similarity(S[i], f) for f in free):.2f}")
    noise = M[0, 1]
    print(f"\n지시 없음끼리(노이즈 바닥): {noise:.2f}")
    for i in range(2, n):
        to_none = (M[i, 0] + M[i, 1]) / 2
        to_others = np.mean([M[i, j] for j in range(2, n) if j != i])
        print(f"{names[i]:<12} 지시 없음 2건과 평균 {to_none:.2f} (바닥보다 {noise - to_none:+.2f}), 다른 구조 지시와 평균 {to_others:.2f}")
    # 구조가 실제로 달라졌는지 재는 값: 글자 잉크 가로세로 비율, 속공간(뼈대 밖 빈 곳 비율)
    print("\n실제 글자 모양 측정(공통 글자 평균)")
    print(f"{'':<12}{'가로/세로':>10}{'잉크 비율':>10}")
    for nm, p in zip(names, paths):
        rs, inks = [], []
        for ch in chars:
            img = checks._render(p, ch, 96) > 127
            ys, xs = np.nonzero(img)
            if len(xs) == 0:
                continue
            rs.append((xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1))
            inks.append(img[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].mean())
        print(f"{nm:<12}{np.mean(rs):>10.2f}{np.mean(inks):>10.2f}")
    if sheet:
        sample = [c for c in "달콤한집가게냥이빵" if c in chars][:8] or list(chars[:8])
        cell = 120
        im = Image.new("RGB", (110 + cell * len(sample), cell * n), "white")
        d = ImageDraw.Draw(im)
        lab = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 15)
        for r, (nm, p) in enumerate(zip(names, paths)):
            d.text((8, r * cell + 50), nm, fill="black", font=lab)
            f = ImageFont.truetype(str(p), 88)
            for c, ch in enumerate(sample):
                d.text((110 + c * cell + 12, r * cell + 8), ch, font=f, fill="black")
        im.save(sheet)
        print("견본:", sheet)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
