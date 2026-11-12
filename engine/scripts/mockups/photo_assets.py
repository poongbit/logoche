"""사용: python -I scripts/mockups/photo_assets.py <web/public/mockups> '<JSON>'

시안 사진 원본(PNG)에서 웹 자산을 만든다(11/6). JSON은 [{"src": 원본, "name": 내보낼 이름, "kind": "label"|"screen", "quad": 네 꼭짓점}, ...].
꼭짓점(왼위·오른위·오른아래·왼아래)은 photo_quads.py로 찾고 web/components/Mockups.tsx의 face에도 같은 값을 넣는다.
  - 모두: <name>.webp
  - label(포장 라벨): <name>-map.png 칠할 곳 지도. 회색 = 라벨 밝기 ÷ 라벨 가운데 밝기 × 128, 투명도 = 라벨
  - screen(휴대폰 화면): <name>-front.png 화면 앞 조각. 화면 사변형을 조금 넓힌 곳 안의 '흰 화면이 아닌' 화소(노치·테두리·손가락).
    출력의 front 상자(x, y, w, h)를 Mockups.tsx의 Photo.front에 넣는다
  - 늘: grain.png 필름 입자 타일(soft-light로 무대 전체에 얹는다)

11/6 밤 값(원본은 새 피그마 파일 '로고체 시안 사진 생성'의 생성 이미지 1:3 · 1:4 · 1:6):
  menu-wall   plain  [[1152.0,77.2],[1542.0,27.1],[1542.0,640.0],[1152.0,613.4]]  (액자 안쪽: 검은 테 안을 채워 찾음)
  pack-street label  [[326.9,353.1],[656.2,315.6],[693.1,511.0],[362.5,567.4]]
  sns-flat    screen [[1058.3,119.3],[1318.9,24.6],[1515.2,589.4],[1260.8,678.6]]
"""
import sys, json, numpy as np, cv2
from PIL import Image, ImageFilter

out = sys.argv[1]
spec = json.loads(sys.argv[2])
for s in spec:
    rgb = np.asarray(Image.open(s["src"]).convert("RGB"))
    Image.fromarray(rgb).save(f"{out}/{s['name']}.webp", "WEBP", quality=86, method=6)
    if s.get("kind") not in ("label", "screen"):
        continue
    H, W, _ = rgb.shape
    q = np.array(s["quad"], np.float32)
    poly = np.zeros((H, W), np.uint8)
    cv2.fillPoly(poly, [q.round().astype(np.int32)], 255)
    lum = rgb.astype(np.float32) @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    if s["kind"] == "label":
        m = cv2.erode(poly, np.ones((3, 3), np.uint8)).astype(np.float32) / 255
        m = cv2.GaussianBlur(m, (0, 0), 0.9)
        ref = np.median(lum[m > 0.9])
        grey = np.where(m > 0, np.clip(lum / ref * 128, 0, 255), 0)
        Image.fromarray(np.dstack([grey, m * 255]).astype(np.uint8), "LA").save(f"{out}/{s['name']}-map.png", optimize=True)
        print(s["name"], "label ref", round(float(ref), 1))
    else:
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        grown = cv2.dilate(poly, np.ones((9, 9), np.uint8))
        white = ((lum > 228) & (hsv[..., 1] < 25)).astype(np.uint8) * 255
        white = cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        occ = cv2.GaussianBlur(((grown > 0) & (white == 0)).astype(np.uint8) * 255, (0, 0), 0.7)
        rgba = np.dstack([rgb, occ])
        rgba[occ == 0, :3] = 0  # 투명한 곳은 검정으로 비워 파일을 줄인다
        ys, xs = np.where(occ > 0)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        Image.fromarray(rgba[y0:y1, x0:x1], "RGBA").save(f"{out}/{s['name']}-front.png", optimize=True)
        print(s["name"], "front", {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)})

rng = np.random.default_rng(7)
n = rng.normal(128, 26, (256, 256)).clip(0, 255).astype(np.uint8)
Image.fromarray(n, "L").filter(ImageFilter.GaussianBlur(0.45)).save(f"{out}/grain.png", optimize=True)
