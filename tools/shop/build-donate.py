"""
The «Донат» window of the shop (screens/donate.tsx): the artist's wooden board (the window and each cell), one tab
(inactive; the active one is lifted by CSS) and the currency goods for the cells → public/assets/shop/donate/*.webp.
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from goods import GOODS, cut

S = "tools/shop/source/v3"
OUT = "public/assets/shop/donate"
os.makedirs(OUT, exist_ok=True)

def save(a, name, w):
    im = Image.fromarray(a) if not isinstance(a, Image.Image) else a
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())   # no faint halo in the box
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(f"{OUT}/{name}.webp", quality=88, method=6)
    print(name, im.size)

board = Image.open(f"{S}/board.png").convert("RGBA")
save(board, "board", 900)
save(Image.open(f"{S}/cell.png").convert("RGBA"), "cell", 300)   # the paper tag on a pin
tabs = Image.open(f"{S}/tabs.png").convert("RGBA")
save(tabs.crop((590, 263, 856, 648)), "tab", 180)
sheet = Image.open(f"{S}/goods.png").convert("RGBA")
for g in GOODS:
    save(cut(sheet, g), g, 220)

# the packs' pictures (generated sheets 3×3, tools/shop/source/v3/donate/sheet-<CUR>.png): from one coin to a heap of
# sacks. Each picture is found whole on the sheet (its pieces grouped, not a blind grid cut that clips them), its white
# keyed out — the outside and the pure white holes inside (between the coins, the mug's handle) — and kept growing.
from scipy import ndimage
for cur in ["RUB", "GOLD", "TOKEN", "TOOTH", "PAP"]:
    sh = np.array(Image.open(f"{S}/donate/sheet-{cur}.png").convert("RGB")).astype(int)
    H_, W_ = sh.shape[:2]
    ink = sh.min(2) < 236
    lab0, k = ndimage.label(ndimage.binary_dilation(ink, iterations=5))
    # every piece goes to the grid cell of its middle (a piece reaching over the cell line stays whole)
    lab = np.zeros_like(lab0)
    for j, sl in enumerate(ndimage.find_objects(lab0), 1):
        ys, xs = np.nonzero(lab0[sl] == j)
        if len(ys) < 30:
            continue
        cy, cx = sl[0].start + ys.mean(), sl[1].start + xs.mean()
        cell = int(min(2, cy // (H_ / 3)) * 3 + min(2, cx // (W_ / 3))) + 1
        lab[sl][lab0[sl] == j] = cell
    boxes = []
    for j in range(1, 10):
        ys, xs = np.nonzero(lab == j)
        boxes.append((j, xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    for i, (j, x0, y0, x1, y1) in enumerate(boxes):
        a = sh[y0:y1, x0:x1]
        mine = (lab[y0:y1, x0:x1] == j)
        white = a.min(2) > 232
        wl, _ = ndimage.label(white)
        edge = set(np.unique(np.r_[wl[0], wl[-1], wl[:, 0], wl[:, -1]])) - {0}
        bg = np.isin(wl, list(edge))
        # the holes: pure white, not tiny (a highlight on a tooth or a coin stays)
        hl, hn = ndimage.label(white & ~bg & (a.min(2) > 242))
        if hn:
            hs = ndimage.sum(np.ones_like(hl), hl, range(1, hn + 1))
            bg |= np.isin(hl, [h + 1 for h, v in enumerate(hs) if v >= 40])
        bg = (ndimage.binary_dilation(bg, iterations=1) & (a.min(2) > 200)) | ~mine
        alpha = np.where(bg, 0, 255).astype(np.uint8)
        im = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
        im = im.crop(im.getchannel("A").getbbox())
        # each fills the tag, the small ones a bit less: the amount still reads as growing
        f = min(240 / im.width, 240 / im.height) * (0.62 + 0.38 * i / 8)
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        out.alpha_composite(im, ((256 - im.width) // 2, 256 - 8 - im.height))
        out.save(f"{OUT}/{cur.lower()}-{i}.webp", quality=88, method=6)
    print(cur, "packs ok")
