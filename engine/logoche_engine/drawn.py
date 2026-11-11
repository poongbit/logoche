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

빌드 전 다듬기(refine, 11/2 품질 개선. 시험: 거의 다 그린 '굵고 둥근 고딕' 2,298자)
- 획 두께: 기준 서체 같은 글자와 견준 획 두께 비율이 폰트 가운데 값에서 THICK_BAND 넘게 벗어난 글자만 그 끝까지 맞춘다.
  획이 많은 글자(휵·좔·훑·핥)를 이미지 모델이 가늘게 그려 문장에서 옅게 보였다. 기준 서체와 견주는 것은, 복잡한 글자는 원래 가늘게 재지기 때문이다.
- 굵은 스타일(기준 서체 Regular보다 획이 BOLD_RATIO배 넘게 굵음)은 속공간 둘레만 COUNTER_OPEN만큼 깎는다. 바깥 모양은 그대로, ㅁ·ㅂ·ㅇ 안쪽이 넓어져
  작은 크기에서 덜 뭉친다(12px 뭉침 2자 → 1자).
- 크기는 맞추지 않는다. 자리 맞추기만으로 99%가 기준 서체 잉크 상자의 ±6% 안이었다.
"""

from __future__ import annotations

import hashlib
import threading
from collections import OrderedDict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from functools import cache

import cv2
import numpy as np
import pathops
from fontTools.misc.transform import Transform
from PIL import Image, ImageDraw, ImageFont

from . import raster
from . import jamo
from .contour import ALL_GLYPHS, SHARP_BELOW, Axes, PartTweak, Tweak, style_transform, tweak_transform, vtrace
from .hangul import KSX1001_HANGUL
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
THICK_BAND = 0.10  # 빌드 전 다듬기: 획 두께가 폰트 가운데 값에서 이만큼 넘게 벗어나면 이 끝까지 맞춘다
BOLD_RATIO = 1.6  # 획 두께가 기준 서체 Regular의 이 배를 넘으면 굵은 스타일로 보고 속공간을 넓힌다(시험한 스타일 1.47~2.22)
COUNTER_OPEN = 0.12  # 굵은 스타일에서 속공간 둘레를 획 두께의 이만큼 깎는다
REFINE_MIN = 10  # 한글이 이보다 적으면(참고 글자만 있을 때 등) 가운데 값을 믿기 어려워 다듬지 않는다


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


@cache
def ref_advance(ch: str) -> int:
    """기준 서체 같은 글자의 글자 폭(폰트 단위). 숫자·문장부호는 이 폭을 쓴다(자리도 기준 서체 잉크 상자에 맞췄다)."""
    font, cmap = _reference()
    return font["hmtx"][cmap[ord(ch)]][0]


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


# ---------- 스타일 검사(11/2 품질 개선 2-1) ----------
# 읽히기는 하지만 혼자 튀는 글자를 찾아, 웹이 떨어진 글자처럼 다시 그린다(다시 그리는 비용은 사용자에게 받지 않는다).
# 빌드 전 다듬기(refine)가 ±THICK_BAND까지는 맞추므로, 그보다 크게 벗어나 맞추면 모양이 상하는 글자만 고른다.
STYLE_THICK = 1.2  # 획 두께가 기준의 이 배 넘게 굵거나 1/이 배 넘게 가늘면 다시 그린다(2,298자 시험에서 ±15% 밖이 1.3%)
STYLE_SIZE = 1.12  # 크기가 기준 서체 잉크 상자의 이 배 넘게 크거나 작으면 다시 그린다(시험에서 99%가 ±6% 안)


def _thickness_ratio(mask: np.ndarray, ch: str) -> float:
    return raster.solid_thickness(mask) / _ref_thickness(ch)


def _size_ratio(mask: np.ndarray, ch: str) -> float | None:
    b = raster.bbox(mask)
    if b is None:
        return None
    bx0, by0, bx1, by1 = _box(ch)
    return float(np.sqrt((b[2] - b[0]) * (b[3] - b[1]) / ((bx1 - bx0) * (by1 - by0) * PX * PX)))


def style_scores(placed: dict[str, np.ndarray], refs: dict[str, np.ndarray]) -> dict[str, tuple[float, float]]:
    """한글 글자마다 (획 두께, 크기). 1이 기준이다. 획 두께는 기준 서체 같은 글자와 견준 비율을 참고 글자들의 가운데 값으로 나눈다
    (복잡한 글자는 원래 가늘게 재진다). 참고 글자가 없으면 이 장의 가운데 값을 기준으로 쓴다."""
    hangul = {c: m for c, m in placed.items() if c in KSX1001_HANGUL and m.any()}
    if not hangul:
        return {}
    base = [_thickness_ratio(m, c) for c, m in place_refs(refs).items() if c in KSX1001_HANGUL and m.any()] if refs else []
    mid = float(np.median(base or [_thickness_ratio(m, c) for c, m in hangul.items()]))
    return {c: (_thickness_ratio(m, c) / mid, _size_ratio(m, c) or 1.0) for c, m in hangul.items()}


def style_problem(score: tuple[float, float]) -> str | None:
    t, s = score
    if t > STYLE_THICK:
        return f"획이 다른 글자보다 {round((t - 1) * 100)}% 굵어요"
    if t < 1 / STYLE_THICK:
        return f"획이 다른 글자보다 {round((1 - t) * 100)}% 가늘어요"
    if max(s, 1 / s) > STYLE_SIZE:
        return f"글자가 다른 글자보다 {'커요' if s > 1 else '작아요'}"
    return None


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


# ---------- 빌드 전 다듬기 ----------


@cache
def _ref_thickness(ch: str) -> float:
    """기준 서체 Regular 같은 글자의 획 두께(틀 px). 글자마다 한 번만 잰다."""
    font = ImageFont.truetype(str(REFERENCE_FONTS["regular"]), round(1000 * PX))
    image = Image.new("L", (SIDE, SIDE), 0)
    ImageDraw.Draw(image).text((SIDE * 0.1, SIDE * 0.05), ch, font=font, fill=255)
    return raster.solid_thickness(np.asarray(image) > 127)


def _open_counters(mask: np.ndarray, amount_px: float) -> np.ndarray:
    """속공간(구멍) 둘레의 잉크만 amount_px만큼 깎는다. 획이 끊기거나 속공간 수가 바뀌면 그대로 둔다."""
    if amount_px < 0.5:
        return mask
    m = raster.pad(mask, 1).astype(np.uint8)
    _, labels = cv2.connectedComponents(1 - m, connectivity=4)
    holes = (labels > 0) & (labels != labels[0, 0])  # 한 칸 둘렀으므로 모서리는 바깥이다
    if not holes.any():
        return mask
    near = cv2.distanceTransform((~holes).astype(np.uint8), cv2.DIST_L2, 5) <= amount_px
    out = (m.astype(bool) & ~near)[1:-1, 1:-1]
    ink = float(mask.sum())
    limits = (raster.PIECE_MIN_SHARE * ink, raster.HOLE_MIN_SHARE * ink)
    return out if raster.topology(out, *limits) == raster.topology(mask, *limits) else mask


def refine(glyphs: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """빌드 전에 한글 글자마다 획 두께를 고르게 하고, 굵은 스타일은 속공간을 넓힌다(모듈 설명 참고). 숫자·문장부호는 그대로 둔다."""
    hangul = {c: m for c, m in glyphs.items() if c in KSX1001_HANGUL and m.any()}
    if len(hangul) < REFINE_MIN:
        return glyphs
    own = {c: raster.solid_thickness(m) for c, m in hangul.items()}
    ratio = {c: own[c] / _ref_thickness(c) for c in hangul}
    mid = float(np.median(list(ratio.values())))
    bold = mid >= BOLD_RATIO
    out = dict(glyphs)
    for c, m in hangul.items():
        r = ratio[c] / mid
        if abs(r - 1) > THICK_BAND:
            want = 1 + THICK_BAND if r > 1 else 1 - THICK_BAND
            m = _offset(m, (want / r - 1) * own[c] / 2)
        if bold:
            m = _open_counters(m, COUNTER_OPEN * own[c])
        out[c] = m
    return out


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


def tweaked_axes(axes: Axes, tweak: Tweak | None) -> Axes:
    """글자별 굵기 조정을 축에 반영한다. 그린 굵기를 모르면(drawn_weight 없음) 지금 굵기를 기준으로 삼아 조정이 헛돌지 않게 한다."""
    if tweak is None or not tweak.pull:
        return axes
    return replace(axes, weight=axes.weight + tweak.pull, drawn_weight=axes.weight if axes.drawn_weight is None else axes.drawn_weight)


def _part_transform(p: PartTweak, cx: float, cy: float) -> Transform:
    """부분 조정 변환(폰트 단위, 축은 부분 잉크 상자 가운데 (cx, cy))."""
    sx, sy = p.width / 100 * p.scale / 100, p.height / 100 * p.scale / 100
    return Transform(1, 0, 0, 1, p.tx, p.ty).transform(Transform(sx, 0, 0, sy, cx * (1 - sx), cy * (1 - sy)))


def _trace_parts(mask: np.ndarray, ch: str, style: Transform, px: float, tweak: Tweak) -> pathops.Path:
    """초성·중성·종성 영역을 따로 따서 부분 조정을 건 뒤 합친다(11/11). 영역은 jamo.split으로 나눈다."""
    lab, _ = jamo.split(mask, ch, px, tweak.cuts)
    out = pathops.Path(fillType=pathops.FillType.WINDING)
    for number, name in jamo.PART_NAMES.items():
        part = lab == number
        b = raster.bbox(part)
        if b is None:
            continue
        m = max(4, round(MARGIN * px / PX))
        h, w = mask.shape
        x0, y0, x1, y1 = max(0, b[0] - m), max(0, b[1] - m), min(w, b[2] + m), min(h, b[3] + m)
        to_units = Transform(1 / px, 0, 0, -1 / px, FRAME_LEFT, FRAME_TOP).translate(x0, y0)
        pt = (tweak.parts or {}).get(name)
        move = Transform()
        if pt is not None and not pt.identity:
            cx = FRAME_LEFT + (b[0] + b[2]) / 2 / px  # 부분 잉크 상자 가운데(폰트 단위). b는 (x0, y0, x1, y1) 픽셀
            cy = FRAME_TOP - (b[1] + b[3]) / 2 / px
            move = _part_transform(pt, cx, cy)
        piece = pathops.Path(fillType=pathops.FillType.EVEN_ODD)
        vtrace(part[y0:y1, x0:x1], piece.getPen(), style.transform(move).transform(to_units))
        piece.simplify(fix_winding=True, keep_starting_points=False)
        out = pathops.op(out, piece, pathops.PathOp.UNION, fix_winding=True)
    return out


def trace(mask: np.ndarray, axes: Axes, advance: int, px: float = PX, tweak: Tweak | None = None, ch: str | None = None) -> tuple[pathops.Path, int]:
    """틀 그림(px 배율) 한 글자를 폰트 단위 외곽선으로. (외곽선, 글자 폭)을 돌려준다. tweak: 이 글자만의 조정(Tweak). ch: 부분 조정(초·중·종성)에 필요."""
    style, width = style_transform(advance, axes)
    if tweak is not None and tweak.geometric:
        style = style.transform(tweak_transform(advance, tweak))  # 그림 → 폰트 단위 → 글자별 조정 → 전체 너비·기울기·자간
    path = pathops.Path(fillType=pathops.FillType.EVEN_ODD)
    b = raster.bbox(mask)
    if b is None:
        return path, width
    if tweak is not None and tweak.has_parts and ch is not None and ch in KSX1001_HANGUL:
        return _trace_parts(mask, ch, style, px, tweak), width
    h, w = mask.shape
    m = max(4, round(MARGIN * px / PX))
    x0, y0, x1, y1 = max(0, b[0] - m), max(0, b[1] - m), min(w, b[2] + m), min(h, b[3] + m)
    to_units = Transform(1 / px, 0, 0, -1 / px, FRAME_LEFT, FRAME_TOP).translate(x0, y0)
    vtrace(mask[y0:y1, x0:x1], path.getPen(), style.transform(to_units))
    path.simplify(fix_winding=True, keep_starting_points=False)
    return path, width


def resolve_all(glyphs: dict[str, np.ndarray], axes: Axes, offset_px: float, tweaks: dict[str, Tweak]) -> tuple[Tweak | None, tuple[float, float] | None]:
    """전체 조정("*")을 풀어 (모든 글자에 걸 조정, 굵기 기준)을 돌려준다. 전체 조정이 rel(기준 글자)을 가지면 그 글자에 굵기 조정(pull)을 걸었을 때
    윤곽이 실제로 얼마나(px) 옮겨지는지와 그 글자의 획 두께를 재어 (옮긴 거리, 기준 두께)로 삼고, 조정에서 pull은 뺀다. 다른 글자는 outline이
    "옮긴 거리 × 자기 두께 ÷ 기준 두께"만큼 옮긴다. 곧 기준 글자에서 보인 두께 변화의 비율을 글자마다 자기 두께에 맞춰 건다.
    기준 글자가 없으면 pull을 그대로 둔다(모든 글자에 같은 양)."""
    t = tweaks.get(ALL_GLYPHS)
    if t is None or not t.rel:
        return t, None
    plain = replace(t, rel=None)
    src = glyphs.get(t.rel)
    if not t.pull or src is None or not src.any():
        return plain, None
    thickness = raster.solid_thickness(glyph_mask(src, axes, offset_px))
    moved = tweaked_axes(axes, Tweak(pull=t.pull))
    delta = weight_offset(moved) - offset_px
    if thickness <= 0 or abs(delta) < 0.05:
        return plain, None
    return replace(plain, pull=0), (delta, thickness)


def outline(
    mask: np.ndarray | None,
    axes: Axes,
    advance: int,
    offset_px: float,
    edit: Edit | None = None,
    tweak: Tweak | None = None,
    thick: tuple[float, float] | None = None,
    ch: str | None = None,
) -> tuple[pathops.Path, int]:
    """그린 글자(틀 그림) 하나를 외곽선으로. 고친 글자가 있으면 그 그림을 쓴다. tweak: 이 글자만의 조정. thick: 전체 굵기 조정의 (기준 글자에서 옮긴 거리, 기준 두께)(resolve_all)."""
    if tweak is not None and tweak.pull:
        axes = tweaked_axes(axes, tweak)
        offset_px = weight_offset(axes)
    if edit is not None:
        return trace(edit_mask(edit, axes), axes, advance, EDIT_PX, tweak, ch)
    assert mask is not None
    if thick:
        # 이 글자의 지금 획 두께 ≈ 그린 두께 + 양쪽 offset. 기준 글자와 두께 비율만큼 옮긴다.
        offset_px += thick[0] * (raster.solid_thickness(mask) + 2 * offset_px) / thick[1]
    return trace(glyph_mask(mask, axes, offset_px), axes, advance, PX, tweak, ch)
