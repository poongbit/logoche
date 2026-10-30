"""미리보기: 글 몇 자만 빌드와 같은 방법(그린 글자 → 외곽선)으로 만들어 글자별 SVG 패스로 돌려준다.
화면 4에서 굵기·너비·기울기·자간을 다듬을 때 부른다. 2,350자 전체는 화면 4 빌드에서 만든다."""

from __future__ import annotations

import numpy as np
from fontTools.misc.transform import Transform

from . import drawn
from .build import UPM
from .contour import Axes, svg_path
from .layout import get_layout

MAX_CHARS = 80


def render_preview(glyphs: dict[str, np.ndarray], axes: Axes, text: str, edits: dict[str, drawn.Edit] | None = None) -> dict:
    """글자마다 {char, path, advance}. path는 SVG 좌표(y 아래쪽, 위 끝 = ascender, viewBox 높이 = ascender - descender)다.
    아직 그리지 않은 글자(그리고 KS X 1001 밖, 한글이 아닌 글자)는 path·advance가 null이고, 화면이 기본 글꼴로 그린다. 띄어쓰기는 path가 빈 문자열이다."""
    layout = get_layout()
    edits = edits or {}
    offset_px = drawn.weight_offset(axes)
    to_svg = Transform(1, 0, 0, -1, 0, layout.ascender)
    space = round(round(layout.advance * axes.width / 100 + axes.tracking * 10) * 0.3)  # build.py의 space 폭

    made: dict[str, dict] = {}
    out = []
    for ch in list(text)[:MAX_CHARS]:
        if ch == " ":
            out.append({"char": ch, "path": "", "advance": space})
        elif ch in glyphs or ch in edits:
            if ch not in made:
                path, advance = drawn.outline(glyphs.get(ch), axes, layout.advance, offset_px, edits.get(ch))
                made[ch] = {"path": svg_path(path, to_svg)[0], "advance": advance}
            out.append({"char": ch, **made[ch]})
        else:
            out.append({"char": ch, "path": None, "advance": None})
    return {"unitsPerEm": UPM, "ascender": layout.ascender, "descender": layout.descender, "glyphs": out}
