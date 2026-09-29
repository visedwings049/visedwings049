"""Draws the JFFJ motorcycle icon (assets/jffj.ico + png preview). Run: python tools/make_icon.py"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "assets"
S = 1024  # draw big, downsample for crisp edges


def build() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # rounded-square background: dusk gradient
    bg = Image.new("RGBA", (S, S))
    px = bg.load()
    top, bottom = (22, 22, 30), (120, 44, 22)
    for y in range(S):
        t = (y / S) ** 1.4
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(S):
            px[x, y] = c
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=210, fill=255)
    img.paste(bg, (0, 0), mask)

    # road-flare sun behind the bike
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([262, 190, 762, 690], fill=(224, 82, 31, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    sun_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sun_mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=210, fill=255)
    img.alpha_composite(Image.composite(glow, Image.new("RGBA", (S, S), (0, 0, 0, 0)), sun_mask))

    d = ImageDraw.Draw(img)
    ink = (10, 10, 12, 255)

    # ground line
    d.rounded_rectangle([90, 806, 934, 830], radius=12, fill=ink)

    # wheels
    rear, front = (300, 690), (760, 690)
    r_out, r_in = 128, 96
    for cx, cy in (rear, front):
        d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=ink)
        d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=(224, 82, 31, 255))
        d.ellipse([cx - r_in + 14, cy - r_in + 14, cx + r_in - 14, cy + r_in - 14], fill=(30, 20, 18, 255))
        for a in range(0, 360, 30):  # spokes
            import math
            ex = cx + math.cos(math.radians(a)) * (r_in - 12)
            ey = cy + math.sin(math.radians(a)) * (r_in - 12)
            d.line([cx, cy, ex, ey], fill=ink, width=7)
        d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=ink)

    # long raked front fork
    d.line([(690, 420), front], fill=ink, width=26)
    d.line([(672, 430), (752, 660)], fill=ink, width=10)
    # handlebar (ape hangers)
    d.line([(668, 430), (640, 300), (700, 262)], fill=ink, width=22, joint="curve")
    d.ellipse([688, 250, 724, 286], fill=ink)
    # headlight
    d.ellipse([672, 392, 742, 462], fill=ink)

    # frame / engine block
    d.polygon([(300, 690), (420, 560), (600, 560), (690, 440), (668, 424), (590, 500), (430, 500), (330, 620)], fill=ink)
    d.rounded_rectangle([420, 560, 610, 700], radius=24, fill=ink)
    for i in range(4):  # cooling fins
        d.rectangle([430 + i * 46, 540, 452 + i * 46, 566], fill=ink)
    # swingarm to rear wheel
    d.line([(420, 640), rear], fill=ink, width=28)

    # teardrop tank
    d.polygon([(430, 500), (470, 430), (600, 410), (660, 460), (610, 505), (520, 510)], fill=ink)
    # solo seat + sissy bar
    d.polygon([(330, 500), (430, 500), (440, 470), (350, 470)], fill=ink)
    d.line([(345, 480), (290, 380)], fill=ink, width=14)
    # exhaust pipe
    d.rounded_rectangle([300, 690, 560, 724], radius=17, fill=ink)
    # rider-less: little flame accent on the tank
    d.polygon([(500, 470), (545, 440), (585, 448), (540, 478)], fill=(224, 82, 31, 255))

    return img


def main():
    OUT.mkdir(exist_ok=True)
    icon = build()
    icon.resize((512, 512), Image.LANCZOS).save(OUT / "jffj_icon.png")
    icon.save(OUT / "jffj.ico", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print("wrote", OUT / "jffj.ico")


if __name__ == "__main__":
    main()
