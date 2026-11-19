"""
The currency icons drawn after the real things (the user's photos, redrawn in the game's style; gpt-image on white):
tools/ui/source/cur-{papirosa,rub,bar,token,tooth}.png → public/assets/ui/cur-{papirosa,rub,gold,token,tooth}.webp, 256×256.
The white around is cut away: everything light that touches the picture's border (the drawings have a thick dark
outline, so the white inside them is never reached), the edge softened; the thing is centred on a square.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "ui"))
NAMES = {"papirosa": "papirosa", "rub": "rub", "bar": "gold", "token": "token", "tooth": "tooth"}
for src, dst in NAMES.items():
    im = Image.open(os.path.join(HERE, "source", f"cur-{src}.png")).convert("RGB")
    a = np.asarray(im, dtype=np.float32)
    light = a.min(2) > 225
    lab, _ = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    bg = ndimage.binary_dilation(bg, iterations=1)          # eat the light fringe on the outline
    alpha = ndimage.gaussian_filter((~bg).astype(np.float32), 0.8)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    rgba = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8))
    rgba = rgba.crop(rgba.getbbox())
    side = max(rgba.size) + 8
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    sq = sq.resize((256, 256), Image.LANCZOS)
    sq.save(os.path.join(OUT, f"cur-{dst}.webp"), quality=90, method=6)
    print(dst, rgba.size)
