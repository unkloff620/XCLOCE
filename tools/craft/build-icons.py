"""«Крафт» icons: generated sheets (tools/craft/source/sheet-<n>.png, 3×3 on white, contents in sheets.json) and single
pictures (source/<id>.png) → cut out of the white → public/assets/items/<id>.webp (256×256, like the other items);
source/nav-craft.png → the bottom-menu icon public/assets/nav/craft.webp."""
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "items"))
S = 256
def cut(rgb):  # white → transparent (flooded from the border; enclosed white holes only if neutral)
    im = rgb.astype(np.float32)
    lab, n = ndimage.label(im.min(2) > 236)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    for i in range(1, n + 1):
        if i in border: continue
        m = lab == i
        px = im[m]
        if m.sum() > 30 and px.mean() > 249.5 and abs((px[:, 2] - px[:, 0]).mean()) < 0.8: bg |= m
    bg = ndimage.binary_dilation(bg, iterations=1)
    a = np.where(bg, 0, 255).astype(np.uint8)
    lab2, n2 = ndimage.label(a > 0)   # drop specks
    if n2 > 1:
        sizes = ndimage.sum(a > 0, lab2, range(1, n2 + 1))
        for i, sz in enumerate(sizes, 1):
            if sz < sizes.max() * 0.02: a[lab2 == i] = 0
    out = Image.fromarray(np.dstack([rgb, a]).astype(np.uint8), "RGBA")
    return out.crop(out.split()[3].getbbox())
def save(im, id_):
    k = S * 0.9 / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    c = Image.new("RGBA", (S, S), (0, 0, 0, 0)); c.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2))
    c.save(os.path.join(OUT, id_ + ".webp"), quality=88, method=6)
sheets = json.load(open(os.path.join(SRC, "sheets.json")))
for si, sheet in enumerate(sheets):
    im = np.array(Image.open(os.path.join(SRC, f"sheet-{si}.png")).convert("RGB"))
    h, w = im.shape[:2]
    for k, (id_, _) in enumerate(sheet):
        r, c = divmod(k, 3)
        cell = im[r * h // 3:(r + 1) * h // 3, c * w // 3:(c + 1) * w // 3]
        save(cut(cell), id_)
for f in os.listdir(SRC):
    if f.startswith("craft-") and f.endswith(".png"):
        save(cut(np.array(Image.open(os.path.join(SRC, f)).convert("RGB"))), f[:-4])
# the bottom-menu icon «Крафт» (public/assets/nav/craft.webp, 128×128 like the others)
nav = cut(np.array(Image.open(os.path.join(SRC, "nav-craft.png")).convert("RGB")))
k = 128 * 0.94 / max(nav.size)
nav = nav.resize((round(nav.width * k), round(nav.height * k)), Image.LANCZOS)
c = Image.new("RGBA", (128, 128), (0, 0, 0, 0)); c.alpha_composite(nav, ((128 - nav.width) // 2, (128 - nav.height) // 2))
c.save(os.path.join(OUT, "..", "nav", "craft.webp"), quality=90, method=6)
# the page's paper: the stash's crumpled sheet, a blueprint cell (white — laid over the paper with multiply), the recipe sheet (cut out)
UI = os.path.join(OUT, "..", "craft")
os.makedirs(UI, exist_ok=True)
Image.open(os.path.join(SRC, "paper-stash.png")).convert("RGB").resize((1024, 683), Image.LANCZOS).save(os.path.join(UI, "paper-stash.webp"), quality=78, method=6)
Image.open(os.path.join(SRC, "cell-blueprint.png")).convert("RGB").resize((256, 256), Image.LANCZOS).save(os.path.join(UI, "cell.webp"), quality=86, method=6)
rec = cut(np.array(Image.open(os.path.join(SRC, "paper-recipe.png")).convert("RGB")))
rec.resize((720, round(rec.height * 720 / rec.width)), Image.LANCZOS).save(os.path.join(UI, "paper-recipe.webp"), quality=80, method=6)
print("ok")
