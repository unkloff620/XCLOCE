#!/usr/bin/env python3
"""«Колесо удачи»: the artist's manhole (source/wheel-original.png) cut in two —

  - the frame: its toothed rim (outside R_CUT), it stays → public/assets/fortune/rim.webp;
  - the lid: everything inside — the dotted rusty plate (source/wheel-plate.png, an edit of the same picture without its
    15 uneven spokes), SECTORS even curved spokes drawn here, the hub → public/assets/fortune/lid-v1.webp; it turns.
Both on the same sheet, so the client lays them one on the other. The prizes follow the same curve and radii
(src/content/fortune.ts WHEEL_CURVE, WHEEL_R).

    python3 tools/fortune/build-wheel.py
"""
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/fortune/source"
OUT = ROOT / "public/assets/fortune"
SECTORS, CURVE, SS = 13, 34, 2
R_HUB, R_RIM = 134, 404     # px on the 1024 sheet: the hub's white ring, the rim's white ring
R_CUT = 424                 # the lid ends here (on the dark groove between the white ring and the toothed rim)
C = 512


def disc(r, blur=0.0):
    m = Image.new("L", (1024, 1024), 0)
    ImageDraw.Draw(m).ellipse([C - r, C - r, C + r, C + r], fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def main():
    orig = Image.open(SRC / "wheel-original.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    plate = Image.open(SRC / "wheel-plate.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)

    # the lid: the plate up to the groove (its own white ring has no spoke stubs), the original hub
    lid = plate.copy()
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
            th = math.radians(a0 + CURVE * t ** 1.35)
            pts.append(((C + r * math.cos(th)) * SS, (C + r * math.sin(th)) * SS))
        sd.line([(x + 5 * SS, y + 6 * SS) for x, y in pts], fill=150, width=18 * SS, joint="curve")
        ld.line(pts, fill=(52, 50, 48, 255), width=19 * SS, joint="curve")
        ld.line(pts, fill=(196, 192, 186, 255), width=13 * SS, joint="curve")
        ld.line([(x - 1.5 * SS, y - 1.5 * SS) for x, y in pts], fill=(246, 244, 240, 255), width=6 * SS, joint="curve")
    inside = ImageChops.subtract(disc(R_RIM + 4), disc(R_HUB))
    shadow = ImageChops.multiply(shadow.resize((1024, 1024), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4)), inside)
    dark = Image.new("RGBA", (1024, 1024), (20, 18, 16, 255))
    dark.putalpha(shadow.point(lambda v: int(v * 0.55)))
    lid = Image.alpha_composite(lid, dark)
    line = line.resize((1024, 1024), Image.LANCZOS)
    line.putalpha(ImageChops.multiply(line.getchannel("A"), inside.filter(ImageFilter.GaussianBlur(1))))
    lid = Image.alpha_composite(lid, line)
    lid.paste(orig, (0, 0), disc(R_HUB - 3, 1.5))
    lid.putalpha(ImageChops.multiply(lid.getchannel("A"), disc(R_CUT, 1)))
    lid.resize((900, 900), Image.LANCZOS).save(OUT / "lid-v1.webp", "WEBP", quality=88, method=6)

    # the frame: the toothed rim of the original, the middle cut out
    rim = orig.copy()
    rim.putalpha(ImageChops.multiply(rim.getchannel("A"), ImageChops.invert(disc(R_CUT - 1, 1))))
    rim.resize((900, 900), Image.LANCZOS).save(OUT / "rim.webp", "WEBP", quality=88, method=6)
    print("wrote", OUT / "lid-v1.webp", OUT / "rim.webp")


if __name__ == "__main__":
    main()
