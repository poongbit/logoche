"""외곽선 도구: 조절값(Axes), 비트맵 → 외곽선(vtracer), 외곽선 → SVG 패스, 너비·기울기·자간 변환.
10/30: 자소 조합(compose.py)을 그만두며 그린 글자 빌드(drawn.py)가 쓰는 것만 남겼다."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

import cv2
import numpy as np
import pathops
import vtracer
from fontTools.misc.transform import Transform
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.roundingPen import RoundingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

SHARP_BELOW = 0.35  # 둥글기 축이 이보다 낮으면 굵기 조정에 정사각형 커널을 쓴다


@dataclass
class Axes:
    weight: float = 400
    roundness: float = 0.5  # 낮으면 굵기를 맞출 때 모서리를 각지게 둔다
    width: float = 100  # %
    slant: float = 0  # 도, 오른쪽으로 기울면 +
    tracking: float = 0  # 1em의 %
    drawn_weight: float | None = None  # 글자를 그릴 때의 굵기(없으면 weight). 지금 굵기와의 차이만큼 획을 굵히거나 가늘인다


_PATH_RE = re.compile(r'<path d="([^"]+)"[^>]*?transform="translate\(([-\d.]+),([-\d.]+)\)"')

VTRACER = dict(filter_speckle=4, corner_threshold=60, length_threshold=4.0, splice_threshold=45, path_precision=2)


def vtrace(mask: np.ndarray, pen, to_units: Transform, **params) -> None:
    """검은 글씨 = True인 비트맵을 vtracer로 따서, 픽셀 좌표에 to_units를 걸어 pen에 그린다."""
    image = np.where(mask, 0, 255).astype(np.uint8)
    ok, png = cv2.imencode(".png", cv2.cvtColor(image, cv2.COLOR_GRAY2BGR))
    assert ok
    svg = vtracer.convert_raw_image_to_svg(png.tobytes(), img_format="png", colormode="binary", mode="spline", **(VTRACER | params))
    for d, tx, ty in _PATH_RE.findall(svg):
        parse_path(d, TransformPen(pen, to_units.translate(float(tx), float(ty))))


def svg_path(path: pathops.Path, transform: Transform = Transform()) -> tuple[str, int]:
    """외곽선을 SVG 패스 문자열(정수 좌표)로 바꾼다. 점 수(마디 끝점 수)도 돌려준다."""
    rec = RecordingPen()
    path.draw(TransformPen(rec, transform))
    nodes = sum(1 for op, _ in rec.value if op in ("lineTo", "curveTo", "qCurveTo"))
    svg = SVGPathPen(None)
    rec.replay(RoundingPen(svg))
    return svg.getCommands(), nodes


def style_transform(advance: int, axes: Axes) -> tuple[Transform, int]:
    """폰트 단위 외곽선에 너비·기울기·자간을 거는 변환과 글자 폭."""
    k = axes.width / 100
    track = axes.tracking * 10  # 1em = 1,000단위의 %
    center_x = advance / 2
    center_y = 380  # 글자 몸통 가운데 높이. 여기를 축으로 기울인다.
    shear = math.tan(math.radians(axes.slant))
    # 너비 → 기울기 → 자간 절반만큼 오른쪽으로
    widen = Transform(k, 0, 0, 1, center_x * (1 - k), 0)
    slant = Transform(1, 0, shear, 1, -center_y * shear, 0)
    shift = Transform(1, 0, 0, 1, (advance * k - advance) / 2 + track / 2, 0)
    return shift.transform(slant).transform(widen), round(advance * k + track)
