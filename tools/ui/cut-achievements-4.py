"""Cuts the 4th achievement sheet (gpt-image-2 on white, 3×3, the last cell empty): the social and craft icons →
public/assets/ui/<name>.webp, 256 px, the white cut out (flooded from each cell's border)."""
import numpy as np
from PIL import Image
from scipy import ndimage

NAMES = ["ach-trainer", "ach-winner", "ach-wall", "ach-craft1", "ach-craft2", "ach-craft3", "ach-stashbox", "ach-parts"]
im = np.array(Image.open("tools/ui/achievements-sheet-4.png").convert("RGB"))
h, w = im.shape[:2]
for k, name in enumerate(NAMES):
    r, c = divmod(k, 3)
    cell = im[r * h // 3:(r + 1) * h // 3, c * w // 3:(c + 1) * w // 3]
    lab, n = ndimage.label(cell.min(2) > 236)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = ndimage.binary_dilation(np.isin(lab, list(border)), iterations=1)
    out = Image.fromarray(np.dstack([cell, np.where(bg, 0, 255).astype(np.uint8)]), "RGBA")
    out = out.crop(out.split()[3].getbbox())
    side = max(out.size) + 8
    sq = Image.new("RGBA", (side, side))
    sq.alpha_composite(out, ((side - out.width) // 2, (side - out.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(f"public/assets/ui/{name}.webp", quality=88, method=6)
    print(name)
