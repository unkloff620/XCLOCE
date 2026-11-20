"""The currency icons with a thin dark outline (the user 2026-11-20): tools/currency/source/cur-*.webp (the clean icons)
→ public/assets/ui/cur-*.webp — the shape's alpha grown by ~3.3% of the size, filled dark, the icon on top."""
import os, glob
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "ui"))
for f in sorted(glob.glob(os.path.join(HERE, "source", "cur-*.webp"))):
    im = Image.open(f).convert("RGBA")
    W, H = im.size
    pad = max(2, round(W * 0.04))
    big = Image.new("RGBA", (W + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    big.alpha_composite(im, (pad, pad))
    a = np.asarray(big)[..., 3] > 60
    r = max(1, round(W * 0.033))
    yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
    grown = ndimage.binary_dilation(a, structure=(xx * xx + yy * yy) <= r * r)
    ring = Image.fromarray((grown * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    out = Image.new("RGBA", big.size, (26, 15, 8, 0))
    out.putalpha(ring)
    out.alpha_composite(big)
    out = out.resize((W, H), Image.LANCZOS)
    out.save(os.path.join(OUT, os.path.basename(f)), quality=92, method=6)
    print(os.path.basename(f), W, r)
