"""무료 폰트 도감 초안: 뼈대 닮음으로 구조 묶음을 만들고, 폰트마다 특성 점수를 낸다. 비용 없음."""
import sys, json
from pathlib import Path
import numpy as np, cv2
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from logoche_engine import checks
from logoche_engine.checks import _shape_set, shape_similarity, _render, _ridge

FREE = Path(__file__).resolve().parents[1] / "compare" / "free"
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
files = sorted(p for d in (FREE, FREE.parent / "nanum-hand") for p in d.iterdir() if p.suffix.lower() in (".ttf", ".otf"))
# 같은 가족의 굵기 변형은 대표 하나만(Regular 우선) — 구조는 같다
def family(p):
    n = p.stem
    for t in ("-Regular", "-Bold", "-Medium", "[wght]", " Light", " Bold", " Regular", " OTF B", " OTF R", " TTF Bold", " TTF Light", " TTF Regular", " TTF ExtraBold", "TTFBold", "TTFMedium", " OTF"):
        n = n.replace(t, "")
    return n.strip()
fam = {}
for p in files:
    k = family(p)
    pri = 0 if "Regular" in p.stem or p.stem == k else (1 if "Medium" in p.stem or "Light" in p.stem else 2)
    if k not in fam or pri < fam[k][0]:
        fam[k] = (pri, p)
fonts = {k: v[1] for k, v in fam.items() if k not in ("AstaSans", "BlackAndWhitePicture", "GrandifloraOne", "MoiraiOne", "NanumGothicCoding", "Diphylleia", "Orbit")}  # 한글 없음/코딩체 제외는 아래 coverage로 다시 거름
print(len(fonts), "families")

KS = "가각간갇갈감갑값갓강같개객걸검겁것게겨격견결겸경계고곡곤골곰공과관광괴교구국군굴굿궁권귀규균그극근글금급기긴길김깊까깨꼬꽃꿈나낙난날남낮내냉너넓네노녹논놀농높눈뉴느는늘능늦다단달담답당대더덕도독돈돌동돼두둘뒤드든듣들등디따때떠또뜨라락란랑래랜러럭런럼렇레려력련렬로록론롤료루류르른를리린림립마막만많말맑맛망맞매머먹먼멀메며면명모목몬몸못무문물미민밀바박반받발밝밤밥방배백버번벌범법벗베벽변별병보복본볼봄부북분불비빈빛빠뿌사산살삶상새색생서석선설섬성세셔소속손솔수숙순술숲쉬스슬습승시식신실심십싸쌀써쓰씨아악안않알암앞애야약양어언얼엄업없에여역연열영예오온올옷와완왕외왼요용우운울움워원월위유육은을음의이익인일임입있자작잔잠장재저적전절점정제조족존종좋죄주죽준중즐증지직진질집짓짧차착찬참창찾채책처천철첫청체초촌총최추축출충취치친칠침카캐커컴코쿠크큰키타탈태택터토통투트특틀티파판팔패펴편평포폭표푸풍프피필하학한할함합항해행향허헌현형호혼홀화확환활황회획효후훈휴흐흑흰희히힘"
FEATURE_SET = KS[:120]

def coverage(p):
    cmap = TTFont(p, lazy=True).getBestCmap()
    return sum(ord(c) in cmap for c in KS) / len(KS)

rows = {}
for k, p in list(fonts.items()):
    cov = coverage(p)
    try:
        _render(p, "가", 96); _render(p, "힣", 96)
    except Exception as e:
        print("제외(렌더 실패)", k, str(e)[:40]); fonts.pop(k); continue
    if cov < 0.9:
        print("제외(한글 부족)", k, round(cov, 2)); fonts.pop(k); continue
    rows[k] = {"file": p.name, "coverage": round(cov, 3)}

names = list(fonts)
sets = {k: _shape_set(fonts[k], fonts[k].stat().st_mtime) for k in names}
n = len(names)
S = np.zeros((n, n))
for i in range(n):
    for j in range(n):
        S[i, j] = 1.0 if i == j else (shape_similarity(sets[names[i]], sets[names[j]]) + shape_similarity(sets[names[j]], sets[names[i]])) / 2
D = 1 - S
def average_linkage(D, t):
    """평균 연결 군집화: 묶음이 t개가 될 때까지 평균 거리가 가까운 쪽부터 합친다."""
    cl = [[i] for i in range(len(D))]
    while len(cl) > t:
        best = (9, None, None)
        for a in range(len(cl)):
            for b in range(a + 1, len(cl)):
                dd = np.mean([D[i, j] for i in cl[a] for j in cl[b]])
                if dd < best[0]: best = (dd, a, b)
        _, a, b = best
        cl[a] = cl[a] + cl[b]; del cl[b]
    lab = np.zeros(len(D), int)
    for gi, c in enumerate(cl): lab[c] = gi + 1
    return lab
def kmedoids(D, k, seed=0, iters=50):
    """k-medoids: 서로 가까운 것끼리 비슷한 크기로 묶는다. 평균 연결은 큰 덩어리 하나로 몰려서 바꿨다."""
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(20):
        med = list(rng.choice(len(D), k, replace=False))
        for _ in range(iters):
            lab = np.argmin(D[:, med], axis=1)
            new = [int(np.argmin(D[np.ix_(np.where(lab == c)[0], np.where(lab == c)[0])].sum(1)) and np.where(lab == c)[0][np.argmin(D[np.ix_(np.where(lab == c)[0], np.where(lab == c)[0])].sum(1))]) if (lab == c).any() else med[c] for c in range(k)]
            if new == med: break
            med = new
        cost = D[np.arange(len(D)), [med[l] for l in np.argmin(D[:, med], axis=1)]].sum()
        if best is None or cost < best[0]: best = (cost, med)
    return np.argmin(D[:, best[1]], axis=1) + 1
labels = kmedoids(D, 14)
print("clusters", len(set(labels)))

# 특성: 굵기·굵기 변화·획 밀도·고딕과의 거리(느슨함)·원형도
def feats(p):
    cmap = TTFont(p, lazy=True).getBestCmap()
    th, cv, ink, hv = [], [], [], []
    for ch in FEATURE_SET[:60]:
        if ord(ch) not in cmap: continue
        img = _render(p, ch, 96)
        m = img > 127
        if m.sum() < 30: continue
        dist = cv2.distanceTransform(np.pad(m, 1).astype(np.uint8), cv2.DIST_L2, 5)[1:-1, 1:-1]
        r = _ridge(m)
        if r.sum() < 5: continue
        d = dist[r]
        th.append(2 * d.mean()); cv.append(d.std() / d.mean()); ink.append(m.sum() / (np.ptp(np.nonzero(m)[0]) + 1) / (np.ptp(np.nonzero(m)[1]) + 1))
        # 가로 획 vs 세로 획 두께 비(명조 대비)
        ys, xs = np.nonzero(r)
        gx = cv2.Sobel(dist.astype(np.float32), cv2.CV_32F, 1, 0); gy = cv2.Sobel(dist.astype(np.float32), cv2.CV_32F, 0, 1)
    return float(np.mean(th)), float(np.mean(cv)), float(np.mean(ink))

def contrast(p):
    """가로획 두께 / 세로획 두께: 'ㅡ'와 'ㅣ'에서 잰다."""
    cmap = TTFont(p, lazy=True).getBestCmap()
    out = []
    for ch in "으이":
        if ord(ch) not in cmap: return None
    def run_len(mask, axis):
        ls = []
        arr = mask if axis == 0 else mask.T
        for line in arr:
            c = 0
            for v in line:
                if v: c += 1
                elif c: ls.append(c); c = 0
            if c: ls.append(c)
        return np.median(ls) if ls else 0
    m = _render(p, "ㅣ", 96) > 127 if ord("ㅣ") in cmap else None
    h = _render(p, "ㅡ", 96) > 127 if ord("ㅡ") in cmap else None
    if m is None or h is None: return None
    v_w = run_len(m, 0); h_w = run_len(h, 1)
    return h_w / v_w if v_w else None

base_name = "Pretendard" if "Pretendard" in names else names[0]
for i, k in enumerate(names):
    w, c, d = feats(fonts[k])
    rows[k].update(cluster=int(labels[i]), weight=round(w, 2), widthvar=round(c, 3), density=round(d, 3),
                   contrast=(round(contrast(fonts[k]), 2) if contrast(fonts[k]) else None),
                   loose=round(1 - S[i, names.index(base_name)], 3))
(OUT / "catalog.json").write_text(json.dumps({"base": base_name, "fonts": rows, "names": names, "sim": S.round(3).tolist()}, ensure_ascii=False, indent=1))

# 시트: 묶음별로 샘플 글자
SAMPLE = "가나다한글바다식당"
groups = {}
for k in names: groups.setdefault(rows[k]["cluster"], []).append(k)
order = sorted(groups, key=lambda g: -len(groups[g]))
W = 150; H = 110
sheet_rows = []
for g in order:
    for k in sorted(groups[g]): sheet_rows.append((g, k))
img = Image.new("RGB", (230 + W * len(SAMPLE) * 0 + 9 * 70 + 20, 40 + H * 0 + 78 * len(sheet_rows)), "white")
d = ImageDraw.Draw(img)
label = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 15)
y = 10
last = None
for g, k in sheet_rows:
    if g != last:
        d.rectangle([0, y, img.width, y + 22], fill=(235, 230, 220)); d.text((8, y + 3), f"묶음 {g}  ({len(groups[g])}개)", font=label, fill="black"); y += 26; last = g
    d.text((8, y + 20), k[:22], font=label, fill="black")
    f = ImageFont.truetype(str(fonts[k]), 52)
    for ci, ch in enumerate(SAMPLE):
        try: d.text((230 + ci * 70, y), ch, font=f, fill="black")
        except Exception: pass
    y += 70
img = img.crop((0, 0, img.width, y + 10))
img.save(OUT / "catalog-sheet.png")
print("done", img.size)
