#!/usr/bin/env python3
"""«Колесо удачи»: the wheel picture with SECTORS curved spokes.

The artist's wheel (source/wheel-original.png, 1024 px) has 15 uneven spokes; the game has 13 sectors. The plate without
spokes (source/wheel-plate.png, an image edit of the original) gives the inside, the original keeps its rim and hub, and the
spokes are drawn here, evenly. The client places the sector prizes with the same curve (src/content/fortune.ts WHEEL_CURVE).

    python3 tools/fortune/build-wheel.py   →  public/assets/fortune/wheel.webp
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/fortune/source"
OUT = ROOT / "public/assets/fortune/wheel.webp"

SECTORS = 13
R_HUB, R_RIM = 134, 404          # px on the 1024 sheet: the hub's white ring, the rim's white ring
CURVE = 34                       # degrees the spoke turns from the hub to the rim (the same in fortune.ts)
SS = 2                           # supersampling


def spoke_theta(a0, t):
    """angle (deg) of a spoke starting at a0, at t = 0 (hub) … 1 (rim): bends more near the rim, like the artist's"""
    return a0 + CURVE * (t ** 1.35)


def main():
    orig = Image.open(SRC / "wheel-original.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    plate = Image.open(SRC / "wheel-plate.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    c = 512
    # inside: the plate; the hub and the rim: the original (soft edges)
    mask = Image.new("L", (1024, 1024), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([c - R_RIM - 22, c - R_RIM - 22, c + R_RIM + 22, c + R_RIM + 22], fill=255)
    md.ellipse([c - R_HUB, c - R_HUB, c + R_HUB, c + R_HUB], fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(2))
    wheel = orig.copy()
    wheel.paste(plate, (0, 0), mask)

    S = 1024 * SS
    shadow = Image.new("L", (S, S), 0)
    line = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd, ld = ImageDraw.Draw(shadow), ImageDraw.Draw(line)
    for i in range(SECTORS):
        a0 = -90 + i * 360 / SECTORS
        pts = []
        for k in range(41):
            t = k / 40
            r = R_HUB - 4 + (R_RIM + 10 - (R_HUB - 4)) * t
            th = math.radians(spoke_theta(a0, t))
            pts.append(((c + r * math.cos(th)) * SS, (c + r * math.sin(th)) * SS))
        sd.line([(x + 5 * SS, y + 6 * SS) for x, y in pts], fill=150, width=18 * SS, joint="curve")
        ld.line(pts, fill=(52, 50, 48, 255), width=19 * SS, joint="curve")
        ld.line(pts, fill=(196, 192, 186, 255), width=13 * SS, joint="curve")
        ld.line([(x - 1.5 * SS, y - 1.5 * SS) for x, y in pts], fill=(246, 244, 240, 255), width=6 * SS, joint="curve")
    shadow = shadow.resize((1024, 1024), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4))
    inside = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(inside).ellipse([c - R_RIM - 4, c - R_RIM - 4, c + R_RIM + 4, c + R_RIM + 4], fill=255)
    ImageDraw.Draw(inside).ellipse([c - R_HUB + 2, c - R_HUB + 2, c + R_HUB - 2, c + R_HUB - 2], fill=0)
    from PIL import ImageChops
    shadow = ImageChops.multiply(shadow, inside)
    dark = Image.new("RGBA", (1024, 1024), (20, 18, 16, 255))
    dark.putalpha(shadow.point(lambda v: int(v * 0.55)))
    wheel = Image.alpha_composite(wheel, dark)
    line = line.resize((1024, 1024), Image.LANCZOS)
    la = ImageChops.multiply(line.getchannel("A"), inside.filter(ImageFilter.GaussianBlur(1)))
    line.putalpha(la)
    wheel = Image.alpha_composite(wheel, line)
    # the hub back on top (the spokes go under it)
    hub = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(hub).ellipse([c - R_HUB + 3, c - R_HUB + 3, c + R_HUB - 3, c + R_HUB - 3], fill=255)
    wheel.paste(orig, (0, 0), hub.filter(ImageFilter.GaussianBlur(1.5)))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wheel.resize((900, 900), Image.LANCZOS).save(OUT, "WEBP", quality=88, method=6)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
