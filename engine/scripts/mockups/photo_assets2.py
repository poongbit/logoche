"""사용: python -I scripts/mockups/photo_assets2.py <web/public/mockups> <JSON: [{src,name,kind:label|screen,quad}]>
사진 후보별 웹 자산: webp, 라벨 칠할 곳 지도(bag), 화면 앞 가림(phone: 손가락·노치·테두리)."""
import sys, json, numpy as np, cv2
from PIL import Image
out = sys.argv[1]
spec = json.loads(sys.argv[2])  # [{src, name, kind, quad}]
for s in spec:
    rgb = np.asarray(Image.open(s["src"]).convert("RGB"))
    Image.fromarray(rgb).save(f"{out}/{s['name']}.webp", "WEBP", quality=86, method=6)
    H, W, _ = rgb.shape
    q = np.array(s["quad"], np.float32)
    poly = np.zeros((H, W), np.uint8); cv2.fillPoly(poly, [q.round().astype(np.int32)], 255)
    f = rgb.astype(np.float32); lum = f @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    if s["kind"] == "label":
        m = cv2.erode(poly, np.ones((3, 3), np.uint8)).astype(np.float32) / 255
        m = cv2.GaussianBlur(m, (0, 0), 0.9)
        ref = np.median(lum[m > 0.9])
        grey = np.where(m > 0, np.clip(lum / ref * 128, 0, 255), 0)
        Image.fromarray(np.dstack([grey, m * 255]).astype(np.uint8), "LA").save(f"{out}/{s['name']}-map.png", optimize=True)
        print(s["name"], "label ref", round(float(ref), 1))
    else:
        # 화면 앞 가림: 화면 사변형을 조금 넓힌 곳 안에서 '흰 화면'이 아닌 화소(손가락·노치·테두리 모서리)
        grown = cv2.dilate(poly, np.ones((9, 9), np.uint8))
        white = (lum > 228) & (hsv[..., 1] < 25)
        white = cv2.morphologyEx(white.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        occ = ((grown > 0) & (white == 0)).astype(np.uint8) * 255
        occ = cv2.GaussianBlur(occ, (0, 0), 0.7)
        # 흰 화면 가장자리 안쪽 1px까지 부드럽게 겹치게
        rgba = np.dstack([rgb, occ])
        ys, xs = np.where(grown > 0)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        Image.fromarray(rgba[y0:y1, x0:x1], "RGBA").save(f"{out}/{s['name']}-front.png", optimize=True)
        print(s["name"], "front box", [int(x0), int(y0), int(x1 - x0), int(y1 - y0)])
