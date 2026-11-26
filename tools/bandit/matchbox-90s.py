"""
The blue matchbox of «Бандитский фарт» (the roulette's win; the spins give the red one, source/matchbox.png): the 90s
box — white with a blue stripe (the user 2026-11-26), a low-quality image edit of the red one on flat magenta
(tools/bandit/source/extra/matchbox-90s.png) → the magenta keyed out → public/assets/bandit/matchbox-blue.webp, 256×256.
"""
import numpy as np
from PIL import Image
from scipy import ndimage

a = np.array(Image.open("tools/bandit/source/extra/matchbox-90s.png").convert("RGB")).astype(float)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# magenta-ness: red and blue high, green low
mag = np.clip(((r + b) / 2 - g - 60) / 80, 0, 1)
lab, _ = ndimage.label(mag > 0.5)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(edge))
alpha = np.where(bg, 0, 1 - mag * (ndimage.binary_dilation(bg, iterations=3)))
# the pink fringe at the edge: take the magenta out of it
fr = (alpha > 0) & (alpha < 1)
a[fr, 0] = np.minimum(a[fr, 0], a[fr, 1] + 30); a[fr, 2] = np.minimum(a[fr, 2], a[fr, 1] + 30)
im = Image.fromarray(np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8))
im = im.crop(im.getbbox())
side = round(max(im.size) * 1.04)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
sq.resize((256, 256), Image.LANCZOS).save("public/assets/bandit/matchbox-blue.webp", quality=90, method=6)
print("ok")
