"""The location page and the locations list (the user's art, tools/locations/source/page/, 1080×2340 each, one screen):
bg1.png — the paper behind everything (fixed); bg2.png — the sheet in front (from its top line down);
tab-left/mid/right.png — the tabs «Дневные» «Ночные» «Бизнес» on the sheet's top edge.
→ public/assets/locations/page/: bg1.webp, sheet.webp (cropped to the sheet), tab-{l,m,r}.webp (cropped).
Prints the tabs' places (percent of the screen width) and how far the sheet's top line comes into a tab, for screens.css."""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "page")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "locations", "page"))
os.makedirs(OUT, exist_ok=True)
W = 1080
Image.open(os.path.join(SRC, "bg1.png")).convert("RGB").resize((720, 1560), Image.LANCZOS).save(os.path.join(OUT, "bg1.webp"), quality=75, method=6)

def alpha_box(im, thr=8):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thr)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

sh = Image.open(os.path.join(SRC, "bg2.png")).convert("RGBA")
x0, sy, x1, y1 = alpha_box(sh)
sheet = sh.crop((0, sy, W, y1))
sheet.resize((720, round(720 * sheet.height / W)), Image.LANCZOS).save(os.path.join(OUT, "sheet.webp"), quality=75, method=6)
print("sheet top", sy, "height/width", round(sheet.height / W, 4))
for src, k in (("tab-left", "l"), ("tab-mid", "m"), ("tab-right", "r")):
    t = Image.open(os.path.join(SRC, f"{src}.png")).convert("RGBA")
    a, b, c, d = alpha_box(t)
    t.crop((a, b, c, d)).save(os.path.join(OUT, f"tab-{k}.webp"), quality=75, method=6)
    print(k, f"left {a / W * 100:.2f}% width {(c - a) / W * 100:.2f}% h/w {(d - b) / (c - a):.4f} sheet-in {(sy - b) / (d - b) * 100:.1f}% (top {b})")
