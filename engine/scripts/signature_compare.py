"""시그니처 시험 결과(11/5): 시그니처를 넣은 서체와 같은 로고·같은 속성의 기존 서체(대조), 같은 속성의 다른 로고 서체를 견준다(B안).

    engine/.venv/bin/python scripts/signature_compare.py docs/main-20261105-runs.jsonl docs/signature-20261105-runs.jsonl [견본.png]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR  # noqa: E402

CELL = "둥글고 굵고 균일"


def main(main_runs: str, sig_runs: str, sheet: str | None) -> None:
    ctrl = [r for r in (json.loads(l) for l in open(main_runs, encoding="utf-8") if l.strip()) if r.get("phase") == "done" and r["attrName"] == CELL and not r.get("repeat")]
    sig = [r for r in (json.loads(l) for l in open(sig_runs, encoding="utf-8") if l.strip()) if r.get("phase") == "done"]
    p = lambda r: BUILDS_DIR / r["buildId"] / "font.ttf"  # noqa: E731
    allp = [p(r) for r in ctrl + sig]
    hs = [{chr(c) for c in TTFont(x, lazy=True).getBestCmap() if 0xAC00 <= c <= 0xD7A3} for x in allp]
    chars = "".join(sorted(set.intersection(*hs)))
    S = {r["buildId"]: checks._shape_set(p(r), p(r).stat().st_mtime, chars) for r in ctrl + sig}
    sim = lambda a, b: checks.shape_similarity(S[a["buildId"]], S[b["buildId"]])  # noqa: E731
    print(f"시그니처 {len(sig)}건, 같은 속성 대조 {len(ctrl)}건, 공통 {len(chars)}자 (B안)\n")
    print(f"{'로고':<8}{'자기 대조와':>10}{'다른 로고 대조와(평균)':>22}{'대조의 다른 로고와(평균)':>24}")
    for s in sig:
        own = next((c for c in ctrl if c["logoId"] == s["logoId"]), None)
        others = [c for c in ctrl if c["logoId"] != s["logoId"]]
        s_others = np.mean([sim(s, c) for c in others])
        c_others = np.mean([sim(own, c) for c in others]) if own else float("nan")
        print(f"{s['logoId']:<8}{sim(s, own) if own else float('nan'):>10.2f}{s_others:>22.2f}{c_others:>24.2f}")
    if len(sig) >= 2:
        pair = [sim(a, b) for i, a in enumerate(sig) for b in sig[i + 1 :]]
        cp = []
        for i, a in enumerate(sig):
            for b in sig[i + 1 :]:
                ca = next(c for c in ctrl if c["logoId"] == a["logoId"])
                cb = next(c for c in ctrl if c["logoId"] == b["logoId"])
                cp.append(sim(ca, cb))
        print(f"\n시그니처끼리 평균 {np.mean(pair):.2f} / 같은 로고들의 대조끼리 평균 {np.mean(cp):.2f}")
    if sheet:
        sample = list(chars[:8])
        cell = 110
        rows = []
        for s in sig:
            own = next((c for c in ctrl if c["logoId"] == s["logoId"]), None)
            if own:
                rows.append((f"{s['logoId']} 대조", p(own)))
            rows.append((f"{s['logoId']} 시그니처", p(s)))
        im = Image.new("RGB", (100 + cell * len(sample), cell * len(rows)), "white")
        d = ImageDraw.Draw(im)
        lab = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 13)
        for r, (name, fp) in enumerate(rows):
            d.text((6, r * cell + 48), name, fill="black", font=lab)
            f = ImageFont.truetype(str(fp), 80)
            for c, ch in enumerate(sample):
                d.text((100 + c * cell + 10, r * cell + 6), ch, font=f, fill="black")
        im.save(sheet)
        print("견본:", sheet, "글자", sample)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
