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
