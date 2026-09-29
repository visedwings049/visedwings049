"""Card rendering (Pillow only, no UI). Ported from the original Streamlit app."""
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from jffj.paths import FONTS_DIR

ACCENT = "#e0521f"  # road-flare orange
DEFAULT_IMAGE_OPACITY = 50
TAGLINE = "JESUS FOREVER\nFOREVER JESUS\nMike Arico - JFFJ"
TAGLINE_SIZE_RATIO = 0.7
TAGLINE_LINE_SPACING = 1.0
BLOCK_GAP_BASE = 30

FONTS = {
    "Anton": {"file": "Anton-Regular.ttf"},
    "Bebas Neue": {"file": "BebasNeue-Regular.ttf"},
    "Oswald": {"file": "Oswald-Variable.ttf", "variable": True},
    "Orbitron": {"file": "Orbitron-Variable.ttf", "variable": True},
    "Poppins": {"file": "Poppins-Regular.ttf", "bold_file": "Poppins-Bold.ttf"},
    "Lato": {"file": "Lato-Regular.ttf", "bold_file": "Lato-Bold.ttf"},
}

CANVAS_SIZES = {
    "1080 x 1920 (Story / Reel / TikTok)": (1080, 1920),
    "1440 x 2560 (High-Res)": (1440, 2560),
}

GRADIENTS = {
    "Asphalt Night": ["#0c0c0e", "#242427", "#3a3a3f"],
    "Chrome Sunset": ["#1a1210", "#8a3a1e", "#e0521f"],
    "Highway Dusk": ["#14181f", "#3a2f3a", "#6b3c4a"],
    "Steel Horizon": ["#101317", "#3d4550", "#6f7a86"],
}


@dataclass
class CardSettings:
    canvas_size: tuple = (1080, 1920)
    bg_mode: str = "Image"  # Image | Gradient | Solid Color
    bg_image_path: Optional[str] = None
    image_opacity: int = DEFAULT_IMAGE_OPACITY
    gradient_name: str = "Asphalt Night"
    bg_color: str = "#141414"

    text: str = ""
    append_tagline: bool = True
    font_name: str = "Anton"
    bold: bool = False
    font_size: int = 72
    auto_fit: bool = True
    line_spacing: float = 1.15
    alignment: str = "Center"
    side_margin: int = 100

    text_color: str = "#FFFFFF"
    text_opacity: int = 255
    stroke_enabled: bool = True
    stroke_width: int = 3
    stroke_color: str = "#000000"
    shadow_enabled: bool = True
    shadow_color: str = "#000000"
    shadow_opacity: int = 160
    shadow_dx: int = 4
    shadow_dy: int = 6
    shadow_blur: int = 8

    frame_enabled: bool = False
    frame_color: str = ACCENT
    anchor: str = "Middle"  # Top | Middle | Bottom
    v_offset: int = 0


def load_font(font_name: str, size: int, bold: bool) -> ImageFont.FreeTypeFont:
    spec = FONTS[font_name]
    path = FONTS_DIR / (spec.get("bold_file") if bold and spec.get("bold_file") else spec["file"])
    font = ImageFont.truetype(str(path), size)
    if spec.get("variable"):
        try:
            names = [n.decode() for n in font.get_variation_names()]
            if bold:
                for candidate in ("Bold", "SemiBold", "Black", "Medium"):
                    if candidate in names:
                        font.set_variation_by_name(candidate)
                        break
            else:
                default_instance = spec.get("default_instance")
                if default_instance and default_instance in names:
                    font.set_variation_by_name(default_instance)
        except Exception:
            pass
    return font


def hex_to_rgb(hex_color: str) -> tuple:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def hex_to_rgba(hex_color: str, alpha: int) -> tuple:
    return (*hex_to_rgb(hex_color), alpha)


def build_gradient(stops_hex: list, w: int, h: int) -> Image.Image:
    stops = [hex_to_rgb(c) for c in stops_hex]
    n = len(stops)
    column = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        seg = t * (n - 1)
        i = min(int(seg), n - 2)
        local_t = seg - i
        column.putpixel((0, y), tuple(
            round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * local_t) for k in range(3)
        ))
    return column.resize((w, h))


def cover_resize(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    src_ratio = img.width / img.height
    dst_ratio = target_w / target_h
    if src_ratio > dst_ratio:
        new_h = target_h
        new_w = round(new_h * src_ratio)
    else:
        new_w = target_w
        new_h = round(new_w / src_ratio)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list:
    lines = []
    for paragraph in text.split("\n"):
        if paragraph.strip() == "":
            lines.append("")
            continue
        current = ""
        for word in paragraph.split(" "):
            trial = f"{current} {word}".strip()
            if draw.textlength(trial, font=font) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def measure_block(draw, font_name, bold, size, text, max_width, line_spacing):
    font = load_font(font_name, size, bold)
    lines = wrap_text(draw, text, font, max_width)
    ascent, descent = font.getmetrics()
    line_height = round((ascent + descent) * line_spacing)
    return font, lines, line_height, line_height * max(len(lines), 1)


def _background(s: CardSettings) -> Image.Image:
    w, h = s.canvas_size
    if s.bg_mode == "Image" and s.bg_image_path and Path(s.bg_image_path).is_file():
        with Image.open(s.bg_image_path) as src:
            img = cover_resize(src.convert("RGB"), w, h)
        backdrop = build_gradient(GRADIENTS[s.gradient_name], w, h)
        return Image.blend(backdrop, img, s.image_opacity / 100).convert("RGBA")
    if s.bg_mode == "Gradient":
        return build_gradient(GRADIENTS[s.gradient_name], w, h).convert("RGBA")
    if s.bg_mode == "Image":
        return build_gradient(GRADIENTS[s.gradient_name], w, h).convert("RGBA")
    return Image.new("RGBA", (w, h), hex_to_rgba(s.bg_color, 255))


def _line_x(alignment: str, canvas_w: int, margin: int, line_w: float) -> float:
    if alignment == "Center":
        return (canvas_w - line_w) / 2
    if alignment == "Right":
        return canvas_w - margin - line_w
    return margin


def render_card(s: CardSettings) -> tuple:
    """Returns (RGB image, effective font size in px)."""
    canvas_w, canvas_h = s.canvas_size
    canvas = _background(s)

    main_text = s.text.strip()
    show_tagline = s.append_tagline
    if not main_text and not show_tagline:
        main_text = TAGLINE  # never render a blank card
    show_main = bool(main_text)

    scale = canvas_w / 1080
    draw_probe = ImageDraw.Draw(canvas)
    margin_px = round(s.side_margin * scale)
    max_text_width = canvas_w - 2 * margin_px
    margin_v = round(100 * scale)
    available_height = canvas_h - 2 * margin_v
    block_gap = round(BLOCK_GAP_BASE * scale)

    def build_blocks(size):
        blocks = []
        if show_main:
            blocks.append(measure_block(draw_probe, s.font_name, s.bold, size, main_text, max_text_width, s.line_spacing))
        if show_tagline:
            tagline_size = max(1, round(size * TAGLINE_SIZE_RATIO))
            blocks.append(measure_block(draw_probe, s.font_name, s.bold, tagline_size, TAGLINE, max_text_width, TAGLINE_LINE_SPACING))
        return blocks, sum(b[3] for b in blocks) + block_gap * max(len(blocks) - 1, 0)

    current_size = max(1, round(s.font_size * scale))
    blocks, block_height = build_blocks(current_size)
    if s.auto_fit:
        min_size = max(12, round(20 * scale))
        step = max(1, round(2 * scale))
        while block_height > available_height and current_size > min_size:
            current_size -= step
            blocks, block_height = build_blocks(current_size)

    if s.anchor == "Top":
        block_top = margin_v
    elif s.anchor == "Bottom":
        block_top = canvas_h - margin_v - block_height
    else:
        block_top = (canvas_h - block_height) // 2
    block_top += round(s.v_offset * scale)

    text_rgba = hex_to_rgba(s.text_color, s.text_opacity)
    stroke_rgba = hex_to_rgba(s.stroke_color, 255)
    shadow_rgba = hex_to_rgba(s.shadow_color, s.shadow_opacity)
    stroke_w = round(s.stroke_width * scale) if s.stroke_enabled else 0

    if s.shadow_enabled:
        shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow_layer)
        y = block_top
        for font, lines, line_height, _ in blocks:
            for line in lines:
                x = _line_x(s.alignment, canvas_w, margin_px, shadow_draw.textlength(line, font=font))
                shadow_draw.text(
                    (x + round(s.shadow_dx * scale), y + round(s.shadow_dy * scale)),
                    line, font=font, fill=shadow_rgba,
                    stroke_width=stroke_w, stroke_fill=shadow_rgba,
                )
                y += line_height
            y += block_gap
        if s.shadow_blur > 0:
            shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(s.shadow_blur * scale))
        canvas = Image.alpha_composite(canvas, shadow_layer)

    text_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    text_draw = ImageDraw.Draw(text_layer)
    y = block_top
    for font, lines, line_height, _ in blocks:
        for line in lines:
            x = _line_x(s.alignment, canvas_w, margin_px, text_draw.textlength(line, font=font))
            text_draw.text(
                (x, y), line, font=font, fill=text_rgba,
                stroke_width=stroke_w,
                stroke_fill=stroke_rgba if s.stroke_enabled else None,
            )
            y += line_height
        y += block_gap
    canvas = Image.alpha_composite(canvas, text_layer)

    if s.frame_enabled:
        frame_draw = ImageDraw.Draw(canvas)
        inset1 = round(46 * scale)
        frame_draw.rectangle(
            [inset1, inset1, canvas_w - inset1 - 1, canvas_h - inset1 - 1],
            outline=s.frame_color, width=max(1, round(5 * scale)),
        )
        inset2 = round(64 * scale)
        frame_draw.rectangle(
            [inset2, inset2, canvas_w - inset2 - 1, canvas_h - inset2 - 1],
            outline=s.frame_color, width=max(1, round(1.5 * scale)),
        )

    return canvas.convert("RGB"), current_size
