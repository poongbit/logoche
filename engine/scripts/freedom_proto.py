"""글자 모양 자유도 시제품(11/5, docs/glyph-freedom-methods-20261105.md의 G·A). 이미지 호출 없음.
참고 글자 30자 작업(web/.data/glyphs/<작업 id>)을 빌드와 같은 방식으로 자리 맞춘 뒤,
  1) 정규화 켬(빌드 그대로: drawn.refine = 글자마다 획 두께 고르기)
  2) 정규화 끔
  3) 정규화 끔 + 글자별 변주(크기·기울기·회전·자리·가로세로, 글자 이름으로 정한 난수라 같은 글자는 늘 같다) 약·강
을 한 장에 줄 세운다.

    engine/.venv/bin/python scripts/freedom_proto.py <작업 id> --out 견본.png
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logoche_engine import drawn, raster  # noqa: E402

GLYPHS = Path(__file__).resolve().parents[2] / "web" / ".data" / "glyphs"


def rng_for(ch: str, salt: str) -> np.random.Generator:
    return np.random.default_rng(int(hashlib.sha256((salt + ch).encode()).hexdigest()[:12], 16))


def vary(mask: np.ndarray, ch: str, level: float) -> np.ndarray:
    """글자 하나에 결정적 변주: 크기 ±8%·가로세로 ±7%·기울기 ±4°·회전 ±3°·자리 ±3%(level=1 기준). 틀 밖으로 나가면 줄인다."""
    r = rng_for(ch, "freedom")
    s = 1 + level * r.uniform(-0.08, 0.08)
    sx = s * (1 + level * r.uniform(-0.07, 0.07))
    sy = s * (1 + level * r.uniform(-0.07, 0.07))
    shear = math.tan(math.radians(level * r.uniform(-4, 4)))
    rot = math.radians(level * r.uniform(-3, 3))
    tx, ty = level * r.uniform(-0.03, 0.03) * mask.shape[1], level * r.uniform(-0.03, 0.03) * mask.shape[0]
    h, w = mask.shape
    cx, cy = w / 2, h / 2
    a = np.array([[sx * math.cos(rot), -sy * math.sin(rot) + shear * sy], [sx * math.sin(rot), sy * math.cos(rot)]], np.float64)
    m = np.zeros((2, 3), np.float64)
    m[:, :2] = a
    m[:, 2] = np.array([cx + tx, cy + ty]) - a @ np.array([cx, cy])
    out = cv2.warpAffine(mask.astype(np.uint8) * 255, m.astype(np.float32), (w, h), flags=cv2.INTER_LINEAR) > 127
    return out


def tile(mask: np.ndarray, size: int) -> np.ndarray:
    return cv2.resize((~mask).astype(np.uint8) * 255, (size, size), interpolation=cv2.INTER_AREA)


def main(args: list[str]) -> None:
    job = args[0]
    out_path = Path(args[args.index("--out") + 1]) if "--out" in args else Path("freedom.png")
    report = json.loads((GLYPHS / job / "report.json").read_text(encoding="utf-8"))
    chars = report["chars"]
    refs = {}
    for i, ch in enumerate(chars):
        gray = np.asarray(Image.open(GLYPHS / job / f"{i}.png").convert("L"))
        refs[ch] = raster.clean_glyph(gray, max_side=None)
    placed = drawn.place_refs(refs)
    refined = drawn.refine(dict(placed))  # 30자라 REFINE_MIN(10) 이상이면 켜진다
    print("정규화 켬 글자 수", sum(1 for c in chars if not np.array_equal(placed[c], refined[c])), "/", len(chars))
    th_on = [raster.solid_thickness(refined[c]) / drawn.PX for c in chars if refined[c].any()]
    th_off = [raster.solid_thickness(placed[c]) / drawn.PX for c in chars if placed[c].any()]
    print(f"획 두께(폰트 단위) 평균·표준편차  켬 {np.mean(th_on):.1f}±{np.std(th_on):.1f}   끔 {np.mean(th_off):.1f}±{np.std(th_off):.1f}")
    show = list(chars[:14])
    rows = [
        ("정규화 켬(지금)", {c: refined[c] for c in show}),
        ("정규화 끔", {c: placed[c] for c in show}),
        ("끔 + 변주 약", {c: vary(placed[c], c, 0.6) for c in show}),
        ("끔 + 변주 강", {c: vary(placed[c], c, 1.2) for c in show}),
    ]
    cell = 130
    sheet = Image.new("L", (170 + cell * len(show), cell * len(rows)), 255)
    d = ImageDraw.Draw(sheet)
    lf = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 15)
    for r, (label, masks) in enumerate(rows):
        d.text((6, r * cell + cell // 2 - 8), label, font=lf, fill=0)
        for c, ch in enumerate(show):
            sheet.paste(Image.fromarray(tile(masks[ch], cell)), (170 + c * cell, r * cell))
    sheet.save(out_path)
    print(out_path)


if __name__ == "__main__":
    main(sys.argv[1:])
