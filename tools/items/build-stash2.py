"""Cuts the four new stash sheets (tools/items/source/stash2/sheet-*.png: four stashes + the whole set on each)
into public/assets/items/stash-*.webp (320×320) and public/assets/stash/set-N.webp (512×512)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(os.path.dirname(__file__), "source", "stash2")
# sheet → (the four boxes left-top, right-top, left-middle, right-middle; the set box) in sheet pixels
SHEETS = {
    "sol": (13, [(27, 13, 652, 396), (640, 11, 1250, 526), (17, 419, 630, 836), (643, 539, 1252, 824)], (82, 832, 1228, 1243),
            ["stash-sol-canister", "stash-sol-pillow", "stash-sol-radio", "stash-sol-paste"]),
    "xrp": (14, [(21, 51, 760, 359), (781, 5, 1239, 409), (21, 397, 742, 744), (741, 445, 1238, 833)], (61, 753, 1196, 1239),
            ["stash-xrp-paste", "stash-xrp-deo", "stash-xrp-slipper", "stash-xrp-beanie"]),
    "meme": (15, [(58, 0, 568, 451), (710, 2, 1177, 508), (41, 469, 712, 838), (791, 499, 1203, 923)], (130, 830, 1116, 1250),
             ["stash-meme-mug", "stash-meme-noodles", "stash-meme-can", "stash-meme-cigs"]),
    "eth": (16, [(39, 12, 640, 417), (691, 8, 1246, 426), (37, 418, 668, 884), (730, 415, 1249, 852)], (155, 793, 1125, 1254),
            ["stash-eth-soap", "stash-eth-sardines", "stash-eth-book", "stash-eth-coffee"]),
}


def square(im, size, pad=0.04):
    bb = im.split()[3].point(lambda a: 255 if a > 20 else 0).getbbox()
    im = im.crop(bb)
    s = int(max(im.size) * (1 + pad * 2))
    c = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return c.resize((size, size), Image.LANCZOS)


def only_main(sheet, box):
    """the box cut out with only the piece of art that mostly lies in it (neighbours that poke in are dropped)"""
    a = np.array(sheet)[..., 3] > 20
    lab, _ = ndimage.label(ndimage.binary_dilation(a, iterations=4))
    x0, y0, x1, y1 = box
    sub = lab[y0:y1, x0:x1]
    ids, counts = np.unique(sub[sub > 0], return_counts=True)
    keep = ids[np.argmax(counts)]
    im = np.array(sheet.crop(box))
    im[..., 3] = np.where(sub == keep, im[..., 3], 0)
    return Image.fromarray(im)


for name, (n, boxes, setbox, ids) in SHEETS.items():
    sheet = Image.open(os.path.join(SRC, f"sheet-{name}.png")).convert("RGBA")
    for box, iid in zip(boxes, ids):
        square(only_main(sheet, box), 320).save(os.path.join(ROOT, "public", "assets", "items", f"{iid}.webp"), quality=88, method=6)
    square(only_main(sheet, setbox), 512, 0.02).save(os.path.join(ROOT, "public", "assets", "stash", f"set-{n}.webp"), quality=86, method=6)
    print(name, "ok")
