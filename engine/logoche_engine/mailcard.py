"""알림 메일 본문 그림(11/6). 메일 앱의 다크모드가 배경·글자색을 따로 뒤집어 흰 바탕에 흰 글씨가 되는 일이 있어서,
본문을 600px 폭 디자인 그대로 그림 한 장으로 그린다(2배 해상도). 글꼴은 SUIT와 Black Han Sans(compare/free)."""

from __future__ import annotations

from functools import cache
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from .paths import ASSETS_DIR, COMPARE_DIR

S = 2  # 해상도 배율
W = 600
PAD = 40
GREEN = "#35e0b2"
INK = "#111111"


def _font_path(name: str):
    p = COMPARE_DIR / "free" / name
    if not p.exists():
        raise FileNotFoundError(p)
    return p


@cache
def _font(name: str, size: float) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_font_path(name)), round(size * S))


def _text(d: ImageDraw.ImageDraw, x: float, cy: float, t: str, font, fill) -> float:
    d.text((x * S, cy * S), t, font=font, fill=fill, anchor="lm")
    return d.textlength(t, font=font) / S


def _fit(d: ImageDraw.ImageDraw, t: str, font, width: float) -> str:
    if d.textlength(t, font=font) / S <= width:
        return t
    while t and d.textlength(t + "…", font=font) / S > width:
        t = t[:-1]
    return t + "…"


def _wrap(d: ImageDraw.ImageDraw, t: str, font, width: float) -> list[str]:
    """\\n은 그대로 줄바꿈, 넘치면 어절 단위로 꺾는다."""
    out: list[str] = []
    for raw in t.split("\n"):
        cur = ""
        for word in raw.split(" "):
            trial = f"{cur} {word}".strip()
            if cur and d.textlength(trial, font=font) / S > width:
                out.append(cur)
                cur = word
            else:
                cur = trial
        out.append(cur)
    return out


def render_card(kind: str, label: str, title: str, lines: list[str], button: str, note: str, footer: list[str]) -> bytes:
    body_f, bold_f = _font("SUIT-Regular.otf", 16), _font("SUIT-Bold.otf", 13)
    note_f, foot_f = _font("SUIT-Regular.otf", 13.5), _font("SUIT-Regular.otf", 12.5)
    btn_f, head_f = _font("SUIT-Bold.otf", 17), _font("BlackHanSans-Regular.ttf", 30)
    probe = ImageDraw.Draw(Image.new("RGB", (4, 4)))
    inner = W - PAD * 2

    # 줄 배치(높이를 먼저 알아야 캔버스를 만든다)
    paras = [_wrap(probe, p, body_f, inner) for p in lines]
    note_lines = _wrap(probe, note, note_f, inner)
    done = kind == "done"
    y = 275 if done else 228  # 첫 본문 줄의 가운데
    line_ys: list[float] = []
    for para in paras:
        for ln in para:
            line_ys.append(y)
            y += 26
        y += 13 - 0  # 문단 사이
    last = line_ys[-1]
    btn_top = last + 37
    btn_h = 56
    note_y = btn_top + btn_h + 31
    foot_div = note_y + 39 + 19 * (len(note_lines) - 1)
    foot_y = foot_div + 29
    height = foot_y + 19 * (len(footer) - 1) + 34

    im = Image.new("RGB", (W * S, round(height * S)), "#ffffff")
    d = ImageDraw.Draw(im)

    logo = Image.open(ASSETS_DIR / "mail" / "logo.png").convert("RGBA")
    logo = logo.resize((88 * S, round(88 * S * logo.height / logo.width)), Image.LANCZOS)
    im.paste(logo, (PAD * S, 38 * S), logo)

    if done:
        d.rectangle((0, 104 * S, W * S, 232 * S), fill=GREEN)
        _text(d, PAD, 143, _fit(probe, label, bold_f, inner), bold_f, INK)
        _text(d, PAD, 178, title, head_f, INK)
    else:
        d.rectangle((PAD * S, round(102.5 * S), (W - PAD) * S, round(104 * S)), fill="#777777")
        _text(d, PAD, 140, _fit(probe, label, bold_f, inner), bold_f, "#444444")
        _text(d, PAD, 174, title, head_f, INK)

    k = 0
    for para in paras:
        for ln in para:
            _text(d, PAD, line_ys[k], ln, body_f, INK)
            k += 1

    # 버튼: 검은 알약 + 초록 원 + 화살표
    tw = probe.textlength(button, font=btn_f) / S
    bw = 24 + tw + 22 + 48 + 8
    d.rounded_rectangle((PAD * S, btn_top * S, (PAD + bw) * S, (btn_top + btn_h) * S), radius=btn_h * S // 2, fill=INK)
    _text(d, PAD + 24, btn_top + btn_h / 2, button, btn_f, "#ffffff")
    cx, cy = PAD + bw - 8 - 24, btn_top + btn_h / 2
    d.ellipse(((cx - 24) * S, (cy - 24) * S, (cx + 24) * S, (cy + 24) * S), fill=GREEN)
    a = 2.4 * S
    d.line(((cx - 8) * S, cy * S, (cx + 7) * S, cy * S), fill=INK, width=round(a))
    d.line(((cx + 1) * S, (cy - 7) * S, (cx + 8) * S, cy * S, (cx + 1) * S, (cy + 7) * S), fill=INK, width=round(a), joint="curve")

    for i, ln in enumerate(note_lines):
        _text(d, PAD, note_y + 19 * i, ln, note_f, "#555555")
    d.rectangle((PAD * S, foot_div * S, (W - PAD) * S, foot_div * S + S), fill="#e5e5e5")
    for i, ln in enumerate(footer):
        _text(d, PAD, foot_y + 19 * i, ln, foot_f, "#666666")

    buf = BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()
