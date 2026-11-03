"""글자별 조정(Tweak)이 외곽선에 올바른 순서로 걸리는지 확인한다. 실행: engine/.venv/bin/python tests/test_tweak.py"""

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logoche_engine import drawn  # noqa: E402
from logoche_engine.contour import Axes, Tweak  # noqa: E402
from logoche_engine.layout import get_layout  # noqa: E402
from logoche_engine.contour import svg_path  # noqa: E402


def square_mask() -> np.ndarray:
    m = np.zeros((drawn.SIDE, drawn.SIDE), bool)
    c = drawn.SIDE // 2
    m[c - 120 : c + 120, c - 120 : c + 120] = True  # 몸통 한가운데 큰 네모
    return m


def bounds(path) -> tuple[float, float, float, float]:
    b = path.bounds
    return b


def run(tweak, axes=None):
    axes = axes or Axes(weight=400, drawn_weight=400)
    adv = get_layout().advance
    return drawn.outline(square_mask(), axes, adv, drawn.weight_offset(axes), None, tweak)


def check(name, ok, detail=""):
    print(("통과" if ok else "실패"), name, detail)
    if not ok:
        raise SystemExit(1)


base, adv0 = run(None)
zero, adv1 = run(Tweak())
check("조정 없음은 원래와 같다", svg_path(base)[0] == svg_path(zero)[0] and adv0 == adv1)

x0, y0, x1, y1 = base.bounds
half, advh = run(Tweak(scale=50))
hx0, hy0, hx1, hy1 = half.bounds
cx, cy = get_layout().advance / 2, 380
check("크기 50%는 (advance/2, 380)을 축으로 줄어든다", abs((hx1 - hx0) - (x1 - x0) / 2) < 3 and abs((hx0 + hx1) / 2 - (cx + ((x0 + x1) / 2 - cx) / 2)) < 3 and abs((hy0 + hy1) / 2 - (cy + ((y0 + y1) / 2 - cy) / 2)) < 3)
check("크기를 바꿔도 글자 폭은 그대로다", advh == adv0)

moved, advm = run(Tweak(tx=40, ty=-30))
check("이동은 그만큼 옮긴다", abs(moved.bounds[0] - x0 - 40) < 2 and abs(moved.bounds[1] - y0 + 30) < 2)

wide, advw = run(Tweak(width=150))
check("가로 150%는 가로만 넓히고 글자 폭은 그대로다", abs((wide.bounds[2] - wide.bounds[0]) - 1.5 * (x1 - x0)) < 3 and abs((wide.bounds[3] - wide.bounds[1]) - (y1 - y0)) < 3 and advw == adv0)

slanted, _ = run(Tweak(slant=12))
check("기울기 증감은 위쪽을 오른쪽으로 민다", slanted.bounds[2] > x1 + 5)

bold, _ = run(Tweak(pull=100))
check("굵기 증감은 윤곽을 키운다", (bold.bounds[2] - bold.bounds[0]) > (x1 - x0) + 2)
# 그린 굵기를 모르는 옛 프로젝트에서도 굵기 조정이 먹는다
legacy, _ = run(Tweak(pull=100), Axes(weight=400, drawn_weight=None))
check("그린 굵기 없이도 굵기 조정이 먹는다", (legacy.bounds[2] - legacy.bounds[0]) > (x1 - x0) + 2)
print("모두 통과")

# 표의 '*'(전체) 조정은 따로 조정이 없는 글자에 걸리고, 글자별 조정은 그것을 덮어쓴다(더하지 않는다).
from logoche_engine.contour import ALL_GLYPHS  # noqa: E402
from logoche_engine.preview import render_preview  # noqa: E402

square = {"가": square_mask(), "나": square_mask()}
out = render_preview(square, Axes(weight=400, drawn_weight=400), "가나", None, {ALL_GLYPHS: Tweak(tx=80), "나": Tweak(tx=20)})
paths = {g["char"]: g["path"] for g in out["glyphs"]}
plain = render_preview(square, Axes(weight=400, drawn_weight=400), "가나")
plain_paths = {g["char"]: g["path"] for g in plain["glyphs"]}
check("'*'는 조정 없는 글자에 걸린다", paths["가"] != plain_paths["가"])
check("글자별 조정은 '*'를 덮어쓴다", paths["나"] != paths["가"] and paths["나"] != plain_paths["나"])
print("전체 조정 통과")
