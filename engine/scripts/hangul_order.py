"""나머지 글자를 그릴 순서(10/30, web/lib/hangulOrder.ts를 만든다).

    uv run python scripts/hangul_order.py

화면 4는 참고 글자 밖의 2,350자를 30자씩 글자표로 그린다. 자주 쓰는 글자를 먼저 그려, 그리기를 줄여 시험할 때(GLYPH_REST_LIMIT)도
쓸 만한 글자가 먼저 들어가게 한다. 순서: 말뭉치에 나온 횟수가 많은 글자 → 나오지 않은 글자는 KS X 1001 순서.

말뭉치(처음 한 번 data/cache/corpus/에 받는다):
- 일상 글: NSMC 네이버 영화 리뷰 시험 세트(github.com/e9t/nsmc, CC0), 약 126만 자
- 설명 글: KorQuAD 1.0 dev 세트의 위키백과 문단(korquad.github.io, CC BY-ND 2.0 KR), 약 35만 자
"""

from __future__ import annotations

import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from logoche_engine.hangul import KSX1001_HANGUL  # noqa: E402
from logoche_engine.paths import DATA_DIR  # noqa: E402

CORPUS_DIR = DATA_DIR / "cache" / "corpus"
SOURCES = {
    "nsmc_test.txt": "https://raw.githubusercontent.com/e9t/nsmc/master/ratings_test.txt",
    "korquad_dev.json": "https://korquad.github.io/dataset/KorQuAD_v1.0_dev.json",
}
OUT = ROOT.parent / "web" / "lib" / "hangulOrder.ts"


def load_corpus() -> Counter[str]:
    """두 말뭉치에 나온 한글 음절 횟수."""
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        if not (CORPUS_DIR / name).exists():
            (CORPUS_DIR / name).write_bytes(urllib.request.urlopen(url, timeout=120).read())
    lines = (CORPUS_DIR / "nsmc_test.txt").read_text().splitlines()[1:]
    nsmc = "\n".join(line.split("\t")[1] for line in lines if "\t" in line)
    korquad = json.loads((CORPUS_DIR / "korquad_dev.json").read_text())
    contexts = "\n".join(dict.fromkeys(p["context"] for a in korquad["data"] for p in a["paragraphs"]))
    return Counter(ch for ch in nsmc + contexts if "가" <= ch <= "힣")


def main() -> None:
    ksx = set(KSX1001_HANGUL)
    seen = [ch for ch, _ in load_corpus().most_common() if ch in ksx]
    order = seen + sorted(ksx - set(seen))
    assert len(order) == len(ksx)
    OUT.write_text(
        "// 나머지 글자를 그릴 순서: 한글 2,350자를 자주 쓰는 글자부터(engine/scripts/hangul_order.py가 만든다. 손으로 고치지 않는다).\n"
        f"// 말뭉치(NSMC 영화 리뷰·KorQuAD 위키백과 문단)에 나온 글자 {len(seen):,}자 → 나오지 않은 {len(order) - len(seen):,}자는 KS X 1001 순서.\n"
        f'export const HANGUL_BY_FREQUENCY =\n  "{"".join(order)}";\n'
    )
    print(f"{OUT}: {len(seen)}자 말뭉치 순서 + {len(order) - len(seen)}자")


if __name__ == "__main__":
    main()
