"""L0 확인(11/5): 엔진 조정(기울기·가로·세로)을 서체 전체에 걸면 뼈대 유사도가 얼마나 움직이는가. 새 호출 없이 이미 만든 서체로 계산한다.
조정은 96px로 그린 글자 비트맵에 같은 변환(몸통 가운데 축 기준 기울임·늘림)을 걸어 흉내 낸다(윤곽선 변환과 같은 결과, 래스터 오차만 있음).

    engine/.venv/bin/python scripts/l0_tweak_test.py docs/main-20261105-runs.jsonl
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402

VARIANTS = {  # 이름: (기울기°, 가로%, 세로%)
    "항등(오차 확인)": (0, 100, 100),
    "기울기 +2": (2, 100, 100),
    "기울기 +4": (4, 100, 100),
    "가로 95%": (0, 95, 100),
    "가로 105%": (0, 105, 100),
    "기울기 +8": (8, 100, 100),
    "기울기 +15": (15, 100, 100),
    "기울기 -8": (-8, 100, 100),
    "가로 85%": (0, 85, 100),
    "가로 115%": (0, 115, 100),
    "세로 85%": (0, 100, 85),
    "세로 115%": (0, 100, 115),
    "기울기 +8·가로 90": (8, 90, 100),
    "기울기 -8·가로 110": (-8, 110, 100),
    "기울기 +12·가로 85·세로 110": (12, 85, 110),
}


def warp(img: np.ndarray, slant: float, width: float, height: float) -> np.ndarray:
    h, w = img.shape
    cx, cy = w / 2, h / 2
    sx, sy = width / 100, height / 100
    shear = math.tan(math.radians(slant))
    # 출력 좌표 = S * (입력 - c) + 기울임 + c, 기울임은 위로 갈수록 오른쪽(글자 기울임)
    m = np.array([[sx, -shear * sy, cx - sx * cx + shear * sy * cy], [0, sy, cy - sy * cy]], np.float32)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR)


def shape_set(path: Path, chars: str, tweak) -> dict:
    font = TTFont(path, lazy=True)
    cmap = font.getBestCmap()
    out = {}
    for ch in chars:
        if ord(ch) not in cmap:
            continue
        img = checks._render(path, ch, 96)
        if tweak:
            img = warp(img, *tweak)
        ridge = checks.skeleton(img)
        if ridge is not None:
            out[ch] = checks._shape_entry(ridge)
    return out


def main(runs: str) -> None:
    rows = [r for r in (json.loads(l) for l in open(runs, encoding="utf-8") if l.strip()) if r.get("phase") == "done"]
    paths, hs = [], []
    for r in rows:
        p = BUILDS_DIR / r["buildId"] / "font.ttf"
        paths.append(p)
        hs.append({chr(c) for c in TTFont(p, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3})
    chars = "".join(sorted(set.intersection(*hs)))
    free_paths = checks._font_files(COMPARE_DIR / "free")
    n = len(paths)
    base = [shape_set(p, chars, None) for p in paths]
    free = [shape_set(p, chars, None) for p in free_paths]
    M = np.array([[checks.shape_similarity(base[i], base[j]) if i != j else 1 for j in range(n)] for i in range(n)])
    F = np.array([[checks.shape_similarity(s, x) for x in free] for s in base])
    print(f"서체 {n}개, 무료 폰트 {len(free)}개, 공통 {len(chars)}자")
    iu = np.triu_indices(n, 1)
    near_pairs = [(i, j) for i, j in zip(*iu) if M[i, j] >= 0.85]
    near_free = [(i, k) for i in range(n) for k in range(len(free)) if F[i, k] >= 0.85]
    print(f"0.85 이상인 서체 쌍 {len(near_pairs)}개, 무료 폰트와 0.85 이상인 (서체, 무료폰트) 쌍 {len(near_free)}개\n")
    print(f"{'조정':<28}| 자기 자신과 | 서체끼리 쌍(≥.85)→평균 / <.85로 내려간 비율 | 무료 폰트 쌍(≥.85)→평균 / <.85 비율")
    for name, tw in VARIANTS.items():
        tset = [shape_set(p, chars, tw) for p in paths]
        selfs = np.mean([checks.shape_similarity(base[i], tset[i]) for i in range(n)])
        a = [checks.shape_similarity(base[i], tset[j]) for i, j in near_pairs]
        a += [checks.shape_similarity(base[j], tset[i]) for i, j in near_pairs]
        b = [checks.shape_similarity(tset[i], free[k]) for i, k in near_free]
        print(
            f"{name:<28}| {selfs:.2f}      | {np.mean(a):.2f} / {np.mean(np.array(a) < 0.85) * 100:3.0f}%"
            f"                         | {np.mean(b):.2f} / {np.mean(np.array(b) < 0.85) * 100:3.0f}%"
        )


if __name__ == "__main__":
    main(sys.argv[1])
