"""
Eye colour variants of the pupils layer.
Input: tools/rig/source/v2/pupils.png (the artist's dark iris on the 2000×2800 canvas).
Output: public/assets/hero/pupils-<i>.webp for every EYE_COLORS index above 0 (index 0 is the original pupils.webp).
The crop and scale match tools/rig/build-rig.py, so RIG.pupils positions every variant.
Recolour: the grey iris takes the colour with its own light and shade; the black outline, the pupil and the white glints stay.
Keep COLORS in sync with EYE_COLORS in src/content/home.ts.
"""
import os
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "hero")
SCALE = 0.5
COLORS = ["#2a2a33", "#7a4a26", "#2f6fd6", "#2e9e5b", "#8a98a8", "#9b5de5", "#e0a32f", "#d63a3a"]

im = np.array(Image.open(os.path.join(HERE, "source", "v2", "pupils.png")).convert("RGBA"))
a = im[:, :, 3]
a[a < 40] = 0
n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8))
for i in range(1, n):
    if st[i][4] < 20: a[lab == i] = 0
im[:, :, 3] = a
im[a == 0, :3] = 0
ys, xs = np.nonzero(a)
x0, y0, x1, y1 = xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5
base = im[y0:y1, x0:x1].astype(np.float32)
rgb = base[:, :, :3]
lum = rgb.mean(axis=2)
# 0 on the black outline/pupil, 1 on the iris; glints (very light) are left alone
w = np.clip((lum - 14) / 22, 0, 1) * np.clip((165 - lum) / 40, 0, 1)
shade = np.clip(lum / 72, 0.35, 1.45)[:, :, None]

for i, hexc in enumerate(COLORS):
    if i == 0:
        continue
    c = np.array([int(hexc[k:k + 2], 16) for k in (1, 3, 5)], np.float32)
    tint = np.clip(c[None, None, :] * shade, 0, 255)
    out = base.copy()
    out[:, :, :3] = rgb * (1 - w[:, :, None]) + tint * w[:, :, None]
    img = Image.fromarray(out.astype(np.uint8))
    img = img.resize((round(img.width * SCALE), round(img.height * SCALE)), Image.LANCZOS)
    p = os.path.join(OUT, f"pupils-{i}.webp")
    img.save(p, "WEBP", quality=92, method=6)
    print(p, img.size)
