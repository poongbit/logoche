"""이미지 모델이 그린 음절 그림으로 바로 외곽선을 딴다(10/30 결정: MX-Font를 빼고 GPT가 2,350자를 다 그린다).

그림은 두 가지로 온다.
- 참고 글자(화면 3, 30자 안팎): 글자표 칸에서 잉크에 맞춰 자른 그림. 쓸 때마다 이 묶음 안에서 자리를 맞춘다(place_refs).
- 나머지 글자(화면 4): 글자표 한 장을 자를 때 바로 자리를 맞춘 그림(place_sheet). 웹이 저장해 두었다가 빌드·미리보기에 보낸다.

자리 맞추기(10/30 시험: engine/data/GPT-직접-폰트-시험/, TTF와 그림 겹침 0.97~0.99)
1. 크기: 한 장에서 온 글자는 한 배율로 키운다. 글자마다 기준 서체 같은 글자와 잉크 넓이가 같아지는 배율을 구해 가운데 값을 쓰고,
   가운데 값과 OUTLIER배 넘게 다른 글자(한 자씩 다시 그린 그림처럼 다른 배율로 그린 것)만 제 배율을 쓴다.
   그래서 글자 사이 크기 차이는 그린 대로 남는다.
2. 자리: 기준 서체 같은 글자의 잉크 상자 가운데.
3. 굵기: 나머지 글자 장은 참고 글자와 획 두께가 같아지게 윤곽을 옮긴다(시험에서 장마다 0.89~0.93배로 조금 가늘었다).

그림 틀은 폰트 단위 정사각형(FRAME_*)이다. 자리 맞춘 그림은 1em = 500px(PX) 흑백 마스크이고, 편집 화면(EDIT_SIDE)도 같은 틀을 쓴다.
외곽선은 굵기 축만큼 윤곽을 옮긴 뒤 vtracer로 따고, 너비·기울기·자간은 외곽선에 건다.
"""

from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from functools import cache

import cv2
import numpy as np
import pathops
from fontTools.misc.transform import Transform
from PIL import Image, ImageDraw, ImageFont

from . import raster
from .contour import SHARP_BELOW, Axes, style_transform, vtrace
from .reference import REFERENCE_FONTS, REFERENCE_WEIGHTS, glyph_bounds, load_font

FRAME_LEFT, FRAME_TOP, FRAME_SPAN = -150, 1030, 1300  # 폰트 단위. x -150~1150, y -270~1030(글자 몸통 가운데 380이 가운데)
PX = 0.5  # 자리 맞춘 그림의 픽셀 / 폰트 단위
SIDE = round(FRAME_SPAN * PX)
EDIT_SIDE = 512  # 편집 화면 그림(웹 GlyphEditor)
EDIT_PX = EDIT_SIDE / FRAME_SPAN
OUTLIER = 1.5
SPECK_AREA = 30  # 자리 맞춘 그림에서 이보다 작은 덩어리(px)는 지운다
THICKNESS_SAMPLE = 40  # 장의 획 두께는 이만큼만 재서 가운데 값을 쓴다
MARGIN = 24  # 윤곽을 옮기거나 외곽선을 딸 때 글자 둘레에 남기는 여백(px)


# ---------- 기준 서체 ----------


@cache
def _reference():
    font = load_font("regular")
    return font, font.getBestCmap()


@cache
def _box(ch: str) -> tuple[float, float, float, float]:
    """기준 서체 같은 글자의 잉크 상자(폰트 단위)."""
    font, cmap = _reference()
    bounds = glyph_bounds(font, cmap[ord(ch)])
    assert bounds is not None
    return bounds


# ---------- 자리 맞추기 ----------


def _own_scale(gray: np.ndarray, ch: str) -> float | None:
    b = raster.bbox(raster.ink_mask(gray))
    if b is None:
        return None
    x0, y0, x1, y1 = b
    bx0, by0, bx1, by1 = _box(ch)
    return float(np.sqrt((bx1 - bx0) * (by1 - by0) / ((x1 - x0) * (y1 - y0))))


def scales(images: dict[str, np.ndarray]) -> dict[str, float]:
    """폰트 단위 / 그림 픽셀. 빈 그림은 뺀다."""
    own = {c: s for c, g in images.items() if (s := _own_scale(g, c))}
    if not own:
        return {}
    mid = float(np.median(list(own.values())))
    return {c: s if max(s / mid, mid / s) > OUTLIER else mid for c, s in own.items()}


def _place(gray: np.ndarray, ch: str, scale: float) -> np.ndarray:
    """그림을 틀(SIDE px)에 놓은 잉크 마스크."""
    x0, y0, x1, y1 = raster.bbox(raster.ink_mask(gray))
    k = scale * PX
    w, h = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
    glyph = cv2.resize(gray[y0:y1, x0:x1], (w, h), interpolation=cv2.INTER_CUBIC if k > 1 else cv2.INTER_AREA) < 128
    bx0, by0, bx1, by1 = _box(ch)
    ox = round(((bx0 + bx1) / 2 - FRAME_LEFT) * PX - w / 2)
    oy = round((FRAME_TOP - (by0 + by1) / 2) * PX - h / 2)
    canvas = np.zeros((SIDE, SIDE), bool)
    cx0, cy0, cx1, cy1 = max(0, ox), max(0, oy), min(SIDE, ox + w), min(SIDE, oy + h)
    if cx1 > cx0 and cy1 > cy0:
        canvas[cy0:cy1, cx0:cx1] = glyph[cy0 - oy : cy1 - oy, cx0 - ox : cx1 - ox]
    return raster.remove_specks(canvas, SPECK_AREA)


def _around(mask: np.ndarray, margin: int, edit: Callable[[np.ndarray], np.ndarray]) -> np.ndarray:
    """글자 둘레만 잘라 고친다(틀 전체에 거리 변환을 걸지 않으려고)."""
    b = raster.bbox(mask)
    if b is None:
        return mask
    h, w = mask.shape
    x0, y0, x1, y1 = max(0, b[0] - margin), max(0, b[1] - margin), min(w, b[2] + margin), min(h, b[3] + margin)
    out = np.zeros_like(mask)
    out[y0:y1, x0:x1] = edit(mask[y0:y1, x0:x1])
    return out


def _offset(mask: np.ndarray, amount_px: float, sharp: bool = False) -> np.ndarray:
    """윤곽을 amount_px만큼 바깥(+)이나 안(-)으로 옮긴다. 획이 끊기거나 속공간이 막히면 덜 옮긴다."""
    if abs(amount_px) < 0.25 or not mask.any():
        return mask
    move = raster.offset_square if sharp else raster.offset
    return _around(
        mask,
        MARGIN + int(np.ceil(abs(amount_px))),
        lambda m: raster.keep_shape(m, 1.0, 0.25 / abs(amount_px), lambda mm, k: move(mm, amount_px * k)),
    )


def thickness(masks: Iterable[np.ndarray]) -> float:
    """획 두께(폰트 단위) 가운데 값."""
    values = [raster.solid_thickness(m) for _, m in zip(range(THICKNESS_SAMPLE), (m for m in masks if m.any()))]
    return float(np.median(values)) / PX if values else 0.0


def place_group(images: dict[str, np.ndarray], target_thickness: float | None = None) -> dict[str, np.ndarray]:
    """한 장(또는 참고 글자 묶음)의 그림을 틀에 놓는다. target_thickness(폰트 단위)를 주면 획 두께를 거기에 맞춘다."""
    masks = {c: _place(images[c], c, s) for c, s in scales(images).items()}
    if target_thickness:
        shift = (target_thickness - thickness(masks.values())) / 2 * PX
        masks = {c: _offset(m, shift) for c, m in masks.items()}
    return masks


_lock = threading.Lock()
_REFS: OrderedDict[str, dict[str, np.ndarray]] = OrderedDict()  # 참고 글자 묶음 → 자리 맞춘 그림(최근 4묶음)


def _refs_key(refs: dict[str, np.ndarray]) -> str:
    h = hashlib.sha1()
    for c in sorted(refs):
        h.update(c.encode())
        h.update(np.ascontiguousarray(refs[c]).tobytes())
    return h.hexdigest()


def place_refs(refs: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    key = _refs_key(refs)
    with _lock:
        if key in _REFS:
            _REFS.move_to_end(key)
            return _REFS[key]
    placed = place_group(refs)
    with _lock:
        _REFS[key] = placed
        while len(_REFS) > 4:
            _REFS.popitem(last=False)
    return placed


def place_sheet(cells: dict[str, np.ndarray], refs: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """나머지 글자 한 장. 획 두께를 참고 글자에 맞춘다(참고 글자가 없으면 그린 대로)."""
    target = thickness(place_refs(refs).values()) if refs else None
    return place_group(cells, target)


def encode(mask: np.ndarray) -> str:
    """자리 맞춘 그림 → 흑백 PNG data URL(흰 바탕 검은 글씨)."""
    return raster.png_data_url(Image.fromarray(~mask))


def decode(gray: np.ndarray) -> np.ndarray:
    if gray.shape != (SIDE, SIDE):
        gray = cv2.resize(gray, (SIDE, SIDE), interpolation=cv2.INTER_AREA)
    return gray < 128


# ---------- 굵기 축 ----------


@cache
def _px_per_weight() -> float:
    """굵기 축 1이 틀(PX)에서 획 두께 몇 픽셀인지. 기준 서체 Regular·Bold를 같은 배율로 그려 잰다."""
    sample = "가나다라마바사아자차카타파하"

    def measure(weight: str) -> float:
        font = ImageFont.truetype(str(REFERENCE_FONTS[weight]), round(1000 * PX))
        values = []
        for ch in sample:
            image = Image.new("L", (SIDE, SIDE), 0)
            ImageDraw.Draw(image).text((SIDE * 0.1, SIDE * 0.1), ch, font=font, fill=255)
            values.append(raster.solid_thickness(np.asarray(image) > 127))
        return float(np.mean(values))

    span = REFERENCE_WEIGHTS["bold"] - REFERENCE_WEIGHTS["regular"]
    return (measure("bold") - measure("regular")) / span


def weight_offset(axes: Axes) -> float:
    """그린 굵기에서 지금 굵기로 바꿀 때 윤곽을 옮길 픽셀(틀 PX 기준, +면 굵게). 그린 굵기를 모르면 0."""
    if axes.drawn_weight is None:
        return 0.0
    return (axes.weight - axes.drawn_weight) * _px_per_weight() / 2


def glyph_mask(mask: np.ndarray, axes: Axes, offset_px: float) -> np.ndarray:
    return _offset(mask, offset_px, axes.roundness < SHARP_BELOW)


# ---------- 사용자가 고친 글자(화면 4 글자 고치기) ----------


@dataclass(frozen=True)
class Edit:
    """편집 화면에서 고친 글자. mask는 고칠 때 본 굵기(weight)로 그린 EDIT_SIDE 그림이다(True = 잉크)."""

    mask: np.ndarray
    weight: float


def decode_edit(gray: np.ndarray, weight: float) -> Edit:
    if gray.shape != (EDIT_SIDE, EDIT_SIDE):
        gray = cv2.resize(gray, (EDIT_SIDE, EDIT_SIDE), interpolation=cv2.INTER_AREA)
    return Edit(gray < 128, weight)


def edit_mask(edit: Edit, axes: Axes) -> np.ndarray:
    """고친 그림을 지금 굵기에 맞춘다. 고칠 때 굵기와의 차이만큼만 윤곽을 옮긴다."""
    then = Axes(edit.weight, axes.roundness, axes.width, axes.slant, axes.tracking, axes.drawn_weight)
    shift = (weight_offset(axes) - weight_offset(then)) * EDIT_PX / PX
    return _offset(edit.mask, shift, axes.roundness < SHARP_BELOW)


def to_edit(mask: np.ndarray) -> np.ndarray:
    """틀(SIDE) 그림 → 편집 화면 크기."""
    return cv2.resize(mask.astype(np.uint8) * 255, (EDIT_SIDE, EDIT_SIDE), interpolation=cv2.INTER_AREA) > 127


def guides(advance: int, ascender: int, descender: int) -> dict[str, float]:
    """편집 그림에서 글자 틀의 자리: 기준선·위 끝·아래 끝(y), 글자 폭의 왼쪽·오른쪽(x). 너비·기울기·자간을 걸기 전이다."""
    y = lambda units: (FRAME_TOP - units) * EDIT_PX  # noqa: E731
    x = lambda units: (units - FRAME_LEFT) * EDIT_PX  # noqa: E731
    return {"baseline": y(0), "ascender": y(ascender), "descender": y(descender), "left": x(0), "right": x(advance)}


# ---------- 외곽선 ----------


def trace(mask: np.ndarray, axes: Axes, advance: int, px: float = PX) -> tuple[pathops.Path, int]:
    """틀 그림(px 배율) 한 글자를 폰트 단위 외곽선으로. (외곽선, 글자 폭)을 돌려준다."""
    style, width = style_transform(advance, axes)
    path = pathops.Path(fillType=pathops.FillType.EVEN_ODD)
    b = raster.bbox(mask)
    if b is None:
        return path, width
    h, w = mask.shape
    m = max(4, round(MARGIN * px / PX))
    x0, y0, x1, y1 = max(0, b[0] - m), max(0, b[1] - m), min(w, b[2] + m), min(h, b[3] + m)
    to_units = Transform(1 / px, 0, 0, -1 / px, FRAME_LEFT, FRAME_TOP).translate(x0, y0)
    vtrace(mask[y0:y1, x0:x1], path.getPen(), style.transform(to_units))
    path.simplify(fix_winding=True, keep_starting_points=False)
    return path, width


def outline(mask: np.ndarray | None, axes: Axes, advance: int, offset_px: float, edit: Edit | None = None) -> tuple[pathops.Path, int]:
    """그린 글자(틀 그림) 하나를 외곽선으로. 고친 글자가 있으면 그 그림을 쓴다."""
    if edit is not None:
        return trace(edit_mask(edit, axes), axes, advance, EDIT_PX)
    assert mask is not None
    return trace(glyph_mask(mask, axes, offset_px), axes, advance)
