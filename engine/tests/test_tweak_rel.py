"""전체 굵기 조정을 기준 글자의 두께 변화 비율로 거는 규칙(11/5, drawn.resolve_all)."""

import cv2
import numpy as np

from logoche_engine import drawn, raster
from logoche_engine.contour import ALL_GLYPHS, Axes, Tweak


def _cross(width: int) -> np.ndarray:
    s = drawn.SIDE
    m = np.zeros((s, s), np.uint8)
    c = s // 2
    cv2.rectangle(m, (c - 100, c - width // 2), (c + 100, c + width // 2), 255, -1)
    cv2.rectangle(m, (c - width // 2, c - 100), (c + width // 2, c + 100), 255, -1)
    return m > 0


def test_relative_thickness_is_even_across_glyphs():
    glyphs = {"면": _cross(40), "가": _cross(24), "나": _cross(56)}
    axes = Axes(weight=700, drawn_weight=700)
    off = drawn.weight_offset(axes)
    tweak, thick = drawn.resolve_all(glyphs, axes, off, {ALL_GLYPHS: Tweak(pull=-150, rel="면")})
    assert tweak is not None and tweak.pull == 0 and tweak.rel is None and thick is not None
    ratios = []
    for m in glyphs.values():
        t = raster.solid_thickness(m)
        o = off + thick[0] * (t + 2 * off) / thick[1]
        ratios.append(raster.solid_thickness(drawn.glyph_mask(m, axes, o)) / t)
    assert max(ratios) - min(ratios) < 0.02  # 숫자 그대로는 0.61~0.84로 벌어졌다


def test_without_rel_pull_stays():
    glyphs = {"면": _cross(40)}
    axes = Axes(weight=700, drawn_weight=700)
    tweak, thick = drawn.resolve_all(glyphs, axes, 0.0, {ALL_GLYPHS: Tweak(pull=-150)})
    assert tweak.pull == -150 and thick is None
