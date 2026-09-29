import io
import os
import re
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont, ImageFilter

st.set_page_config(page_title="JFFJ Card Generator", layout="wide")

# Standalone app: its own root, its own .env (see .env.example next to this
# file for the variable names to fill in) - no dependency on the Slumber
# Realms Studio project this was started from.
APP_ROOT = Path(__file__).resolve().parent
load_dotenv(APP_ROOT / ".env")

SMTP_HOST = os.environ.get("JFFJ_SMTP_HOST", "smtp.gmail.com")
SMTP_PORT_RAW = os.environ.get("JFFJ_SMTP_PORT", "587")
SMTP_PORT = int(SMTP_PORT_RAW) if SMTP_PORT_RAW.isdigit() else 587
SMTP_USER = os.environ.get("JFFJ_SMTP_USER")
SMTP_PASSWORD = os.environ.get("JFFJ_SMTP_PASSWORD")
SMTP_USE_TLS = os.environ.get("JFFJ_SMTP_USE_TLS", "true").lower() == "true"
EMAIL_FROM = os.environ.get("JFFJ_EMAIL_FROM") or SMTP_USER

FONTS_DIR = APP_ROOT / "assets" / "fonts"
DEFAULT_LIBRARY_DIR = APP_ROOT / "assets" / "library" / "Arico"
DEFAULT_IMAGE_OPACITY = 50  # i.e. background image reduced by 50%
IMAGE_BACKDROP = "#141414"
IMAGE_EXTENSIONS ={".png", ".jpg", ".jpeg", ".webp"}
ACCENT = "#e0521f"  # road-flare orange
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TAGLINE = "JESUS FOREVER\nFOREVER JESUS\nMike Arico - JFFJ"
TAGLINE_SIZE_RATIO = 0.7  # tagline renders 30% smaller than the main text
TAGLINE_LINE_SPACING = 1.0  # tighter than the main text's line spacing, so the 3 lines sit close together
BLOCK_GAP_BASE = 30  # px, at the 1080-wide baseline, between the main text and the tagline

# name -> file (+ optional bold_file for static pairs, or variable=True for
# variable-weight fonts that expose named instances like "Bold"; default_instance
# picks the non-bold instance for variable fonts that don't default to Regular)
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


def hex_to_rgba(hex_color: str, alpha: int) -> tuple:
    hex_color = hex_color.lstrip("#")
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    return (r, g, b, alpha)


def hex_to_rgb(hex_color: str) -> tuple:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def build_gradient(stops_hex: list, w: int, h: int) -> Image.Image:
    stops = [hex_to_rgb(c) for c in stops_hex]
    n = len(stops)
    column = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        seg = t * (n - 1)
        i = min(int(seg), n - 2)
        local_t = seg - i
        r = round(stops[i][0] + (stops[i + 1][0] - stops[i][0]) * local_t)
        g = round(stops[i][1] + (stops[i + 1][1] - stops[i][1]) * local_t)
        b = round(stops[i][2] + (stops[i + 1][2] - stops[i][2]) * local_t)
        column.putpixel((0, y), (r, g, b))
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


@st.cache_data(show_spinner=False)
def list_library_images(dir_path_str: str) -> list:
    directory = Path(dir_path_str)
    if not directory.is_dir():
        return []
    files = [f for f in directory.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS]
    files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return [str(f) for f in files]


@st.cache_data(show_spinner=False)
def make_thumbnail(path_str: str, mtime: float, max_dim: int = 260) -> bytes:
    img = Image.open(path_str).convert("RGB")
    img.thumbnail((max_dim, max_dim))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=80)
    return buffer.getvalue()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list:
    lines = []
    for paragraph in text.split("\n"):
        if paragraph.strip() == "":
            lines.append("")
            continue
        words = paragraph.split(" ")
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if draw.textlength(trial, font=font) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def describe_card(bg_mode, gradient_name, bg_color, canvas_w, canvas_h, text, font_name, bold, final_size, alignment, frame_enabled) -> str:
    """Plain-language description of what the generated image contains, built
    from the known generation parameters (no image analysis needed since we
    built the image ourselves)."""
    if bg_mode == "Image":
        bg_desc = "a custom uploaded background photo"
    elif bg_mode == "Gradient":
        bg_desc = f'a "{gradient_name}" gradient background'
    else:
        bg_desc = f"a solid {bg_color} background"

    snippet = " ".join(text.split())
    if len(snippet) > 220:
        snippet = snippet[:217].rstrip() + "..."

    frame_desc = " with an edge frame" if frame_enabled else ""
    style_desc = f"{font_name}{' Bold' if bold else ''}, {final_size}px, {alignment.lower()}-aligned"

    return (
        f"A {canvas_w}x{canvas_h} JFFJ card over {bg_desc}{frame_desc}. "
        f"Text ({style_desc}):\n\n\"{snippet}\""
    )


def build_email(to_address: str, subject: str, body: str, image_bytes: bytes, image_filename: str) -> MIMEMultipart:
    msg = MIMEMultipart()
    msg["From"] = EMAIL_FROM
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    image_part = MIMEImage(image_bytes, name=image_filename)
    image_part.add_header("Content-Disposition", "attachment", filename=image_filename)
    msg.attach(image_part)
    return msg


def deliver_email(msg: MIMEMultipart, to_address: str) -> None:
    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
    try:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(EMAIL_FROM, [to_address], msg.as_string())
    finally:
        server.quit()


def send_card_email(to_address: str, subject: str, body: str, image_bytes: bytes, image_filename: str) -> None:
    if not SMTP_USER or not SMTP_PASSWORD:
        raise RuntimeError(
            "Email isn't configured yet. Copy .env.example to .env next to "
            "jffj_app/app.py and fill in JFFJ_SMTP_USER / JFFJ_SMTP_PASSWORD."
        )
    msg = build_email(to_address, subject, body, image_bytes, image_filename)
    deliver_email(msg, to_address)


def measure_block(draw, font_name, bold, size, text, max_width, line_spacing):
    font = load_font(font_name, size, bold)
    lines = wrap_text(draw, text, font, max_width)
    ascent, descent = font.getmetrics()
    line_height = round((ascent + descent) * line_spacing)
    block_height = line_height * max(len(lines), 1)
    return font, lines, line_height, block_height


st.title("JFFJ")
st.caption("Lay text over an asphalt/chrome backdrop — pick a font, tune stroke, shadow, and frame, export a ready-to-post card.")

col_controls, col_preview = st.columns([1, 1.2], gap="large")

with col_controls:
    tab_bg, tab_text, tab_color, tab_frame = st.tabs(["Background", "Text & Type", "Color & Effects", "Frame & Export"])

    with tab_bg:
        canvas_label = st.selectbox("Canvas size", list(CANVAS_SIZES.keys()))
        CANVAS_W, CANVAS_H = CANVAS_SIZES[canvas_label]

        bg_mode = st.radio("Background type", ["Image", "Gradient", "Solid Color"], horizontal=True, index=1)

        uploaded = None
        gradient_name = None
        bg_color = "#141414"
        library_selected_image = None

        if bg_mode == "Image":
            image_source = st.radio("Image source", ["Library", "Upload"], horizontal=True)

            if image_source == "Upload":
                uploaded = st.file_uploader(
                    "Upload a background image (auto cropped to fit 9:16)",
                    type=["png", "jpg", "jpeg", "webp"],
                )
                st.caption("Works well with a garage/road/chrome photo.")
                if not uploaded:
                    st.info("Upload an image above, or switch to Library / Gradient / Solid Color.")
            else:
                library_dir = st.text_input(
                    "Image library folder",
                    value=st.session_state.get("jffj_library_dir", str(DEFAULT_LIBRARY_DIR)),
                    help="Paste the folder where your generated images (e.g. Kling renders) are saved.",
                )
                st.session_state["jffj_library_dir"] = library_dir

                image_paths = list_library_images(library_dir)

                if not Path(library_dir).is_dir():
                    st.warning("That folder doesn't exist. Paste a valid path above.")
                elif not image_paths:
                    st.info("No PNG/JPG/WEBP images found in that folder.")
                else:
                    st.caption(f"{len(image_paths)} image(s) — scroll to browse, click a thumbnail's Select button.")
                    gallery = st.container(height=420)
                    with gallery:
                        cols_per_row = 3
                        for row_start in range(0, len(image_paths), cols_per_row):
                            row_paths = image_paths[row_start:row_start + cols_per_row]
                            cols = st.columns(cols_per_row)
                            for col, path_str in zip(cols, row_paths):
                                path = Path(path_str)
                                with col:
                                    thumb = make_thumbnail(path_str, path.stat().st_mtime)
                                    st.image(thumb, use_container_width=True)
                                    is_selected = st.session_state.get("jffj_selected_image") == path_str
                                    if st.button(
                                        "Selected" if is_selected else "Select",
                                        key=f"lib_select_{path_str}",
                                        use_container_width=True,
                                        type="primary" if is_selected else "secondary",
                                    ):
                                        st.session_state["jffj_selected_image"] = path_str
                                        st.rerun()
                                    st.caption(path.name)

                selected_path = st.session_state.get("jffj_selected_image")
                if selected_path and Path(selected_path).is_file():
                    library_selected_image = selected_path
                    st.success(f"Using: {Path(selected_path).name}")
                else:
                    st.info("Select an image from the folder above, or switch to Upload / Gradient / Solid Color.")
        elif bg_mode == "Gradient":
            gradient_name = st.radio("Gradient", list(GRADIENTS.keys()), horizontal=True)
        else:
            bg_color = st.color_picker("Background color", "#141414")

        if bg_mode == "Image":
            image_opacity = st.slider(
                "Background image opacity (%)", 0, 100, DEFAULT_IMAGE_OPACITY,
                help="Default is 50%. Lower values fade the image into the dark backdrop.",
            )

    with tab_text:
        custom_text = st.text_area(
            "Card text",
            value="",
            height=140,
            placeholder="Type your message here...",
        )
        append_tagline = st.checkbox("Append JFFJ tagline to every card", value=True)
        stripped = custom_text.strip()
        show_tagline = append_tagline
        main_text = stripped
        if not main_text and not show_tagline:
            main_text = TAGLINE  # never render a blank card
        show_main = bool(main_text)
        text = f"{main_text}\n\n{TAGLINE}" if (main_text and show_tagline) else (main_text or TAGLINE)

        font_name = st.selectbox("Font", list(FONTS.keys()), index=0)
        bold = st.checkbox("Bold", value=False)
        font_size = st.slider("Font size", 20, 160, 72)
        auto_fit = st.checkbox("Shrink to fit if the text runs long", value=True)
        line_spacing = st.slider("Line spacing", 1.0, 2.0, 1.15, 0.05)
        alignment = st.selectbox("Alignment", ["Center", "Left", "Right"], index=0)
        side_margin = st.slider("Side margin (px)", 40, 300, 100, 10)

    with tab_color:
        st.markdown("**Text color**")
        text_color = st.color_picker("Text color", "#FFFFFF", label_visibility="collapsed")
        text_opacity = st.slider("Text opacity", 0, 255, 255)

        st.divider()
        stroke_enabled = st.checkbox("Stroke / outline", value=True)
        stroke_width = st.slider("Stroke width", 0, 12, 3, disabled=not stroke_enabled)
        stroke_color = st.color_picker("Stroke color", "#000000", disabled=not stroke_enabled)

        st.divider()
        shadow_enabled = st.checkbox("Drop shadow", value=True)
        shadow_color = st.color_picker("Shadow color", "#000000", disabled=not shadow_enabled)
        shadow_opacity = st.slider("Shadow opacity", 0, 255, 160, disabled=not shadow_enabled)
        shadow_dx = st.slider("Shadow offset X", -40, 40, 4, disabled=not shadow_enabled)
        shadow_dy = st.slider("Shadow offset Y", -40, 40, 6, disabled=not shadow_enabled)
        shadow_blur = st.slider("Shadow blur", 0, 30, 8, disabled=not shadow_enabled)

    with tab_frame:
        frame_enabled = st.checkbox("Edge frame", value=False)
        frame_color = st.color_picker("Frame color", ACCENT, disabled=not frame_enabled)
        anchor = st.radio("Vertical placement", ["Top", "Middle", "Bottom"], index=1, horizontal=True)
        v_offset = st.slider("Fine-tune vertical position (px)", -400, 400, 0, 5)
        st.divider()
        filename = st.text_input("File name", "jffj_card")

# --- Build background ---
def fade_over_backdrop(img: Image.Image, opacity_pct: int) -> Image.Image:
    backdrop = Image.new("RGB", img.size, IMAGE_BACKDROP)
    return Image.blend(backdrop, img, opacity_pct / 100).convert("RGBA")


if bg_mode == "Image" and uploaded:
    base_img = Image.open(uploaded).convert("RGB")
    canvas = fade_over_backdrop(cover_resize(base_img, CANVAS_W, CANVAS_H).convert("RGB"), image_opacity)
elif bg_mode == "Image" and library_selected_image:
    base_img = Image.open(library_selected_image).convert("RGB")
    canvas = fade_over_backdrop(cover_resize(base_img, CANVAS_W, CANVAS_H).convert("RGB"), image_opacity)
elif bg_mode == "Gradient":
    canvas = build_gradient(GRADIENTS[gradient_name], CANVAS_W, CANVAS_H).convert("RGBA")
elif bg_mode == "Image":
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), hex_to_rgba("#141414", 255))
else:
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), hex_to_rgba(bg_color, 255))

# scale font/margins from the 1080-wide baseline so sizing stays sensible at higher canvas sizes
scale = CANVAS_W / 1080
draw_probe = ImageDraw.Draw(canvas)
max_text_width = CANVAS_W - 2 * round(side_margin * scale)
margin_v = round(100 * scale)
available_height = CANVAS_H - 2 * margin_v

block_gap = round(BLOCK_GAP_BASE * scale)


def build_blocks(size):
    blocks = []
    if show_main:
        blocks.append(measure_block(draw_probe, font_name, bold, size, main_text, max_text_width, line_spacing))
    if show_tagline:
        tagline_size = max(1, round(size * TAGLINE_SIZE_RATIO))
        blocks.append(measure_block(draw_probe, font_name, bold, tagline_size, TAGLINE, max_text_width, TAGLINE_LINE_SPACING))
    total_height = sum(b[3] for b in blocks) + block_gap * max(len(blocks) - 1, 0)
    return blocks, total_height


current_size = max(1, round(font_size * scale))
blocks, block_height = build_blocks(current_size)

if auto_fit:
    min_size = max(12, round(20 * scale))
    step = max(1, round(2 * scale))
    while block_height > available_height and current_size > min_size:
        current_size -= step
        blocks, block_height = build_blocks(current_size)

if anchor == "Top":
    block_top = margin_v
elif anchor == "Bottom":
    block_top = CANVAS_H - margin_v - block_height
else:
    block_top = (CANVAS_H - block_height) // 2
block_top += round(v_offset * scale)

text_rgba = hex_to_rgba(text_color, text_opacity)
stroke_rgba = hex_to_rgba(stroke_color, 255)
shadow_rgba = hex_to_rgba(shadow_color, shadow_opacity)
active_stroke_width = round(stroke_width * scale) if stroke_enabled else 0

if shadow_enabled:
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    y = block_top
    for font, lines, line_height, height in blocks:
        for line in lines:
            w = shadow_draw.textlength(line, font=font)
            if alignment == "Center":
                x = (CANVAS_W - w) / 2
            elif alignment == "Right":
                x = CANVAS_W - round(side_margin * scale) - w
            else:
                x = round(side_margin * scale)
            shadow_draw.text(
                (x + round(shadow_dx * scale), y + round(shadow_dy * scale)),
                line, font=font, fill=shadow_rgba,
                stroke_width=active_stroke_width, stroke_fill=shadow_rgba,
            )
            y += line_height
        y += block_gap
    if shadow_blur > 0:
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(shadow_blur * scale))
    canvas = Image.alpha_composite(canvas, shadow_layer)

text_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
text_draw = ImageDraw.Draw(text_layer)
y = block_top
for font, lines, line_height, height in blocks:
    for line in lines:
        w = text_draw.textlength(line, font=font)
        if alignment == "Center":
            x = (CANVAS_W - w) / 2
        elif alignment == "Right":
            x = CANVAS_W - round(side_margin * scale) - w
        else:
            x = round(side_margin * scale)
        text_draw.text(
            (x, y), line, font=font, fill=text_rgba,
            stroke_width=active_stroke_width,
            stroke_fill=stroke_rgba if stroke_enabled else None,
        )
        y += line_height
    y += block_gap

canvas = Image.alpha_composite(canvas, text_layer)

if frame_enabled:
    frame_draw = ImageDraw.Draw(canvas)
    inset1 = round(46 * scale)
    frame_draw.rectangle(
        [inset1, inset1, CANVAS_W - inset1 - 1, CANVAS_H - inset1 - 1],
        outline=frame_color, width=max(1, round(5 * scale)),
    )
    inset2 = round(64 * scale)
    frame_draw.rectangle(
        [inset2, inset2, CANVAS_W - inset2 - 1, CANVAS_H - inset2 - 1],
        outline=frame_color, width=max(1, round(1.5 * scale)),
    )

final_img = canvas.convert("RGB")

with col_preview:
    st.subheader("Preview")
    st.image(final_img, use_container_width=True)

    buffer = io.BytesIO()
    final_img.save(buffer, format="PNG")
    image_bytes = buffer.getvalue()
    image_filename = f"{filename or 'jffj_card'}.png"

    st.download_button(
        "Download PNG",
        data=image_bytes,
        file_name=image_filename,
        mime="image/png",
        use_container_width=True,
    )
    st.caption(f"{CANVAS_W} x {CANVAS_H} · {font_name}{' Bold' if bold else ''} · {current_size}px")

    st.divider()
    st.subheader("Email it to yourself")

    if not SMTP_USER or not SMTP_PASSWORD:
        st.info(
            "Email isn't configured yet. Copy `.env.example` to `.env` next to "
            "`jffj_app/app.py` and fill in your SMTP details, then reload this page."
        )
    else:
        st.caption("Enter your email and we'll send this card straight to your inbox.")
        email_to = st.text_input(
            "Your email",
            value="",
            placeholder="you@example.com",
        )

        with st.expander("Subject / message (optional)"):
            auto_description = describe_card(
                bg_mode, gradient_name, bg_color, CANVAS_W, CANVAS_H,
                text, font_name, bold, current_size, alignment, frame_enabled,
            )
            email_subject = st.text_input("Subject", value=f"JFFJ Card — {filename or 'jffj_card'}")
            email_body = st.text_area("Message", value=auto_description, height=140)

        if st.button("Send to my email", use_container_width=True, type="primary"):
            if not email_to.strip():
                st.error("Enter an email address first.")
            elif not EMAIL_RE.match(email_to.strip()):
                st.error("That doesn't look like a valid email address.")
            else:
                try:
                    send_card_email(email_to.strip(), email_subject, email_body, image_bytes, image_filename)
                    st.success(f"Sent to {email_to.strip()}.")
                except Exception as exc:
                    st.error(f"Could not send: {exc}")
