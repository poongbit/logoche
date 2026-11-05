"""통제된 생성 실험 파일럿(web/scripts/gen-pilot.ts, 방식 A: 참고 글자 30자만)의 서체끼리 유사도 분석. 결과는 docs/similarity-analysis-20261105.md.

    engine/.venv/bin/python scripts/pilot_analysis.py docs/pilot-20261105-runs.jsonl

비교는 모든 빌드가 공통으로 가진 한글 글자로만 한다(참고 글자 30자 중 검사에서 떨어져 다른 글자로 바뀐 것은 빠진다)."""

from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402
from logoche_engine.reference import REFERENCE_FONTS  # noqa: E402


def main(path: str) -> None:
    rows = [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]
    print(f"건수 {len(rows)}, 실패 {sum(1 for r in rows if r.get('phase') != 'done')}, 건별 어림 비용 합 ${sum(r.get('costUsd', 0) for r in rows):.2f}")
    rows = [r for r in rows if r.get("phase") == "done"]
    fonts = []
    for r in rows:
        p = BUILDS_DIR / r["buildId"] / "font.ttf"
        cmap = TTFont(p, lazy=True).getBestCmap()
        fonts.append((r, p, {chr(c) for c in cmap if 0xAC00 <= c <= 0xD7A3}))
    chars = "".join(sorted(set.intersection(*[h for _, _, h in fonts])))
    print(f"빌드 {len(fonts)}개, 공통 한글 {len(chars)}자")
    sets = [checks._shape_set(p, p.stat().st_mtime, chars) for _, p, _ in fonts]
    n = len(fonts)
    M = np.zeros((n, n))
    for i, j in itertools.combinations(range(n), 2):
        M[i, j] = M[j, i] = checks.shape_similarity(sets[i], sets[j])
    iu = np.triu_indices(n, 1)
    v = M[iu]
    L = lambda i: fonts[i][0]  # noqa: E731
    print(f"모든 쌍 {len(v)}: 중앙값 {np.median(v):.3f} p90 {np.percentile(v, 90):.3f} 최대 {v.max():.3f} | 0.85 이상 {(v >= .85).sum()}쌍({(v >= .85).mean() * 100:.0f}%) 0.90 이상 {(v >= .9).sum()}쌍")
    for i, j in zip(*iu):
        if L(i)["logoId"] == L(j)["logoId"] and L(i)["attrName"] == L(j)["attrName"]:
            print(f"같은 입력 반복({L(i)['n']}번↔{L(j)['n']}번): {M[i, j]:.3f}")

    def group(name: str, pred) -> None:
        x = [M[i, j] for i, j in zip(*iu) if pred(L(i), L(j)) and not (L(i)["logoId"] == L(j)["logoId"] and L(i)["attrName"] == L(j)["attrName"])]
        print(f"{name} {len(x)}쌍: 중앙값 {np.median(x):.3f} 최대 {max(x):.3f} 0.85 이상 {sum(1 for y in x if y >= .85)}쌍")

    group("같은 로고·다른 속성", lambda a, b: a["logoId"] == b["logoId"] and a["attrName"] != b["attrName"])
    group("같은 속성·다른 로고", lambda a, b: a["logoId"] != b["logoId"] and a["attrName"] == b["attrName"])
    group("로고도 속성도 다름", lambda a, b: a["logoId"] != b["logoId"] and a["attrName"] != b["attrName"])
    group("서체 계열 같음", lambda a, b: a["family"] == b["family"])
    group("서체 계열 다름", lambda a, b: a["family"] != b["family"])
    print("계열:", ", ".join(f"{L(i)['n']}번 {L(i)['family']}" for i in range(n)))

    ref = {w: checks._shape_set(p, p.stat().st_mtime, chars) for w, p in REFERENCE_FONTS.items()}
    g = np.array([max(checks.shape_similarity(s, r) for r in ref.values()) for s in sets])
    print(f"기준체 점수: 중앙값 {np.median(g):.2f} 범위 {g.min():.2f}~{g.max():.2f}")
    free = checks._font_files(COMPARE_DIR / "free")
    fs = [checks._shape_set(p, p.stat().st_mtime, chars) for p in free]
    print("가장 가까운 무료 폰트(0.80 이상만 이름):")
    for i, s in enumerate(sets):
        sc = [checks.shape_similarity(s, x) for x in fs]
        k = int(np.argmax(sc))
        if sc[k] >= 0.80:
            print(f"  {L(i)['n']}번({L(i)['logoId']}·{L(i)['attrName']}·{L(i)['family']}): {sc[k]:.2f} {free[k].stem}")
    gm = np.array([max(checks.shape_similarity(s, x) for x in fs) for s in sets])
    print(f"가장 가까운 무료 폰트 점수: 중앙값 {np.median(gm):.2f} 최대 {gm.max():.2f}, 0.85 이상 {(gm >= .85).sum()}개")


if __name__ == "__main__":
    main(sys.argv[1])
