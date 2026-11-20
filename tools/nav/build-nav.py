"""The bottom menu's icons (vector cartoon, the user's picks 2026-11-20): tools/nav/source/<id>.png (1024², white background)
→ public/assets/nav/<id>.webp (128², transparent): the white around the object (reached from the edges) cut away, the edge softened."""
import os, glob
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "nav"))
for f in sorted(glob.glob(os.path.join(HERE, "source", "*.png"))):
    im = Image.open(f).convert("RGB")
    a = np.asarray(im).astype(int)
    white = (a.min(axis=2) > 232) & (a.max(axis=2) - a.min(axis=2) < 18)
    lab, _ = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = Image.fromarray(((~bg) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    rgba = im.convert("RGBA"); rgba.putalpha(alpha)
    x0, y0, x1, y1 = rgba.getbbox()
    s = max(x1 - x0, y1 - y0) + 16
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sq.alpha_composite(rgba.crop((cx - s // 2, cy - s // 2, cx - s // 2 + s, cy - s // 2 + s)))
    sq.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, os.path.basename(f)[:-4] + ".webp"), quality=90, method=6)
    print(os.path.basename(f))
