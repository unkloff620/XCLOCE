"""
«Барыга на газели» — the artist's pictures (tools/van/source/):
  body.png, wheels.png — the van and its wheels in place on the back yard's sheet (1200×2043, like yard0-bg.webp);
  trunk.png — the open back doors (the window), plaque.png — the slate the packs are shown on.
→ public/assets/van/: body.webp, wheels.webp (cropped; their place on the sheet printed for screens.css .yard-van-*),
  trunk.webp (cropped), plaque-{free,bronze,silver,gold}.webp (the slate as is, and tinted bronze / silver / gold by
  its brightness), plaque-rim.webp (the slate's outline band as a white mask: the shine runs along it).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "van"))
os.makedirs(OUT, exist_ok=True)
W, H = 1200, 2043

for n in ("body", "wheels"):
    im = Image.open(os.path.join(SRC, f"{n}.png")).convert("RGBA")
    a = np.array(im)
    a[a[..., 3] < 8] = 0                       # stray specks off
    im = Image.fromarray(a)
    x0, y0, x1, y1 = im.getbbox()
    im.crop((x0, y0, x1, y1)).save(os.path.join(OUT, f"{n}.webp"), quality=90, method=6)
    print(n, f"left {x0 / W * 100:.2f}% top {y0 / H * 100:.2f}% width {(x1 - x0) / W * 100:.2f}% height {(y1 - y0) / H * 100:.2f}%")

t = Image.open(os.path.join(SRC, "trunk.png")).convert("RGBA")
t = t.crop(t.getbbox())
t.save(os.path.join(OUT, "trunk.webp"), quality=88, method=6)
print("trunk", t.size)

p = Image.open(os.path.join(SRC, "plaque.png")).convert("RGBA")
p = p.crop(p.getbbox())
p.save(os.path.join(OUT, "plaque-free.webp"), quality=90, method=6)
a = np.asarray(p).astype(np.float32)
lum = (a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)) / 255
# a tint: dark → deep, light → bright, by the slate's own brightness (its scratches and the ribbon's folds stay)
TINTS = {"bronze": ((52, 26, 10), (176, 104, 56), (255, 214, 168)),
         "silver": ((44, 48, 56), (150, 158, 172), (255, 255, 255)),
         "gold": ((60, 36, 4), (214, 158, 34), (255, 244, 186))}
for name, (lo, mid, hi) in TINTS.items():
    lo, mid, hi = (np.array(c, np.float32) for c in (lo, mid, hi))
    k = np.clip(lum * 1.15, 0, 1)[..., None]
    rgb = np.where(k < 0.5, lo + (mid - lo) * (k / 0.5), mid + (hi - mid) * ((k - 0.5) / 0.5))
    Image.fromarray(np.dstack([rgb, a[..., 3]]).astype(np.uint8)).save(os.path.join(OUT, f"plaque-{name}.webp"), quality=90, method=6)

# the outline band: the solid slate's edge (inside its outline, a band about 2.4% of the width)
solid = a[..., 3] > 128
d = ndimage.distance_transform_edt(solid)
band = np.clip(1 - (d - p.width * 0.024) / 6, 0, 1) * solid
rim = np.zeros((p.height, p.width, 4), np.uint8)
rim[..., :3] = 255
rim[..., 3] = (band * 255).astype(np.uint8)
Image.fromarray(rim).save(os.path.join(OUT, "plaque-rim.webp"), quality=90, method=6)
print("plaque", p.size)
