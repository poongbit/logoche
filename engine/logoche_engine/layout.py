"""글자 틀: 만든 서체의 글자 폭과 위·아래 끝. 기준 서체(Source Han Sans KR Regular)에서 읽는다.
10/30: 자소 조합 때 쓰던 배치 규칙(위치별 자모 변형의 상자를 HarfBuzz로 재던 코드)은 뺐다."""

from __future__ import annotations

from dataclasses import dataclass
from functools import cache

from .reference import load_font


@dataclass(frozen=True)
class Layout:
    advance: int  # 한글 글자 폭(폰트 단위)
    ascender: int
    descender: int


@cache
def get_layout() -> Layout:
    font = load_font("regular")
    os2 = font["OS/2"]
    return Layout(font["hmtx"][font.getBestCmap()[ord("가")]][0], os2.sTypoAscender, os2.sTypoDescender)
