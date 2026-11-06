"""'우리 가게' 외곽선 만들기(lib/attributeGlyphs.ts). python3 -I scripts/attribute_glyphs_gen.py <fontsource 풀어 둔 폴더> lib/attributeGlyphs.ts > out.ts
- 글꼴: @fontsource 패키지(npm)의 woff2. 기존 '가' 외곽선과 같은 글꼴·굵기인지 먼저 확인한다.
- 글자를 글꼴 advance대로 한 줄에 놓고, 1em = 100 단위로 줄인 뒤 잉크 상자 왼쪽 위를 (0,0)에 맞춘다(y는 아래로).
"""
import sys, glob, os, re
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen

root, existing = sys.argv[1], sys.argv[2]
TEXT = "우리 가게"

SOURCES = {
    "roundEdge": ("jua", None, "Jua"),
    "sharpEdge": ("bhs", None, "Black Han Sans(검은고딕)"),
    "thin": ("nskr", 200, "Noto Sans KR wght 200"),
    "bold": ("nskr", 800, "Noto Sans KR wght 800"),
    "even": ("nskr", 400, "Noto Sans KR wght 400"),
    "high": ("nserif", 400, "Noto Serif KR wght 400"),
    "neat": ("nskr", 400, "Noto Sans KR wght 400"),
    "brush": ("brush", None, "Nanum Brush Script"),
}

_cache = {}


def font_for(pkg, wght, ch):
    files = sorted(glob.glob(os.path.join(root, pkg, "package/files", "*-normal.woff2")))
    files = [f for f in files if (wght is not None and "-wght-" in f) or (wght is None and "-400-" in f)]
    for f in files:
        key = (f, wght)
        if key not in _cache:
            t = TTFont(f)
            if wght is not None:
                t = instancer.instantiateVariableFont(t, {"wght": wght})
            _cache[key] = t
        t = _cache[key]
        if ord(ch) in t.getBestCmap():
            return t
    raise SystemExit(f"{pkg} {wght}: '{ch}' 없음")


def first_point(pkg, wght, ch):
    t = font_for(pkg, wght, ch)
    p = RecordingPen()
    t.getGlyphSet()[t.getBestCmap()[ord(ch)]].draw(p)
    return p.value[0][1][0]


src = open(existing, encoding="utf-8").read()
for key, (pkg, wght, _) in SOURCES.items():
    m = re.search(key + r': \{ d: "M([-\d.]+) ([-\d.]+)', src)
    want = (float(m.group(1)), float(m.group(2)))
    got = first_point(pkg, wght, "가")
    ok = abs(want[0] - got[0]) < 0.01 and abs(want[1] - got[1]) < 0.01
    print(f"// check {key}: 가 첫 점 {got} vs 기존 {want} {'OK' if ok else 'MISMATCH'}", file=sys.stderr)


def fmt(v):
    s = f"{v:.1f}"
    s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


out = {}
for key, (pkg, wght, label) in SOURCES.items():
    # 한 줄로 놓기
    x = 0.0
    placed = []
    for ch in TEXT:
        t = font_for(pkg, wght, ch if ch != " " else "가")
        upm = t["head"].unitsPerEm
        cmap = t.getBestCmap()
        if ch == " ":
            name = cmap.get(0x20)
            if name is None:
                # 한글 묶음 파일에 빈칸이 없으면 기본 라틴 파일에서 찾는다
                t2 = font_for(pkg, wght, " ")
                adv = t2["hmtx"][t2.getBestCmap()[0x20]][0]
            else:
                adv = t["hmtx"][name][0]
            x += adv * 1000 / upm
            continue
        name = cmap[ord(ch)]
        placed.append((t, name, x, upm))
        x += t["hmtx"][name][0] * 1000 / upm
    # 잉크 상자
    xmin = ymin = 1e9
    xmax = ymax = -1e9
    for t, name, dx, upm in placed:
        gs = t.getGlyphSet()
        bp = BoundsPen(gs)
        s = 1000 / upm
        gs[name].draw(TransformPen(bp, (s, 0, 0, s, dx, 0)))
        if bp.bounds:
            a, b, c, d = bp.bounds
            xmin, ymin, xmax, ymax = min(xmin, a), min(ymin, b), max(xmax, c), max(ymax, d)
    k = 0.1  # 1em(1000) -> 100
    sp = SVGPathPen(None, ntos=fmt)
    for t, name, dx, upm in placed:
        s = 1000 / upm
        gs = t.getGlyphSet()
        # x' = (x*s + dx - xmin) * k, y' = (ymax - y*s) * k
        gs[name].draw(TransformPen(sp, (s * k, 0, 0, -s * k, (dx - xmin) * k, ymax * k)))
    out[key] = (sp.getCommands(), (xmax - xmin) * k, (ymax - ymin) * k, label, ymax * k)

print("// generated")
for key, (d, w, h, label, top) in out.items():
    print(f'  {key}: {{ d: "{d}", w: {w:.1f}, h: {h:.1f} }}, // {label}, 잉크 위 = 기준선 위 {top:.1f}')
