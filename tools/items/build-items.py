"""
Item pictures from the artist's PNGs: tools/items/source/<id>.png → public/assets/items/<id>.webp
(alpha cleaned of haze and specks, trimmed, centred on a square canvas, 256 px).
UI icons (tools/items/ui/<name>.png) go to public/assets/ui/<name>.webp.
Clothes drawn on the rig canvas (tools/rig/source/wear/<id>.png) get their icons here too.
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
WEAR = os.path.abspath(os.path.join(HERE, "..", "rig", "source", "wear"))
ICON_CROP = {"sneakers": (0, 0, 1000, 2800), "slippers": (0, 0, 1000, 2800)}  # a pair far apart: the icon shows one shoe
UI_OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "ui"))
os.makedirs(UI_OUT, exist_ok=True)
# a dedicated icon drawn by the artist (source/<id>.png) wins over the one cut from the clothes on the rig canvas
own = sorted(glob.glob(os.path.join(HERE, "source", "*.png")))
have = {os.path.splitext(os.path.basename(f))[0] for f in own}
files = own + [f for f in sorted(glob.glob(os.path.join(WEAR, "*.png"))) if os.path.splitext(os.path.basename(f))[0] not in have]
files += sorted(glob.glob(os.path.join(HERE, "ui", "*.png")))
for f in files:
    name = os.path.splitext(os.path.basename(f))[0]
    dest = UI_OUT if os.path.basename(os.path.dirname(f)) == "ui" else OUT
    img = Image.open(f).convert("RGBA")
    if name in ICON_CROP and os.path.dirname(f) == os.path.abspath(WEAR): img = img.crop(ICON_CROP[name])
    im = np.array(img)
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
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(dest, name + ".webp"), "WEBP", quality=88, method=4)
    print(name, crop.size, os.path.getsize(os.path.join(dest, name + ".webp")) // 1024, "KB")
