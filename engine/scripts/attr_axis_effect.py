"""속성 축별로 서체끼리 닮음이 얼마나 달라지나(11/5, 새 호출 없음). 본 실험·파일럿 빌드 56개의 모든 쌍(B안 정규화, 공통 글자)을
'어느 속성이 다른가'로 묶어 평균 점수와 0.85 이상 비율을 본다. 다른 로고끼리만 센다(같은 로고는 로고 요인이 섞인다).

    engine/.venv/bin/python scripts/attr_axis_effect.py docs/main-20261105-runs.jsonl docs/pilot-20261105-runs.jsonl
"""

from __future__ import annotations

import itertools
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR  # noqa: E402

# 이름 → (획 끝, 굵기, 대비, 손맛). 이름에 없는 대비는 균일, 손맛은 단정으로 둔다.
def decode(name: str) -> tuple[str, str, str, str]:
    t = name.split()
    return (
        "둥근" if "둥글고" in t else "각진",
        "굵은" if "굵고" in t else "가는",
        "대비" if any(x.startswith("대비") for x in t) else "균일",
        "붓맛" if any("붓맛" in x for x in t) else "단정",
    )


AXES = ["획 끝", "굵기", "대비", "손맛"]


def main(paths: list[str]) -> None:
    rows = [r for p in paths for r in (json.loads(l) for l in open(p, encoding="utf-8") if l.strip()) if r.get("phase") == "done" and not r.get("repeat")]
    fonts = [BUILDS_DIR / r["buildId"] / "font.ttf" for r in rows]
    hs = [{chr(c) for c in TTFont(p, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3} for p in fonts]
    chars = "".join(sorted(set.intersection(*hs)))
    S = [checks._shape_set(p, p.stat().st_mtime, chars) for p in fonts]
    attrs = [decode(r["attrName"]) for r in rows]
    groups: dict[str, list[float]] = defaultdict(list)
    for i, j in itertools.combinations(range(len(rows)), 2):
        a, b = rows[i], rows[j]
        if a["logoId"] == b["logoId"]:
            continue
        s = checks.shape_similarity(S[i], S[j])
        diff = [AXES[k] for k in range(4) if attrs[i][k] != attrs[j][k]]
        groups["다른 속성 %d개" % len(diff)].append(s)
        if len(diff) == 1:
            groups["하나만 다름: " + diff[0]].append(s)
        if not diff:
            groups["속성 같음 · 계열 " + ("같음" if a["family"] == b["family"] else "다름")].append(s)
    print(f"서체 {len(rows)}개, 공통 {len(chars)}자, 다른 로고끼리만")
    for k in sorted(groups):
        v = np.array(groups[k])
        print(f"{k:28s} 쌍 {len(v):4d}  평균 {v.mean():.3f}  0.85 이상 {np.mean(v >= 0.85) * 100:4.1f}%")


if __name__ == "__main__":
    main(sys.argv[1:])
