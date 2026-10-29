"""
The upgrader cabinet (gpt-image-2 / gpt-image-1.5 art, tools/upgrader/source/):
  upg-room.png    → public/assets/upgrader/room.webp   (1024×1536: two empty item slots, the round dial, plates, the tray)
  upg-needle.png  → public/assets/upgrader/needle.webp (the arrow riding the dial ring, pointing up)
  upg-buttons.png → public/assets/upgrader/btn-off.webp, btn-on.webp (mode buttons), btn-go.webp (the long button)
Run from the repo root: python3 tools/upgrader/build-upgrader.py
"""
import os
import numpy as np
from PIL import Image

SRC, OUT = "tools/upgrader/source", "public/assets/upgrader"
os.makedirs(OUT, exist_ok=True)
Image.open(f"{SRC}/upg-room.png").convert("RGB").save(f"{OUT}/room.webp", quality=86, method=6)


def trim(im, size=None):
    im = im.crop(im.getbbox())
    if size:
        k = size / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    return im


trim(Image.open(f"{SRC}/upg-needle.png").convert("RGBA"), 160).save(f"{OUT}/needle.webp", quality=90, method=6)

# the button sheet: find the separate sprites by their opaque columns/rows
sheet = Image.open(f"{SRC}/upg-buttons.png").convert("RGBA")
alpha = np.array(sheet)[..., 3] > 24


def spans(v):
    out, start = [], None
    for i, on in enumerate(v):
        if on and start is None:
            start = i
        if not on and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(v)))
    return [s for s in out if s[1] - s[0] > 20]


rows = spans(alpha.any(1))
top = alpha[rows[0][0]:rows[0][1]]
cols = spans(top.any(0))
boxes = [(c0, rows[0][0], c1, rows[0][1]) for c0, c1 in cols]
off, on = sheet.crop(boxes[0]), sheet.crop(boxes[-1])
go = trim(sheet.crop((0, rows[-1][0], sheet.width, rows[-1][1])))
trim(off, 220).save(f"{OUT}/btn-off.webp", quality=90, method=6)
trim(on, 220).save(f"{OUT}/btn-on.webp", quality=90, method=6)
trim(go, 900).save(f"{OUT}/btn-go.webp", quality=88, method=6)
for n in ("btn-off", "btn-on", "btn-go", "needle"):
    print(n, Image.open(f"{OUT}/{n}.webp").size)
