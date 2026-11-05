"""유사도 정규화(11/5 B안): 기울이거나 늘린 복사본도 같은 서체로 읽혀야 한다."""

import cv2
import numpy as np

from logoche_engine import checks


def _glyph() -> np.ndarray:
    img = np.zeros((192, 192), np.uint8)
    cv2.rectangle(img, (60, 50), (130, 62), 255, -1)
    cv2.rectangle(img, (90, 50), (102, 150), 255, -1)
    cv2.ellipse(img, (96, 125), (30, 18), 0, 0, 360, 255, 8)
    return img


def _warp(img: np.ndarray, shear: float, sx: float) -> np.ndarray:
    m = np.float32([[sx, -shear, 96 * (1 - sx) + shear * 96], [0, 1, 0]])
    return cv2.warpAffine(img, m, (192, 192))


def _score(a: np.ndarray, b: np.ndarray) -> float:
    ra, rb = checks.skeleton(a), checks.skeleton(b)
    return checks.shape_similarity({"x": checks._shape_entry(ra)}, {"x": checks._shape_entry(rb)})


def test_sheared_and_stretched_copy_still_matches():
    g = _glyph()
    assert _score(g, _warp(g, 0.15, 0.9)) >= 0.85


def test_different_shape_does_not_match():
    g = _glyph()
    other = np.zeros((192, 192), np.uint8)
    cv2.rectangle(other, (50, 50), (60, 150), 255, -1)
    cv2.rectangle(other, (130, 50), (140, 150), 255, -1)
    cv2.rectangle(other, (50, 95), (140, 105), 255, -1)
    assert _score(g, other) < 0.85
