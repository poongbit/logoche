"""빌드 출처 기록(provenance.json)이 남고 읽히는지 확인한다. 실행: engine/.venv/bin/python tests/test_provenance.py"""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logoche_engine import jobs  # noqa: E402
from logoche_engine.contour import Axes  # noqa: E402


def check(name, ok, detail=""):
    print(("통과" if ok else "실패"), name, detail)
    if not ok:
        raise SystemExit(1)


with tempfile.TemporaryDirectory() as tmp:
    d = Path(tmp) / "abc123"
    jobs.write_provenance(d, "abc123", "deadbeef", Axes(weight=500), {"glyphs": 30, "edits": 1, "tweaks": 0}, {"source": "web", "projectId": "p-1", "family": "gothic"})
    rec = jobs.read_provenance(d / "font.ttf")
    check("기록이 남고 font.ttf 옆에서 읽힌다", rec is not None and rec["buildId"] == "abc123" and rec["client"]["projectId"] == "p-1")
    check("방식 이름과 시각이 들어간다", rec["pipeline"] == jobs.PIPELINE_VERSION and rec["startedAt"].endswith("+00:00"), rec["startedAt"])
    check("굵기 등 조절값이 들어간다", rec["axes"]["weight"] == 500 and rec["counts"]["glyphs"] == 30)
    check("가게 이름·소유자 같은 키는 엔진이 만들지 않는다", not ({"storeName", "owner", "logoImage"} & set(rec) | {"storeName", "owner", "logoImage"} & set(rec["client"])))
    check("임시 파일이 남지 않는다", not (d / "provenance.json.tmp").exists())

    d2 = Path(tmp) / "big"
    jobs.write_provenance(d2, "big", None, Axes(), {}, {"blob": "x" * (jobs.PROVENANCE_MAX_BYTES + 10)})
    rec2 = jobs.read_provenance(d2 / "font.ttf")
    check("너무 큰 클라이언트 값은 잘라 내고 빌드 정보는 남긴다", rec2 is not None and rec2["client"] == {"truncated": True} and rec2["buildId"] == "big")

    check("11/5 전 빌드(기록 없음)는 None", jobs.read_provenance(Path(tmp) / "none" / "font.ttf") is None)

    # 쓸 수 없는 위치여도 예외를 내지 않는다(빌드를 막지 않는다)
    blocked = Path(tmp) / "file"
    blocked.write_text("x")
    jobs.write_provenance(blocked / "sub", "x", None, Axes(), {}, {})
    check("기록이 실패해도 예외를 내지 않는다", True)

print("모두 통과")
