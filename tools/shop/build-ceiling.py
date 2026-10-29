"""
The shop's ceiling above the picture (public/assets/shop/v2/ceiling.webp): on tall phones the scene does not reach the
top of the screen, so the room goes on upward instead of a hard edge.
The room is drawn in one-point perspective: the ceiling is a plane whose edges (the two corner beams) run to the
vanishing point VP. Scaling the picture about VP maps the ceiling onto itself, so every row above the picture is taken
from the ceiling band of room.webp (rows 0..BAND) scaled about VP; the band is mirrored back and forth in log-distance,
so there are no seams, and the seam with the picture is exact (row 0 maps onto itself); the band's own top-to-bottom shading is flattened. The ceiling darkens upward
(farther from the lamp), and the lamp cord goes on up to a mount.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "public/assets/shop/v2/room.webp"
OUT = "public/assets/shop/v2/ceiling.webp"
EXT = 900                   # px above the picture (room.webp is 1200×1680)
VP = (568.0, 679.0)         # where the corner beams meet (measured on room.webp)
BAND = 98                   # the ceiling rows above the front beam
CORD_X = 598                # the lamp cord (lamp layer: canvas x 49.8 %)
CORD_TOP = 150              # the cord mount, px above the picture

room = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
H, W, _ = room.shape
vx, vy = VP
r0, r1 = vy, vy - BAND
L = np.log(r0 / r1)

ys, xs = np.mgrid[0:EXT, 0:W].astype(np.float32)
y = ys - EXT                                   # rows above the picture: -EXT..-1
r = vy - y
w = np.log(r / r0)
m = np.mod(w, 2 * L)
m = np.where(m < L, m, 2 * L - m)
rs = r0 * np.exp(-m)
t = rs / r
sx = vx + (xs - vx) * t
sy = vy - rs


def bilinear(img, x, y):
    x = np.clip(x, 0, img.shape[1] - 1.001)
    y = np.clip(y, 0, img.shape[0] - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a, b = img[y0, x0], img[y0, x0 + 1]
    c, d = img[y0 + 1, x0], img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


# the band is shaded top to bottom; mirrored, that shading would show as stripes: flatten it (row by row), fading the
# fix in over the first band so the seam with the picture stays exact
rows = room[: BAND + 2, 300:900].mean(axis=(1, 2))
flat = room.copy()
flat[: BAND + 2] *= (rows.mean() / rows)[:, None, None]
raw = bilinear(room, sx, sy)
fix = bilinear(flat, sx, sy)
a = np.clip(w / L, 0, 1)[..., None]
out = raw * (1 - a) + fix * a
# farther from the lamp: darker and a little cooler upward
k = (np.abs(y) / EXT)[..., None]
out = out * (1 - 0.55 * k ** 0.8)
out[..., 2] *= 1 + 0.06 * k[..., 0]
img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))

# the lamp cord up to a mount on the ceiling
d = ImageDraw.Draw(img)
top = EXT - CORD_TOP
d.rectangle((CORD_X - 7, top, CORD_X + 7, EXT), fill=(26, 20, 14))
d.rectangle((CORD_X - 3, top, CORD_X + 2, EXT), fill=(92, 96, 62))
d.ellipse((CORD_X - 34, top - 14, CORD_X + 34, top + 12), fill=(26, 20, 14))
d.ellipse((CORD_X - 28, top - 10, CORD_X + 28, top + 6), fill=(70, 74, 50))
img.save(OUT, quality=86, method=6)
print("ceiling", img.size)
