"""사용: python -I scripts/mockups/photo_assets.py <web/public/mockups>  (원본 bag2.png·menu2.png·phone2.png가 있는 폴더에서)

11/6 시안 사진 원본(Figma '로고체 디자인'에서 gpt-image-2.5로 생성, 1792×768)을 웹용 webp로 바꾸고,
포장 라벨 칠할 곳 지도(회색 = 라벨 밝기 ÷ 라벨 가운데 밝기 × 128, 투명도 = 라벨)와 필름 입자 타일(grain.png)을 만든다.
라벨 마스크는 photo_quads.py가 쓴 /tmp/dbg_bag2-mask.png를 쓴다.
"""
import sys, numpy as np, cv2
from PIL import Image, ImageFilter
out = sys.argv[1]
# 사진을 webp로
for src, dst in [("bag2.png","pack-bag.webp"),("menu2.png","menu-stand.webp"),("phone2.png","sns-phone.webp")]:
    Image.open(src).convert("RGB").save(f"{out}/{dst}", "WEBP", quality=86, method=6)
# 포장 라벨 칠할 곳 지도: 회색 = 라벨 밝기 ÷ 라벨 가운데 밝기 × 128, 투명도 = 라벨 마스크
im = np.asarray(Image.open("bag2.png").convert("RGB")).astype(np.float32)
lum = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
m = cv2.imread("/tmp/dbg_bag2-mask.png", 0).astype(np.float32) / 255
m = cv2.erode(m, np.ones((3,3),np.uint8))
m = cv2.GaussianBlur(m, (0,0), 0.9)
ref = np.median(lum[m > 0.9])
grey = np.where(m > 0, np.clip(lum / ref * 128, 0, 255), 0)
la = np.dstack([grey, m * 255]).astype(np.uint8)
Image.fromarray(la, "LA").save(f"{out}/pack-bag-map.png", optimize=True)
print("label ref lum", ref)
# 그레인 타일(흑백 128 근처, soft-light로 얹는다)
rng = np.random.default_rng(7)
n = rng.normal(128, 26, (256,256)).clip(0,255).astype(np.uint8)
Image.fromarray(n, "L").filter(ImageFilter.GaussianBlur(0.45)).save(f"{out}/grain.png", optimize=True)
