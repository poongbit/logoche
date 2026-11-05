"""ㅇ 속공간에 로고 심볼을 엔진이 직접 넣는 시험(11/5). 기존 폰트를 글자 그림으로 뽑아 ㅇ의 속공간(둥근 구멍)을 찾아 심볼을 같은 비율로 넣는다. 새 호출 없음.

    engine/.venv/bin/python scripts/mark_counter_test.py <빌드ID:이름:모양> ... --out 견본.png
모양: star, triangle, leaf
"""

from __future__ import annotations

import math
import sys
import unicodedata
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from logoche_engine.paths import BUILDS_DIR  # noqa: E402

SIZE = 256
FILL = 0.62  # 속공간 짧은 변 대비 심볼 크기
MIN_HOLE = 9  # 속공간 짧은 변이 이보다 작으면 넣지 않는다(px, SIZE 기준)


def has_ieung(ch: str) -> bool:
    return "ᄋ" in unicodedata.normalize("NFD", ch) or "ᅌ" in unicodedata.normalize("NFD", ch)


def render(font: ImageFont.FreeTypeFont, ch: str) -> np.ndarray:
    img = Image.new("L", (SIZE, SIZE), 255)
    d = ImageDraw.Draw(img)
    b = d.textbbox((0, 0), ch, font=font)
    d.text(((SIZE - (b[2] - b[0])) / 2 - b[0], (SIZE - (b[3] - b[1])) / 2 - b[1]), ch, font=font, fill=0)
    return np.array(img)


def ieung_hole(gray: np.ndarray):
    """ㅇ 속공간 후보: 둥근 구멍(타원에 가까운 것) 중 가장 둥근 하나. 반환 (cx, cy, w, h) 또는 None."""
    ink = (gray < 128).astype(np.uint8) * 255
    cs, hier = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None:
        return None
    best = None
    for i, c in enumerate(cs):
        if hier[0][i][3] < 0:  # 바깥 윤곽은 건너뜀(구멍만)
            continue
        area = cv2.contourArea(c)
        x, y, w, h = cv2.boundingRect(c)
        if min(w, h) < MIN_HOLE or area < 40:
            continue
        fill = area / (w * h)  # 타원 0.785, 직사각형 1.0
        asp = w / h
        if not (0.55 <= fill <= 0.9 and 0.35 <= asp <= 2.4):
            continue
        score = -area  # 글자당 가장 큰 둥근 구멍 하나(처음 ㅇ이 받침 ㅇ보다 큼)
        if best is None or score < best[0]:
            best = (score, (x + w / 2, y + h / 2, w, h))
    return best[1] if best else None


def mark_poly(shape: str, r: float) -> np.ndarray:
    if shape == "star":
        pts = [(math.cos(-math.pi / 2 + k * math.pi / 5) * (r if k % 2 == 0 else r * 0.42), math.sin(-math.pi / 2 + k * math.pi / 5) * (r if k % 2 == 0 else r * 0.42)) for k in range(10)]
    elif shape == "triangle":
        pts = [(0, -r), (r * 0.9, r * 0.7), (-r * 0.9, r * 0.7)]
    else:  # leaf: 양 끝이 뾰족한 잎(오른쪽 위로 기울임)
        t = np.linspace(0, math.pi, 24)
        up = [(r * math.cos(a), -r * 0.5 * math.sin(a)) for a in t]
        dn = [(r * math.cos(a), r * 0.5 * math.sin(a)) for a in t[::-1]]
        ang = -math.pi / 4
        pts = [(x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)) for x, y in up + dn]
    return np.array(pts, dtype=np.float32)


def stamp(gray: np.ndarray, hole, shape: str) -> np.ndarray:
    cx, cy, w, h = hole
    r = min(w, h) * FILL / 2 * (1.25 if shape == "triangle" else 1.0)
    poly = (mark_poly(shape, r) + np.array([cx, cy], dtype=np.float32)).astype(np.int32)
    out = gray.copy()
    cv2.fillPoly(out, [poly], 0)
    return out


def main(args: list[str]) -> None:
    out = Path(args[args.index("--out") + 1]) if "--out" in args else Path("mark_counter.png")
    specs = [a for a in args if ":" in a]
    show = "아응안앙이은있강공영옹앞"
    contrast = "가것국람"
    from fontTools.ttLib import TTFont

    rows, stats = [], []
    for spec in specs:
        bid, name, shape = spec.split(":")
        path = BUILDS_DIR / bid / "font.ttf"
        font = ImageFont.truetype(str(path), 200)
        cmap = TTFont(path, lazy=True).getBestCmap()
        pool = [chr(c) for c in cmap if 0xAC00 <= c <= 0xD7A3 and has_ieung(chr(c))]
        sample = pool[:: max(1, len(pool) // 600)]
        ok = sum(1 for ch in sample if ieung_hole(render(font, ch)) is not None)
        stats.append(f"{name}({shape}): ㅇ 든 글자 {len(sample)}개 중 속공간을 찾아 넣은 글자 {ok}개 ({ok * 100 // len(sample)}%)")
        row_orig, row_new = [], []
        for ch in show + contrast:
            g = render(font, ch)
            h = ieung_hole(g) if has_ieung(ch) else None
            row_orig.append(g)
            row_new.append(stamp(g, h, shape) if h else g)
        rows.append((name + " 원래", np.hstack(row_orig)))
        rows.append((name + f" +{shape}", np.hstack(row_new)))
    W = rows[0][1].shape[1]
    sheet = Image.new("L", (W + 150, SIZE * len(rows)), 255)
    d = ImageDraw.Draw(sheet)
    lf = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 22)
    for i, (label, arr) in enumerate(rows):
        sheet.paste(Image.fromarray(arr), (150, i * SIZE))
        d.text((8, i * SIZE + SIZE // 2 - 12), label, font=lf, fill=0)
    sheet.save(out)
    print("\n".join(stats))
    print(out)


if __name__ == "__main__":
    main(sys.argv[1:])
