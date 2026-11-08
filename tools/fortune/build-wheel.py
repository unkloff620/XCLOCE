#!/usr/bin/env python3
"""«Колесо удачи»: the wheel picture with SECTORS curved steel spokes.

The rim with its bulbs and the hub: source/wheel-metal.png (an image edit of the street wheel in the metal of the artist's
first wheel); the disc between them: source/wheel-plate.png (the artist's dotted rusty plate without spokes). The spokes are
drawn here, evenly, in the same light steel. The client places the prizes with the same curve and radii
(src/content/fortune.ts WHEEL_CURVE, WHEEL_R).

    python3 tools/fortune/build-wheel.py   →  public/assets/fortune/wheel-v3.webp
"""
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/fortune/source"
OUT = ROOT / "public/assets/fortune/wheel-v3.webp"
SECTORS, CURVE, SS = 13, 34, 2
R_HUB, R_RIM = 140, 398          # px on the 1024 sheet (fortune.ts WHEEL_R)
C = 512


def disc(r, blur=0.0):
    m = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(m).ellipse([C - r, C - r, C + r, C + r], fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def main():
    metal = Image.open(SRC / "wheel-metal.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    plate = Image.open(SRC / "wheel-plate.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    # the artist's plate filled the ring 134…404: stretch it a little to 140…398 is not needed — it covers the whole inside
    wheel = metal.copy()
    inside = ImageChops.subtract(disc(R_RIM + 1, 1.5), disc(R_HUB - 1, 1.5))
    wheel.paste(plate, (0, 0), inside)

    S = 1024 * SS
    shadow = Image.new("L", (S, S), 0)
    line = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd, ld = ImageDraw.Draw(shadow), ImageDraw.Draw(line)
    for i in range(SECTORS):
        a0 = -90 + i * 360 / SECTORS
        pts = []
        for k in range(41):
            t = k / 40
            r = R_HUB - 6 + (R_RIM + 10 - (R_HUB - 6)) * t
            th = math.radians(a0 + CURVE * t ** 1.35)
            pts.append(((C + r * math.cos(th)) * SS, (C + r * math.sin(th)) * SS))
        sd.line([(x + 4 * SS, y + 5 * SS) for x, y in pts], fill=150, width=16 * SS, joint="curve")
        ld.line(pts, fill=(48, 46, 44, 255), width=18 * SS, joint="curve")
        ld.line(pts, fill=(200, 197, 191, 255), width=12 * SS, joint="curve")
        ld.line([(x - 1.5 * SS, y - 1.5 * SS) for x, y in pts], fill=(240, 238, 233, 255), width=5 * SS, joint="curve")
    clip = ImageChops.subtract(disc(R_RIM + 2), disc(R_HUB - 2))
    shadow = ImageChops.multiply(shadow.resize((1024, 1024), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4)), clip)
    dark = Image.new("RGBA", (1024, 1024), (20, 16, 12, 255))
    dark.putalpha(shadow.point(lambda v: int(v * 0.5)))
    wheel = Image.alpha_composite(wheel, dark)
    line = line.resize((1024, 1024), Image.LANCZOS)
    line.putalpha(ImageChops.multiply(line.getchannel("A"), clip.filter(ImageFilter.GaussianBlur(1))))
    wheel = Image.alpha_composite(wheel, line)
    wheel.paste(metal, (0, 0), disc(R_HUB - 3, 1.5))   # the hub over the spokes' ends
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wheel.resize((900, 900), Image.LANCZOS).save(OUT, "WEBP", quality=88, method=6)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
