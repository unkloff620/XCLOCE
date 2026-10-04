"""Cuts the achievement icon sheet (3×2, already on a transparent background) into square webp icons for public/assets/ui/."""
import cv2
import numpy as np
from PIL import Image

SRC = "tools/ui/achievements-sheet.png"
OUT = "public/assets/ui"
NAMES = [["ach-damage", "ach-hits", "ach-wins"], ["ach-yard", "ach-chests", "ach-weekly"]]

img = Image.open(SRC).convert("RGBA")
W, H = img.size
cw, ch = W // 3, H // 2
for r in range(2):
    for c in range(3):
        cell = img.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        arr = np.array(cell)
        # drop stray specks of the sheet: keep pieces of at least 0.5% of the icon
        n, lab, stats, _ = cv2.connectedComponentsWithStats((arr[:, :, 3] > 12).astype(np.uint8), 8)
        total = stats[1:, cv2.CC_STAT_AREA].sum()
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < total * 0.005:
                arr[lab == i, 3] = 0
        cell = Image.fromarray(arr)
        a = arr[:, :, 3]
        ys, xs = np.where(a > 12)
        crop = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        side = max(crop.size) + 8
        sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        sq.alpha_composite(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
        sq.resize((256, 256), Image.LANCZOS).save(f"{OUT}/{NAMES[r][c]}.webp", quality=90, method=6)
        print(NAMES[r][c], crop.size)
