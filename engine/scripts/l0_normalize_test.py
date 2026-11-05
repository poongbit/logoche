"""유사도에 기울기·가로세로 정규화를 넣었을 때 군집 수와 '기울인 복사본' 잡힘을 본다(11/5). 새 호출 없음.
정규화 A: 모멘트로 기울기만 폅니다. B: 기울기를 펴고 가로·세로 퍼짐도 같게 맞춥니다.

    engine/.venv/bin/python scripts/l0_normalize_test.py docs/main-20261105-runs.jsonl
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402
from l0_tweak_test import warp  # noqa: E402


def normalize(img: np.ndarray, mode: str) -> np.ndarray:
    if mode == "raw":
        return img
    b = (cv2.medianBlur(img, 5) > 127).astype(np.float64)
    ys, xs = np.nonzero(b)
    if len(xs) < 20:
        return img
    cx, cy = xs.mean(), ys.mean()
    dx, dy = xs - cx, ys - cy
    mxx, myy, mxy = (dx * dx).mean(), (dy * dy).mean(), (dx * dy).mean()
    k = mxy / myy  # x' = x - k*y 로 기울기를 편다
    sx = sy = 1.0
    if mode == "B":
        vx = mxx - mxy * mxy / myy
        sx = np.sqrt(myy / max(vx, 1e-6))  # 가로 퍼짐을 세로와 같게
    h, w = img.shape
    m = np.array([[sx, -k * sx, 0], [0, sy, 0]], np.float64)
    m[:, 2] = np.array([w / 2, h / 2]) - m[:, :2] @ np.array([cx, cy])
    return cv2.warpAffine(img, m.astype(np.float32), (w, h), flags=cv2.INTER_LINEAR)


def shape_set(path: Path, chars: str, mode: str, tweak=None) -> dict:
    cmap = TTFont(path, lazy=True).getBestCmap()
    out = {}
    for ch in chars:
        if ord(ch) not in cmap:
            continue
        img = checks._render(path, ch, 96)
        if tweak:
            img = warp(img, *tweak)
        ridge = checks.skeleton(normalize(img, mode))
        if ridge is not None:
            out[ch] = checks._shape_entry(ridge)
    return out


def main(runs: str) -> None:
    rows = [r for r in (json.loads(l) for l in open(runs, encoding="utf-8") if l.strip()) if r.get("phase") == "done"]
    paths = [BUILDS_DIR / r["buildId"] / "font.ttf" for r in rows]
    hs = [{chr(c) for c in TTFont(p, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3} for p in paths]
    chars = "".join(sorted(set.intersection(*hs)))
    free_paths = checks._font_files(COMPARE_DIR / "free")
    n = len(paths)
    print(f"서체 {n}개, 무료 폰트 {len(free_paths)}개, 공통 {len(chars)}자\n")
    for mode, label in (("raw", "지금(정규화 없음)"), ("A", "A 기울기만 폄"), ("B", "B 기울기 폄 + 가로세로 맞춤")):
        base = [shape_set(p, chars, mode) for p in paths]
        free = [shape_set(p, chars, mode) for p in free_paths]
        M = np.array([[checks.shape_similarity(base[i], base[j]) if i != j else 1 for j in range(n)] for i in range(n)])
        F = np.array([[checks.shape_similarity(s, x) for x in free] for s in base])
        print(f"== {label} ==  서체 쌍 점수 평균 {M[np.triu_indices(n, 1)].mean():.2f}, 서체-무료 평균 {F.mean():.2f}")
        for t in (0.85, 0.90):
            reps: list[int] = []
            for i in range(n):
                if all(M[i, j] < t for j in reps):
                    reps.append(i)
            acc: list[int] = []
            for i in range(n):
                if F[i].max() < t and all(M[i, j] < t for j in acc):
                    acc.append(i)
            print(f"  문턱 {t:.2f}: 군집 {len(reps)}개 / 무료와 안 닮은 서체 {(F.max(axis=1) < t).mean() * 100:.0f}% / 순차 통과 {len(acc)}/{n}")
        # 기울인 복사본 잡힘: 서체 i vs 자기 복사본(기울기+8, 가로 90)과 (기울기-8, 가로 110)
        for tw in ((8, 90, 100), (-8, 110, 100), (12, 85, 110)):
            cp = [shape_set(p, chars, mode, tw) for p in paths]
            s = np.array([checks.shape_similarity(base[i], cp[i]) for i in range(n)])
            print(f"  자기 복사본 {tw}: 평균 {s.mean():.2f}, ≥0.85로 잡힘 {(s >= 0.85).mean() * 100:.0f}%")
        print()


if __name__ == "__main__":
    main(sys.argv[1])
