"""
The shop's ceiling above the picture (public/assets/shop/v2/ceiling.webp): on tall phones the scene does not reach the
top of the screen, so the room goes on upward instead of a hard edge.
The room is drawn in one-point perspective: the ceiling is a plane whose edges (the two corner beams) run to the
vanishing point VP. Scaling the picture about VP maps the ceiling onto itself, so every row above the picture is taken
from the ceiling band of room.webp (rows 0..BAND) scaled about VP; the band is mirrored back and forth in log-distance,
so there are no seams, and the seam with the picture is exact (row 0 maps onto itself); the band's own top-to-bottom shading is flattened; further up the plaster
is a drawn tileable texture in the same perspective, so cracks do not repeat. The ceiling darkens upward
(farther from the lamp), and the lamp cord goes on up to a mount.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "public/assets/shop/v2/room.webp"
OUT = "public/assets/shop/v2/ceiling.webp"
TEX = "tools/shop/source/ceiling-plaster.png"
TEX_U, TEX_V = 1150.0, 1_250_000.0     # texture px per (screen px / distance to VP) and per (1 / distance): plaster scale
LEFT_EDGE = (40.0, 0.777)            # inner edge of the left beam: x = a + b·y (y = row, negative above the picture)
RIGHT_EDGE = (1150.0, -0.857)
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
# past the first band the plaster is a drawn tileable texture (tools/shop/source/ceiling-plaster.png, generated from
# the room's own ceiling) laid on the ceiling plane in the same perspective: no repeated cracks. Only between the inner
# edges of the corner beams (lines through VP); colours matched to the band; faded in so the seam stays exact.
tex = np.asarray(Image.open(TEX).convert("RGB")).astype(np.float32)
band = room[:BAND, 300:900].reshape(-1, 3)
tm, ts = tex.reshape(-1, 3).mean(0), tex.reshape(-1, 3).std(0)
tex = (tex - tm) / ts * band.std(0) + band.mean(0)
u = (xs - vx) / r * TEX_U
v = TEX_V / r
tx = np.mod(u, tex.shape[1] - 1)
ty = np.mod(v, tex.shape[0] - 1)
proj = bilinear(tex, tx, ty)
left = LEFT_EDGE[0] + LEFT_EDGE[1] * y          # inner edges of the beams, x on row y
right = RIGHT_EDGE[0] + RIGHT_EDGE[1] * y
inside = np.clip(np.minimum(xs - left, right - xs) / 6.0, 0, 1)
fade = np.clip((w / L - 0.4) / 1.2, 0, 1)
tw = (inside * fade)[..., None]
out = out * (1 - tw) + proj * tw
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
