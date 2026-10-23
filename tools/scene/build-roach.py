"""Cuts the cockroach sheet (tools/scene/source/roach.png: the body and three legs) into
public/assets/yard/roach-body.webp and roach-leg-1..3.webp at half size (the zonk room's runner)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
sheet = Image.open(os.path.join(os.path.dirname(__file__), "source", "roach.png")).convert("RGBA")
a = np.array(sheet)[..., 3] > 20
lab, _ = ndimage.label(ndimage.binary_dilation(a, iterations=3))
PARTS = {"body": (0, 0, 1268, 724), "leg-1": (1240, 200, 1575, 724), "leg-2": (1540, 200, 1930, 724), "leg-3": (1780, 200, 2172, 724)}
for name, (x0, y0, x1, y1) in PARTS.items():
    sub = lab[y0:y1, x0:x1]
    ids, counts = np.unique(sub[sub > 0], return_counts=True)
    keep = ids[np.argmax(counts)]
    im = np.array(sheet.crop((x0, y0, x1, y1)))
    im[..., 3] = np.where(sub == keep, im[..., 3], 0)
    out = Image.fromarray(im)
    out = out.resize((out.width // 2, out.height // 2), Image.LANCZOS)
    out.save(os.path.join(ROOT, "public", "assets", "yard", f"roach-{name}.webp"), quality=88, method=6)
    print(name, (x0, y0), out.size)
