"""
«Бандитский фарт» (the slot machine, the user 2026-11-26): its symbols, drawn on flat white (low-quality image
generations, tools/bandit/source/<id>.png) → cut out (the white joined to the edges goes, the black outline stays)
→ public/assets/bandit/<id>.webp, 256×256, transparent.
"""
import os, glob
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "bandit", "source")
OUT = os.path.join(ROOT, "public", "assets", "bandit")
os.makedirs(OUT, exist_ok=True)
for p in sorted(glob.glob(os.path.join(SRC, "*.png"))):
    sid = os.path.splitext(os.path.basename(p))[0]
    a = np.array(Image.open(p).convert("RGB")).astype(int)
    # whitish: bright and grey; the background is the whitish joined to the picture's border
    white = (a.min(2) > 225) & (a.max(2) - a.min(2) < 22)
    lab, _ = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    # and the big white holes inside (the A, the Q, the 0 of 10, the ring's hole): flat white over 0.3% of the picture
    sizes = ndimage.sum(white, lab, range(1, lab.max() + 1))
    holes = {i + 1 for i, s in enumerate(sizes) if s > white.size * 0.003}
    bg = np.isin(lab, list(edge | holes))
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=2)
    fg = ndimage.binary_fill_holes(fg) & ~np.isin(lab, list(holes))
    # keep the big pieces only (stray specks of the background go)
    lab2, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab2, range(1, n + 1))
        fg = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.04])
    alpha = ndimage.gaussian_filter(fg.astype(float), 1.0)
    rgba = np.dstack([a, (alpha * 255).astype(int)]).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v > 30 else 0).getbbox()
    im = im.crop(bb)
    s = max(im.size) + 24
    sq = Image.new("RGBA", (s, s)); sq.alpha_composite(im, ((s - im.width) // 2, (s - im.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f"{sid}.webp"), "WEBP", quality=88, method=6)
    print(sid, im.size)
