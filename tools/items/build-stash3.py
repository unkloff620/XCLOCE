"""Cuts the stash sheets of the third wave (tools/items/source/stash3/sheet-<key>.png: four stashes in two rows on top,
the whole set across the bottom) into public/assets/items/stash-*.webp (320×320) and public/assets/stash/set-N.webp (512×512).
The pieces are found by themselves: the five biggest blobs of the picture; the lowest wide one is the set."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SRC = os.path.join(os.path.dirname(__file__), "source", "stash3")
# sheet key → (set number, the four stashes: top-left, top-right, middle-left, middle-right)
SHEETS = {
 "office": [
  17,
  [
   "stash-off-stapler",
   "stash-off-mug",
   "stash-off-folder",
   "stash-off-mouse"
  ]
 ],
 "shib": [
  18,
  [
   "stash-shib-plush",
   "stash-shib-coin",
   "stash-shib-bandana",
   "stash-shib-bone"
  ]
 ],
 "admin": [
  19,
  [
   "stash-adm-hdd",
   "stash-adm-cable",
   "stash-adm-router",
   "stash-adm-floppy"
  ]
 ],
 "rig": [
  20,
  [
   "stash-rig-fan",
   "stash-rig-psu",
   "stash-rig-strip",
   "stash-rig-bill"
  ]
 ],
 "kassa": [
  21,
  [
   "stash-acc-calc",
   "stash-acc-ledger",
   "stash-acc-stamp",
   "stash-acc-envelope"
  ]
 ],
 "cfo": [
  22,
  [
   "stash-cfo-safe",
   "stash-cfo-glasses",
   "stash-cfo-abacus",
   "stash-cfo-receipts"
  ]
 ],
 "tax": [
  23,
  [
   "stash-tax-form",
   "stash-tax-usdt",
   "stash-tax-shredder",
   "stash-tax-cookie"
  ]
 ],
 "pacc": [
  24,
  [
   "stash-pacc-pepe",
   "stash-pacc-chart",
   "stash-pacc-pen",
   "stash-pacc-binder"
  ]
 ],
 "file": [
  25,
  [
   "stash-hr-file",
   "stash-hr-badge",
   "stash-hr-stamp",
   "stash-hr-photo"
  ]
 ],
 "team": [
  26,
  [
   "stash-tb-rope",
   "stash-tb-helmet",
   "stash-tb-medal",
   "stash-tb-whistle"
  ]
 ],
 "family": [
  27,
  [
   "stash-fam-mug",
   "stash-fam-tee",
   "stash-fam-cake",
   "stash-fam-plant"
  ]
 ],
 "popcat": [
  28,
  [
   "stash-pop-cat",
   "stash-pop-coin",
   "stash-pop-bowl",
   "stash-pop-yarn"
  ]
 ],
 "table": [
  29,
  [
   "stash-ny-olivie",
   "stash-ny-champ",
   "stash-ny-tangerine",
   "stash-ny-herring"
  ]
 ],
 "santa": [
  30,
  [
   "stash-santa-bag",
   "stash-santa-beard",
   "stash-santa-staff",
   "stash-santa-gift"
  ]
 ],
 "tree": [
  31,
  [
   "stash-tree-ball",
   "stash-tree-star",
   "stash-tree-garland",
   "stash-tree-cone"
  ]
 ],
 "karaoke": [
  32,
  [
   "stash-kar-mic",
   "stash-kar-disco",
   "stash-kar-glasses",
   "stash-kar-tie"
  ]
 ],
 "cayman": [
  33,
  [
   "stash-cay-box",
   "stash-cay-palm",
   "stash-cay-gold",
   "stash-cay-key"
  ]
 ],
 "case": [
  34,
  [
   "stash-case-case",
   "stash-case-euro",
   "stash-case-cuff",
   "stash-case-cigar"
  ]
 ],
 "cold": [
  35,
  [
   "stash-cold-wallet",
   "stash-cold-steel",
   "stash-cold-ice",
   "stash-cold-tube"
  ]
 ],
 "pengu": [
  36,
  [
   "stash-peng-plush",
   "stash-peng-coin",
   "stash-peng-ice",
   "stash-peng-scarf"
  ]
 ],
 "deck": [
  37,
  [
   "stash-y-wheel",
   "stash-y-anchor",
   "stash-y-buoy",
   "stash-y-binoc"
  ]
 ],
 "whale": [
  38,
  [
   "stash-whale-plush",
   "stash-whale-net",
   "stash-whale-pearl",
   "stash-whale-chest"
  ]
 ],
 "yparty": [
  39,
  [
   "stash-yp-cocktail",
   "stash-yp-shades",
   "stash-yp-bucket",
   "stash-yp-jetski"
  ]
 ],
 "captain": [
  40,
  [
   "stash-cap-pepe",
   "stash-cap-hat",
   "stash-cap-map",
   "stash-cap-compass"
  ]
 ],
 "module": [
  41,
  [
   "stash-moon-helmet",
   "stash-moon-flag",
   "stash-moon-rock",
   "stash-moon-boot"
  ]
 ],
 "alien": [
  42,
  [
   "stash-alien-head",
   "stash-alien-ufo",
   "stash-alien-ray",
   "stash-alien-coin"
  ]
 ],
 "farm": [
  43,
  [
   "stash-lf-rig",
   "stash-lf-panel",
   "stash-lf-dish",
   "stash-lf-crater"
  ]
 ],
 "rocket": [
  44,
  [
   "stash-rk-rocket",
   "stash-rk-fuel",
   "stash-rk-button",
   "stash-rk-ticket"
  ]
 ]
}


def square(im, size, pad=0.04):
    bb = im.split()[3].point(lambda a: 255 if a > 20 else 0).getbbox()
    im = im.crop(bb)
    s = int(max(im.size) * (1 + pad * 2))
    c = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return c.resize((size, size), Image.LANCZOS)


def pieces(sheet):
    a = np.array(sheet)[..., 3] > 24
    lab, n = ndimage.label(ndimage.binary_dilation(a, iterations=6))
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    keep = [i + 1 for i in np.argsort(sizes)[::-1][:5]]
    out = []
    for k in keep:
        ys, xs = np.where(lab == k)
        im = np.array(sheet)
        im[..., 3] = np.where(lab == k, im[..., 3], 0)
        out.append(((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), Image.fromarray(im).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))))
    return out


only = set(sys.argv[1:])
for key, (n, ids) in SHEETS.items():
    if only and key not in only:
        continue
    f = os.path.join(SRC, f"sheet-{key}.png")
    if not os.path.exists(f):
        print(key, "no sheet"); continue
    ps = pieces(Image.open(f).convert("RGBA"))
    if len(ps) < 5:
        print(key, "only", len(ps), "pieces"); continue
    # the set: the piece reaching lowest; the rest: two rows, each left to right
    ps.sort(key=lambda p: p[0][3])
    whole = ps.pop()
    ps.sort(key=lambda p: (p[0][1] + p[0][3]) / 2)
    rows = sorted(ps[:2], key=lambda p: p[0][0]) + sorted(ps[2:], key=lambda p: p[0][0])
    for (box, im), iid in zip(rows, ids):
        square(im, 320).save(os.path.join(ROOT, "public", "assets", "items", f"{iid}.webp"), quality=88, method=6)
    square(whole[1], 512, 0.02).save(os.path.join(ROOT, "public", "assets", "stash", f"set-{n}.webp"), quality=86, method=6)
    print(key, "ok")
