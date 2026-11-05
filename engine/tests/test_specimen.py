"""견본 이미지 파이프라인(글자 나누기 → 지문 → 비교)이 동작하는지 합성 글자표로 확인한다. 실행: engine/.venv/bin/python tests/test_specimen.py

같은 서체를 (1) 파일로 그린 지문과 (2) 글자표 이미지를 열화시켜 만든 지문으로 비교해, 이미지 경로에서 점수가 얼마나 떨어지는지 첫 수치를 찍는다.
이 수치가 SPECIMEN_THRESHOLD를 정하는 출발점이다(아직 보정 전)."""

import json
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from logoche_engine import checks, specimen  # noqa: E402
from logoche_engine.paths import COMPARE_DIR  # noqa: E402
from logoche_engine.reference import REFERENCE_FONTS  # noqa: E402

CHARS = checks.FREQUENT_CHARS[:30]
ROWS, COLS = 5, 6


def check(name, ok, detail=""):
    print(("통과" if ok else "실패"), name, detail)
    if not ok:
        raise SystemExit(1)


def sheet_image(font_path: Path, cell=150, size=110, margin=40) -> np.ndarray:
    """흰 바탕에 검은 글자, 칸마다 하나. 가로세로 margin 여백."""
    font = ImageFont.truetype(str(font_path), size)
    image = Image.new("L", (COLS * cell + 2 * margin, ROWS * cell + 2 * margin), 255)
    draw = ImageDraw.Draw(image)
    for i, ch in enumerate(CHARS):
        r, c = divmod(i, COLS)
        x0, y0, x1, y1 = draw.textbbox((0, 0), ch, font=font)
        draw.text((margin + c * cell + (cell - (x1 - x0)) / 2 - x0, margin + r * cell + (cell - (y1 - y0)) / 2 - y0), ch, font=font, fill=0)
    return np.array(image)


def degrade(img: np.ndarray, scale=0.4, quality=35) -> np.ndarray:
    small = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (3, 3), 0)
    ok, enc = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE)


def write_folder(root: Path, name: str, img: np.ndarray, **meta) -> Path:
    folder = root / name
    folder.mkdir()
    cv2.imencode(".png", img)[1].tofile(str(folder / "sheet.png"))
    (folder / "meta.json").write_text(json.dumps({"name": name, "chars": CHARS, **meta}, ensure_ascii=False), encoding="utf-8")
    return folder


def similarity_to_file(folder: Path, font_path: Path) -> float:
    mine = checks._specimen_set(folder, specimen.stamp(folder))
    return checks.shape_similarity(mine, checks._shape_set(font_path, font_path.stat().st_mtime))


reference = REFERENCE_FONTS["regular"]
others = [p for p in checks._font_files(COMPARE_DIR / "free") if p.stem.lower().startswith(("nanummyeongjo", "notoserif", "nanumgothic"))]
other = others[0] if others else None

with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    clean = sheet_image(reference)

    f = write_folder(root, "clean-auto", clean)
    sheet = specimen.load(f)
    check("자동 나누기: 글자 수가 맞는다", len(sheet.boxes) == len(CHARS), f"{len(sheet.boxes)}칸")
    s_clean = similarity_to_file(f, reference)
    check("깨끗한 글자표 ↔ 같은 서체 파일", s_clean >= 0.90, f"{s_clean:.3f}")

    f = write_folder(root, "clean-grid", clean, grid=[ROWS, COLS])
    s_grid = similarity_to_file(f, reference)
    check("grid 지정으로 나눠도 같은 점수대", s_grid >= 0.90, f"{s_grid:.3f}")

    ruled = clean.copy()  # 실제 글자표처럼 칸 테두리선이 있는 경우(선이 글자로 읽히면 안 된다)
    for r in range(ROWS + 1):
        ruled[40 + r * 150 - 1 : 40 + r * 150 + 1, 40 : 40 + COLS * 150] = 0
    for c in range(COLS + 1):
        ruled[40 : 40 + ROWS * 150, 40 + c * 150 - 1 : 40 + c * 150 + 1] = 0
    f = write_folder(root, "ruled", ruled)
    s_ruled = similarity_to_file(f, reference)
    check("칸 테두리선이 있어도 글자만 읽는다", len(specimen.load(f).boxes) == len(CHARS) and s_ruled >= 0.90, f"{s_ruled:.3f}")

    f = write_folder(root, "inverted", 255 - clean)
    s_inv = similarity_to_file(f, reference)
    check("흰 글자·검은 바탕도 auto로 읽는다", abs(s_inv - s_clean) < 0.02, f"{s_inv:.3f}")

    print("--- 열화 수치 (이 값이 SPECIMEN_THRESHOLD 보정의 출발점) ---")
    results = {}
    for scale, quality in [(0.6, 80), (0.4, 50), (0.3, 35), (0.22, 25)]:
        f = write_folder(root, f"deg-{scale}-{quality}", degrade(clean, scale, quality))
        try:
            results[(scale, quality)] = similarity_to_file(f, reference)
            glyph_px = round(110 * scale)
            print(f"  글자 약 {glyph_px}px, JPEG {quality}: {results[(scale, quality)]:.3f}")
        except specimen.SpecimenError as e:
            print(f"  글자 약 {round(110 * scale)}px, JPEG {quality}: 읽지 못함 — {e}")
    check("보통 열화(글자 약 44px, JPEG 50)에서도 0.80 이상", results.get((0.4, 50), 0) >= 0.80, f"{results.get((0.4, 50), 0):.3f}")

    if other:
        f = write_folder(root, "other-font", sheet_image(other))
        s_other = similarity_to_file(f, reference)
        check("다른 서체는 낮게 나온다", s_other < s_clean - 0.10, f"{other.stem} {s_other:.3f} < {s_clean:.3f}")
    else:
        print("건너뜀 다른 서체 비교 (compare/free에 NanumMyeongjo 등이 없다)")

    wrong = write_folder(root, "wrong-count", clean, **{})
    meta = json.loads((wrong / "meta.json").read_text(encoding="utf-8"))
    meta["chars"] = CHARS[:-1]  # 글자 하나를 덜 적으면 자동 나누기는 거절해야 한다
    (wrong / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    try:
        specimen.load(wrong)
        check("글자 수가 안 맞으면 거절", False, "예외가 나지 않았다")
    except specimen.SpecimenError as e:
        check("글자 수가 안 맞으면 거절", "chars" in str(e), str(e)[:60])

    check("칸 너비 검증: 합쳐지고 쪼개진 칸을 가려낸다", not specimen.plausible([(0, 0, 80, 80), (90, 0, 250, 80), (260, 0, 275, 80), (280, 0, 360, 80)]) and specimen.plausible([(0, 0, 80, 80), (90, 0, 170, 80), (180, 0, 250, 80), (260, 0, 340, 80)]))

    tiny = write_folder(root, "tiny", degrade(clean, 0.12, 60))
    try:
        specimen.load(tiny)
        check("너무 작은 글자는 거절", False, "예외가 나지 않았다")
    except specimen.SpecimenError as e:
        check("너무 작은 글자는 거절", True, str(e)[:50])

    broken = root / "broken"
    broken.mkdir()
    (broken / "meta.json").write_text("{", encoding="utf-8")
    check("깨진 견본은 빈 지문으로 빠진다(빌드를 막지 않는다)", checks._specimen_set(broken, 0.0) == {})

print("모두 통과")
