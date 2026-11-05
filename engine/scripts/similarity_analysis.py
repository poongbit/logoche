"""우리가 만든 서체(data/builds)끼리 얼마나 닮는지 재는 분석. 결과는 docs/similarity-analysis-20261105.md에 정리했다.

    engine/.venv/bin/python scripts/similarity_analysis.py

글자 109개(checks.SAMPLE_CHARS) 중 99개 이상 든 빌드만 쓴다. 같은 로고를 다시 빌드한 것과 서로 다른 로고의 결과를 기록으로 가를 수 없어서
(빌드에 로고 식별자가 없다), 점수가 높은 쌍을 같은 출처로 묶는 기준(GROUP_THRESHOLDS)을 바꿔 가며 결과가 얼마나 흔들리는지 함께 보인다."""

from __future__ import annotations

import datetime
import glob
import itertools
import os
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fontTools.ttLib import TTFont  # noqa: E402

from logoche_engine import checks  # noqa: E402
from logoche_engine.jobs import read_provenance  # noqa: E402
from logoche_engine.paths import BUILDS_DIR, COMPARE_DIR  # noqa: E402
from logoche_engine.reference import REFERENCE_FONTS  # noqa: E402

GROUP_THRESHOLDS = (0.99, 0.97, 0.95, 0.92)
PIPELINE_CUT = datetime.datetime(2026, 10, 30, 17, 0)  # 이 시각 전: MX-Font 시기, 이후: 그린 글자 방식
MIN_CHARS = 99


def pct(v, p):
    return float(np.percentile(v, p))


def groups_at(M: np.ndarray, th: float) -> list[list[int]]:
    parent = list(range(len(M)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in itertools.combinations(range(len(M)), 2):
        if M[i, j] >= th:
            parent[find(i)] = find(j)
    out = defaultdict(list)
    for i in range(len(M)):
        out[find(i)].append(i)
    return list(out.values())


def main() -> None:
    files = []
    for f in sorted(glob.glob(str(BUILDS_DIR / "*/font.ttf")), key=os.path.getmtime):
        cmap = TTFont(f, lazy=True).getBestCmap()
        if sum(1 for c in checks.SAMPLE_CHARS if ord(c) in cmap) >= MIN_CHARS:
            files.append(Path(f))
    sets = [checks._shape_set(p, p.stat().st_mtime) for p in files]
    n = len(files)
    M = np.zeros((n, n))
    for i, j in itertools.combinations(range(n), 2):
        M[i, j] = M[j, i] = checks.shape_similarity(sets[i], sets[j])
    iu = np.triu_indices(n, 1)
    v = M[iu]
    print(f"쓸 수 있는 빌드 {n}개, 쌍 {len(v)}개")
    print(f"[1] 모든 쌍: 중앙값 {np.median(v):.3f} p90 {pct(v, 90):.3f} p95 {pct(v, 95):.3f} 최대 {v.max():.3f}")
    for th in (0.95, 0.90, 0.85, 0.80):
        print(f"    {th} 이상: {(v >= th).sum()}쌍 ({(v >= th).mean() * 100:.1f}%)")

    print("[2] 같은 출처로 묶는 기준을 바꿔 가며 (묶은 뒤 서로 다른 출처끼리의 쌍)")
    for th in GROUP_THRESHOLDS:
        groups = groups_at(M, th)
        reps = [g[-1] for g in groups]
        R = M[np.ix_(reps, reps)]
        w = R[np.triu_indices(len(reps), 1)]
        print(
            f"    묶음 {th}: 출처 {len(reps)}개(묶음 크기 {sorted((len(g) for g in groups), reverse=True)[:6]}), 쌍 {len(w)}개, "
            f"중앙값 {np.median(w):.3f} p90 {pct(w, 90):.3f} 최대 {w.max():.3f}, 0.85 이상 {(w >= 0.85).sum()}쌍({(w >= 0.85).mean() * 100:.1f}%)"
        )

    ts = [os.path.getmtime(p) for p in files]
    for gap in (20, 90):  # 시간 간격이 이보다 길면 다른 세션(점수로 묶는 순환을 피한다. 다른 세션 사이에도 같은 로고의 재빌드가 섞인다)
        sess = [0]
        for a, b in zip(ts, ts[1:]):
            sess.append(sess[-1] + (1 if (b - a) / 60 > gap else 0))
        cross = np.array([M[i, j] for i, j in zip(*iu) if sess[i] != sess[j]])
        print(f"    시간 간격 {gap}분↑: 세션 {max(sess) + 1}개, 세션 간 쌍 {len(cross)}개 중앙값 {np.median(cross):.3f} 0.85 이상 {(cross >= 0.85).mean() * 100:.1f}% 최대 {cross.max():.3f}")
    old_ix = [i for i, t in enumerate(ts) if datetime.datetime.fromtimestamp(t) < PIPELINE_CUT]
    new_ix = [i for i in range(n) if i not in old_ix]
    x = np.array([M[i, j] for i in old_ix for j in new_ix])
    print(f"    방식 교차(MX {len(old_ix)}개 × 현재 {len(new_ix)}개): {len(x)}쌍 중앙값 {np.median(x):.3f} 최대 {x.max():.3f}")
    for name, ix in (("MX끼리", old_ix), ("현재끼리", new_ix)):
        y = np.array([M[i, j] for i, j in itertools.combinations(ix, 2)])
        print(f"    {name}: {len(y)}쌍 중앙값 {np.median(y):.3f}")

    # 11/5부터 빌드마다 provenance.json이 남는다(jobs.write_provenance). 있는 빌드는 점수로 묶지 않고 기록의 프로젝트 번호로 출처를 가른다.
    prov = [read_provenance(p) for p in files]
    keyed = [(i, (r or {}).get("client", {}).get("projectId")) for i, r in enumerate(prov)]
    keyed = [(i, k) for i, k in keyed if k]
    print(f"    출처 기록이 있는 빌드 {len(keyed)}개 / {n}개 (파이프라인: {sorted({(r or {}).get('pipeline') for r in prov if r})})")
    if len({k for _, k in keyed}) >= 2:
        cross = np.array([M[i, j] for (i, ki), (j, kj) in itertools.combinations(keyed, 2) if ki != kj])
        print(f"    기록 기준 서로 다른 프로젝트끼리: 프로젝트 {len({k for _, k in keyed})}개, 쌍 {len(cross)}개 중앙값 {np.median(cross):.3f} 0.85 이상 {(cross >= 0.85).mean() * 100:.1f}% 최대 {cross.max():.3f}")

    print("[3] 기준체(Source Han Sans)에 얼마나 붙어 있나")
    ref = {w: checks._shape_set(p, p.stat().st_mtime) for w, p in REFERENCE_FONTS.items()}
    g = np.array([max(checks.shape_similarity(s, r) for r in ref.values()) for s in sets])
    free = [p for p in checks._font_files(COMPARE_DIR / "free") if "SourceHan" not in p.stem]
    fr = np.array([max(checks.shape_similarity(checks._shape_set(p, p.stat().st_mtime), r) for r in ref.values()) for p in free])
    print(f"    우리 서체 {n}개 → 기준체: 중앙값 {np.median(g):.3f} p10 {pct(g, 10):.3f} p90 {pct(g, 90):.3f} 범위 {g.min():.3f}~{g.max():.3f}")
    print(f"    무료 폰트 {len(fr)}개 → 기준체: 중앙값 {np.median(fr):.3f} p10 {pct(fr, 10):.3f} p90 {pct(fr, 90):.3f} 범위 {fr.min():.3f}~{fr.max():.3f}")
    mins = np.array([min(g[i], g[j]) for i, j in zip(*iu)])
    print(f"    쌍 점수와 두 서체의 기준체 점수(작은 쪽)의 상관 {np.corrcoef(v, mins)[0, 1]:.2f}")

    print("[4] 실존 무료 폰트와의 비교")
    fsets = [checks._shape_set(p, p.stat().st_mtime) for p in checks._font_files(COMPARE_DIR / "free")]
    gm = np.array([max(checks.shape_similarity(s, x) for x in fsets) for s in sets])
    fam = lambda p: p.stem.split("-")[0].split("[")[0]
    fl = checks._font_files(COMPARE_DIR / "free")
    ff = np.array([checks.shape_similarity(fsets[i], fsets[j]) for i, j in itertools.combinations(range(len(fl)), 2) if fam(fl[i]) != fam(fl[j])])
    print(f"    우리 서체 → 가장 가까운 무료 폰트: 중앙값 {np.median(gm):.3f} 최대 {gm.max():.3f}, 0.85 이상 {(gm >= 0.85).sum()}개")
    print(f"    무료 폰트끼리(다른 가족) {len(ff)}쌍: 중앙값 {np.median(ff):.3f} p95 {pct(ff, 95):.3f} p99 {pct(ff, 99):.3f}, 0.85 이상 {(ff >= 0.85).mean() * 100:.1f}%")

    print("[5] 출처가 N개일 때 새 서체가 0.85 이상으로 겹칠 확률 1-(1-q)^N (쌍이 서로 독립이라는 가정, 위 [2]의 q 범위)")
    for q in (0.036, 0.066, 0.148, 0.169, 0.038):  # 0.038은 실존 무료 폰트끼리([4])
        print(f"    q={q:.3f}: " + ", ".join(f"N={N}: {1 - (1 - q) ** N:.2f}" for N in (10, 30, 100, 1000)))


if __name__ == "__main__":
    main()
