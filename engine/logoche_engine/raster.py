"""비트맵 도구: 이미지 입출력, 획 두께 측정, 거리장으로 굵기·모서리 조정."""

from __future__ import annotations

import base64
import io

import cv2
import numpy as np
from PIL import Image


def decode_image(data_url_or_b64: str) -> Image.Image:
    data = data_url_or_b64.split(",", 1)[1] if data_url_or_b64.startswith("data:") else data_url_or_b64
    image = Image.open(io.BytesIO(base64.b64decode(data)))
    image.load()
    return image


def to_gray(image: Image.Image) -> np.ndarray:
    """투명 배경은 흰색으로 깔고 0~255 회색조 배열로 바꾼다."""
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    return np.array(Image.alpha_composite(background, rgba).convert("L"))


def png_data_url(array_or_image: np.ndarray | Image.Image) -> str:
    image = Image.fromarray(array_or_image) if isinstance(array_or_image, np.ndarray) else array_or_image
    buf = io.BytesIO()
    image.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def ink_mask(gray: np.ndarray, threshold: int | None = None) -> np.ndarray:
    """검은 글씨 = True. 기준값이 없으면 Otsu 값을 96~160 사이로 잘라 쓴다(흑백 두 값뿐이면 Otsu가 0을 낸다)."""
    if threshold is None:
        otsu, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        threshold = int(min(max(otsu, 96), 160))
    return gray < threshold


def normalize_ink(gray: np.ndarray) -> np.ndarray:
    """회색으로 그려 온 글씨를 검게 편다. 이미지 API가 진회색·연회색으로 그릴 때가 있다."""
    ink = ink_mask(gray)
    if not ink.any():
        return gray
    dark = float(np.percentile(gray[ink], 10))
    if dark < 30:
        return gray
    stretched = (gray.astype(np.float32) - dark) * 255 / max(1.0, 255 - dark)
    return np.clip(stretched, 0, 255).astype(np.uint8)


MAX_GLYPH_SIDE = 600


def clean_glyph(gray: np.ndarray, max_side: int | None = MAX_GLYPH_SIDE) -> np.ndarray:
    """글자 그림을 엔진이 쓰기 좋게 다듬는다: 회색 글씨를 검게 펴고, 획 안의 작은 밝은 점(이미지 모델이 넣는 질감)을
    메우고, 너무 큰 그림은 줄인다. 점이 남으면 굵은 획을 가는 선 여러 개로 잘못 읽는다."""
    gray = normalize_ink(gray)
    h, w = gray.shape
    if max_side and max(h, w) > max_side:
        k = max_side / max(h, w)
        gray = cv2.resize(gray, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)
    ink = ink_mask(gray)
    if not ink.any():
        return gray
    count, labels, stats, _ = cv2.connectedComponentsWithStats((~ink).astype(np.uint8), connectivity=4)
    limit = max(12, int(ink.sum() * 0.002))
    pinholes = np.zeros(count, dtype=bool)
    for i in range(1, count):
        x, y, bw, bh, area = stats[i]
        inside = x > 0 and y > 0 and x + bw < gray.shape[1] and y + bh < gray.shape[0]
        pinholes[i] = inside and area <= limit
    fill = pinholes[labels]
    return np.where(fill, 0, gray).astype(np.uint8)


def remove_specks(mask: np.ndarray, min_area: int) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = np.zeros(count, dtype=bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[labels]


def bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """(x0, y0, x1, y1), 끝은 포함하지 않는다."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def signed_distance(mask: np.ndarray) -> np.ndarray:
    """글씨 안은 양수, 밖은 음수인 거리장."""
    m = pad(mask, 1).astype(np.uint8)
    inside = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    outside = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    return (inside - outside)[1:-1, 1:-1]


def offset(mask: np.ndarray, amount: float) -> np.ndarray:
    """윤곽을 amount픽셀만큼 바깥(+)이나 안(-)으로 옮긴다. 모서리는 둥글게 이어진다."""
    if abs(amount) < 0.25:
        return mask
    return signed_distance(mask) > -amount


def offset_square(mask: np.ndarray, amount: float) -> np.ndarray:
    """정사각형 커널로 굵히거나 가늘인다. 가로·세로 획의 모서리가 각진 채로 남는다."""
    k = int(round(abs(amount)))
    if k < 1:
        return mask
    kernel = np.ones((2 * k + 1, 2 * k + 1), np.uint8)
    op = cv2.dilate if amount > 0 else cv2.erode
    return op(mask.astype(np.uint8), kernel).astype(bool)


PIECE_MIN_SHARE = 0.02  # 글씨 면적의 이 비율보다 작은 덩어리(이미지 모델이 남긴 점)는 세지 않는다
HOLE_MIN_SHARE = 0.03  # 글씨 면적의 이 비율보다 작은 틈(붓 질감)은 속공간으로 세지 않는다


def topology(mask: np.ndarray, min_piece: float = 0, min_hole: float = 0) -> tuple[int, int]:
    """(글씨 덩어리 수, 속공간 수). min_piece·min_hole(픽셀)보다 작은 것은 세지 않는다."""
    m = pad(mask, 1).astype(np.uint8)
    _, _, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    pieces = int((stats[1:, cv2.CC_STAT_AREA] >= max(1, min_piece)).sum())
    _, labels, stats, _ = cv2.connectedComponentsWithStats(1 - m, connectivity=4)
    outside = labels[0, 0]  # 한 칸 둘렀으므로 모서리는 바깥이다
    areas = stats[1:, cv2.CC_STAT_AREA]
    holes = int(((areas >= max(1, min_hole)) & (np.arange(1, len(stats)) != outside)).sum())
    return pieces, holes


def keep_shape(mask: np.ndarray, size: float, min_size: float, edit) -> np.ndarray:
    """edit(mask, size)가 글자 모양을 망가뜨리면(큰 덩어리나 속공간 수가 바뀌면: 획이 사라지거나 끊기거나 속공간이 막힘)
    size를 줄여 다시 한다. 끝까지 망가지면 그대로 둔다. 굵기 맞추기가 쓴다.
    작은 점과 붓 질감 틈은 세지 않는다(그것까지 지키면 질감 있는 글자는 아무것도 못 바꾼다)."""
    ink = float(mask.sum())
    limits = (PIECE_MIN_SHARE * ink, HOLE_MIN_SHARE * ink)
    want = topology(mask, *limits)
    while size >= min_size:
        out = edit(mask, size)
        if topology(out, *limits) == want:
            return out
        size *= 0.7
    return mask


def solid_thickness(mask: np.ndarray) -> float:
    """면적으로 잰 획 두께(픽셀). 너비 t인 획 안 거리의 평균은 t/4 + 0.5다.
    stroke_thickness(능선 중앙값)는 붓 질감의 거친 가장자리와 가는 실선이 만든 작은 능선에 끌려 굵은 획을 아주 가늘게 잰다."""
    if not mask.any():
        return 0.0
    dist = cv2.distanceTransform(pad(mask, 1).astype(np.uint8), cv2.DIST_L2, 5)
    return max(1.0, 4 * float(dist[dist > 0].mean()) - 2)


def pad(mask: np.ndarray, amount: int) -> np.ndarray:
    return np.pad(mask, amount, constant_values=False)
