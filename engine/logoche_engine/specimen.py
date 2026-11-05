"""견본 이미지(글자표 캡처·사진)에서 글자를 잘라 유사도 비교에 쓸 수 있는 모양으로 맞춘다.

폰트 파일이 없는 상용 폰트와 비교하려는 길이다. 이 모듈은 이미지만 다루고(checks를 부르지 않는다),
뼈대·거리장 계산은 checks가 한다. 폴더 하나가 견본 하나다:

    compare/specimen/<이름>/
        meta.json   {"name": "표시 이름", "chars": "가나다...(왼쪽→오른쪽, 위→아래 순서)",
                     "grid": [행, 열] (선택: 칸이 고르게 나뉜 글자표), "ink": "auto|dark|light" (선택),
                     "source": "출처·약관 메모" (선택)}
        sheet.png   글자표 이미지 (png·jpg·jpeg·webp 하나)

글자 나누기는 두 가지다. grid가 있으면 잉크가 있는 영역을 행×열로 똑같이 자른다. 없으면 가로·세로 투영으로 줄과 글자를
찾고, 찾은 글자 수가 chars와 정확히 같을 때만 쓴다(다르면 SpecimenError, 엉뚱한 글자에 지문을 붙이지 않는다).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
GLYPH_LONG_SIDE = 80  # checks._render(…, 96)으로 그린 글자의 긴 변과 비슷하게 맞춘다
CANVAS = 192
MIN_GLYPH_PX = 24  # 이보다 작게 찍힌 글자는 뼈대가 믿을 만하지 않다
ROW_GAP_FRAC = 0.15  # 같은 줄로 묶을 틈: 줄 높이 중앙값의 비율
COLUMN_GAP_FRACS = (0.10, 0.06, 0.14, 0.20, 0.03, 0.28)  # 글자 사이 틈: 줄 높이의 비율. 글자 수가 맞는 값을 찾는다


class SpecimenError(ValueError):
    """견본을 쓸 수 없는 이유를 사람이 읽을 말로 담는다."""


@dataclass
class SpecimenMeta:
    name: str
    chars: str
    grid: tuple[int, int] | None
    ink: str
    source: str


def read_meta(folder: Path) -> SpecimenMeta:
    try:
        raw = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise SpecimenError(f"meta.json을 읽을 수 없어요: {e}") from e
    chars = "".join(str(raw.get("chars", "")).split())
    if not chars:
        raise SpecimenError("meta.json에 chars(이미지 속 글자 순서)가 없어요")
    grid = raw.get("grid")
    if grid is not None:
        if not (isinstance(grid, list) and len(grid) == 2 and all(isinstance(n, int) and n > 0 for n in grid)):
            raise SpecimenError("grid는 [행, 열] 두 양의 정수여야 해요")
        grid = (grid[0], grid[1])
        if grid[0] * grid[1] < len(chars):
            raise SpecimenError(f"grid {grid[0]}×{grid[1]}칸이 글자 {len(chars)}개보다 적어요")
    ink = str(raw.get("ink", "auto"))
    if ink not in {"auto", "dark", "light"}:
        raise SpecimenError('ink는 "auto"·"dark"·"light" 중 하나여야 해요')
    return SpecimenMeta(str(raw.get("name") or folder.name), chars, grid, ink, str(raw.get("source", "")))


def sheet_path(folder: Path) -> Path:
    images = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES and not p.stem.startswith("preview"))
    if not images:
        raise SpecimenError("글자표 이미지(png·jpg·jpeg·webp)가 폴더에 없어요")
    return images[0]


def stamp(folder: Path) -> float:
    """폴더 안 meta.json·글자표가 바뀌었는지 보는 값(캐시 키)."""
    return max((p.stat().st_mtime for p in (folder / "meta.json", sheet_path(folder))), default=0.0)


def read_gray(path: Path) -> np.ndarray:
    # 한글 경로도 읽으려고 imread 대신 fromfile+imdecode. 투명 배경은 흰색 위에 얹는다.
    image = cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise SpecimenError("이미지를 열 수 없어요")
    if image.ndim == 3 and image.shape[2] == 4:
        alpha = image[:, :, 3:4].astype(np.float32) / 255
        image = (image[:, :, :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
    if image.ndim == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image.astype(np.uint8)


def ink_mask(gray: np.ndarray, ink: str = "auto") -> np.ndarray:
    """잉크(글자)가 True인 마스크. auto는 더 많은 쪽을 바탕으로 본다."""
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, bright = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if ink == "auto":
        # 잉크는 소수 쪽이다. 가장자리 밝기로 정하면 칸선이 이미지 테두리에 걸린 글자표(실제 사이트 캡처)에서 뒤집힌다.
        ink = "dark" if (bright > 0).mean() >= 0.5 else "light"
    return _without_rules((bright == 0) if ink == "dark" else (bright > 0))


def _without_rules(mask: np.ndarray) -> np.ndarray:
    """글자표의 칸 테두리선을 지운다. 이미지 짧은 변의 절반보다 긴 가로·세로 직선은 글자 획일 수 없다(실제 사이트 글자표는 대부분 칸선이 있다)."""
    h, w = mask.shape
    k = max(60, int(0.5 * min(h, w)))
    ink = mask.astype(np.uint8) * 255
    lines = np.zeros_like(ink)
    for size in ((k, 1), (1, k)):
        lines |= cv2.morphologyEx(ink, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, size))
    if not lines.any():
        return mask
    return mask & ~(cv2.dilate(lines, np.ones((3, 3), np.uint8)) > 0)


def _runs(flags: np.ndarray, min_gap: int, min_len: int = 2) -> list[tuple[int, int]]:
    """True가 이어진 구간 [시작, 끝). min_gap보다 짧은 틈은 메워 한 구간으로 본다. min_len보다 짧은 구간은 티끌로 버린다."""
    idx = np.flatnonzero(flags)
    if idx.size == 0:
        return []
    runs: list[list[int]] = []
    start = prev = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - prev - 1 >= min_gap:
            runs.append([start, prev + 1])
            start = i
        prev = i
    runs.append([start, prev + 1])
    return [(a, b) for a, b in runs if b - a >= min_len]


def _tight(mask: np.ndarray, x0: int, y0: int, x1: int, y1: int) -> tuple[int, int, int, int] | None:
    ys, xs = np.nonzero(mask[y0:y1, x0:x1])
    if xs.size == 0:
        return None
    return x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1


def split_cells(mask: np.ndarray, count: int, grid: tuple[int, int] | None = None) -> list[tuple[int, int, int, int] | None]:
    """글자 칸 (x0, y0, x1, y1) 목록을 읽는 순서로. 잉크가 없는 칸은 None(grid에서만 나온다)."""
    h, w = mask.shape
    if not mask.any():
        raise SpecimenError("이미지에서 글자를 찾지 못했어요 (ink 방향을 dark/light로 지정해 보세요)")
    whole = _tight(mask, 0, 0, w, h)
    if grid:
        rows, cols = grid
        x0, y0, x1, y1 = whole
        cw, ch = (x1 - x0) / cols, (y1 - y0) / rows
        cells = []
        for r in range(rows):
            for c in range(cols):
                cells.append(_tight(mask, round(x0 + c * cw), round(y0 + r * ch), round(x0 + (c + 1) * cw), round(y0 + (r + 1) * ch)))
        return cells[: max(count, 0)] if count else cells
    row_flags = mask.sum(axis=1) >= max(1, int(w * 0.002))
    first = _runs(row_flags, 1)
    if not first:
        raise SpecimenError("이미지에서 글자 줄을 찾지 못했어요")
    ref = float(np.median([b - a for a, b in first]))
    rows = _runs(row_flags, max(1, round(ref * ROW_GAP_FRAC)))
    found = []
    for frac in COLUMN_GAP_FRACS:
        boxes: list[tuple[int, int, int, int] | None] = []
        for y0, y1 in rows:
            band = mask[y0:y1]
            col_flags = band.sum(axis=0) >= 1
            for x0, x1 in _runs(col_flags, max(1, round((y1 - y0) * frac))):
                boxes.append(_tight(mask, x0, y0, x1, y1))
        boxes = [b for b in boxes if b is not None]
        found.append(len(boxes))
        if len(boxes) == count and plausible(boxes):
            return boxes
    merged = _merge_fragments(mask, rows, count)
    if merged is not None and plausible(merged):
        return merged
    raise SpecimenError(
        f"찾은 글자 수가 chars와 달라요 (chars {count}자, 찾은 수 {sorted(set(found))}, 줄 {len(rows)}개). "
        "칸이 고른 글자표면 meta.json에 grid [행, 열]을 넣어 보세요"
    )


def plausible(boxes: list[tuple[int, int, int, int] | None]) -> bool:
    """칸 너비가 서로 비슷한가. 글자 수가 같아도 두 글자가 합쳐지고 한 글자가 쪼개지면 수가 우연히 맞는다(실제 캡처에서 나왔다)."""
    widths = [b[2] - b[0] for b in boxes if b]
    if not widths:
        return False
    med = float(np.median(widths))
    return all(0.45 * med <= w <= 1.6 * med for w in widths)


def _merge_fragments(mask: np.ndarray, rows: list[tuple[int, int]], count: int) -> list[tuple[int, int, int, int] | None] | None:
    """틈 기준이 하나로 안 맞을 때(가는 획 서체는 한 글자가 여러 조각으로 갈라진다) 조각을 가까운 것부터 합쳐 정해진 글자 수로 만든다.
    합친 너비가 줄 높이의 1.15배를 넘으면 합치지 않는다(글자 하나는 대체로 정사각형에 가깝다). 그래도 글자 수가 안 맞으면 None."""
    bands = [[list(r) for r in _runs(mask[y0:y1].sum(axis=0) >= 1, 1)] for y0, y1 in rows]
    total = sum(len(b) for b in bands)
    while total > count:
        best = None
        for bi, (frags, (y0, y1)) in enumerate(zip(bands, rows)):
            limit = 1.15 * (y1 - y0)
            for i in range(len(frags) - 1):
                gap = frags[i + 1][0] - frags[i][1]
                if frags[i + 1][1] - frags[i][0] <= limit and (best is None or gap < best[0]):
                    best = (gap, bi, i)
        if best is None:
            return None
        _, bi, i = best
        bands[bi][i][1] = bands[bi][i + 1][1]
        del bands[bi][i + 1]
        total -= 1
    if total != count:
        return None
    boxes = [_tight(mask, x0, y0, x1, y1) for (y0, y1), frags in zip(rows, bands) for x0, x1 in frags]
    return boxes if all(boxes) else None


def normalize_glyph(mask: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    """잘라 낸 글자를 긴 변 GLYPH_LONG_SIDE로 키우거나 줄여 CANVAS 한가운데 놓는다(글자 흰색·바탕 검정, checks.skeleton 입력 모양)."""
    x0, y0, x1, y1 = box
    crop = mask[y0:y1, x0:x1].astype(np.uint8) * 255
    k = GLYPH_LONG_SIDE / max(crop.shape)
    crop = cv2.resize(crop, (max(1, round(crop.shape[1] * k)), max(1, round(crop.shape[0] * k))), interpolation=cv2.INTER_AREA)
    out = np.zeros((CANVAS, CANVAS), np.uint8)
    oy, ox = (CANVAS - crop.shape[0]) // 2, (CANVAS - crop.shape[1]) // 2
    out[oy : oy + crop.shape[0], ox : ox + crop.shape[1]] = crop
    return out


@dataclass
class Specimen:
    meta: SpecimenMeta
    boxes: list[tuple[int, int, int, int] | None]
    glyphs: dict[str, np.ndarray]  # 글자 → normalize_glyph 결과 (같은 글자가 여럿이면 처음 것)
    mask: np.ndarray


def load(folder: Path) -> Specimen:
    meta = read_meta(folder)
    mask = ink_mask(read_gray(sheet_path(folder)), meta.ink)
    boxes = split_cells(mask, len(meta.chars), meta.grid)
    if len(boxes) < len(meta.chars):
        raise SpecimenError(f"칸이 {len(boxes)}개뿐이라 chars {len(meta.chars)}자를 못 채워요")
    sizes = [max(b[2] - b[0], b[3] - b[1]) for b in boxes if b]
    if not sizes:
        raise SpecimenError("글자 칸이 모두 비어 있어요")
    if float(np.median(sizes)) < MIN_GLYPH_PX:
        raise SpecimenError(f"글자가 너무 작아요 (긴 변 중앙값 {np.median(sizes):.0f}px, {MIN_GLYPH_PX}px 이상 필요). 더 큰 이미지를 쓰세요")
    glyphs: dict[str, np.ndarray] = {}
    for ch, box in zip(meta.chars, boxes):
        if box is None:
            raise SpecimenError(f"'{ch}' 칸이 비어 있어요 (chars 순서나 grid를 확인하세요)")
        glyphs.setdefault(ch, normalize_glyph(mask, box))
    return Specimen(meta, boxes, glyphs, mask)
