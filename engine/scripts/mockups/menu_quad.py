"""사용: engine/.venv/bin/python -I scripts/mockups/menu_quad.py <원본 PNG> <내보낼 폴더>

메뉴판 사진(가죽판 위 크림색 종이 한 장)에서 종이 네 꼭짓점과 종이 색을 찾고, 웹에 쓸 webp를 만든다.
종이는 밝고 채도가 낮은 가장 큰 덩어리다. 꼭짓점은 네 변의 가장자리 점들에 직선을 맞춰(집게가 덮은 곳은 벗어난 점으로 빠진다) 만나는 점으로 잡는다.
종이가 비스듬히 놓여 있어 왼쪽 끝 = 왼위, 위쪽 끝 = 오른위, 오른쪽 끝 = 오른아래, 아래쪽 끝 = 왼아래다.
"""

import json
import sys

import numpy as np
from PIL import Image

src, out_dir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
H, W, _ = a.shape
mx, mn = a.max(-1), a.min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
paper = (lum > 0.62) & (sat < 0.3)

ys, xs = np.nonzero(paper)
corners = {
    "left": (xs.min(), ys[xs == xs.min()].mean()),
    "top": (xs[ys == ys.min()].mean(), ys.min()),
    "right": (xs.max(), ys[xs == xs.max()].mean()),
    "bottom": (xs[ys == ys.max()].mean(), ys.max()),
}
TL, TR, BR, BL = corners["left"], corners["top"], corners["right"], corners["bottom"]


def robust_fit(u, v):
    """v = k*u + c, 집게 등으로 벗어난 점(3px 넘게)은 빼고 다시 맞춘다"""
    u, v = np.asarray(u, float), np.asarray(v, float)
    keep = np.ones(len(u), bool)
    for _ in range(4):
        k, c = np.polyfit(u[keep], v[keep], 1)
        res = np.abs(v - (k * u + c))
        keep = res < max(3.0, np.median(res[keep]) * 2.5)
    return k, c


def span(p, q, n=40, pad=0.12):
    t = np.linspace(pad, 1 - pad, n)
    return [(p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s) for s in t]


def first(mask_line):
    idx = np.nonzero(mask_line)[0]
    return idx.min() if len(idx) else None


def last(mask_line):
    idx = np.nonzero(mask_line)[0]
    return idx.max() if len(idx) else None


# 위·아래 변: 기둥마다 가장 위/아래 종이 화소(y = k x + c). 왼·오른 변: 줄마다 가장 왼/오른 종이 화소(x = k y + c)
top_pts = [(x, first(paper[:, int(x)])) for x, _ in span(TL, TR)]
bot_pts = [(x, last(paper[:, int(x)])) for x, _ in span(BL, BR)]
left_pts = [(y, first(paper[int(y)])) for _, y in span(TL, BL)]
right_pts = [(y, last(paper[int(y)])) for _, y in span(TR, BR)]
top = robust_fit(*zip(*[p for p in top_pts if p[1] is not None]))
bot = robust_fit(*zip(*[p for p in bot_pts if p[1] is not None]))
left = robust_fit(*zip(*[p for p in left_pts if p[1] is not None]))
right = robust_fit(*zip(*[p for p in right_pts if p[1] is not None]))


def meet(h_line, v_line):
    k1, c1 = h_line  # y = k1 x + c1
    k2, c2 = v_line  # x = k2 y + c2
    y = (k1 * c2 + c1) / (1 - k1 * k2)
    return [round(float(k2 * y + c2), 1), round(float(y), 1)]


quad = [meet(top, left), meet(top, right), meet(bot, right), meet(bot, left)]
inner = paper.copy()
inner[: int(min(q[1] for q in quad)) + 40] = False
color = "#%02x%02x%02x" % tuple(int(v * 255) for v in np.median(a[paper], axis=0))
im.save(f"{out_dir}/menu-board.webp", quality=86, method=6)
json.dump({"size": [W, H], "quad": quad, "paper": color}, open(f"{out_dir}/menu-board.json", "w"))
print("quad", quad, "paper", color)

# 확인용: 찾은 네 변을 그린 그림
from PIL import ImageDraw

check = im.copy()
d = ImageDraw.Draw(check)
d.polygon([tuple(p) for p in quad], outline=(255, 0, 0), width=3)
check.save(f"{out_dir}/check-quad.png")
