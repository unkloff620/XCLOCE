"""The location card of the list: the artist's wooden plank (tools/locations/source/card.png, transparent around it)
→ public/assets/locations/card-plank.webp (cropped to the plank). Prints the places of the artist's template boxes
(name tab, picture, the day / night leader: avatar, nickname, authority) as percent of the cropped plank for screens.css .lc-*."""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "locations"))
im = Image.open(os.path.join(HERE, "source", "card.png")).convert("RGBA")
a = np.array(im)
a[a[..., 3] < 12] = 0
im = Image.fromarray(a)
x0, y0, x1, y1 = im.getbbox()
p = im.crop((x0, y0, x1, y1))
W, H = p.size
p = p.resize((1200, round(1200 * H / W)), Image.LANCZOS)
p.save(os.path.join(OUT, "card-plank.webp"), quality=90, method=6)
print("plank", p.size)
# the template's boxes (on the 2172×541 template)
BOX = {"name": (162, 50, 594, 112), "pic": (129, 128, 619, 453), "ava-d": (719, 177, 947, 402), "nick-d": (956, 180, 1275, 242),
       "rep-d": (956, 245, 1276, 304), "ava-n": (1374, 182, 1591, 398), "nick-n": (1600, 180, 1919, 242), "rep-n": (1600, 245, 1920, 304)}
for k, (a_, b_, c_, d_) in BOX.items():
    print(f"{k}: left {(a_ - x0) / W * 100:.2f}% top {(b_ - y0) / H * 100:.2f}% width {(c_ - a_) / W * 100:.2f}% height {(d_ - b_) / H * 100:.2f}%")
