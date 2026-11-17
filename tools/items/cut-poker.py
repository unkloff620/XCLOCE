"""
Poker's pictures (tools/items/source/poker/, image generations on white): the sticker, the cases, the raven —
the white around them taken off (flood from the border), trimmed, on a 256² square → public/assets/items/<id>.webp.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "items", "source", "poker")
OUT = os.path.join(ROOT, "public", "assets", "items")
MAP = {"sticker2": "poker-sticker", "case2": "poker-case", "case-bronze": "poker-case-1", "case-silver": "poker-case-2",
       "case-gold": "poker-case-3", "case-open": "poker-case-open", "raven": "raven",
       # the opened cases seen from above (the rewards lie on the velvet)
       "open-bronze": "poker-case-1-open", "open-silver": "poker-case-2-open", "open-gold": "poker-case-3-open"}
SIZE = {"poker-case-open": 512, "poker-case-1-open": 512, "poker-case-2-open": 512, "poker-case-3-open": 512}

for src, out in MAP.items():
    im = np.array(Image.open(os.path.join(SRC, src + ".png")).convert("RGB")).astype(np.float32)
    white = im.min(2) > 232
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    bg = np.isin(lab, list(border))
    # a soft edge: the near-white rim next to the background fades
    d = ndimage.distance_transform_edt(~bg)
    a = np.clip(d / 2.0, 0, 1)
    rgba = np.dstack([im, a * 255]).astype(np.uint8)
    pic = Image.fromarray(rgba)
    pic = pic.crop(pic.getbbox())
    n = SIZE.get(out, 256)
    side = max(pic.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(pic, ((side - pic.width) // 2, (side - pic.height) // 2))
    sq.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, out + ".webp"), "WEBP", quality=90, method=6)
    print(out)
