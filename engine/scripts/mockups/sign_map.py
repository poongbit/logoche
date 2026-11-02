"""사용: engine/.venv/bin/python -I scripts/mockups/sign_map.py <원본 PNG> <내보낼 폴더>

간판 사진에서 바꿔 칠할 곳(파란 간판 면·차양 줄무늬) 지도와 간판 면 네 꼭짓점을 만든다.

지도 PNG(회색+투명): 회색 = 밝기 비율(128이 간판 면 가운데값, 255가 2배), 투명도 = 바꿔 칠할 정도(0~255).
결과 확인용으로 세 가지 색으로 칠해 본 그림도 만든다.
"""

import json
import sys

import numpy as np
from PIL import Image

src, out_dir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
H, W, _ = a.shape
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(-1), a.min(-1)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
# 색상(도). 파랑 계열만.
hue = np.zeros_like(mx)
d = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, (60 * ((g - b) / d)) % 360, hue)
hue = np.where(mx == g, 60 * ((b - r) / d) + 120, hue)
hue = np.where(mx == b, 60 * ((r - g) / d) + 240, hue)


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


hue_ok = 1 - smooth(np.abs(hue - 205), 18, 30)
blue = smooth(sat, 0.35, 0.6) * smooth(mx, 0.18, 0.3) * hue_ok
# 차양 옆면은 그늘이라 덜 짙다: 그 자리만 기준을 낮춘다
shaded = smooth(sat, 0.2, 0.4) * smooth(mx, 0.1, 0.2) * hue_ok
side = np.zeros_like(blue)
side[60:320, 20:215] = 1
blue = np.maximum(blue, shaded * side)
# 위층 유리창(어둡고 푸른 반사)은 밝기로 뺀다. 차양 줄무늬는 밝다.
top_rows = np.zeros_like(blue)
top_rows[0:70] = 1
blue = blue * (1 - top_rows * (1 - smooth(mx, 0.45, 0.6)))
# 간판과 차양 자리 밖은 칠하지 않는다
region = np.zeros_like(blue)
region[0:320, 20:W] = 1  # 차양
region[130:400, 295:1185] = 1  # 간판
blue = blue * region
# 가장자리의 얇은 파란 테두리까지 칠하게 1~2px 넓히고 부드럽게
from PIL import ImageFilter
grown = Image.fromarray((blue * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
mask = np.maximum(blue, np.asarray(grown).astype(np.float32) / 255.0) * region

# 간판 면 네 꼭짓점: 위·아래 가장자리는 기둥 몇 개의 첫/끝 파란 줄로 직선을 맞추고, 왼·오른 가장자리는 가운데 줄들로 맞춘다
face = blue > 0.5
face[:130] = False
face[400:] = False
face[:, :295] = False
face[:, 1185:] = False


def edge_line(axis_vals, pick):
    pts = []
    for v in axis_vals:
        idx = np.where(pick(v))[0]
        if len(idx):
            pts.append((v, idx))
    return pts


def longest_run(col):
    # 기둥에서 가장 긴 파란 구간(간판 면). 위의 차양 줄무늬 조각은 짧아서 빠진다.
    idx = np.where(col)[0]
    if not len(idx):
        return None
    breaks = np.where(np.diff(idx) > 1)[0]
    starts = np.r_[idx[0], idx[breaks + 1]]
    ends = np.r_[idx[breaks], idx[-1]]
    i = int(np.argmax(ends - starts))
    return int(starts[i]), int(ends[i])


cols = range(360, 1120, 20)
runs = [(x, longest_run(face[:, x])) for x in cols]
top = [(x, r[0]) for x, r in runs if r]
bot = [(x, r[1]) for x, r in runs if r]
# 둥근 모서리를 피해 왼쪽은 아래쪽 줄, 오른쪽은 가운데 줄로 맞춘다(왼쪽 윗변이 더 낮다)
left = [(np.where(face[y])[0].min(), y) for y in range(235, 355, 8) if face[y].any()]
right = [(np.where(face[y])[0].max(), y) for y in range(180, 330, 8) if face[y].any()]


def fit(pts, x_from_y=False):
    p = np.array(pts, dtype=float)
    if x_from_y:  # x = k*y + c
        k, c = np.polyfit(p[:, 1], p[:, 0], 1)
        return ("x", k, c)
    k, c = np.polyfit(p[:, 0], p[:, 1], 1)  # y = k*x + c
    return ("y", k, c)


def meet(l1, l2):
    # l1: y = k1 x + c1 (위/아래), l2: x = k2 y + c2 (왼/오른)
    _, k1, c1 = l1
    _, k2, c2 = l2
    y = (k1 * c2 + c1) / (1 - k1 * k2)
    x = k2 * y + c2
    return [round(float(x), 1), round(float(y), 1)]


T, B, L, R = fit(top), fit(bot), fit(left, True), fit(right, True)
quad = [meet(T, L), meet(T, R), meet(B, R), meet(B, L)]

lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
ref = float(np.median(lum[face]))
ratio = np.clip(lum / ref, 0, 2)
# 넓혀 칠하는 가장자리(흰 벽과 섞인 화소)는 밝아서 테두리가 빛나 보인다: 가장자리만 밝기 비율을 누른다
ratio = np.where(blue < 0.5, np.minimum(ratio, 1.05), ratio)
# 회색+투명(LA) 한 장: 회색 = 밝기 비율, 투명도 = 칠할 정도. 칠하지 않는 곳은 비워 파일을 줄인다.
alpha = np.clip(mask * 255, 0, 255).astype(np.uint8)
m = np.zeros((H, W, 2), dtype=np.uint8)
m[..., 0] = np.where(alpha > 0, np.clip(ratio * 128, 0, 255), 0).astype(np.uint8)
m[..., 1] = alpha
Image.fromarray(m, "LA").save(f"{out_dir}/sign-street-map.png", optimize=True)
im.save(f"{out_dir}/sign-street.webp", quality=86, method=6)
json.dump({"size": [W, H], "quad": quad, "ref": ref}, open(f"{out_dir}/sign-street.json", "w"), ensure_ascii=False)
print("quad", quad, "ref", round(ref, 3), "mask px", int((mask > 0.5).sum()))


# 확인용: 세 가지 색으로 칠해 보기(브라우저와 같은 계산)
def paint(hex_color):
    t = np.array([int(hex_color[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255.0
    col = np.clip(t[None, None, :] * ratio[..., None], 0, 1)
    return a * (1 - mask[..., None]) + col * mask[..., None]


tiles = [a] + [paint(c) for c in ("#F26B3A", "#2E7D32", "#F4D35E")]
sheet = np.concatenate([np.concatenate(tiles[:2], 1), np.concatenate(tiles[2:], 1)], 0)
Image.fromarray((sheet * 255).astype(np.uint8)).resize((W, H)).save(f"{out_dir}/check-colors.png")
Image.fromarray((mask * 255).astype(np.uint8)).save(f"{out_dir}/check-mask.png")
