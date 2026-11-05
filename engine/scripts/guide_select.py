"""구조 참고 폰트 선택 규칙(A안) 시험: 입력 조합 → 점수 → 상위 5개. AI 호출 없음."""
import json, itertools, collections, random
from pathlib import Path

POOL = json.loads((Path(__file__).resolve().parents[1] / "compare" / "guide_pool.json").read_text())
SHORT = lambda s: s.replace("-Regular", "").replace("Nanum", "")

# 분위기 → (가산 태그, 가산 굵기/느슨함 조건, 감점 조건)
def tone_score(f, tone):
    t, w, l, c = set(f["tones"]), f["weight"], f["loose"], f["cluster"]
    s = 0.0
    P = lambda *tags: sum(1.0 for x in tags if x in t)
    if tone == "cute":
        s += P("귀여운", "장난스러운", "친근한") + (0.5 if l in ("느슨", "구조다름") else 0) - (1 if l == "정형" and w != "굵은" else 0)
    elif tone == "warm":
        s += P("따뜻한", "친근한", "편안한", "감성") - (1 if f["stem"].startswith("BlackHan") else 0)
    elif tone == "playful":
        s += P("장난스러운", "개성있는") + (0.5 if l in ("느슨", "구조다름") else 0) - (1 if l == "정형" else 0)
    elif tone == "premium":
        s += P("우아한", "고급스러운", "섬세한") + (0.5 if w == "가는" else 0) - (1 if w == "굵은" else 0) - (1 if l in ("느슨", "매우느슨") else 0)
    elif tone == "trustworthy":
        s += P("신뢰", "단정") + (0.5 if l in ("정형", "보통") else 0) - (1 if l == "매우느슨" else 0)
    elif tone == "traditional":
        s += P("전통적인", "빈티지") - (1 if "현대적" in t else 0)
    elif tone == "modern":
        s += P("현대적") + (0.5 if l in ("정형", "보통") else 0) - (1 if "장식적" in t else 0)
    elif tone == "natural":
        s += P("편안한", "따뜻한", "친근한") + (0.5 if l == "보통" else 0) - (1 if w == "굵은" and l == "정형" else 0)
    elif tone == "retro":
        s += P("빈티지", "장식적", "감성") - (1 if "현대적" in t else 0)
    elif tone == "hip":
        s += P("개성있는", "트렌디") + (0.5 if l == "구조다름" else 0) - (1 if f["stem"].startswith("Pretendard") else 0)
    elif tone == "bold":
        s += P("힘있는", "강렬한") + (1 if w == "굵은" else 0) - (1 if w == "가는" else 0)
    elif tone == "calm":
        s += P("단정", "섬세한", "편안한") + (0.5 if w == "가는" else 0) - (1 if w == "굵은" else 0) - (1 if l == "매우느슨" else 0)
    return s

def usage_adjust(f, use):
    """None이면 제외."""
    r, w = f["read"], f["weight"]
    s = 0.0
    if use == "signage_menu":
        if r < 3: return None
        s += 0.5 if w != "가는" else 0
    elif use == "sns_thumbnail":
        if r < 2: return None
        s += 0.5 if w == "굵은" or "개성있는" in f["tones"] else 0
    elif use == "packaging_sticker":
        if r < 2: return None
        s += 0.5 if w == "굵은" else 0
    elif use == "print_card":
        if r < 3: return None
        s += 0.5 if w == "가는" or "단정" in f["tones"] else 0
    elif use == "web_app":
        if r < 3: return None
        s += 0.5 if f["loose"] in ("정형", "보통") else 0
    return s

def hand_adjust(f, hand):
    brush = "붓맛" in " ".join(f["tones"])
    if hand == "neat":
        if brush: return None
        return {"정형": 1, "보통": 0.5, "구조다름": 0, "느슨": -0.5, "매우느슨": -1}[f["loose"]]
    if hand == "brush":
        return {"정형": -1, "보통": 0, "구조다름": 0, "느슨": 1, "매우느슨": 1}[f["loose"]] + (0.5 if brush else 0)
    return 0.0 if not brush else None  # 손맛 미선택이면 붓 폰트 제외

def rank(tones, uses, hand=None, usage_count=None, k=5):
    out = []
    for f in POOL:
        s = sum(tone_score(f, t) for t in tones)
        us = [usage_adjust(f, u) for u in uses]
        if any(u is None for u in us): continue
        s += sum(us)
        h = hand_adjust(f, hand)
        if h is None: continue
        s += h
        out.append([s, f])
    out.sort(key=lambda x: -x[0])
    # 다양성: 한 묶음에서 2개까지
    seen = collections.Counter(); top = []
    for s, f in out:
        if seen[f["cluster"]] >= 2: continue
        seen[f["cluster"]] += 1; top.append((s, f))
        if len(top) == k: break
    return top

def pick(top, seed, usage_count=None):
    """상위 5개에서 적합도 가중(C안: 묶음 사용이 많으면 가중치 낮춤)으로 시드 랜덤 선택."""
    rng = random.Random(seed)
    mean = (sum(usage_count.values()) / max(1, len(usage_count))) if usage_count else 0
    ws = []
    for s, f in top:
        fit = max(0.1, s - min(x[0] for x in top) + 0.5)
        pen = 1 + (usage_count.get(f["cluster"], 0) / mean if mean else 0)
        ws.append(fit / pen)
    return rng.choices(top, weights=ws)[0][1]

if __name__ == "__main__":
    combos = [
        (["cute"], ["sns_thumbnail"], "brush"), (["cute", "playful"], ["packaging_sticker"], None),
        (["premium"], ["print_card"], "neat"), (["premium", "calm"], ["signage_menu"], None),
        (["trustworthy", "modern"], ["web_app"], "neat"), (["traditional"], ["signage_menu"], None),
        (["warm", "natural"], ["signage_menu", "packaging_sticker"], None), (["hip", "bold"], ["sns_thumbnail"], None),
        (["retro"], ["packaging_sticker"], "brush"), (["calm"], ["print_card"], "neat"),
    ]
    print("== 조합별 상위 5 ==")
    for tones, uses, hand in combos:
        top = rank(tones, uses, hand)
        print(f"{'+'.join(tones)} / {'+'.join(uses)} / {hand or '-'}\n   " + " > ".join(f"{SHORT(f['stem'])}[{f['cluster']}]({s:.1f})" for s, f in top))
    # 전체 입력 공간에서 폰트별 선택 분포(랜덤 입력 3000건)
    rng = random.Random(1)
    tones_all = ["cute","warm","playful","premium","trustworthy","traditional","modern","natural","retro","hip","bold","calm"]
    uses_all = ["signage_menu","sns_thumbnail","packaging_sticker","print_card","web_app"]
    cnt = collections.Counter(); cl = collections.Counter(); empty = 0
    usage = collections.Counter()
    for i in range(3000):
        tones = rng.sample(tones_all, rng.randint(1, 3)); uses = rng.sample(uses_all, rng.randint(1, 2)); hand = rng.choice([None, "neat", "brush"])
        top = rank(tones, uses, hand)
        if not top: empty += 1; continue
        f = pick(top, i, usage)
        cnt[f["stem"]] += 1; cl[f["cluster"]] += 1; usage[f["cluster"]] += 1
    n = sum(cnt.values())
    print(f"\n== 무작위 입력 3000건: 후보 없음 {empty}건 ==")
    for k_, v in cnt.most_common(): print(f"  {SHORT(k_):28s} {v/n*100:5.1f}%")
    print("  안 뽑힌 폰트:", [SHORT(f["stem"]) for f in POOL if f["stem"] not in cnt])
    print("  묶음 비중:", {c: round(v / n * 100, 1) for c, v in sorted(cl.items())})
