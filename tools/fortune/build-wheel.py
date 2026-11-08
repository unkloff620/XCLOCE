#!/usr/bin/env python3
"""«Колесо удачи»: a manhole lid turning in its frame.

  - the lid (source/manhole-lid.png, empty between the boss and the lip) gets SECTORS curved raised ribs drawn here →
    public/assets/fortune/lid.webp (it turns; the client places the prizes with the same curve and radii:
    src/content/fortune.ts WHEEL_CURVE, WHEEL_R);
  - the frame (source/manhole-frame.png: the iron seat in broken asphalt, drawn a little squashed) is made round around its
    hole and cut square → public/assets/fortune/frame.webp; its hole is FRAME_HOLE of the half-width (fortune.ts).

    python3 tools/fortune/build-wheel.py
"""
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/fortune/source"
OUT = ROOT / "public/assets/fortune"
SECTORS, CURVE, SS = 13, 34, 2
R_HUB, R_RIM, R_LID = 200, 432, 498     # px on the 1024 lid sheet: the boss, the lip's inner edge, the lid's edge
C = 512
# the frame's hole as drawn (px of the 1024 source): x 263…766, y 260…717
HOLE_X, HOLE_Y = (263, 766), (260, 717)
FRAME_SIZE, HOLE_R = 1024, 252          # the made-round frame: its sheet and its hole's radius on it


def disc(r, size=1024, c=C, blur=0.0):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse([c - r, c - r, c + r, c + r], fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def lid():
    src = Image.open(SRC / "manhole-lid.png").convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    src.putalpha(ImageChops.multiply(src.getchannel("A"), disc(R_LID, blur=1)))
    S = 1024 * SS
    shadow = Image.new("L", (S, S), 0)
    line = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd, ld = ImageDraw.Draw(shadow), ImageDraw.Draw(line)
    for i in range(SECTORS):
        a0 = -90 + i * 360 / SECTORS
        pts = []
        for k in range(41):
            t = k / 40
            r = R_HUB - 8 + (R_RIM + 6 - (R_HUB - 8)) * t
            th = math.radians(a0 + CURVE * t ** 1.35)
            pts.append(((C + r * math.cos(th)) * SS, (C + r * math.sin(th)) * SS))
        sd.line([(x + 3 * SS, y + 4 * SS) for x, y in pts], fill=140, width=12 * SS, joint="curve")
        ld.line(pts, fill=(46, 48, 52, 255), width=15 * SS, joint="curve")
        ld.line(pts, fill=(196, 199, 204, 255), width=9 * SS, joint="curve")
        ld.line([(x - 1.2 * SS, y - 1.2 * SS) for x, y in pts], fill=(236, 238, 241, 255), width=3 * SS, joint="curve")
    clip = ImageChops.subtract(disc(R_RIM + 2), disc(R_HUB - 4))
    shadow = ImageChops.multiply(shadow.resize((1024, 1024), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3)), clip)
    dark = Image.new("RGBA", (1024, 1024), (20, 20, 24, 255))
    dark.putalpha(shadow.point(lambda v: int(v * 0.45)))
    out = Image.alpha_composite(src, dark)
    line = line.resize((1024, 1024), Image.LANCZOS)
    line.putalpha(ImageChops.multiply(line.getchannel("A"), clip.filter(ImageFilter.GaussianBlur(1))))
    out = Image.alpha_composite(out, line)
    out.paste(src, (0, 0), disc(R_HUB - 6, blur=1.5))      # the boss over the ribs' ends
    out.resize((900, 900), Image.LANCZOS).save(OUT / "lid.webp", "WEBP", quality=88, method=6)


def frame():
    src = Image.open(SRC / "manhole-frame.png").convert("RGBA")
    cx, cy = sum(HOLE_X) / 2, sum(HOLE_Y) / 2
    rx, ry = (HOLE_X[1] - HOLE_X[0]) / 2, (HOLE_Y[1] - HOLE_Y[0]) / 2
    k = HOLE_R / rx
    w, h = round(src.width * k), round(src.height * k * rx / ry)
    big = src.resize((w, h), Image.LANCZOS)
    ox, oy = round(cx * k) - FRAME_SIZE // 2, round(cy * k * rx / ry) - FRAME_SIZE // 2
    sheet = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    sheet.paste(big, (-ox, -oy), big)
    # the hole: dark, deeper in the middle (the lid covers all but a thin gap)
    hole = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (8, 8, 10, 255))
    hole.putalpha(disc(HOLE_R + 6, FRAME_SIZE, FRAME_SIZE // 2, 2))
    sheet = Image.alpha_composite(hole, sheet)
    sheet.resize((900, 900), Image.LANCZOS).save(OUT / "frame.webp", "WEBP", quality=86, method=6)
    print("frame: hole", HOLE_R / (FRAME_SIZE / 2), "of the half-width")


if __name__ == "__main__":
    lid()
    frame()
    print("wrote", OUT / "lid.webp", OUT / "frame.webp")
