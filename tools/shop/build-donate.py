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
# sacks; each cell cut, its white keyed out from the border, kept at the sheet's scale (they grow cell to cell)
from scipy import ndimage
for cur in ["RUB", "GOLD", "TOKEN", "TOOTH", "PAP"]:
    sh = np.array(Image.open(f"{S}/donate/sheet-{cur}.png").convert("RGB")).astype(int)
    n = sh.shape[0] // 3
    for i in range(9):
        r, c = divmod(i, 3)
        a = sh[r * n:(r + 1) * n, c * n:(c + 1) * n]
        white = a.min(2) > 232
        lab, _ = ndimage.label(white)
        edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
        bg = np.isin(lab, list(edge))
        bg = ndimage.binary_dilation(bg, iterations=1) & (a.min(2) > 200)
        fg = ~bg
        lab, k = ndimage.label(ndimage.binary_dilation(fg, iterations=4))
        if k > 1:  # the neighbours' bits at the cell's edge go
            sz = ndimage.sum(fg, lab, range(1, k + 1))
            fg &= np.isin(lab, [j + 1 for j, v in enumerate(sz) if v >= 0.15 * sz.max()])
        alpha = np.where(fg, 255, 0).astype(np.uint8)
        im = Image.fromarray(np.dstack([a.astype(np.uint8), alpha]))
        im = im.crop(im.getchannel("A").getbbox())
        # each fills the tag, the small ones a bit less: the amount still reads as growing
        f = min(240 / im.width, 240 / im.height) * (0.62 + 0.38 * i / 8)
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        out.alpha_composite(im, ((256 - im.width) // 2, 256 - 8 - im.height))
        im = out
        im.save(f"{OUT}/{cur.lower()}-{i}.webp", quality=88, method=6)
    print(cur, "packs ok")
