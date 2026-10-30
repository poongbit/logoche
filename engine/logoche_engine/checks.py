"""상업용 검사 7항목. 키 이름은 웹(web/lib/types.ts CheckKey)과 같다. OCR은 웹이 Claude로 따로 한다.

platform_render는 실제 기기에 띄워 보는 검사가 아니라 각 환경이 요구하는 표·값을 갖췄는지 보는 구조 검사다.
similarity는 무료 폰트(compare/free, scripts/fetch_compare_fonts.py)와 비교한다. 상용 폰트 비교 대상은 아직 없다(design.md 정할 것 5).
발급 대장(받아 간 서체)과는 비교하지 않는다(10/30 결정: 서체마다 따로 만든다. MX-Font 서체끼리는 뼈대가 거의 같아
앞서 받아 간 서체가 다른 가게의 새 서체를 막았다. 러너스하이·와사비 0.88)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import cv2
import numpy as np
import pathops
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

from .hangul import KSX1001_HANGUL
from .paths import COMPARE_DIR
from .reference import REFERENCE_FONTS, REFERENCE_NAME

# 뼈대 겹침 점수의 기준값(정할 것 7). 10/28 비교 폰트 69개(52가족)로 다시 잼: 다른 가족끼리 중앙값 0.40·95% 0.84,
# 0.9를 넘는 쌍은 대부분 같은 뿌리(Pretendard·SUIT ≈ Source Han Sans 0.98~0.99)지만, 따로 만든 본문용 고딕·명조끼리도
# 0.92~0.93이 나온다(IBM Plex Sans KR ~ 나눔고딕, 나눔명조 ~ Noto Serif KR). 질감만 입힌 사본은 0.76~0.98,
# 우리 빌드의 최고 점수는 0.24~0.77이다. 사본을 놓치는 쪽이 더 위험해서 0.85를 그대로 둔다(engine/README.md).
SIMILARITY_THRESHOLD = 0.85
FREQUENT_CHARS = "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후그느드르"
COMPLEX_CHARS = "값읽밟뚫쌌꽃흙닭햇볕밖삶젊짧넓흘렀갔왔됐뷔쿄퀘쥐틔펴훼괜찮읊겠많않싫옳힘쓸쐈"
PANGRAM_CHARS = "다람쥐헌쳇바퀴에타고파"  # 다람쥐 헌 쳇바퀴에 타고파(기본 자음 14개가 모두 나온다)
SAMPLE_CHARS = FREQUENT_CHARS + COMPLEX_CHARS + PANGRAM_CHARS


def _available(font: TTFont, chars: str) -> str:
    """서체에 있는 글자만. 일부 글자만 든 서체를 검사할 때 쓴다."""
    cmap = font.getBestCmap()
    return "".join(dict.fromkeys(ch for ch in chars if ord(ch) in cmap))


@dataclass
class CheckResult:
    key: str
    status: str  # pass · fail
    detail: str


@dataclass
class Similarity:
    score: float
    threshold: float
    nearestFont: str
    nearestKind: str  # free · commercial
    passed: bool
    compared: dict[str, int]


def _result(key: str, ok: bool, detail: str) -> CheckResult:
    return CheckResult(key, "pass" if ok else "fail", detail)


def check_glyph_set(font: TTFont, expected: list[str]) -> CheckResult:
    """expected: 들어 있어야 할 음절(2,350자)."""
    cmap = font.getBestCmap()
    glyf = font["glyf"]
    present = [ch for ch in expected if ord(ch) in cmap and glyf[cmap[ord(ch)]].numberOfContours > 0]
    detail = f"한글 {len(present):,} / {len(KSX1001_HANGUL):,}자"
    have = set(present)
    missing = [ch for ch in expected if ch not in have]
    if missing:  # 이미지 모델이 끝내 그리지 못한 글자는 서체에 없다. 화면 4 글자 고치기로 그려 넣을 수 있다.
        detail += f" · 빠진 글자 {''.join(missing[:12])}{'…' if len(missing) > 12 else ''}"
    return _result("glyph_set", len(present) == len(expected), detail)


def glyph_broken(glyph, glyf) -> bool:
    """점이 셋보다 적은 윤곽이 있거나, 면적이 0이거나, 자기교차·겹침이 있으면(정리 전후 면적이 달라진다) 깨진 글자다."""
    _, ends, _ = glyph.getCoordinates(glyf)
    start = 0
    for end in ends:
        if end - start + 1 < 3:
            return True
        start = end + 1
    path = pathops.Path()
    glyph.draw(path.getPen(), glyf)
    before = abs(path.area)
    simplified = pathops.Path(path)
    simplified.simplify()
    return before == 0 or abs(abs(simplified.area) - before) > 0.005 * before


def check_broken_glyphs(font: TTFont) -> CheckResult:
    glyf = font["glyf"]
    broken = []
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.numberOfContours > 0 and glyph_broken(glyph, glyf):
            broken.append(name)
    cmap_rev = {v: chr(k) for k, v in font.getBestCmap().items()}
    sample = ", ".join(cmap_rev.get(n, n) for n in broken[:5])
    return _result("broken_glyphs", not broken, "0개" if not broken else f"{len(broken)}개 ({sample})")


def check_embedding(font: TTFont) -> CheckResult:
    fs_type = font["OS/2"].fsType
    return _result("embedding", fs_type == 0, f"fsType {fs_type}")


def check_naming_license(font: TTFont) -> CheckResult:
    names = font["name"]
    missing = []
    for name_id, label in [(1, "글꼴 이름"), (2, "스타일"), (4, "전체 이름"), (6, "PostScript 이름"), (13, "라이선스")]:
        if not names.getName(name_id, 3, 1, 0x409):
            missing.append(label)
    if not names.getName(1, 3, 1, 0x412):
        missing.append("한국어 이름")
    description = names.getName(10, 3, 1, 0x409)
    if not description or "AI" not in description.toUnicode():
        missing.append("AI 생성 표시")
    return _result("naming_license", not missing, "이름·라이선스·AI 생성 표시 기록" if not missing else "빠짐: " + ", ".join(missing))


def check_platform_render(font: TTFont, path: Path) -> CheckResult:
    problems = []
    subtables = {(t.platformID, t.platEncID, t.format) for t in font["cmap"].tables}
    if (3, 1, 4) not in subtables:
        problems.append("Windows cmap")
    if not any(p == 0 for p, _, _ in subtables):
        problems.append("Unicode cmap(macOS·iOS)")
    os2, hhea, head = font["OS/2"], font["hhea"], font["head"]
    if os2.version < 4:
        problems.append("OS/2 버전")
    if os2.usWinAscent < head.yMax or os2.usWinDescent < -head.yMin:
        problems.append("Windows 줄 높이(잘림)")
    if (hhea.ascent, hhea.descent) != (os2.sTypoAscender, os2.sTypoDescender):
        problems.append("macOS·Windows 줄 높이 불일치")
    if not 16 <= head.unitsPerEm <= 16384:
        problems.append("unitsPerEm")
    if "post" not in font or "gasp" not in font:
        problems.append("post·gasp 표")
    size_mb = path.stat().st_size / 1_000_000
    if size_mb > 10:
        problems.append(f"파일 크기 {size_mb:.1f}MB(웹)")
    try:
        pil = ImageFont.truetype(str(path), 24)
        Image.new("L", (200, 40)).getbbox()
        ImageDraw.Draw(Image.new("L", (200, 40))).text((0, 0), "가나다", font=pil)
    except OSError as err:
        problems.append(f"FreeType 렌더링 실패({err})")
    ok = not problems
    return _result("platform_render", ok, f"구조 검사 통과 · {size_mb:.1f}MB (실기기 표시는 따로 확인)" if ok else ", ".join(problems))


def _render(font_path: Path, ch: str, size: int) -> np.ndarray:
    font = ImageFont.truetype(str(font_path), size)
    image = Image.new("L", (size * 2, size * 2), 0)
    ImageDraw.Draw(image).text((size // 2, size // 2), ch, font=font, fill=255)
    return np.array(image)


def _holes(mask: np.ndarray, min_area: int) -> int:
    contours, hierarchy = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return 0
    return sum(1 for i, h in enumerate(hierarchy[0]) if h[3] >= 0 and cv2.contourArea(contours[i]) >= min_area)


@cache
def _reference_holes(ch: str) -> int:
    return _holes(_render(REFERENCE_FONTS["regular"], ch, 96) > 127, 6)


def check_size_legibility(path: Path) -> CheckResult:
    """12px에서 덩어리로 뭉치는 글자, 96px에서 기준 서체보다 속공간(구멍)이 줄어든 글자를 센다."""
    sample = _available(TTFont(path, lazy=True), SAMPLE_CHARS)
    blobs, closed = [], []
    for ch in sample:
        small = _render(path, ch, 12) > 127
        ys, xs = np.nonzero(small)
        if len(xs):
            box = small[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
            if box.mean() > 0.72:
                blobs.append(ch)
        if _holes(_render(path, ch, 96) > 127, 6) < _reference_holes(ch):
            closed.append(ch)
    limit = max(1, round(len(sample) * 0.05))
    ok = len(blobs) <= limit and len(closed) <= limit
    detail = f"검사 {len(sample)}자 · 12px 뭉침 {len(blobs)}자 · 96px 속공간 막힘 {len(closed)}자"
    flagged = (blobs + [c for c in closed if c not in blobs])[:8]
    if flagged:
        detail += f" ({''.join(flagged)})"
    return _result("size_legibility", ok, detail)


# ---------- 유사도 ----------

SIM_SIZE = 64
SIM_TOLERANCE = 2.0  # 픽셀. 뼈대가 이 거리 안에 있으면 겹친 것으로 본다.


def _ridge(mask: np.ndarray) -> np.ndarray:
    """획의 가운데 선(거리장의 능선). 굵기와 상관없이 획이 지나는 자리만 남는다."""
    dist = cv2.distanceTransform(np.pad(mask, 1).astype(np.uint8), cv2.DIST_L2, 5)[1:-1, 1:-1]
    return (dist >= cv2.dilate(dist, np.ones((3, 3), np.uint8))) & (dist > 0.75)


def _shape_image(font_path: Path, ch: str) -> np.ndarray | None:
    return skeleton(_render(font_path, ch, 96))


def skeleton(rendered: np.ndarray) -> np.ndarray | None:
    """96px로 그린 글자(0~255)의 뼈대를 SIM_SIZE 칸에 맞춰 돌려준다."""
    # 중간값 거르기로 붓 질감(가장자리 요철·마른 붓 틈)을 지운 뒤 뼈대를 잡는다. 안 거르면 요철마다 뼈대 가지가 생겨,
    # Source Han Sans에 질감만 입힌 사본이 0.79~0.82로 기준 아래가 됐다(거르면 0.92~0.96, 다른 서체 점수는 ±0.02, 10/28).
    image = cv2.medianBlur(rendered, 5) > 127
    ys, xs = np.nonzero(image)
    if len(xs) == 0:
        return None
    crop = image[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.uint8) * 255
    h, w = crop.shape
    k = (SIM_SIZE - 4) / max(h, w)
    crop = cv2.resize(crop, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)
    out = np.zeros((SIM_SIZE, SIM_SIZE), np.uint8)
    oy, ox = (SIM_SIZE - crop.shape[0]) // 2, (SIM_SIZE - crop.shape[1]) // 2
    out[oy : oy + crop.shape[0], ox : ox + crop.shape[1]] = crop
    ridge = _ridge(out > 127)
    return ridge if ridge.any() else None


@cache
def _shape_set(font_path: Path, mtime: float) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """글자마다 (뼈대, 뼈대까지의 거리장)."""
    font = TTFont(font_path, lazy=True)
    cmap = font.getBestCmap()
    out = {}
    for ch in SAMPLE_CHARS:
        if ord(ch) in cmap:
            ridge = _shape_image(font_path, ch)
            if ridge is not None:
                out[ch] = (ridge, cv2.distanceTransform((~ridge).astype(np.uint8), cv2.DIST_L2, 5))
    return out


def shape_similarity(a: dict[str, tuple[np.ndarray, np.ndarray]], b: dict[str, tuple[np.ndarray, np.ndarray]]) -> float:
    """두 서체의 글자 뼈대가 얼마나 같은 자리를 지나는지(F1 평균). 크기를 맞춰 비교하고 굵기 차이는 보지 않는다. 0~1."""
    scores = []
    for ch, (ridge_a, dist_a) in a.items():
        if ch not in b:
            continue
        ridge_b, dist_b = b[ch]
        precision = (dist_b[ridge_a] <= SIM_TOLERANCE).mean()
        recall = (dist_a[ridge_b] <= SIM_TOLERANCE).mean()
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0.0)
    return float(np.mean(scores)) if scores else 0.0


def _font_files(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in {".otf", ".ttf"})


def _display_name(path: Path) -> str:
    try:
        name = TTFont(path, lazy=True)["name"].getDebugName(4)
        return name or path.stem
    except Exception:
        return path.stem


def comparison_set() -> list[tuple[str, str, Path]]:
    """(종류, 이름, 파일) 목록."""
    out: list[tuple[str, str, Path]] = [("free", f"{REFERENCE_NAME} {w.title()}", p) for w, p in REFERENCE_FONTS.items()]
    out += [("free", _display_name(p), p) for p in _font_files(COMPARE_DIR / "free")]
    out += [("commercial", _display_name(p), p) for p in _font_files(COMPARE_DIR / "commercial")]
    return out


def warm_comparison() -> None:
    """비교 폰트의 뼈대를 미리 만들어 캐시에 둔다(엔진을 켤 때 한 번)."""
    for _, _, font_path in comparison_set():
        _shape_set(font_path, font_path.stat().st_mtime)


def check_similarity(path: Path) -> tuple[CheckResult, Similarity]:
    mine = _shape_set(path, path.stat().st_mtime)
    candidates = comparison_set()
    best = ("free", REFERENCE_NAME, 0.0)
    counts = {"free": 0, "commercial": 0}
    for kind, name, font_path in candidates:
        counts[kind] += 1
        score = shape_similarity(mine, _shape_set(font_path, font_path.stat().st_mtime))
        if score > best[2]:
            best = (kind, name, score)
    kind, name, score = best
    sim = Similarity(round(score, 3), SIMILARITY_THRESHOLD, name, kind, score < SIMILARITY_THRESHOLD, counts)
    detail = f"{score:.2f} (기준 {SIMILARITY_THRESHOLD:.2f}) · 무료 폰트 {counts['free']}개와 비교"
    detail += f" · 상용 폰트 {counts['commercial']}개" if counts["commercial"] else " · 상용 폰트는 비교 안 함"
    return _result("similarity", sim.passed, detail), sim


def run_checks(
    path: Path,
    expected: list[str] | None = None,
    on_result: Callable[[int, CheckResult], None] = lambda i, result: None,
) -> tuple[list[CheckResult], Similarity]:
    """7항목을 차례로 검사한다. on_result는 항목이 끝날 때마다 (순서, 결과)를 받는다."""
    font = TTFont(path)
    steps: list[Callable[[], CheckResult]] = [
        lambda: check_glyph_set(font, expected or KSX1001_HANGUL),
        lambda: check_broken_glyphs(font),
        lambda: check_embedding(font),
        lambda: check_naming_license(font),
        lambda: check_platform_render(font, path),
        lambda: check_size_legibility(path),
    ]
    results: list[CheckResult] = []
    for step in steps:
        results.append(step())
        on_result(len(results) - 1, results[-1])
    sim_result, sim = check_similarity(path)
    results.append(sim_result)
    on_result(len(results) - 1, sim_result)
    return results, sim
