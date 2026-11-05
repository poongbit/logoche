"""캘리그래피 느낌 시제품(11/5): 이미 만든 폰트의 글자 그림을 '핵심만 남기고(침식) 납작한 펜촉 모양으로 다시 불린다(팽창)'.
획이 펜촉 방향과 나란하면 가늘어지고 수직이면 굵어져 굵기 변화가 생기고, 획 끝은 펜촉 모양으로 비스듬히 잘린다. 새 호출 없음.

    engine/.venv/bin/python scripts/calligraphy_proto.py <빌드폴더 앞 8자리> [...] --out 견본.png
"""

from __future__ import annotations

import glob
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import raster  # noqa: E402
from logoche_engine.paths import BUILDS_DIR  # noqa: E402

SIZE = 384


def render(font: ImageFont.FreeTypeFont, ch: str) -> np.ndarray:
    img = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    b = d.textbbox((0, 0), ch, font=font)
    d.text(((SIZE - (b[2] - b[0])) / 2 - b[0], (SIZE - (b[3] - b[1])) / 2 - b[1]), ch, font=font, fill=255)
    return np.asarray(img) > 127


def nib(major: float, minor: float, angle_deg: float) -> np.ndarray:
    """납작한 타원 펜촉 커널. angle_deg: 펜촉 긴 축의 기울기(위로 올라가는 쪽이 +)."""
    r = int(math.ceil(major)) + 2
    k = np.zeros((2 * r + 1, 2 * r + 1), np.uint8)
    cv2.ellipse(k, (r, r), (max(1, round(major)), max(1, round(minor))), -angle_deg, 0, 360, 1, -1)
    return k


def thin(mask: np.ndarray) -> np.ndarray:
    """Zhang-Suen 세선화(중심선 한 픽셀). 새 의존성 없이 numpy로."""
    img = mask.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            P2, P3, P4, P5, P6, P7, P8, P9 = (p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2])
            n = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9
            seq = [P2, P3, P4, P5, P6, P7, P8, P9, P2]
            a = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0:
                c = (P2 * P4 * P6 == 0) & (P4 * P6 * P8 == 0)
            else:
                c = (P2 * P4 * P8 == 0) & (P2 * P6 * P8 == 0)
            rm = (img == 1) & (n >= 2) & (n <= 6) & (a == 1) & c
            if rm.any():
                img[rm] = 0
                changed = True
        if not changed:
            return img > 0


def calligraphy(mask: np.ndarray, angle: float = 40, major: float = 0.6, minor: float = 0.13, slant: float = 0.0, taper: float = 0.9) -> np.ndarray:
    """mask(True=잉크) → 중심선을 따라 납작한 펜촉(타원)을 찍어 다시 쓴 모양.
    펜촉 긴 축이 획과 나란하면 가늘고 수직이면 굵다. 획 끝(끝점 근처)에서는 펜촉을 줄여 뾰족하게 만든다. major·minor·taper는 원래 획 두께 t 대비 비율."""
    if not mask.any():
        return mask
    t = raster.solid_thickness(mask)
    smooth = cv2.medianBlur(mask.astype(np.uint8) * 255, 7) > 127
    sk = thin(smooth)
    ys, xs = np.nonzero(sk)
    if len(xs) == 0:
        return mask
    # 끝점(이웃 하나)
    p = np.pad(sk.astype(np.uint8), 1)
    nb = sum(np.roll(np.roll(p, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))[1:-1, 1:-1]
    ends = sk & (nb == 1)
    if ends.any():
        dist = cv2.distanceTransform((~ends).astype(np.uint8), cv2.DIST_L2, 5)
    else:
        dist = np.full(sk.shape, 1e9, np.float32)
    out = np.zeros((SIZE, SIZE), np.uint8)
    th = math.radians(angle)
    for y, x in zip(ys, xs):
        f = min(1.0, 0.35 + 0.65 * dist[y, x] / max(1.0, taper * t))
        cv2.ellipse(out, (int(x), int(y)), (max(1, round(major * t * f)), max(1, round(minor * t * f))), -angle, 0, 360, 255, -1)
    out = out > 127
    if slant:
        k = math.tan(math.radians(slant))
        m = np.array([[1, -k, k * SIZE * 0.6], [0, 1, 0]], np.float32)
        out = cv2.warpAffine(out.astype(np.uint8) * 255, m, (SIZE, SIZE), flags=cv2.INTER_LINEAR) > 127
    return out


def main(args: list[str]) -> None:
    out_path = Path(args[args.index("--out") + 1]) if "--out" in args else Path("calligraphy.png")
    prefixes = [a for a in args if not a.startswith("--") and a != str(out_path)]
    text = "달콤한집 로고체 냥이빵 안녕하세요"
    text = text.replace(" ", "")
    variants = [
        ("원래", None),
        ("펜촉 40°", dict(angle=40)),
        ("펜촉 40° + 기울임 8°", dict(angle=40, slant=8)),
        ("가는 펜촉 55° (대비 큼)", dict(angle=55, major=0.55, minor=0.08, slant=6)),
        ("굵은 붓 25°", dict(angle=25, major=0.62, minor=0.2)),
    ]
    cell = 120
    rows = []
    for pre in prefixes:
        p = glob.glob(str(BUILDS_DIR / (pre + "*") / "font.ttf"))[0]
        font = ImageFont.truetype(p, int(SIZE * 0.82))
        cmap = set(TTFont(p, lazy=True).getBestCmap())
        chars = [c for c in text if ord(c) in cmap][:12]
        for label, kw in variants:
            tiles = []
            for ch in chars:
                m = render(font, ch)
                if kw is not None:
                    m = calligraphy(m, **kw)
                tiles.append(cv2.resize((~m).astype(np.uint8) * 255, (cell, cell), interpolation=cv2.INTER_AREA))
            rows.append((f"{pre[:6]} {label}", np.hstack(tiles)))
    W = max(r[1].shape[1] for r in rows)
    sheet = Image.new("L", (W + 190, cell * len(rows)), 255)
    d = ImageDraw.Draw(sheet)
    lf = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 15)
    for i, (label, arr) in enumerate(rows):
        sheet.paste(Image.fromarray(arr), (190, i * cell))
        d.text((6, i * cell + cell // 2 - 8), label, font=lf, fill=0)
    sheet.save(out_path)
    print(out_path)


if __name__ == "__main__":
    main(sys.argv[1:])
