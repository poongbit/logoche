"""TTF 빌드: 이미지 모델이 그린 2,350자를 외곽선으로 따서 fontTools로 TrueType 파일로 만든다(10/30: MX-Font 생성을 뺐다).
사용자가 화면 4에서 고친 글자는 그 그림으로 외곽선을 따고, 빌드가 끝난 뒤 고치면 그 글자만 바꿔 끼운다(patch_glyph).
그리지 못한 글자는 서체에 넣지 않는다(글자 세트 검사가 빠진 글자를 알린다). 고친 글자는 그리지 못한 글자여도 들어간다.
OTF·WOFF·WOFF2는 TTF에서 받을 때 만든다(export_font). 외곽선은 TTF 한 벌만 두어, 글자를 고쳐도 형식마다 같다."""

from __future__ import annotations

import datetime as dt
import io
import os
import re
import threading
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import timestampNow
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable

from . import drawn
from .contour import Axes
from .hangul import KSX1001_HANGUL
from .layout import get_layout

VENDOR_ID = "LGCH"
UPM = 1000
# 10/29 결정(MX-Font 학습 데이터가 OFL 폰트)으로 결과를 OFL로 낸다. 10/30 MX-Font를 뺀 뒤에도 권리 결정은 그대로다(바꿀지는 사용자 결정).
# 원문은 assets/licenses/OFL-1.1.txt.
OFL_NOTICE = "This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org"
OFL_URL = "https://openfontlicense.org"


@dataclass
class FontMeta:
    font_id: str
    store_name: str
    models: list[str] = field(default_factory=list)
    license_text: str = ""
    ai_notice: str = ""


def _ascii_name(store_name: str, font_id: str) -> str:
    """영문 이름 칸에는 한글을 쓸 수 없는 환경이 있어 id로 짧은 이름을 만든다."""
    short = re.sub(r"[^A-Za-z0-9]", "", font_id)[:8] or "font"
    return f"Logoche {short}"


def _tt_glyph(path: pathops.Path):
    pen = TTGlyphPen(None)
    # pathops는 바깥 윤곽을 시계 반대 방향(PostScript)으로 낸다. TrueType은 시계 방향이라 뒤집는다.
    path.draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
    return pen.glyph()


def build_font(
    glyphs: dict[str, np.ndarray],
    axes: Axes,
    meta: FontMeta,
    out_path: Path,
    progress: Callable[[str, int], None] = lambda stage, n: None,
    edits: dict[str, drawn.Edit] | None = None,
) -> Path:
    """glyphs: 그린 글자(음절 → 자리 맞춘 틀 그림, drawn.py). progress(단계, 끝낸 개수): trace(외곽선) → save(TTF).
    edits: 사용자가 고친 글자(음절 → 그림). 그 글자는 그린 그림 대신 고친 그림으로 외곽선을 딴다."""
    layout = get_layout()
    offset_px = drawn.weight_offset(axes)
    edits = edits or {}
    chars = [c for c in KSX1001_HANGUL if c in glyphs or c in edits]

    glyph_order = [".notdef", "space"]
    cmap = {0x20: "space"}
    glyphs_out = {}
    metrics = {}
    for i, syllable in enumerate(chars):
        path, advance = drawn.outline(glyphs.get(syllable), axes, layout.advance, offset_px, edits.get(syllable))
        name = f"uni{ord(syllable):04X}"
        glyph_order.append(name)
        cmap[ord(syllable)] = name
        glyphs_out[name] = _tt_glyph(path)
        metrics[name] = advance
        if i % 25 == 0:
            progress("trace", i)
    progress("trace", len(chars))
    progress("save", 0)

    advance = round(layout.advance * axes.width / 100 + axes.tracking * 10)
    empty = TTGlyphPen(None).glyph()
    notdef_pen = TTGlyphPen(None)
    for x0, y0, x1, y1, ccw in [(80, -40, 840, 800, False), (140, 20, 780, 740, True)]:
        pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        if ccw:
            pts.reverse()
        notdef_pen.moveTo(pts[0])
        for p in pts[1:]:
            notdef_pen.lineTo(p)
        notdef_pen.closePath()
    glyphs_out[".notdef"] = notdef_pen.glyph()
    glyphs_out["space"] = empty
    metrics[".notdef"] = advance
    metrics["space"] = round(advance * 0.3)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs_out)
    glyf = fb.font["glyf"]
    fb.setupHorizontalMetrics({n: (metrics[n], getattr(glyf[n], "xMin", 0)) for n in glyph_order})

    ascender, descender = layout.ascender, layout.descender
    y_max = max((getattr(glyf[n], "yMax", 0) for n in glyph_order), default=ascender)
    y_min = min((getattr(glyf[n], "yMin", 0) for n in glyph_order), default=descender)
    fb.setupHorizontalHeader(ascent=ascender, descent=descender, lineGap=0)

    english = _ascii_name(meta.store_name, meta.font_id)
    korean = f"{meta.store_name}체" if meta.store_name else english
    today = dt.date.today().isoformat()
    models = meta.models
    description = " ".join(
        x for x in [meta.ai_notice, meta.license_text, f"생성일 {today}.", f"사용 모델: {', '.join(models)}."] if x
    )
    fb.setupNameTable(
        {
            "copyright": f"Copyright (c) {today[:4]}, {meta.store_name or 'customer'} (made with Logoche).",
            "familyName": {"en": english, "ko": korean},
            "styleName": {"en": "Regular", "ko": "보통"},
            "uniqueFontIdentifier": f"Logoche:{meta.font_id}",
            "fullName": {"en": f"{english} Regular", "ko": korean},
            "psName": english.replace(" ", "-") + "-Regular",
            "version": "Version 1.000",
            "manufacturer": "Logoche",
            "description": {"en": description, "ko": description},
            "licenseDescription": OFL_NOTICE,
            "licenseInfoURL": OFL_URL,
        },
        mac=False,
    )
    weight_class = int(min(900, max(100, round(axes.weight / 100) * 100)))
    fb.setupOS2(
        version=4,
        usWeightClass=weight_class,
        usWidthClass=5,
        fsType=0,  # 문서 포함 허용(설치 가능)
        achVendID=VENDOR_ID,
        sTypoAscender=ascender,
        sTypoDescender=descender,
        sTypoLineGap=0,
        usWinAscent=max(ascender, int(y_max)),
        usWinDescent=max(-descender, -int(y_min)),
        sxHeight=0,
        sCapHeight=0,
        fsSelection=0x40 | 0x80,  # REGULAR, USE_TYPO_METRICS
        ulCodePageRange1=1 << 19,  # Korean Wansung
    )
    fb.setupPost(keepGlyphNames=False)
    now = timestampNow()  # 넣지 않으면 1970년(0)이 들어간다
    fb.setupHead(unitsPerEm=UPM, fontRevision=1.0, created=now, modified=now)
    gasp = newTable("gasp")
    gasp.gaspRange = {0xFFFF: 0x000F}
    fb.font["gasp"] = gasp
    fb.font["OS/2"].recalcUnicodeRanges(fb.font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fb.save(out_path)
    return out_path


class GlyphRejected(ValueError):
    pass


def _replace(path: Path, font: TTFont) -> None:
    tmp = path.with_suffix(".tmp")
    font.save(tmp)
    os.replace(tmp, path)


def patch_glyph(font_path: Path, ch: str, outline: pathops.Path, advance: int) -> None:
    """만든 TTF에서 글자 하나의 외곽선을 바꿔 끼운다(화면 4 글자 고치기). 비었거나 깨진 외곽선은 넣지 않는다.
    10/30: 이미지 모델이 그리지 못해 서체에 없는 글자면 새로 넣는다."""
    from .checks import glyph_broken

    if ch not in KSX1001_HANGUL:
        raise GlyphRejected(f"한글 완성형 2,350자 밖의 글자예요: {ch}")
    font = TTFont(font_path)
    glyf = font["glyf"]
    name = font.getBestCmap().get(ord(ch))
    if name is None:
        name = f"uni{ord(ch):04X}"
        order = [*font.getGlyphOrder(), name]
        font.setGlyphOrder(order)
        glyf.setGlyphOrder(order)
        for table in font["cmap"].tables:
            if table.isUnicode():
                table.cmap[ord(ch)] = name
    glyph = _tt_glyph(outline)
    glyf[name] = glyph
    if glyph.numberOfContours <= 0:
        raise GlyphRejected("글자가 비었어요. 획을 그려 주세요.")
    glyph.recalcBounds(glyf)
    if glyph_broken(glyph, glyf):
        raise GlyphRejected("외곽선을 따지 못했어요. 획을 조금 더 굵게 그려 주세요.")
    font["hmtx"][name] = (advance, glyph.xMin)
    os2 = font["OS/2"]
    os2.usWinAscent = max(os2.usWinAscent, int(glyph.yMax))
    os2.usWinDescent = max(os2.usWinDescent, -int(glyph.yMin))
    font["head"].modified = timestampNow()
    _replace(font_path, font)


# ---------- 받는 형식(10/29): OTF·WOFF·WOFF2 ----------

FORMATS = {"ttf": "font/ttf", "otf": "font/otf", "woff": "font/woff", "woff2": "font/woff2"}


def _to_otf(font: TTFont) -> TTFont:
    """TrueType 외곽선(2차 곡선)을 CFF(3차 곡선)로 옮긴다. 2차 곡선은 3차 곡선으로 그대로 바꿀 수 있어 모양이 같다.
    곡선을 줄여 합치면(qu2cu) 파일은 작아지지만 2,350자에 16초가 걸려(10/29 잼) 그대로 옮긴다(3초)."""
    glyf, hmtx = font["glyf"], font["hmtx"]
    order = font.getGlyphOrder()
    charstrings = {}
    for name in order:
        advance = hmtx[name][0]
        pen = T2CharStringPen(advance, None)
        # TrueType은 바깥 윤곽이 시계 방향, CFF는 시계 반대 방향이다.
        glyf[name].draw(ReverseContourPen(pen), glyf)
        charstrings[name] = pen.getCharString()
    names = font["name"]
    ps_name = names.getDebugName(6) or "Logoche-Regular"
    fb = FontBuilder(font["head"].unitsPerEm, isTTF=False)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(font.getBestCmap())
    fb.setupCFF(
        ps_name,
        {"FullName": names.getDebugName(4) or ps_name, "FamilyName": names.getDebugName(1) or ps_name, "Weight": "Regular"},
        charstrings,
        {},
    )
    fb.setupHorizontalMetrics({n: hmtx[n] for n in order})
    for tag in ("head", "hhea", "OS/2", "name"):
        fb.font[tag] = font[tag]
    fb.setupPost(keepGlyphNames=False)
    fb.setupMaxp()
    return fb.font


_export_lock = threading.Lock()


def export_font(ttf_path: Path, kind: str) -> Path:
    """TTF에서 다른 형식을 만든다. TTF가 더 새로우면(글자를 고쳤으면) 다시 만든다. 처음 만들 때 OTF 약 6초, WOFF2 약 5초."""
    if kind == "ttf":
        return ttf_path
    if kind not in FORMATS:
        raise ValueError(kind)
    out = ttf_path.with_suffix(f".{kind}")
    with _export_lock:  # 받기 요청과 미리 만들기가 같은 파일을 함께 쓰지 않게
        # 만든 파일의 수정 시각을 TTF와 같게 맞춰 둔다. 만드는 사이에 글자를 고쳤으면 시각이 달라 다음에 다시 만든다.
        source = ttf_path.stat().st_mtime_ns
        if out.exists() and out.stat().st_mtime_ns == source:
            return out
        font = TTFont(ttf_path)
        if kind == "otf":
            font = _to_otf(font)
        else:
            font.flavor = kind  # woff2는 brotli가 필요하다
        _replace(out, font)
        os.utime(out, ns=(source, source))
    return out


def export_later(ttf_path: Path) -> None:
    """받을 형식을 뒤에서 미리 만들어 둔다(빌드가 끝났을 때, 글자를 고쳤을 때)."""

    def run() -> None:
        for kind in ("woff2", "woff", "otf"):
            try:
                export_font(ttf_path, kind)
            except Exception as err:  # noqa: BLE001 - 받을 때 다시 만든다
                print(f"[logoche] {kind} 미리 만들기 실패: {err}")

    threading.Thread(target=run, daemon=True).start()


def web_css(family: str, file_stem: str) -> str:
    return (
        "/* 홈페이지·쇼핑몰에 붙여 쓰는 예시입니다. 폰트 파일을 같은 폴더에 올리고 주소를 맞춰 주세요. */\n"
        "@font-face {\n"
        f'  font-family: "{family}";\n'
        f'  src: url("{file_stem}.woff2") format("woff2"), url("{file_stem}.woff") format("woff");\n'
        "  font-weight: 400;\n"
        "  font-style: normal;\n"
        "  font-display: swap;\n"
        "}\n\n"
        f'.brand {{ font-family: "{family}", sans-serif; }}\n'
    )


def bundle(ttf_path: Path, file_stem: str, family: str, extra: dict[str, bytes]) -> bytes:
    """모두 받기 묶음(zip): TTF·OTF, 웹폰트(WOFF2·WOFF·CSS), 그리고 extra(라이선스 원문·제작 기록 등)."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for kind in ("ttf", "otf"):
            z.write(export_font(ttf_path, kind), f"{file_stem}.{kind}")
        for kind in ("woff2", "woff"):
            z.write(export_font(ttf_path, kind), f"웹폰트/{file_stem}.{kind}")
        z.writestr("웹폰트/사용 예시.css", web_css(family, file_stem))
        for name, data in extra.items():
            z.writestr(name, data)
    return buf.getvalue()
