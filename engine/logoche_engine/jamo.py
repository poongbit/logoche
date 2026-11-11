"""그린 글자 하나를 초성·중성·종성 영역으로 나눈다(11/11 부분 끌어서 바꾸기).

이미지 모델이 음절을 통째로 그려서 자모 경계 정보가 없다. 그래서 글자의 짜임(모음 종류·받침 유무)으로 어디를 자를지 정하고, 잉크 모양으로 자를 자리를 찾는다.
- 받침이 있으면 아래쪽 가로 빈틈에서 잘라 종성(3)으로 가른다.
- 세로 모음(ㅏㅓㅣㅔ…): 모음의 긴 세로 획 왼쪽 가장자리에서 가로로 가른다(왼쪽 초성 1, 오른쪽 중성 2). ㅓㅔ류는 줄기 왼쪽의 짧은 획까지 모음으로 본다.
- ㅗㅜㅡ류: 초성과 모음 사이 가로 빈틈에서 위아래로 가른다.
- 섞인 모음(ㅘㅝㅞㅟㅢ…): 줄기 왼쪽 가장자리와 가로 빈틈이 만든 왼쪽 위 칸이 초성이다.
열·행 합계가 가장 작은 곳을 고르면 ㅇ·ㅂ 속 빈자리를 틈으로 잘못 잡아서, 세로 가름은 모음 줄기 위치를 기준으로 한다.
시험(engine/scripts/jamo_split_proto.py): 세로 모음·ㅗㅜ 글자는 대체로 맞고, 섞인 모음에서 아래로 뻗은 획이 있는 초성(ㅋ·ㅎ·ㄱ)은 틀릴 때가 있다.
틀리면 사용자가 경계선을 끌어 고친다(cuts: x·y·j, 폰트 단위, +는 오른쪽·위)."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

CHO, JUNG, JONG = 1, 2, 3
PART_NAMES = {CHO: "cho", JUNG: "jung", JONG: "jong"}

_VERT = {0, 1, 2, 3, 4, 5, 6, 7, 20}
_HORIZ = {8, 12, 13, 17, 18}
_TWO_STEMS = {1, 3, 5, 7, 10, 15}
_BAR_LEFT = {4, 5, 6, 7, 14, 15}

_CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
_JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
_JONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"


def jamo_of(ch: str) -> tuple[str, str, str]:
    """음절 → (초성, 중성, 종성). 받침이 없으면 종성은 빈 문자열."""
    code = ord(ch) - 0xAC00
    return _CHO[code // 588], _JUNG[(code // 28) % 21], _JONG[code % 28].strip()


@dataclass(frozen=True)
class Line:
    """화면에 보일 경계선. 좌표는 글자 틀 그림의 픽셀(위가 0)이다. axis x면 세로선(pos는 x, lo~hi는 y), y면 가로선(pos는 y, lo~hi는 x)."""

    id: str  # x: 초성|중성(세로), y: 초성|중성(가로), j: 종성
    axis: str
    pos: float
    lo: float
    hi: float


def _valley(profile: np.ndarray, lo: float, hi: float, kernel: int) -> int:
    p = np.convolve(profile, np.ones(kernel) / kernel, "same")
    lo, hi = int(max(lo, 0)), int(min(max(hi, lo + 2), len(p)))
    return lo + int(np.argmin(p[lo:hi]))


def _longest_run(m: np.ndarray) -> np.ndarray:
    best = np.zeros(m.shape[1], int)
    cur = np.zeros(m.shape[1], int)
    for row in m:
        cur = np.where(row, cur + 1, 0)
        best = np.maximum(best, cur)
    return best


def _stem_left(top: np.ndarray, jung: int, w: int, x0: int, height: float, kernel: int, gap: int) -> int | None:
    run = _longest_run(top)
    cols = np.nonzero(run >= 0.55 * height)[0]
    if len(cols) == 0:
        return None
    groups: list[tuple[int, int]] = []
    start = prev = int(cols[0])
    for c in cols[1:]:
        if c - prev > gap:
            groups.append((start, prev))
            start = int(c)
        prev = int(c)
    groups.append((start, prev))
    left = groups[-1][0]
    if jung in _TWO_STEMS and len(groups) > 1 and left - groups[-2][1] < 0.26 * w:
        left = groups[-2][0]
    if jung in _BAR_LEFT:  # 줄기 왼쪽에 붙은 짧은 획도 모음이다
        left = _valley(top.sum(0).astype(float), max(x0, left - 0.16 * w), left + 1, kernel)
    return int(left)


def split(mask: np.ndarray, ch: str, px_scale: float = 1.0, cuts: dict[str, float] | None = None) -> tuple[np.ndarray, list[Line]]:
    """(영역 번호 그림, 경계선). 영역 번호: 0 빈 곳, 1 초성, 2 중성, 3 종성. px_scale: 폰트 단위 → 그림 픽셀(PX 또는 EDIT_PX).
    cuts: 자동으로 찾은 경계에 더하는 이동(폰트 단위). x·j는 +가 오른쪽·위(j는 위), y는 +가 위."""
    cuts = cuts or {}
    lab = np.zeros(mask.shape, np.uint8)
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return lab, []
    code = ord(ch) - 0xAC00
    jong, jung = code % 28, (code // 28) % 21
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    w, h = x1 - x0, y1 - y0
    k = max(3, round(9 * px_scale / 0.5)) | 1  # 기준 틀(0.5px/단위)에서 9px
    gap = max(2, round(6 * px_scale / 0.5))
    yy, xx = np.mgrid[: mask.shape[0], : mask.shape[1]]
    lines: list[Line] = []

    y_jong = y1
    if jong:
        y_jong = _valley(mask.sum(1).astype(float), y0 + h * 0.55, y0 + h * 0.78, k)
        y_jong = int(round(y_jong - cuts.get("j", 0) * px_scale))
    top = mask & (yy < y_jong)
    top_h = max(1, y_jong - y0)
    lab[mask] = JUNG
    if jung in _VERT or jung not in _HORIZ:
        x_cut = _stem_left(top, jung, w, x0, top_h, k, gap)
        if x_cut is None:
            lo, hi = (0.35, 0.62) if jung in _VERT else (0.45, 0.72)
            x_cut = _valley(top.sum(0).astype(float), x0 + w * lo, x0 + w * hi, k)
        x_cut = int(round(x_cut + cuts.get("x", 0) * px_scale))
        if jung in _VERT:
            lab[top & (xx < x_cut)] = CHO
            lines.append(Line("x", "x", x_cut, y0, y_jong))
        else:
            row = (top & (xx < x_cut)).sum(1).astype(float)
            y_cut = _valley(row, y0 + top_h * 0.42, y0 + top_h * 0.68, k)
            y_cut = int(round(y_cut - cuts.get("y", 0) * px_scale))
            lab[top & (xx < x_cut) & (yy < y_cut)] = CHO
            lines.append(Line("x", "x", x_cut, y0, y_cut))
            lines.append(Line("y", "y", y_cut, x0, x_cut))
    else:
        row = top.sum(1).astype(float)
        y_cut = _valley(row, y0 + top_h * 0.42, y0 + top_h * 0.68, k)
        y_cut = int(round(y_cut - cuts.get("y", 0) * px_scale))
        lab[top & (yy < y_cut)] = CHO
        lines.append(Line("y", "y", y_cut, x0, x1))
    if jong:
        lab[mask & (yy >= y_jong)] = JONG
        lines.append(Line("j", "y", y_jong, x0, x1))
    return lab, lines
