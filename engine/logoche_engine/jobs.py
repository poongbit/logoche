"""빌드 작업. 메모리에 두고 스레드 하나에서 차례로 돈다. 서버를 다시 켜면 진행 중인 작업은 사라지고 TTF 파일은 남는다."""

from __future__ import annotations

import json
import shutil
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

import numpy as np

from . import drawn
from .build import FontMeta, build_font, export_later
from .checks import CheckResult, Similarity, check_glyph_set, run_checks
from .contour import Axes
from .hangul import KSX1001_HANGUL
from .paths import BUILDS_DIR, ISSUED_DIR

CHECK_KEYS = ["glyph_set", "broken_glyphs", "embedding", "naming_license", "platform_render", "size_legibility", "similarity"]

# 진행 단계: 외곽선 따기 → TTF 파일 → 검사 7항목(10/30: MX-Font 익히기·생성을 뺐다. 글자는 웹이 이미지 모델로 그려 보낸다).
# 시작 전에는 앞 작업을 기다린다(queue).
STAGES = ["trace", "save", "check"]
# 남은 시간 어림에 쓰는 글자당 시간(초). M5 맥에서 잰 값이고, 실제로는 외곽선 단계에서 잰 속도로 비율을 맞춘다.
SECONDS_PER_GLYPH = {"trace": 0.012, "save": 0.0007, "check": 0.0015}
CHECK_FIXED_SECONDS = 0.5


@dataclass
class StageProgress:
    done: int = 0
    total: int = 0
    started: float | None = None
    finished: float | None = None


@dataclass
class BuildState:
    build_id: str
    logo_hash: str | None
    store_name: str
    phase: str = "composing"  # composing · checking · done · failed
    stage: str = "queue"  # queue · trace · save · check · done · failed
    total: int = len(KSX1001_HANGUL)  # 외곽선을 딸 글자 수(그리지 못한 글자는 빠진다)
    checks: list[CheckResult] = field(default_factory=lambda: [CheckResult(k, "pending", "") for k in CHECK_KEYS])
    similarity: Similarity | None = None
    error: str | None = None
    created: float = field(default_factory=time.monotonic)
    finished: float | None = None
    progress: dict[str, StageProgress] = field(default_factory=lambda: {k: StageProgress() for k in STAGES})

    @property
    def font_path(self) -> Path:
        return BUILDS_DIR / self.build_id / "font.ttf"

    @property
    def built(self) -> int:
        return self.progress["trace"].done

    def advance(self, stage: str, done: int) -> None:
        """stage 단계에서 done개를 끝냈다. 새 단계면 앞 단계를 닫고 시작 시각을 적는다."""
        now = time.monotonic()
        if stage != self.stage:
            if self.stage in self.progress:
                current = self.progress[self.stage]
                current.done, current.finished = current.total, now
            self.stage = stage
            self.progress[stage].started = now
        self.progress[stage].done = done

    def end(self, phase: str) -> None:
        now = time.monotonic()
        current = self.progress.get(self.stage)
        if phase == "done" and current is not None:
            current.done, current.finished = current.total, now
        self.phase, self.finished = phase, now
        if phase == "done":
            self.stage = "done"

    def _speed(self, now: float) -> float:
        """잰 글자당 시간 대비 실제로 걸린 비율. 외곽선 단계에서 잰다."""
        p = self.progress["trace"]
        if p.started is not None and p.done >= 64:
            spent = (p.finished or now) - p.started
            return min(5.0, max(0.2, spent / (p.done * SECONDS_PER_GLYPH["trace"])))
        return 1.0

    def remaining(self) -> float | None:
        """남은 시간 어림(초). 끝났으면 0, 실패했으면 None."""
        if self.phase == "failed":
            return None
        if self.phase == "done":
            return 0.0
        now = time.monotonic()
        speed = self._speed(now)
        left = 0.0
        for key in STAGES:
            p = self.progress[key]
            if p.finished is not None:
                continue
            estimate = (self.total * SECONDS_PER_GLYPH[key] + (CHECK_FIXED_SECONDS if key == "check" else 0)) * speed
            if p.started is None:
                left += estimate
                continue
            spent = now - p.started
            fraction = p.done / p.total if p.total else 0
            # 진행 중인 단계는 지금까지의 속도로 어림한다. 막 시작했으면 잰 값에서 지난 시간을 뺀다.
            left += spent / fraction * (1 - fraction) if fraction > 0.05 else max(0.0, estimate - spent)
        return left

    def to_dict(self) -> dict:
        now = time.monotonic()

        def stage_status(p: StageProgress) -> str:
            if p.finished is not None:
                return "done"
            if p.started is None:
                return "pending"
            return "failed" if self.phase == "failed" else "active"

        remaining = self.remaining()
        return {
            "buildId": self.build_id,
            "phase": self.phase,
            "stage": self.stage,
            "stages": [
                {
                    "key": key,
                    "status": stage_status(p),
                    "done": p.done,
                    "total": p.total,
                    "seconds": None if p.started is None else round((p.finished or now) - p.started, 2),
                }
                for key, p in self.progress.items()
            ],
            "elapsed": round((self.finished or now) - self.created, 2),
            "remaining": None if remaining is None else round(remaining, 1),
            "builtGlyphs": self.built,
            "totalGlyphs": self.total,
            "checks": [{"key": c.key, "status": c.status, "detail": c.detail} for c in self.checks],
            "similarity": None
            if self.similarity is None
            else {
                "score": self.similarity.score,
                "threshold": self.similarity.threshold,
                "nearestFont": self.similarity.nearestFont,
                "nearestKind": self.similarity.nearestKind,
                "passed": self.similarity.passed,
                "compared": self.similarity.compared,
            },
            "fontReady": self.phase == "done" and self.font_path.exists(),
            "error": self.error,
        }


class BuildManager:
    def __init__(self) -> None:
        self._builds: dict[str, BuildState] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="build")

    def get(self, build_id: str) -> BuildState | None:
        with self._lock:
            return self._builds.get(build_id)

    def start(
        self, glyphs: dict[str, np.ndarray], axes: Axes, meta: FontMeta, logo_hash: str | None, edits: dict[str, drawn.Edit] | None = None
    ) -> BuildState:
        """glyphs: 그린 글자(음절 → 자리 맞춘 틀 그림, drawn.py). edits: 사용자가 고친 글자."""
        edits = edits or {}
        state = BuildState(meta.font_id, logo_hash, meta.store_name, total=len(set(glyphs) | set(edits)))
        for key, total in (("trace", state.total), ("save", 1), ("check", len(CHECK_KEYS))):
            state.progress[key].total = total
        with self._lock:
            self._builds[state.build_id] = state
        self._pool.submit(self._run, state, glyphs, axes, meta, edits)
        return state

    def _run(self, state: BuildState, glyphs: dict[str, np.ndarray], axes: Axes, meta: FontMeta, edits: dict[str, drawn.Edit]) -> None:
        try:
            state.advance("trace", 0)
            build_font(glyphs, axes, meta, state.font_path, state.advance, edits)
            state.phase = "checking"
            state.advance("check", 0)

            def checked(i: int, result: CheckResult) -> None:
                # 화면이 한 항목씩 바뀌어 보이도록 끝난 항목부터 채운다.
                state.checks[i] = result
                state.advance("check", i + 1)

            _, similarity = run_checks(state.font_path, KSX1001_HANGUL, checked)
            state.similarity = similarity
            state.end("done")
            export_later(state.font_path)
        except Exception as err:  # noqa: BLE001 - 작업 실패는 상태로 돌려준다
            traceback.print_exc()
            state.error = f"{type(err).__name__}: {err}"
            state.end("failed")

    def refresh_glyph_set(self, build_id: str) -> None:
        """글자를 바꿔 끼운 뒤 글자 세트 검사만 다시 한다(빠진 글자를 화면 4에서 그려 넣었을 때, 10/30)."""
        state = self.get(build_id)
        if state is None or state.phase != "done":
            return
        state.checks[CHECK_KEYS.index("glyph_set")] = check_glyph_set(TTFont(state.font_path), KSX1001_HANGUL)

    def issue(self, build_id: str) -> Path:
        """발급 대장에 올린다. 무엇을 내보냈는지 남기는 기록이고, 다른 서체의 검사에는 쓰지 않는다(10/30)."""
        state = self.get(build_id)
        source = state.font_path if state else BUILDS_DIR / build_id / "font.ttf"
        if not source.exists():
            raise FileNotFoundError(build_id)
        ISSUED_DIR.mkdir(parents=True, exist_ok=True)
        target = ISSUED_DIR / f"{build_id}.ttf"
        # 받은 뒤 글자를 고치고 다시 받으면 고친 파일로 바꿔 둔다.
        if not target.exists() or target.stat().st_mtime < source.stat().st_mtime:
            shutil.copy(source, target)
            meta = {"fontId": build_id, "storeName": state.store_name if state else "", "logoHash": state.logo_hash if state else None}
            target.with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False))
        return target


def ocr_sheet(font_path: Path, chars: str, cols: int = 10) -> Image.Image:
    """OCR용 그림. 칸마다 글자 하나와 번호(1부터)."""
    cell, label = 120, 22
    rows = (len(chars) + cols - 1) // cols
    image = Image.new("L", (cols * cell, rows * (cell + label)), 255)
    draw = ImageDraw.Draw(image)
    glyph_font = ImageFont.truetype(str(font_path), 84)
    label_font = ImageFont.load_default(size=16)
    for i, ch in enumerate(chars):
        x, y = (i % cols) * cell, (i // cols) * (cell + label)
        draw.text((x + 4, y + 2), str(i + 1), fill=150, font=label_font)
        draw.text((x + cell // 2, y + label + cell // 2), ch, fill=0, font=glyph_font, anchor="mm")
    return image


def new_build_id() -> str:
    return uuid.uuid4().hex
