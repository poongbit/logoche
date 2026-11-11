"""초·중·종성 부분 조정(11/11): 부분을 옮기면 그 부분만 움직이고 나머지는 그대로인지. 실행: engine/.venv/bin/python tests/test_parts.py"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logoche_engine import drawn, jamo  # noqa: E402
from logoche_engine.contour import Axes, PartTweak, Tweak  # noqa: E402
from logoche_engine.layout import get_layout  # noqa: E402

SRC = sorted(Path(__file__).resolve().parents[2].glob("web/.data/glyphs/*/rest/bd95.png"))  # 붕


def check(name, ok, detail=""):
    print(("통과" if ok else "실패"), name, detail)
    if not ok:
        raise SystemExit(1)


if not SRC:
    print("건너뜀: 시험용 글자 그림이 없어요")
    raise SystemExit(0)
mask = drawn.decode(np.array(Image.open(SRC[0]).convert("L")))
axes = Axes(weight=400, drawn_weight=400)
adv = get_layout().advance
off = drawn.weight_offset(axes)
gm = drawn.glyph_mask(mask, axes, off)

lab, lines = jamo.split(gm, "붕", drawn.PX)
check("붕은 초·중·종성 셋으로 나뉜다", {1, 2, 3} <= set(np.unique(lab)), str(np.unique(lab)))
check("경계선은 초|중, 종 둘", {l.id for l in lines} == {"y", "j"}, str([l.id for l in lines]))

base, _ = drawn.trace(gm, axes, adv, drawn.PX, None, "붕")
same, _ = drawn.trace(gm, axes, adv, drawn.PX, Tweak(parts={"cho": PartTweak()}), "붕")
check("부분 조정이 기본값이면 윤곽이 같다", base.bounds == same.bounds)

moved, _ = drawn.trace(gm, axes, adv, drawn.PX, Tweak(parts={"jong": PartTweak(ty=-60)}), "붕")
check("종성만 내리면 아래쪽 경계만 내려간다", moved.bounds[1] < base.bounds[1] - 50 and abs(moved.bounds[3] - base.bounds[3]) < 12, f"{base.bounds} → {moved.bounds}")

big, _ = drawn.trace(gm, axes, adv, drawn.PX, Tweak(parts={"cho": PartTweak(scale=130)}), "붕")
check("초성만 키우면 위쪽 경계가 올라가고 아래는 그대로", big.bounds[3] > base.bounds[3] + 10 and abs(big.bounds[1] - base.bounds[1]) < 12, f"{base.bounds} → {big.bounds}")

cut, _ = jamo.split(gm, "붕", drawn.PX, {"y": -80})
check("경계를 옮기면 초성 영역이 바뀐다", (cut == 1).sum() != (lab == 1).sum())
print("모두 통과")
