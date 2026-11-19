"""
An item drawn on white (gpt-image): tools/items/source/<id>.png → public/assets/items/<id>.webp, 256×256.
The white that touches the border is cut away (the thick dark outline keeps the white inside the drawing), the edge
softened, the thing centred on a square.   python3 tools/items/cut-white.py matches [more ids…]
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "items"))
for name in sys.argv[1:]:
    a = np.asarray(Image.open(os.path.join(HERE, "source", f"{name}.png")).convert("RGB"), dtype=np.float32)
    lab, _ = ndimage.label(a.min(2) > 225)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = ndimage.binary_dilation(np.isin(lab, list(edge)), iterations=1)
    alpha = np.clip((ndimage.gaussian_filter((~bg).astype(np.float32), 0.8) - 0.15) / 0.7, 0, 1)
    im = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8))
    im = im.crop(im.getbbox())
    side = max(im.size) + 12
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f"{name}.webp"), quality=90, method=6)
    print(name, im.size)
