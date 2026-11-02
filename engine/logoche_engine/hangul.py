"""KS X 1001 완성형 한글 2,350자(만든 서체에 넣는 글자). 웹(web/lib/hangul.ts)과 같은 순서다."""

from __future__ import annotations


def _ksx1001_hangul() -> list[str]:
    chars = []
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("euc-kr")
            except UnicodeDecodeError:
                continue
            if "가" <= ch <= "힣":
                chars.append(ch)
    return chars


KSX1001_HANGUL = _ksx1001_hangul()
assert len(KSX1001_HANGUL) == 2350, len(KSX1001_HANGUL)

# 숫자·문장부호(11/2 사용자 결정: 그리기에 넣는다). 나머지 글자와 같은 방식으로 한 장(30칸)에 그린다.
# 웹(web/lib/constants.ts EXTRA_CHARS)과 같은 순서다. 자리와 글자 폭은 기준 서체의 같은 글자를 따른다(drawn.ref_advance).
EXTRA_CHARS = "0123456789.,!?:;'\"()-~/%&+·*#₩"
assert len(EXTRA_CHARS) == 30, len(EXTRA_CHARS)

# 서체에 넣을 수 있는 글자 전부
DRAWN_CHARS = frozenset(KSX1001_HANGUL) | frozenset(EXTRA_CHARS)
