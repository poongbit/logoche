"""글자표: 이미지 API에 줄 기준 글자표를 만들고, 이미지 API가 그린 글자표를 칸별 음절 그림으로 나눈다.

기준 글자표는 기준 서체로 음절을 칸마다 하나씩 놓은 그림이다(철자와 칸 배치를 알려 준다). 이미지 API에 같은 격자로 그리라고 하고,
돌아온 그림을 글자 사이 빈 띠에서 자른다. 가게 이름 견본(화면 2)의 기준 그림과 한 자씩 다시 그릴 때의 기준 그림도 만든다."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from . import raster
from .reference import glyph_bounds, load_font, render_glyph


@dataclass(frozen=True)
class Grid:
    cols: int
    rows: int
    aspect_ratio: str  # 이미지 API에 넘기는 가로:세로

    @property
    def size(self) -> tuple[int, int]:
        w, h = (int(x) for x in self.aspect_ratio.split(":"))
        return 1500, round(1500 * h / w)


def custom_grid(count: int) -> Grid:
    """임의 목록의 격자. 4:3 비율에 가깝게 놓는다(19개 → 5열×4행)."""
    rows = max(1, int(np.ceil(np.sqrt(count * 3 / 4))))
    cols = int(np.ceil(count / rows))
    return Grid(cols, rows, "4:3" if cols > rows else "1:1")


GLYPH_FILL = 0.74  # 칸에서 가장 큰 글자가 차지하는 비율
CELL_MARGIN = 0.03  # 자를 때 칸 가장자리에서 버리는 비율(격자선 흔적 제거)


def _cell_rect(grid: Grid, index: int, width: int, height: int) -> tuple[int, int, int, int]:
    c, r = index % grid.cols, index // grid.cols
    cw, ch = width / grid.cols, height / grid.rows
    return round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)


@dataclass(frozen=True)
class Placement:
    """기준 그림에 글리프 하나를 놓은 자리. 그려 온 그림의 픽셀을 폰트 단위로 되돌릴 때 쓴다."""

    x: int  # 글리프 상자 왼쪽 위(기준 그림 픽셀)
    y: int
    scale: float  # 픽셀/폰트 단위
    box: tuple[float, float, float, float]  # 글리프 상자(폰트 단위, y 위쪽)


def _sheet(glyphs: list[tuple[str, tuple[float, float, float, float]]], grid: Grid) -> tuple[Image.Image, tuple[Placement, ...]]:
    """글리프를 칸마다 하나씩 가운데 놓은 기준 그림. 흰 바탕에 검은 글씨, 옅은 회색 칸 선."""
    width, height = grid.size
    font = load_font("regular")
    cw, ch = width / grid.cols, height / grid.rows
    max_w = max(b[2] - b[0] for _, b in glyphs)
    max_h = max(b[3] - b[1] for _, b in glyphs)
    scale = min(cw * GLYPH_FILL / max_w, ch * GLYPH_FILL / max_h)

    sheet = np.full((height, width), 255, np.uint8)
    placements = []
    for i, (name, b) in enumerate(glyphs):
        coverage = render_glyph(font, name, scale, b)
        x0, y0, x1, y1 = _cell_rect(grid, i, width, height)
        gh, gw = coverage.shape
        ox, oy = x0 + (x1 - x0 - gw) // 2, y0 + (y1 - y0 - gh) // 2
        region = sheet[oy : oy + gh, ox : ox + gw]
        region[:] = np.minimum(region, (255 * (1 - coverage)).astype(np.uint8))
        placements.append(Placement(ox, oy, scale, b))
    image = Image.fromarray(sheet)
    draw = ImageDraw.Draw(image)
    for c in range(1, grid.cols):
        draw.line([(round(c * cw), 0), (round(c * cw), height)], fill=222, width=2)
    for r in range(1, grid.rows):
        draw.line([(0, round(r * ch)), (width, round(r * ch))], fill=222, width=2)
    return image, tuple(placements)


def _single(name: str, b: tuple[float, float, float, float]) -> Image.Image:
    font = load_font("regular")
    size = 768
    scale = size * 0.7 / max(b[2] - b[0], b[3] - b[1])
    coverage = render_glyph(font, name, scale, b)
    canvas = np.full((size, size), 255, np.uint8)
    gh, gw = coverage.shape
    oy, ox = (size - gh) // 2, (size - gw) // 2
    canvas[oy : oy + gh, ox : ox + gw] = (255 * (1 - coverage)).astype(np.uint8)
    return Image.fromarray(canvas)


@dataclass
class Cell:
    char: str
    image: np.ndarray | None  # 흰 바탕 회색조, 글씨에 맞춰 자른 것
    problem: str | None


def _remove_lines(mask: np.ndarray) -> np.ndarray:
    """칸 선을 따라 그린 흔적(칸 폭·높이의 90% 넘게 뻗은 가는 덩어리)을 지운다."""
    h, w = mask.shape
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    keep = np.ones(count, dtype=bool)
    keep[0] = False
    for i in range(1, count):
        bw, bh, area = stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT], stats[i, cv2.CC_STAT_AREA]
        long_side = max(bw / w, bh / h)
        if long_side > 0.9 and area < 0.06 * max(bw, bh) * min(h, w):
            keep[i] = False
    return keep[labels]


def extract_glyph(gray: np.ndarray, char: str, margin: float = CELL_MARGIN) -> Cell:
    h, w = gray.shape
    m = round(margin * min(h, w))
    region = gray[m : h - m, m : w - m]
    mask = raster.ink_mask(region)
    mask = _remove_lines(mask)
    mask = raster.remove_specks(mask, max(4, round(region.size * 0.0006)))
    b = raster.bbox(mask)
    if b is None:
        return Cell(char, None, "빈 칸")
    x0, y0, x1, y1 = b
    rh, rw = mask.shape
    problem = None
    if x0 <= 1 or y0 <= 1 or x1 >= rw - 1 or y1 >= rh - 1:
        problem = "칸 경계에 닿음"
    if (x1 - x0) > 0.4 * rw and (y1 - y0) > 0.4 * rh and mask[y0:y1, x0:x1].mean() > 0.85:
        problem = "칸이 거의 다 칠해짐"
    keep = cv2.dilate(mask.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    # 자르기 전에는 크기를 바꾸지 않는다(좌표가 어긋난다). 자른 뒤에 줄인다.
    cleaned = raster.clean_glyph(np.where(keep, region, 255).astype(np.uint8), max_side=None)
    p = max(4, round(0.04 * max(x1 - x0, y1 - y0)))
    crop = np.full((y1 - y0 + 2 * p, x1 - x0 + 2 * p), 255, np.uint8)
    crop[p:-p, p:-p] = cleaned[y0:y1, x0:x1]
    return Cell(char, raster.clean_glyph(crop), problem)


def normalize_single(image: Image.Image, char: str) -> Cell:
    return extract_glyph(raster.to_gray(image), char, margin=0.01)


def contact_sheet(cells: list[Cell], grid: Grid) -> Image.Image:
    """검사용 모음 그림. 칸마다 번호(1부터)를 붙인다. 빈 칸은 X로 표시한다."""
    size, label_h = 220, 34
    sheet = Image.new("L", (grid.cols * size, grid.rows * (size + label_h)), 255)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=24)
    for i, cell in enumerate(cells):
        c, r = i % grid.cols, i // grid.cols
        x, y = c * size, r * (size + label_h)
        draw.rectangle([x, y, x + size - 1, y + size + label_h - 1], outline=200)
        draw.text((x + 8, y + size + 4), str(i + 1), fill=0, font=font)
        if cell.image is None:
            draw.line([(x + 40, y + 40), (x + size - 40, y + size - 40)], fill=160, width=3)
            draw.line([(x + size - 40, y + 40), (x + 40, y + size - 40)], fill=160, width=3)
            continue
        glyph = Image.fromarray(cell.image)
        glyph.thumbnail((size - 30, size - 30))
        sheet.paste(glyph, (x + (size - glyph.width) // 2, y + (size - glyph.height) // 2))
    return sheet


# ---------- 브랜드명 견본(10/27): 가게 이름 음절을 칸마다 하나씩 ----------

WORD_ASPECTS = ("1:1", "4:3", "3:2", "16:9", "21:9")  # 이미지 API 크기 표(웹 lib/server/openai.ts SIZES)에 있는 가로가 긴 비율
EXTRA_ROW_COST = 0.3  # 한 줄을 고르되, 칸이 너무 홀쭉해지면(글자를 좁게 그린다) 줄을 나눈다


def word_grid(count: int) -> Grid:
    """음절 count개의 격자. 칸이 정사각형에 가깝도록 줄 수와 가로:세로를 고른다(2·3자 → 한 줄, 4자 → 2×2)."""
    best: tuple[float, Grid] | None = None
    for rows in range(1, 4):
        cols = -(-count // rows)
        if cols * (rows - 1) >= count:  # 빈 줄이 생긴다
            continue
        for aspect in WORD_ASPECTS:
            w, h = (int(x) for x in aspect.split(":"))
            score = abs(np.log(w / h * rows / cols)) + EXTRA_ROW_COST * (rows - 1)
            if best is None or score < best[0]:
                best = (score, Grid(cols, rows, aspect))
    assert best is not None
    return best[1]


@cache
def word_sheet(text: str, grid: Grid) -> tuple[Image.Image, tuple[Placement, ...]]:
    """기준 견본: 가게 이름의 음절을 칸마다 하나씩 기준 서체로 놓은 그림. 이미지 API에 철자와 칸을 알려 준다."""
    font = load_font("regular")
    cmap = font.getBestCmap()
    glyphs = []
    for ch in text:
        name = cmap[ord(ch)]
        b = glyph_bounds(font, name)
        assert b is not None
        glyphs.append((name, b))
    return _sheet(glyphs, grid)


# ---------- 참고 글자표(10/29): MX-Font에 줄 참고 음절을 칸마다 하나씩 ----------


def glyph_grid(count: int) -> Grid:
    """참고 글자 count개의 격자(30자 → 6열×5행, 4:3)."""
    return custom_grid(count)


def _syllable_glyph(ch: str) -> tuple[str, tuple[float, float, float, float]]:
    font = load_font("regular")
    name = font.getBestCmap().get(ord(ch))
    if name is None:
        raise ValueError(f"기준 서체에 없는 글자예요: {ch}")
    b = glyph_bounds(font, name)
    assert b is not None
    return name, b


@cache
def glyph_sheet(chars: str) -> Image.Image:
    """기준 글자표: 참고 음절을 칸마다 하나씩 기준 서체로 놓은 그림. 이미지 API에 철자와 칸을 알려 준다."""
    return _sheet([_syllable_glyph(ch) for ch in chars], glyph_grid(len(chars)))[0]


@cache
def glyph_single(ch: str) -> Image.Image:
    """음절 하나의 기준 그림(한 자씩 다시 그릴 때 구조 참고)."""
    return _single(*_syllable_glyph(ch))


GUTTER_SEARCH = 0.35  # 고르게 나눈 경계에서 칸 폭의 이만큼 안쪽까지 자를 자리를 찾는다(이웃 경계의 찾는 범위와 겹치지 않는다)


def _gutter_cuts(ink_profile: np.ndarray, n: int) -> list[int]:
    """n칸으로 나누는 자리(양 끝 포함 n+1개). 고르게 나눈 경계 근처에서 잉크가 가장 적은 띠의 가운데를 고른다."""
    length = len(ink_profile)
    step = length / n
    cuts = [0]
    for k in range(1, n):
        lo = round((k - GUTTER_SEARCH) * step)
        segment = ink_profile[lo : round((k + GUTTER_SEARCH) * step)]
        low = np.flatnonzero(segment == segment.min())
        runs = np.split(low, np.flatnonzero(np.diff(low) > 1) + 1)
        cuts.append(lo + int(max(runs, key=len).mean()))
    return cuts + [length]


def split_glyphs(image: Image.Image, chars: str) -> list[Cell]:
    """이미지 API가 그린 글자표를 칸별 음절 그림으로 자른다. 빈 칸·칸 넘침·격자선 흔적은 extract_glyph가 거른다.
    10/30: 이미지 API는 격자를 조금 어긋나게 그린다. 고르게 나눈 경계로 자르면 글자 끝이 잘려 30자 중 9자가
    '칸 경계에 닿음'으로 떨어진 적이 있어, 글자 사이 빈 띠(줄·열의 잉크 합이 가장 적은 곳)에서 자른다."""
    grid = glyph_grid(len(chars))
    gray = raster.to_gray(image)
    ink = raster.ink_mask(gray)
    xs, ys = _gutter_cuts(ink.sum(axis=0), grid.cols), _gutter_cuts(ink.sum(axis=1), grid.rows)
    cells = []
    for i, ch in enumerate(chars):
        c, r = i % grid.cols, i // grid.cols
        cells.append(extract_glyph(gray[ys[r] : ys[r + 1], xs[c] : xs[c + 1]], ch))
    return cells
