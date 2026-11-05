"""견본 이미지(글자표 캡처·사진)를 유사도 비교 대상으로 등록하고, 글자가 제대로 나뉘었는지 확인한다.

    uv run python scripts/add_specimen.py 글자표.png --name "OO체 Regular" --chars "가나다라마바사아자차" --grid 2x5 \\
        --source "https://… (확인한 약관 문구)"

compare/specimen/<이름>/ 에 sheet.<확장자>·meta.json을 만들고, 나눈 칸을 그린 preview.png를 같은 폴더에 남긴다.
preview.png에서 칸이 글자마다 하나씩 잡혔는지 눈으로 확인한다. 그다음 가장 닮은 무료 폰트 3개를 찍어 상식과 맞는지 본다.
글자 수가 맞지 않으면 등록하지 않는다(--force로 폴더만 남길 수 있다). 이미지는 깃에 올리지 않는다(.gitignore).
등록 전에 해당 사이트의 약관이 견본 이미지 수집을 허용하는지 확인하고 --source에 남긴다.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logoche_engine import checks, specimen  # noqa: E402
from logoche_engine.paths import COMPARE_DIR  # noqa: E402


def slug(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", name).strip("._") or "specimen"


def preview(sheet: specimen.Specimen, path: Path) -> None:
    canvas = cv2.cvtColor((~sheet.mask).astype("uint8") * 255, cv2.COLOR_GRAY2BGR)
    for i, box in enumerate(sheet.boxes):
        if box:
            cv2.rectangle(canvas, box[:2], box[2:], (0, 0, 220), 2)
            cv2.putText(canvas, str(i + 1), (box[0], max(12, box[1] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (220, 0, 0), 2)
    ok, encoded = cv2.imencode(".png", canvas)
    if ok:
        encoded.tofile(str(path))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", type=Path)
    ap.add_argument("--name", required=True, help="화면에 보일 이름")
    ap.add_argument("--chars", required=True, help="이미지 속 글자를 왼쪽→오른쪽, 위→아래 순서로")
    ap.add_argument("--grid", help="칸이 고른 글자표면 행x열 (예: 2x5)")
    ap.add_argument("--ink", choices=["auto", "dark", "light"], default="auto")
    ap.add_argument("--source", default="", help="출처·약관 확인 메모")
    ap.add_argument("--force", action="store_true", help="글자 수가 안 맞아도 폴더를 남긴다(비교에서는 빠진다)")
    args = ap.parse_args()

    if not args.image.is_file():
        ap.error(f"이미지 파일이 없어요: {args.image}")
    meta = {"name": args.name, "chars": "".join(args.chars.split()), "ink": args.ink, "source": args.source}
    if args.grid:
        m = re.fullmatch(r"(\d+)[xX×](\d+)", args.grid)
        if not m:
            ap.error("--grid는 2x5처럼 행x열로 쓰세요")
        meta["grid"] = [int(m[1]), int(m[2])]
    folder = COMPARE_DIR / "specimen" / slug(args.name)
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("sheet.*"):
        old.unlink()
    shutil.copyfile(args.image, folder / f"sheet{args.image.suffix.lower()}")
    (folder / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    try:
        sheet = specimen.load(folder)
    except specimen.SpecimenError as e:
        print(f"실패: {e}")
        if not args.force:
            shutil.rmtree(folder)
            print("등록하지 않았어요.")
        return 1
    preview(sheet, folder / "preview.png")
    fingerprint = checks._specimen_set(folder, specimen.stamp(folder))
    print(f"등록: {folder}")
    print(f"글자 {len(sheet.meta.chars)}자 중 지문 {len(fingerprint)}자. 나눈 칸은 {folder / 'preview.png'}에서 확인하세요.")
    if len(fingerprint) < checks.SPECIMEN_MIN_COMMON:
        print(f"주의: 지문이 {checks.SPECIMEN_MIN_COMMON}자보다 적어 비교에서 빠져요. 한글 글자가 더 든 견본을 쓰세요.")
    scores = []
    for kind, name, path in checks.comparison_set():
        if kind == "specimen" and path == folder:
            continue
        theirs = checks.shape_set_for_chars(kind, path, "".join(sorted(fingerprint))) if kind != "specimen" else checks.shape_set_of(kind, path)
        scores.append((checks.shape_similarity(fingerprint, theirs), kind, name))
    print("가장 닮은 비교 대상 3개 (상식과 맞는지 보세요):")
    for score, kind, name in sorted(scores, reverse=True)[:3]:
        print(f"  {score:.2f}  {name} ({kind})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
