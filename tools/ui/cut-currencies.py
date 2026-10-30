"""The currency coins (tools/ui/source/currency-coins.png: BTC, SOL / USD, RUB on a dark background with a glow)
→ public/assets/ui/coin-{btc,sol,usd,rub}.webp, 256×256, cut to the coin's circle (the dark outline kept)."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "ui"))
im = Image.open(os.path.join(HERE, "source", "currency-coins.png")).convert("RGB")
W, H = im.size
for name, (qx, qy) in {"btc": (0, 0), "sol": (1, 0), "usd": (0, 1), "rub": (1, 1)}.items():
    box = (qx * W // 2, qy * H // 2, (qx + 1) * W // 2, (qy + 1) * H // 2)
    q = im.crop(box)
    a = np.asarray(q, dtype=np.float32)
    # the coin: everything clearly brighter than the dark background and its glow, holes filled, the biggest blob
    lum = a.mean(axis=2)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(lum > 52, iterations=6))
    lab, n = ndimage.label(m)
    k = np.argmax(ndimage.sum(m, lab, range(1, n + 1))) + 1
    ys, xs = np.where(lab == k)
    cx, cy = xs.mean(), ys.mean()
    r = np.sqrt((lab == k).sum() / np.pi) + 7  # + the black outline around the rim
    s = 4
    mask = Image.new("L", (q.width * s, q.height * s), 0)
    ImageDraw.Draw(mask).ellipse(((cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s), fill=255)
    mask = mask.resize(q.size, Image.LANCZOS)
    coin = q.convert("RGBA")
    coin.putalpha(mask)
    coin = coin.crop((int(cx - r) - 2, int(cy - r) - 2, int(cx + r) + 3, int(cy + r) + 3))
    coin.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f"coin-{name}.webp"), quality=90, method=6)
    print(name, round(cx), round(cy), round(r))
