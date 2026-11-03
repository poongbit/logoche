"""기준 서체 Source Han Sans KR 1.001(Apache-2.0). 기준 글자표, 그린 글자의 크기·자리 맞추기, 글자 틀, 굵기 축 재기, 유사도 비교의 기준으로만 쓴다.
기준 서체의 외곽선은 생성 서체에 들어가지 않는다."""

from __future__ import annotations

import threading
from functools import cache

import numpy as np
from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.freetypePen import FreeTypePen
from fontTools.ttLib import TTFont

from .paths import FONTS_DIR

REFERENCE_NAME = "Source Han Sans KR 1.001"
REFERENCE_FONTS = {
    "regular": FONTS_DIR / "SourceHanSansKR-Regular.otf",
    "bold": FONTS_DIR / "SourceHanSansKR-Bold.otf",
}
# 두 무게의 OS/2 usWeightClass. 굵기 축 값을 둘 사이로 보간할 때 쓴다.
REFERENCE_WEIGHTS = {"regular": 400, "bold": 700}


def reference_available() -> bool:
    return all(p.exists() for p in REFERENCE_FONTS.values())


@cache
def load_font(weight: str) -> TTFont:
    return TTFont(REFERENCE_FONTS[weight])


# 11/3: 기준 서체는 글자 그리기(charstring 해석)가 TTFont 안의 상태를 바꿔서, 여러 요청이 동시에 그리면 서로 간섭해
# "not enough values to unpack"로 500이 난다(16개 동시에 600자 → 594자 실패). 엔진을 다시 켠 직후 캐시가 빈 채로
# 글자표 여러 장을 한꺼번에 자를 때 터져 폰트 다시 만들기가 실패했다. 그리는 두 함수는 이 잠금 안에서만 부른다.
_DRAW_LOCK = threading.Lock()


def glyph_bounds(font: TTFont, glyph_name: str) -> tuple[float, float, float, float] | None:
    with _DRAW_LOCK:
        glyph_set = font.getGlyphSet()
        pen = BoundsPen(glyph_set)
        glyph_set[glyph_name].draw(pen)
        return pen.bounds


def render_glyph(font: TTFont, glyph_name: str, scale: float, box: tuple[float, float, float, float], pad: int = 0) -> np.ndarray:
    """글리프에서 box(폰트 단위) 부분을 scale(픽셀/단위)로 그린 커버리지 배열(0~1). 0행이 위쪽."""
    with _DRAW_LOCK:
        glyph_set = font.getGlyphSet()
        pen = FreeTypePen(glyph_set)
        glyph_set[glyph_name].draw(pen)
    x0, y0, x1, y1 = box
    width = int(np.ceil((x1 - x0) * scale)) + pad * 2
    height = int(np.ceil((y1 - y0) * scale)) + pad * 2
    transform = Transform(scale, 0, 0, scale, -x0 * scale + pad, -y0 * scale + pad)
    return pen.array(width=width, height=height, transform=transform)
