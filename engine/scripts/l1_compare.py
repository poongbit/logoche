"""L1 조향 실험 결과(11/5): 처리군(steer)과 대조군(본 실험 같은 입력)을 같은 칸 안 서체 쌍 점수로 비교한다(B안 정규화).

    engine/.venv/bin/python scripts/l1_compare.py docs/main-20261105-runs.jsonl docs/steer-20261105-runs.jsonl
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
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402


def load(path: str, cells: set[str] | None = None, skip_repeat: bool = True):
    rows = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
    return [r for r in rows if r.get("phase") == "done" and (not skip_repeat or not r.get("repeat")) and (cells is None or r["attrName"] in cells)]


def main(control_path: str, steer_path: str) -> None:
    steer = load(steer_path)
    cells = {r["attrName"] for r in steer}
    control = load(control_path, cells)
    allrows = [("control", r) for r in control] + [("steer", r) for r in steer]
    paths = [BUILDS_DIR / r["buildId"] / "font.ttf" for _, r in allrows]
    hs = [{chr(c) for c in TTFont(p, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3} for p in paths]
    chars = "".join(sorted(set.intersection(*hs)))
    S = [checks._shape_set(p, p.stat().st_mtime, chars) for p in paths]
    free = [checks._shape_set(p, p.stat().st_mtime, chars) for p in checks._font_files(COMPARE_DIR / "free")]
    print(f"처리군 {len(steer)}건, 대조군(반복 제외) {len(control)}건, 공통 {len(chars)}자, 무료 폰트 {len(free)}개\n")
    idx = defaultdict(list)
    for i, (arm, r) in enumerate(allrows):
        idx[(r["attrName"], arm)].append(i)

    def pairs(ix):
        return np.array([checks.shape_similarity(S[a], S[b]) for a, b in itertools.combinations(ix, 2)])

    print(f"{'칸':<14}{'군':<9}{'서체':>3} {'쌍':>4} {'평균':>6} {'≥0.85 쌍':>9} {'무료와 최대(평균)':>16}")
    summary = {}
    for cell in sorted(cells):
        for arm in ("control", "steer"):
            ix = idx[(cell, arm)]
            p = pairs(ix)
            fmax = np.mean([max(checks.shape_similarity(S[i], f) for f in free) for i in ix])
            summary[(cell, arm)] = (p.mean(), (p >= 0.85).mean())
            print(f"{cell:<14}{arm:<9}{len(ix):>3} {len(p):>4} {p.mean():>6.2f} {(p >= 0.85).mean() * 100:>8.0f}% {fmax:>14.2f}")
    print()
    for arm in ("control", "steer"):
        ix = [i for i, (a, _) in enumerate(allrows) if a == arm]
        M = np.array([[checks.shape_similarity(S[a], S[b]) if a != b else 1 for b in ix] for a in ix])
        for t in (0.85, 0.90):
            reps: list[int] = []
            for i in range(len(ix)):
                if all(M[i, j] < t for j in reps):
                    reps.append(i)
            print(f"{arm}: 서체 {len(ix)}개 군집(문턱 {t}) {len(reps)}개")
    # 처리군 서체와 같은 칸 대조군 서체 사이(레지스트리와의 거리)
    for cell in sorted(cells):
        cross = [checks.shape_similarity(S[a], S[b]) for a in idx[(cell, "steer")] for b in idx[(cell, "control")]]
        print(f"{cell}: 처리군↔대조군 평균 {np.mean(cross):.2f}, ≥0.85 {np.mean(np.array(cross) >= 0.85) * 100:.0f}%")
    # 계열 분포
    for arm, rows in (("control", control), ("steer", steer)):
        by = defaultdict(lambda: defaultdict(int))
        for r in rows:
            by[r["attrName"]][r.get("family")] += 1
        print(arm, {c: dict(v) for c, v in by.items()})
    for arm, rows in (("control", control), ("steer", steer)):
        print(arm, "건당 어림 비용 평균", round(float(np.mean([r.get("costUsd", 0) for r in rows])), 3))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
