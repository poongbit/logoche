"""로고 측정: 굵기·둥글기·너비·대비·기울기와 색. 같은 그림이면 늘 같은 값이 나온다.

로고에는 글자 말고 심볼·테두리도 있어 값은 근사다. 잴 수 없으면 None을 돌려주고, 웹이 톤 범위 가운데로 채운다.
굵기와 너비는 기준 서체로 쓴 글을 같은 방법으로 재서 맞춘다(Regular 400, Bold 700)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import raster
from .reference import REFERENCE_FONTS, REFERENCE_WEIGHTS

MAX_SIDE = 800
CALIBRATION_TEXT = "달콤한집"


@dataclass
class Measured:
    value: float
    reason: str


@dataclass
class Shape:
    mask: np.ndarray
    thickness: float  # 픽셀
    text_height: float  # 픽셀
    bbox: tuple[int, int, int, int]


def _prepare(image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    rgba = image.convert("RGBA")
    scale = MAX_SIDE / max(rgba.size)
    if scale < 1:
        rgba = rgba.resize((round(rgba.width * scale), round(rgba.height * scale)), Image.Resampling.LANCZOS)
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    rgb = np.array(Image.alpha_composite(background, rgba).convert("RGB"))
    return rgb, cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def _thickness(mask: np.ndarray) -> float:
    """획 두께 ≈ 2 × 넓이 ÷ 둘레. 작은 그림에서도 픽셀 단위로 끊기지 않는다."""
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    perimeter = sum(cv2.arcLength(c, True) for c in contours)
    return float(2 * mask.sum() / perimeter) if perimeter else 0.0


def _line_band(mask: np.ndarray, thickness: float) -> tuple[int, int]:
    """글씨가 있는 행이 이어진 가장 높은 띠(위, 아래). 받침 위 틈처럼 획 두께의 2.5배까지인 틈은 잇는다."""
    rows = mask.any(axis=1)
    ys = np.nonzero(rows)[0]
    bands, start, prev = [], ys[0], ys[0]
    gap = max(3, round(2.5 * thickness))
    for y in ys[1:]:
        if y - prev > gap:
            bands.append((start, prev + 1))
            start = y
        prev = y
    bands.append((start, prev + 1))
    return max(bands, key=lambda b: b[1] - b[0])


def _shape(gray: np.ndarray) -> Shape | None:
    h, w = gray.shape
    border = np.concatenate([gray[0], gray[-1], gray[:, 0], gray[:, -1]])
    otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # 바탕이 어두우면 밝은 쪽이 글씨다.
    mask = gray < otsu if np.median(border) >= otsu else gray >= otsu
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = np.zeros(count, dtype=bool)
    min_area = max(6, round(h * w * 0.0003))
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        frame = (x == 0 or y == 0 or x + bw == w or y + bh == h) and (bw > 0.8 * w or bh > 0.8 * h)
        keep[i] = area >= min_area and not frame
    if not keep.any():
        return None
    # 꽉 찬 덩어리(심볼의 원·면)는 획이 아니라서 뺀다. 획 안쪽에서 가장자리까지는 두께의 절반 남짓이다.
    t0 = _thickness(keep[labels])
    inner = cv2.distanceTransform(np.pad(keep[labels], 1).astype(np.uint8), cv2.DIST_L2, 5)[1:-1, 1:-1]
    for i in range(1, count):
        if keep[i] and inner[labels == i].max() > 1.2 * t0:
            keep[i] = False
    mask = keep[labels]
    if not mask.any():
        return None
    top, bottom = _line_band(mask, t0)
    box = raster.bbox(mask[top:bottom])
    assert box is not None
    x0, y0, x1, y1 = box
    return Shape(mask[top:bottom], _thickness(mask[top:bottom]), float(bottom - top), (x0, y0, x1, y1))


@cache
def _calibration() -> dict[str, tuple[float, float]]:
    """기준 서체로 쓴 글의 (두께/글자 높이, 한 글자 폭/글자 높이). 로고와 같은 과정으로 잰다."""
    out = {}
    for weight, path in REFERENCE_FONTS.items():
        font = ImageFont.truetype(str(path), 110)
        image = Image.new("RGB", (900, 260), (255, 255, 255))
        ImageDraw.Draw(image).text((40, 50), CALIBRATION_TEXT, font=font, fill=(0, 0, 0))
        _, gray = _prepare(image)
        shape = _shape(gray)
        assert shape is not None
        x0, _, x1, _ = shape.bbox
        out[weight] = (shape.thickness / shape.text_height, (x1 - x0) / len(CALIBRATION_TEXT) / shape.text_height)
    return out


def _weight(shape: Shape) -> Measured:
    cal = _calibration()
    r = shape.thickness / shape.text_height
    (r_reg, _), (r_bold, _) = cal["regular"], cal["bold"]
    w_reg, w_bold = REFERENCE_WEIGHTS["regular"], REFERENCE_WEIGHTS["bold"]
    weight = w_reg + (r - r_reg) * (w_bold - w_reg) / (r_bold - r_reg)
    weight = round(min(900, max(100, weight)) / 10) * 10
    return Measured(weight, f"선 두께가 글자 높이의 {r * 100:.0f}%")


def _line_fit(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    vx, vy, x0, y0 = cv2.fitLine(points.astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01).flatten()
    return np.array([x0, y0]), np.array([vx, vy])


def _intersect(p1, d1, p2, d2) -> np.ndarray | None:
    m = np.array([d1, -d2]).T
    if abs(np.linalg.det(m)) < 1e-6:
        return None
    t = np.linalg.solve(m, p2 - p1)
    return p1 + d1 * t[0]


def _roundness(shape: Shape) -> Measured | None:
    """볼록한 모서리마다 두 변을 직선으로 맞춰 만나는 점을 구하고, 그 점에서 실제 윤곽까지 거리로 반지름을 잰다."""
    t = shape.thickness
    if t < 3:
        return None
    contours, _ = cv2.findContours(shape.mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    ratios = []
    for contour in contours:
        pts = contour[:, 0, :].astype(np.float64)
        n = len(pts)
        if n < 20:
            continue
        approx = cv2.approxPolyDP(contour, max(1.5, 0.25 * t), True)[:, 0, :]
        if len(approx) < 3:
            continue
        idx = [int(np.argmin(np.sum((pts - a) ** 2, axis=1))) for a in approx]
        area = cv2.contourArea(contour, oriented=True)
        for k in range(len(idx)):
            i_prev, i, i_next = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            seg_a = pts[i_prev : i + 1] if i_prev < i else np.vstack([pts[i_prev:], pts[: i + 1]])
            seg_b = pts[i : i_next + 1] if i < i_next else np.vstack([pts[i:], pts[: i_next + 1]])
            if len(seg_a) < 6 or len(seg_b) < 6:
                continue
            len_a, len_b = np.linalg.norm(seg_a[-1] - seg_a[0]), np.linalg.norm(seg_b[-1] - seg_b[0])
            if len_a < 0.8 * t or len_b < 0.8 * t:
                continue
            mid_a = seg_a[len(seg_a) // 5 : len(seg_a) * 3 // 5]
            mid_b = seg_b[len(seg_b) * 2 // 5 : len(seg_b) * 4 // 5]
            if len(mid_a) < 3 or len(mid_b) < 3:
                continue
            pa, da = _line_fit(mid_a)
            pb, db = _line_fit(mid_b)
            # 진행 방향을 맞춘다.
            if np.dot(da, seg_a[-1] - seg_a[0]) < 0:
                da = -da
            if np.dot(db, seg_b[-1] - seg_b[0]) < 0:
                db = -db
            turn = da[0] * db[1] - da[1] * db[0]
            if turn * area <= 0:  # 오목한 모서리
                continue
            angle = math.degrees(math.acos(float(np.clip(np.dot(da, db), -1, 1))))  # 꺾인 각
            if not 50 <= angle <= 130:
                continue
            corner = _intersect(pa, da, pb, db)
            if corner is None:
                continue
            delta = float(np.min(np.linalg.norm(pts - corner, axis=1)))
            if delta > 2 * t:
                continue
            interior = math.radians(180 - angle)
            radius = delta / (1 / math.sin(interior / 2) - 1)
            ratios.append(radius / t)
    if len(ratios) < 4:
        return None
    ratio = float(np.median(ratios))
    value = round(min(1.0, max(0.0, ratio * 2)), 2)
    return Measured(value, f"모서리 반지름이 선 두께의 {ratio * 100:.0f}% (모서리 {len(ratios)}곳)")


def _width(shape: Shape, store_name: str) -> Measured | None:
    """글자만 한 줄로 있는 로고일 때만 잰다. 심볼이 있으면 글자 폭을 나눌 수 없다."""
    n = sum(1 for ch in store_name if "가" <= ch <= "힣")
    x0, y0, x1, y1 = shape.bbox
    if n < 2:
        return None
    aspect = (x1 - x0) / n / shape.text_height
    ref = _calibration()["regular"][1]
    value = round(min(120, max(80, aspect / ref * 100)))
    return Measured(value, f"글자 하나의 가로세로비 {aspect:.2f} (가게 이름 {n}자 기준)")


def _runs(mask: np.ndarray) -> np.ndarray:
    """각 행에서 이어진 글씨 픽셀의 길이."""
    padded = np.pad(mask.astype(np.int8), ((0, 0), (1, 1)))
    diff = np.diff(padded, axis=1)
    starts = np.argwhere(diff == 1)
    ends = np.argwhere(diff == -1)
    return (ends[:, 1] - starts[:, 1]).astype(float)


def _contrast(shape: Shape) -> Measured | None:
    t = shape.thickness
    if t < 3:
        return None
    horizontal_runs = _runs(shape.mask)  # 가로로 잰 길이 = 세로획 두께
    vertical_runs = _runs(shape.mask.T)  # 세로로 잰 길이 = 가로획 두께
    vertical_stroke = horizontal_runs[(horizontal_runs >= 0.4 * t) & (horizontal_runs <= 2.0 * t)]
    horizontal_stroke = vertical_runs[(vertical_runs >= 0.4 * t) & (vertical_runs <= 2.0 * t)]
    if len(vertical_stroke) < 20 or len(horizontal_stroke) < 20:
        return None
    v, h = float(np.median(vertical_stroke)), float(np.median(horizontal_stroke))
    ratio = h / v
    value = round(min(1.0, max(0.5, ratio)), 2)
    reason = "선 굵기가 거의 일정" if ratio >= 0.95 else f"가로획이 세로획의 {ratio * 100:.0f}%"
    return Measured(value, reason)


def _slant(shape: Shape) -> Measured:
    """기울여 세로 투영이 가장 날카로워지는 각을 찾는다. 오른쪽으로 기울면 +."""
    mask = shape.mask.astype(np.uint8) * 255
    h, w = mask.shape
    cy = h / 2
    best, best_score = 0.0, -1.0
    for deg in np.arange(-15, 15.5, 0.5):
        k = math.tan(math.radians(deg))
        sheared = cv2.warpAffine(mask, np.float32([[1, k, -k * cy], [0, 1, 0]]), (w + int(abs(k) * h) + 2, h))
        projection = sheared.sum(axis=0).astype(np.float64)
        score = float((projection**2).sum())
        if score > best_score + 1e-9 or (abs(score - best_score) < 1e-9 and abs(deg) < abs(best)):
            best, best_score = float(deg), score
    if abs(best) < 1.5:
        return Measured(0, "기울지 않음")
    return Measured(best, f"글자가 {abs(best):.1f}° {'오른쪽' if best > 0 else '왼쪽'}으로 기울어 있음")


def _hex(rgb: np.ndarray) -> str:
    r, g, b = (int(round(x)) for x in rgb)
    return f"#{r:02X}{g:02X}{b:02X}"


def _luminance(rgb: np.ndarray) -> float:
    return float(np.dot(rgb / 255, [0.299, 0.587, 0.114]))


def _colors(rgb: np.ndarray) -> list[str]:
    """[대표색, 어두운 색, 밝은 색]. 미리보기와 시안에만 쓴다."""
    pixels = rgb.reshape(-1, 3).astype(np.float32)
    rng = np.random.default_rng(0)
    sample = pixels[rng.choice(len(pixels), size=min(20000, len(pixels)), replace=False)]
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    k = 5
    _, labels, centers = cv2.kmeans(sample, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.flatten(), minlength=k) / len(labels)
    order = np.argsort(-counts)
    background = centers[order[0]]
    candidates = [c for i, c in zip(range(k), centers) if counts[i] > 0.01 and np.linalg.norm(c - background) > 40]
    if not candidates:
        candidates = [background]

    def saturation(c: np.ndarray) -> float:
        return float(c.max() - c.min()) / 255

    brand = max(candidates, key=lambda c: saturation(c) * (1 - abs(_luminance(c) - 0.55)))
    dark = min(candidates + [background], key=_luminance)
    if _luminance(dark) > 0.35:
        dark = brand * 0.3
    light = background if _luminance(background) > 0.8 else brand * 0.12 + 255 * 0.88
    return [_hex(brand), _hex(dark), _hex(light)]


def measure_logo(image: Image.Image, store_name: str) -> dict:
    rgb, gray = _prepare(image)
    shape = _shape(gray)
    measured: dict[str, Measured | None] = {"weight": None, "roundness": None, "width": None, "contrast": None, "slant": None}
    if shape is not None and shape.thickness >= 1.5:
        measured = {
            "weight": _weight(shape),
            "roundness": _roundness(shape),
            "width": _width(shape, store_name),
            "contrast": _contrast(shape),
            "slant": _slant(shape),
        }
    return {
        "measured": {k: (None if v is None else {"value": v.value, "reason": v.reason}) for k, v in measured.items()},
        "colors": _colors(rgb),
        "debug": None
        if shape is None
        else {"thicknessPx": round(shape.thickness, 1), "textHeightPx": round(shape.text_height, 1), "bbox": shape.bbox},
    }
