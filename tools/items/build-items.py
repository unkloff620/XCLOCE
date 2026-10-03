"""
Item pictures from the artist's PNGs: tools/items/source/<id>.png → public/assets/items/<id>.webp
(alpha cleaned of haze and specks, trimmed, centred on a square canvas, 256 px).
The ids listed in RASTER_ITEMS (src/client/art/items.tsx) use these files instead of the vector art.
"""
import os, glob
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "items"))
SIZE = 256
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(HERE, "source", "*.png"))):
    im = np.array(Image.open(f).convert("RGBA"))
    a = im[:, :, 3]
    a[a < 40] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8))
    for i in range(1, n):
        if st[i][4] < 300: a[lab == i] = 0
    im[:, :, 3] = a
    ys, xs = np.nonzero(a)
    crop = Image.fromarray(im[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    side = round(max(crop.size) * 1.04)
    sq = Image.new("RGBA", (side, side))
    sq.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    name = os.path.splitext(os.path.basename(f))[0]
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, name + ".webp"), "WEBP", quality=88, method=4)
    print(name, crop.size, os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024, "KB")
