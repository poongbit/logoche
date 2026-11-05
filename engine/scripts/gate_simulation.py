"""본 실험 46건을 만든 순서대로 '새 서체를 받을 때 이미 있는 서체(무료 폰트 + 앞서 받은 서체)와 닮으면 다시 그린다'를 흉내 낸다.
문턱별로 처음 시도에서 받아들여지는 비율과, 다시 그릴 때 드는 추가 비용(어림)을 본다. 새 호출 없이 이미 만든 서체로만 계산한다.

    engine/.venv/bin/python scripts/gate_simulation.py docs/main-20261105-runs.jsonl
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402


def main(path: str) -> None:
    rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
    rows = [r for r in rows if r.get("phase") == "done"]
    fonts = []
    for r in rows:
        p = BUILDS_DIR / r["buildId"] / "font.ttf"
        cm = TTFont(p, lazy=True).getBestCmap()
        fonts.append((r, p, {chr(c) for c in cm if 0xAC00 <= c <= 0xD7A3}))
    chars = "".join(sorted(set.intersection(*[h for _, _, h in fonts])))
    sets = [checks._shape_set(p, p.stat().st_mtime, chars) for _, p, _ in fonts]
    free = [checks._shape_set(p, p.stat().st_mtime, chars) for p in checks._font_files(COMPARE_DIR / "free")]
    n = len(sets)
    M = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            M[i, j] = M[j, i] = checks.shape_similarity(sets[i], sets[j])
    F = np.array([[checks.shape_similarity(s, x) for x in free] for s in sets])  # n x 무료 폰트
    cost = np.array([r.get("costUsd", 0) for r in rows])
    print(f"서체 {n}개, 무료 폰트 {len(free)}개, 공통 한글 {len(chars)}자, 건당 어림 비용 평균 ${cost.mean():.3f}")
    print(f"{'문턱':>5} | {'(가) 무료 폰트와만 비교':>20} | {'(나) 무료 폰트 + 앞서 받은 서체':>26} | 군집 수(서체끼리)")
    for t in (0.80, 0.85, 0.90, 0.95):
        a = (F.max(axis=1) < t).mean()
        acc: list[int] = []
        for i in range(n):
            if F[i].max() < t and all(M[i, j] < t for j in acc):
                acc.append(i)
        # 서체끼리 탐욕 군집: 앞 서체와 문턱 이상이면 같은 군집
        reps: list[int] = []
        for i in range(n):
            if all(M[i, j] < t for j in reps):
                reps.append(i)
        print(f"{t:>5.2f} | 처음에 받아들여짐 {a * 100:4.0f}% | 처음에 받아들여짐 {len(acc) / n * 100:4.0f}% ({len(acc)}/{n}) | {len(reps)}군집")
    print("참고 글자 30자 기준 한 번 그리는 데 평균", f"${cost.mean():.3f}")


if __name__ == "__main__":
    main(sys.argv[1])
