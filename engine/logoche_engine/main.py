"""로고체 엔진 HTTP 서버. 웹(Next.js)의 API 라우트가 부른다.
10/30: 이미지 API가 그린 음절 그림(참고 글자 + 나머지 글자)으로 바로 외곽선을 따서 2,350자 TTF를 만든다(MX-Font를 뺐다, drawn.py).
AI 호출(GPT Image·Claude)은 웹 서버가 하고, 엔진은 그림을 재고 자르고 외곽선을 따서 TTF를 만든다.

uv run uvicorn logoche_engine.main:app --port 8000
"""

from __future__ import annotations

import threading
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fontTools.ttLib import TTFont
from pydantic import BaseModel, Field

from . import drawn, raster
from .build import FORMATS, FontMeta, GlyphRejected, bundle, export_font, export_later, patch_glyph
from .checks import warm_comparison
from .contour import Axes
from .hangul import KSX1001_HANGUL
from .jobs import BuildManager, new_build_id, ocr_sheet
from .layout import get_layout
from .measure import measure_logo
from .paths import ASSETS_DIR
from .preview import render_preview
from .reference import REFERENCE_NAME, reference_available
from .sheets import contact_sheet, glyph_grid, glyph_sheet, glyph_single, normalize_single, split_glyphs, word_grid, word_sheet


@asynccontextmanager
async def lifespan(_: FastAPI):
    # 유사도 비교 폰트의 뼈대를 미리 만들어 둔다(69개 약 2.4초). 첫 빌드의 검사 단계가 그만큼 늦어지지 않게 뒤에서 돌린다.
    threading.Thread(target=warm_comparison, daemon=True).start()
    yield


app = FastAPI(title="Logoche engine", version="0.1.0", lifespan=lifespan)
builds = BuildManager()


@app.get("/health")
def health() -> dict:
    return {"ok": reference_available(), "reference": REFERENCE_NAME}


# ---------- 화면 2: 로고 측정 ----------


class MeasureRequest(BaseModel):
    image: str  # data URL. SVG는 웹에서 PNG로 바꿔 보낸다.
    storeName: str = ""


@app.post("/measure")
def measure(req: MeasureRequest) -> dict:
    try:
        image = raster.decode_image(req.image)
    except Exception as err:
        raise HTTPException(400, f"로고 그림을 읽지 못했어요: {err}") from err
    return measure_logo(image, req.storeName)


# ---------- 화면 3: 기준 글자표 · 글자표 나누기(10/29) ----------


def _chars(chars: str) -> str:
    chars = "".join(dict.fromkeys(chars.replace(" ", "")))
    bad = [c for c in chars if c not in KSX1001_HANGUL]
    if bad:
        raise HTTPException(400, f"참고 글자는 한글 완성형 2,350자 안에서 골라요: {''.join(bad)}")
    if not chars:
        raise HTTPException(400, "참고 글자가 비었어요")
    return chars


class GlyphSheetRequest(BaseModel):
    chars: str


@app.post("/sheets/glyphs")
def glyph_sheet_route(req: GlyphSheetRequest) -> dict:
    """참고 음절을 칸마다 하나씩 기준 서체로 놓은 기준 글자표. 이미지 API에 구조와 칸을 알려 준다."""
    chars = _chars(req.chars)
    grid = glyph_grid(len(chars))
    return {
        "cols": grid.cols,
        "rows": grid.rows,
        "aspectRatio": grid.aspect_ratio,
        "chars": chars,
        "image": raster.png_data_url(glyph_sheet(chars)),
    }


@app.post("/sheets/word")
def word_sheet_route(req: GlyphSheetRequest) -> dict:
    """가게 이름 견본(화면 2)의 기준 그림: 음절을 칸마다 하나씩, 2·3자는 한 줄로(4자는 2×2)."""
    chars = _chars(req.chars)
    grid = word_grid(len(chars))
    image, _ = word_sheet(chars, grid)
    return {"cols": grid.cols, "rows": grid.rows, "aspectRatio": grid.aspect_ratio, "chars": chars, "image": raster.png_data_url(image)}


class GlyphSplitRequest(GlyphSheetRequest):
    image: str


@app.post("/sheets/glyphs/split")
def glyph_split(req: GlyphSplitRequest) -> dict:
    """이미지 API가 그린 글자표를 칸별 음절 그림으로 자르고, 검사용 번호 붙은 모음 그림을 만든다."""
    chars = _chars(req.chars)
    cells = split_glyphs(raster.decode_image(req.image), chars)
    return {
        "cells": [
            {"char": c.char, "image": None if c.image is None else raster.png_data_url(c.image), "problem": c.problem}
            for c in cells
        ],
        "contactSheet": raster.png_data_url(contact_sheet(cells, glyph_grid(len(chars)))),
    }


class RefInput(BaseModel):
    char: str
    image: str  # 이미지 API가 그린 음절(data URL). 참고 글자는 칸에서 자른 그림, 나머지 글자는 자리 맞춘 틀 그림


class GlyphPlaceRequest(GlyphSplitRequest):
    refs: list[RefInput] = Field(default_factory=list)  # 참고 글자. 획 두께를 여기에 맞춘다


@app.post("/sheets/glyphs/place")
def glyph_place(req: GlyphPlaceRequest) -> dict:
    """화면 4 나머지 글자 한 장을 칸별로 자르고, 바로 폰트 틀에 자리를 맞춘다(drawn.place_sheet). 검사용 모음 그림도 만든다.
    image는 자리 맞춘 틀 그림(흑백 PNG)이고, 칸 문제로 자르지 못한 글자는 null이다."""
    chars = _chars(req.chars)
    cells = split_glyphs(raster.decode_image(req.image), chars)
    placed = drawn.place_sheet({c.char: c.image for c in cells if c.image is not None and not c.problem}, _refs(req.refs, required=False))
    return {
        "cells": [
            {"char": c.char, "image": drawn.encode(placed[c.char]) if c.char in placed else None, "problem": c.problem or (None if c.char in placed else "빈 칸")}
            for c in cells
        ],
        "contactSheet": raster.png_data_url(contact_sheet(cells, glyph_grid(len(chars)))),
    }


@app.get("/sheets/glyph")
def glyph_single_route(char: str) -> dict:
    """음절 하나의 기준 그림(한 자씩 다시 그릴 때)."""
    ch = _chars(char)
    if len(ch) != 1:
        raise HTTPException(400, "글자 하나만 보내 주세요")
    return {"char": ch, "image": raster.png_data_url(glyph_single(ch))}


class NormalizeRequest(BaseModel):
    image: str
    char: str


@app.post("/glyphs/normalize")
def normalize(req: NormalizeRequest) -> dict:
    """한 자씩 다시 그린 그림을 글자표 칸과 같은 형식으로 자른다."""
    cell = normalize_single(raster.decode_image(req.image), req.char)
    return {"image": None if cell.image is None else raster.png_data_url(cell.image), "problem": cell.problem}


# ---------- 화면 4: 빌드(10/30: 그린 글자로 바로) ----------


class BuildAxes(BaseModel):
    weight: float = 400
    roundness: float = 0.5
    width: float = 100
    slant: float = 0
    tracking: float = 0
    drawnWeight: float | None = None  # 참고 글자를 그릴 때의 굵기. 지금 굵기와의 차이만큼 획을 굵히거나 가늘인다


def _axes(a: BuildAxes) -> Axes:
    return Axes(a.weight, a.roundness, a.width, a.slant, a.tracking, a.drawnWeight)


def _gray(r: RefInput):
    if r.char not in KSX1001_HANGUL:
        raise HTTPException(400, f"글자는 한글 완성형이어야 해요: {r.char}")
    return raster.to_gray(raster.decode_image(r.image))


def _refs(refs: list[RefInput], required: bool = True) -> dict:
    out = {r.char: raster.clean_glyph(_gray(r), max_side=None) for r in refs}
    if required and not out:
        raise HTTPException(400, "참고 글자가 없어요")
    return out


def _glyphs(refs: list[RefInput], glyphs: list[RefInput]) -> dict:
    """그린 글자 전부(음절 → 자리 맞춘 틀 그림). 참고 글자는 묶음 안에서 자리를 맞추고, 나머지 글자는 받은 그대로 쓴다."""
    out = {g.char: drawn.decode(_gray(g)) for g in glyphs}
    out.update(drawn.place_refs(_refs(refs, required=False)) if refs else {})
    return out


class EditInput(BaseModel):
    char: str
    image: str  # 편집 화면에서 고친 그림(data URL, drawn.EDIT_SIDE px, 흰 바탕 검은 글씨)
    weight: float  # 고칠 때의 굵기 축 값


def _edits(edits: list[EditInput]) -> dict[str, drawn.Edit]:
    out = {}
    for e in edits:
        if e.char not in KSX1001_HANGUL:
            raise HTTPException(400, f"고친 글자는 한글 완성형이어야 해요: {e.char}")
        out[e.char] = drawn.decode_edit(raster.to_gray(raster.decode_image(e.image)), e.weight)
    return out


class BuildRequest(BaseModel):
    buildId: str | None = None
    storeName: str = ""
    logoHash: str | None = None
    axes: BuildAxes = Field(default_factory=BuildAxes)
    refs: list[RefInput] = Field(default_factory=list)  # 참고 글자(화면 3)
    glyphs: list[RefInput] = Field(default_factory=list)  # 나머지 글자(화면 4에서 그려 자리 맞춘 것)
    models: list[str] = Field(default_factory=list)
    licenseText: str = ""
    aiNotice: str = ""
    edits: list[EditInput] = Field(default_factory=list)  # 사용자가 고친 글자


@app.post("/builds")
def start_build(req: BuildRequest) -> dict:
    glyphs, edits = _glyphs(req.refs, req.glyphs), _edits(req.edits)
    if not glyphs and not edits:
        raise HTTPException(400, "그린 글자가 없어요")
    build_id = req.buildId or new_build_id()
    meta = FontMeta(build_id, req.storeName, req.models, req.licenseText, req.aiNotice)
    state = builds.start(glyphs, _axes(req.axes), meta, req.logoHash, edits)
    return {"buildId": state.build_id}


class PreviewRequest(BaseModel):
    text: str
    axes: BuildAxes = Field(default_factory=BuildAxes)
    refs: list[RefInput] = Field(default_factory=list)
    glyphs: list[RefInput] = Field(default_factory=list)  # 글에 든 나머지 글자만 보내면 된다
    edits: list[EditInput] = Field(default_factory=list)


@app.post("/preview")
def preview(req: PreviewRequest) -> dict:
    """글 몇 자(최대 80자)만 빌드와 같은 방법(그린 글자 → 외곽선)으로 만들어 글자별 SVG 패스로 돌려준다."""
    return render_preview(_glyphs(req.refs, req.glyphs), _axes(req.axes), req.text, _edits(req.edits))


# ---------- 화면 4: 글자 고치기(10/29) ----------


class GlyphEditRequest(BaseModel):
    char: str
    axes: BuildAxes = Field(default_factory=BuildAxes)
    refs: list[RefInput] = Field(default_factory=list)
    glyphs: list[RefInput] = Field(default_factory=list)  # 이 글자가 나머지 글자면 그 그림
    edit: EditInput | None = None  # 고친 그림. 없으면 그린 그대로


def _ink_png(mask) -> str:
    return raster.png_data_url(((~mask) * 255).astype("uint8"))


def _drawn_mask(req: GlyphEditRequest, ch: str, axes: Axes):
    """그린 그대로의 글자(틀 그림, 지금 굵기). 아직 그리지 못한 글자면 None."""
    mask = _glyphs(req.refs, [g for g in req.glyphs if g.char == ch]).get(ch)
    return None if mask is None else drawn.glyph_mask(mask, axes, drawn.weight_offset(axes))


def _edit_char(char: str) -> str:
    if len(char) != 1 or char not in KSX1001_HANGUL:
        raise HTTPException(400, "한글 완성형 2,350자 가운데 한 글자를 골라 주세요")
    return char


@app.post("/glyphs/edit-source")
def glyph_edit_source(req: GlyphEditRequest) -> dict:
    """편집 화면에 띄울 그림(EDIT_SIDE px). image는 지금 글자(고친 적이 있으면 고친 그림), original은 그린 그대로(못 그린 글자는 빈 그림),
    guides는 글자 틀 자리."""
    ch = _edit_char(req.char)
    axes = _axes(req.axes)
    mask = _drawn_mask(req, ch, axes)
    original = drawn.to_edit(mask) if mask is not None else np.zeros((drawn.EDIT_SIDE, drawn.EDIT_SIDE), bool)
    current = drawn.edit_mask(_edits([req.edit])[ch], axes) if req.edit else original
    layout = get_layout()
    return {
        "char": ch,
        "size": drawn.EDIT_SIDE,
        "image": _ink_png(current),
        "original": _ink_png(original),
        "guides": drawn.guides(layout.advance, layout.ascender, layout.descender),
    }


@app.post("/builds/{build_id}/glyph")
def patch_build_glyph(build_id: str, req: GlyphEditRequest) -> dict:
    """만든 폰트에서 글자 하나만 다시 딴다. edit가 있으면 고친 그림으로, 없으면 그린 그대로(고친 것 되돌리기)."""
    ch = _edit_char(req.char)
    axes = _axes(req.axes)
    if req.edit:
        outline, advance = drawn.trace(drawn.edit_mask(_edits([req.edit])[ch], axes), axes, get_layout().advance, drawn.EDIT_PX)
    else:
        mask = _drawn_mask(req, ch, axes)
        if mask is None:
            raise HTTPException(400, f"'{ch}'은(는) 아직 그리지 못한 글자라 되돌릴 그림이 없어요")
        outline, advance = drawn.trace(mask, axes, get_layout().advance)
    path = _font_file(build_id)
    try:
        patch_glyph(path, ch, outline, advance)
    except GlyphRejected as err:
        raise HTTPException(400, str(err)) from err
    builds.refresh_glyph_set(build_id)
    export_later(path)
    return {"ok": True}


@app.get("/builds/{build_id}")
def build_status(build_id: str) -> dict:
    state = builds.get(build_id)
    if state is None:
        raise HTTPException(404, "빌드를 찾을 수 없어요")
    return state.to_dict()


def _font_file(build_id: str):
    state = builds.get(build_id)
    from .paths import BUILDS_DIR

    path = state.font_path if state else BUILDS_DIR / build_id / "font.ttf"
    if not path.exists() or (state and state.phase not in {"checking", "done"}):
        raise HTTPException(404, "TTF가 아직 없어요")
    return path


@app.get("/builds/{build_id}/font.{kind}")
def font_file(build_id: str, kind: str) -> FileResponse:
    """TTF는 만든 파일 그대로, OTF·WOFF·WOFF2는 TTF에서 만든다(글자를 고친 뒤면 다시 만든다)."""
    if kind not in FORMATS:
        raise HTTPException(404, "그런 형식은 없어요")
    return FileResponse(export_font(_font_file(build_id), kind), media_type=FORMATS[kind], filename=f"logoche-{build_id[:8]}.{kind}")


class BundleFile(BaseModel):
    name: str
    text: str


class BundleRequest(BaseModel):
    fileStem: str  # 묶음 안 폰트 파일 이름(확장자 빼고)
    family: str  # CSS 예시의 font-family
    files: list[BundleFile] = Field(default_factory=list)  # 함께 넣을 글 파일(제작 기록 등)


@app.post("/builds/{build_id}/bundle")
def font_bundle(build_id: str, req: BundleRequest) -> Response:
    """모두 받기(zip): TTF·OTF·웹폰트(WOFF2·WOFF·CSS 예시)·OFL 원문과 함께 넣을 파일."""
    stem = "".join(c for c in req.fileStem if c not in '\\/:*?"<>|').strip() or f"logoche-{build_id[:8]}"
    extra = {"OFL-1.1.txt": (ASSETS_DIR / "licenses" / "OFL-1.1.txt").read_bytes()}
    extra.update({f.name: f.text.encode() for f in req.files})
    data = bundle(_font_file(build_id), stem, req.family or stem, extra)
    return Response(data, media_type="application/zip")


class OcrSheetRequest(BaseModel):
    chars: str


@app.post("/builds/{build_id}/ocr-sheet")
def build_ocr_sheet(build_id: str, req: OcrSheetRequest) -> dict:
    """OCR용 그림. 서체에 있는 글자만 놓고(10/30: 그리지 못한 글자는 빠진다), 놓은 글자를 chars로 돌려준다."""
    path = _font_file(build_id)
    cmap = TTFont(path, lazy=True).getBestCmap()
    chars = "".join(c for c in req.chars if ord(c) in cmap)
    return {"image": raster.png_data_url(ocr_sheet(path, chars)), "chars": chars}


@app.post("/builds/{build_id}/issue")
def issue(build_id: str) -> dict:
    try:
        builds.issue(build_id)
    except FileNotFoundError as err:
        raise HTTPException(404, "TTF가 없어요") from err
    return {"issued": True}
