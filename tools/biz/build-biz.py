"""The businesses' pencil sketches (tools/biz/source/<biz id>.png, white background; content/business.ts)
→ public/assets/biz/<biz id>.webp: the white made transparent (the paper of the card shows through), cropped, 256 px."""
import os, glob
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "biz"))
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(HERE, "source", "*.png"))):
    a = np.asarray(Image.open(f).convert("RGB")).astype(np.float32)
    dark = 255 - a.min(axis=2)
    alpha = np.clip((dark - 10) * 1.7, 0, 255)
    # the colour of the stroke: un-mix it from white so it keeps its tone when the white goes
    k = np.maximum(alpha / 255, 1e-3)[..., None]
    rgb = np.clip(255 - (255 - a) / k, 0, 255)
    im = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), "RGBA")
    x0, y0, x1, y1 = Image.fromarray((alpha > 24).astype(np.uint8) * 255).getbbox()
    s = max(x1 - x0, y1 - y0) + 24
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sq.paste(im.crop((cx - s // 2, cy - s // 2, cx - s // 2 + s, cy - s // 2 + s)), (0, 0))
    sq.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, os.path.basename(f)[:-4] + ".webp"), quality=86, method=6)
print(len(glob.glob(os.path.join(OUT, "*.webp"))), "sketches")
