"""구조 섞기 시험(11/5, AI 호출 없음): 두 폰트의 글자 모양을 거리장으로 섞어 뼈대를 만들면 구조 다양성이 얼마나 늘고 글자가 깨지는지 잰다.
팔: single(폰트 1개+휘기) / blend(아무 폰트와 섞기+휘기) / blend-far(다른 묶음 폰트와 섞기+휘기). 프로젝트 N개의 뼈대끼리 닮음 분포와 풀·무료 폰트와의 최대 닮음을 본다.
실행: .venv/bin/python scripts/blend_proto.py <출력폴더> [N]"""
import sys, json, hashlib, itertools
from pathlib import Path
import numpy as np, cv2
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from logoche_engine import checks
from logoche_engine.checks import _render, skeleton, _shape_entry, shape_similarity, _shape_set

ROOT = Path(__file__).resolve().parents[1] / "compare"
POOL = json.loads((ROOT / "guide_pool.json").read_text())
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
N = int(sys.argv[2]) if len(sys.argv) > 2 else 60
CHARS = "가나다한글바다식당밥면국꽃흙왕원귀예내고무의쥐람것있빵챗없는"[:30]
S = 96

def font_path(e):
    for d in (e["dir"], "free", "nanum-hand", "maru"):
        for p in (ROOT / d).glob("*"):
            if p.stem == e["stem"]: return p
    raise FileNotFoundError(e["stem"])
FONTS = [(e, font_path(e)) for e in POOL]

def glyph_mask(path, ch):
    """글자를 S×S 칸 가운데에 가득(긴 변 기준) 맞춘 잉크 마스크. 글자 없으면 None."""
    if ord(ch) not in TTFont(path, lazy=True).getBestCmap(): return None
    m = _render(path, ch, S) > 127
    ys, xs = np.nonzero(m)
    if len(xs) == 0: return None
    crop = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255
    k = (S - 8) / max(crop.shape)
    crop = cv2.resize(crop, (max(1, round(crop.shape[1] * k)), max(1, round(crop.shape[0] * k))), interpolation=cv2.INTER_AREA)
    out = np.zeros((S, S), np.uint8)
    oy, ox = (S - crop.shape[0]) // 2, (S - crop.shape[1]) // 2
    out[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    return out > 127

def widen(m, width=15):
    """뼈대를 뽑아 모두 같은 넓은 굵기로 다시 칠한다. 가는 획끼리 어긋나도 섞을 때 끊기지 않게 한다."""
    from logoche_engine import raster
    sk = raster.thin(m).astype(np.uint8)
    return cv2.dilate(sk, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (width, width))) > 0

def sdf(m):
    a = cv2.distanceTransform(m.astype(np.uint8), cv2.DIST_L2, 5)
    b = cv2.distanceTransform((~m).astype(np.uint8), cv2.DIST_L2, 5)
    return a - b

def blend(ma, mb, t):
    return ((1 - t) * sdf(ma) + t * sdf(mb)) > 0

def pull(ma, mb, t, reach=0.22):
    """A의 모양을 B 뼈대 쪽으로 끌어당긴다. 각 점이 가장 가까운 B 뼈대로 t만큼 간다(reach 안에서만). 변위는 부드럽게 퍼뜨려 A의 획 연결을 유지한다."""
    from logoche_engine import raster
    skb = raster.thin(mb)
    if not skb.any(): return ma
    inv = (~skb).astype(np.uint8)
    dist, lab = cv2.distanceTransformWithLabels(inv, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(skb)
    # 라벨 번호는 0 거리 픽셀(뼈대)을 1..n 순으로 매긴다(행 우선)
    order = np.lexsort((xs, ys))
    py, px = ys[order], xs[order]
    gy, gx = np.mgrid[0:S, 0:S]
    ly = py[np.clip(lab - 1, 0, len(py) - 1)]; lx = px[np.clip(lab - 1, 0, len(px) - 1)]
    dy, dx = (ly - gy).astype(np.float32), (lx - gx).astype(np.float32)
    far = dist > S * reach
    dy[far] = 0; dx[far] = 0
    fy = cv2.GaussianBlur(t * dy, (0, 0), 5); fx = cv2.GaussianBlur(t * dx, (0, 0), 5)
    return cv2.remap(ma.astype(np.uint8) * 255, (gx - fx).astype(np.float32), (gy - fy).astype(np.float32), cv2.INTER_LINEAR, borderValue=0) > 127

def warp(mask, seed, amt):
    rng = np.random.default_rng(int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16))
    sigma, amp = S * 0.12, amt * S * 0.06
    f = []
    for _ in range(2):
        g = cv2.GaussianBlur(rng.uniform(-1, 1, (S, S)).astype(np.float32), (0, 0), sigma)
        f.append(g / max(1e-6, float(np.abs(g).max())) * amp)
    gx, gy = np.meshgrid(np.arange(S, dtype=np.float32), np.arange(S, dtype=np.float32))
    return cv2.remap(mask.astype(np.uint8) * 255, gx + f[0], gy + f[1], cv2.INTER_LINEAR, borderValue=0)

def components(m):
    return cv2.connectedComponents(m.astype(np.uint8))[0] - 1

def make_project(i, arm):
    rng = np.random.default_rng(1000 + i)
    a = int(rng.integers(len(FONTS)))
    cand = [j for j in range(len(FONTS)) if j != a and (not arm.endswith("far") or POOL[j]["cluster"] != POOL[a]["cluster"])]
    b = int(rng.choice(cand)) if arm != "single" else None
    t = float(rng.uniform(0.3, 0.7)) if arm != "single" else 0.0
    skel, info, broken = {}, {"a": POOL[a]["stem"], "b": POOL[b]["stem"] if b is not None else None, "t": round(t, 2)}, 0
    for ch in CHARS:
        ma = glyph_mask(FONTS[a][1], ch)
        if ma is None: continue
        if arm == "single":
            m = ma
        else:
            mb = glyph_mask(FONTS[b][1], ch)
            if mb is None: continue
            m = pull(ma, mb, t * 1.4) if arm.startswith("pull") else blend(widen(ma), widen(mb), t)
            if components(m) > max(components(ma), components(mb)) + 1: broken += 1
        img = warp(m, f"p{i}{ch}", 0.6)
        sk = skeleton(img)
        if sk is not None: skel[ch] = _shape_entry(sk)
    info["broken"] = broken
    return skel, info, (a, b, t)

arms = ["single", "pull", "pull-far", "blend"]
res, infos, projs = {}, {}, {}
for arm in arms:
    res[arm], infos[arm], projs[arm] = zip(*[make_project(i, arm) for i in range(N)])
    print(arm, "만듦", flush=True)

pool_sets = [_shape_set(p, p.stat().st_mtime, CHARS) for _, p in FONTS]
free = [p for p in sorted((ROOT / "free").glob("*")) if p.suffix.lower() in (".ttf", ".otf")]
free_sets = [_shape_set(p, p.stat().st_mtime, CHARS) for p in free]
allsets = pool_sets + free_sets

stats = {}
for arm in arms:
    sets = res[arm]
    sims = [shape_similarity(sets[i], sets[j]) for i, j in itertools.combinations(range(N), 2)]
    own = [max(shape_similarity(s, f) for f in allsets) for s in sets]
    brk = [x["broken"] for x in infos[arm]]
    stats[arm] = dict(pair_mean=float(np.mean(sims)), pair_p90=float(np.percentile(sims, 90)), pair_gt70=float(np.mean(np.array(sims) > 0.7)),
                      own_mean=float(np.mean(own)), own_gt85=float(np.mean(np.array(own) > 0.85)), own_gt75=float(np.mean(np.array(own) > 0.75)),
                      broken_mean=float(np.mean(brk)), chars=float(np.mean([len(s) for s in sets])))
    print(arm, {k: round(v, 3) for k, v in stats[arm].items()})
(OUT / "blend-stats.json").write_text(json.dumps({"N": N, "stats": stats}, ensure_ascii=False, indent=1))

# 눈으로 보는 시트: 팔마다 프로젝트 6개 × 글자 10개
lab = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 14)
show = "가한글바다식당꽃원"
cell = 72
sheet = Image.new("RGB", (len(show) * cell + 250, len(arms) * 6 * (cell + 6) + 20), "white"); d = ImageDraw.Draw(sheet); y = 4
for arm in arms:
    for i in range(6):
        inf = infos[arm][i]
        d.text((4, y + 20), f"{arm[:9]} {inf['a'][:10]}" + (f" × {inf['b'][:10]} {inf['t']}" if inf["b"] else ""), font=lab, fill="black")
        a, b, t = projs[arm][i]
        for ci, ch in enumerate(show):
            ma = glyph_mask(FONTS[a][1], ch)
            if ma is None: continue
            mb = glyph_mask(FONTS[b][1], ch) if b is not None else None
            m = ma if mb is None else (pull(ma, mb, t * 1.4) if arm.startswith('pull') else blend(widen(ma), widen(mb), t))
            im = warp(m, f"p{i}{ch}", 0.6)
            from logoche_engine import raster
            line = cv2.dilate(raster.thin(im > 127).astype(np.uint8) * 255, np.ones((2, 2), np.uint8))  # 구조 참고로 가는 뼈대 선
            sheet.paste(Image.fromarray(255 - cv2.resize(line, (cell, cell), interpolation=cv2.INTER_AREA)).convert("RGB"), (250 + ci * cell, y))
        y += cell + 6
    d.line([(0, y - 2), (sheet.width, y - 2)], fill=(200, 0, 0), width=2)
sheet.save(OUT / "blend-sheet.png")
print("done")
