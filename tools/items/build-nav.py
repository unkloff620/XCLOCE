"""
Bottom-menu icons from the artist's sheet (tools/items/nav-sheet.png, transparent background):
every icon is found as a separate opaque blob, trimmed, centred on a square and saved as
public/assets/nav/<tab>.webp (128 px).
"""
import os
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "nav"))
SIZE = 128
# blob centre (x, y) on the sheet → tab id
TABS = {"home": (290, 342), "bosses": (772, 297), "yard": (1256, 334), "inventory": (563, 765), "clans": (1031, 742)}
os.makedirs(OUT, exist_ok=True)
im = np.array(Image.open(os.path.join(HERE, "nav-sheet.png")).convert("RGBA"))
n, lab, st, cen = cv2.connectedComponentsWithStats((im[:, :, 3] > 128).astype(np.uint8))
for tab, (cx, cy) in TABS.items():
    i = lab[cy, cx] or min(range(1, n), key=lambda k: (cen[k][0] - cx) ** 2 + (cen[k][1] - cy) ** 2)
    x, y, w, h, _ = st[i]
    m = 6  # keep the soft edge
    crop = Image.fromarray(im[max(0, y - m):y + h + m, max(0, x - m):x + w + m])
    side = max(crop.size)
    sq = Image.new("RGBA", (side, side))
    sq.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, tab + ".webp"), "WEBP", quality=90, method=4)
    print(tab, (x, y, w, h), os.path.getsize(os.path.join(OUT, tab + ".webp")) // 1024, "KB")
