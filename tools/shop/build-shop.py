"""
The shop scene with the animated shopkeeper. Since 2026-11-24 (the user): the artist's new room with shelves of currency
goods and the new counter (tools/shop/source/v3, a 2000×3000 canvas); the shopkeeper's parts stay as placed on the old
2000×2800 canvas and go DY px down (his hands lie on the new counter). The clothes rack, the drinks and the lamp are gone;
the goods on the shelves (tools/shop/goods.py) open the «Донат» window. Input: the parts placed on the 2000×2800 reference canvas by
  python3 tools/boss/fit-parts.py shopkeeper '<plan>' && python3 tools/boss/place-parts.py shopkeeper
(tools/boss/source/shopkeeper/{raw,placed}). Every layer is cropped to its own box, scaled for phones and written to
public/assets/shop/v2/<layer>.webp; their boxes (percent of the canvas) go to src/client/art/shop-data.ts.
"""
import json
import numpy as np
from PIL import Image

D = "tools/boss/source/shopkeeper"
OUT = "public/assets/shop/v2"
W, H = 2000, 3000
DY = 366                                 # the old 2000×2800 parts → the new canvas (the counter top 1513 → 1880)
DX = 400                                 # the shopkeeper stands to the right (the user 2026-11-24): the goods fill the left
K = 0.6                                  # 2000 px → 1200 px: sharp on a phone at 3× density
V3 = "tools/shop/source/v3"
LAYERS = ["room", "torso", "head", "pen", "sleeveL", "counter", "weapons", "sleeveR", "palm"]
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from goods import cut
os.makedirs(OUT, exist_ok=True)

def placed(n):
    """a layer on the new canvas: the new room and counter as drawn, the old parts moved DY down"""
    if n == "room":
        return np.array(Image.open(f"{V3}/bg.png").convert("RGBA"))
    if n == "counter":
        return np.array(Image.open(f"{V3}/table.png").convert("RGBA"))
    old = np.array(Image.open(f"{D}/placed/{n}.png").convert("RGBA"))
    a = np.zeros((H, W, 4), np.uint8)
    dx = 0 if n == "weapons" else DX     # the goods on the counter stay where they lie (shown by WEAPONS_LEFT)
    a[DY:, dx:] = old[:H - DY, :W - dx]
    return a

data = {}
for n in LAYERS:
    a = placed(n)
    a[a[:, :, 3] < 24] = 0              # stray half-transparent pixels around the cut-outs
    if n == "counter":
        a[:1860, :, 3] = 0               # junk above the counter top
    if n == "room":
        box = (0, 0, W, H)
    else:
        ys, xs = np.nonzero(a[:, :, 3] > 0)
        box = (max(0, xs.min() - 4), max(0, ys.min() - 4), min(W, xs.max() + 5), min(H, ys.max() + 5))
    im = Image.fromarray(a).crop(box)
    im = im.resize((max(1, round(im.width * K)), max(1, round(im.height * K))), Image.LANCZOS)
    if n == "room":
        im.convert("RGB").save(f"{OUT}/{n}.webp", quality=82, method=6)
    else:
        im.save(f"{OUT}/{n}.webp", quality=86, method=6)
    x0, y0, x1, y1 = box
    data[n] = {"left": round(x0 / W * 100, 3), "top": round(y0 / H * 100, 3), "width": round((x1 - x0) / W * 100, 3), "height": round((y1 - y0) / H * 100, 3)}
    print(n, im.size, data[n])
# the shopkeeper (the artist's own parts, drawn right on the canvas): the neck (head sway pivot), the wrist of the hand
# with the pen (it wags around it), the knuckle of each finger on the counter (each taps around its own), canvas percent
pct = lambda x, y: {"x": round(x / W * 100, 2), "y": round(y / H * 100, 2)}
neck = pct(985 + DX, 960 + DY)
pivots = {"pen": pct(450 + DX, 1000 + DY)}
for n in ["f1", "f2", "f3", "f4"]:
    a = placed(n)[:, :, 3] > 40
    ys, xs = np.nonzero(a)
    end = xs >= xs.max() - (xs.max() - xs.min()) * 0.12   # the knuckle end: the right tip, under the palm
    pivots[n] = pct(xs[end].mean(), ys[end].mean())
# the goods on the shelves: (good, currency, the middle of its bottom on the shelf, scale); the first one of each
# currency is the big one with the buy mark. Shelves' tops (canvas y): 590, 910, 1225, 1515, 1800.
SHELF = [
    # the top shelves across, the lower ones on the left of the shopkeeper (his head from y 850 at x 1210–1550)
    ("rub-l", "RUB", 430, 594, 1.25, True), ("gold-l", "GOLD", 880, 594, 1.2, True), ("tok-l", "TOKEN", 1320, 594, 1.25, True),
    ("tooth-crate", "TOOTH", 1640, 594, 0.8, False),
    ("tooth-spill2", "TOOTH", 420, 914, 1.15, True), ("pap-l", "PAP", 850, 914, 1.1, True), ("tok-s", "TOKEN", 1660, 914, 0.85, False),
    ("rub-s", "RUB", 380, 1229, 0.9, False), ("gold-s", "GOLD", 610, 1229, 0.8, False),
    ("pap-s", "PAP", 380, 1519, 0.85, False), ("tooth-jar", "TOOTH", 600, 1519, 0.8, False),
    ("tooth-crate2", "TOOTH", 400, 1804, 0.8, False), ("pap-m", "PAP", 610, 1804, 0.75, False),
]
sheet = Image.open(f"{V3}/goods.png").convert("RGBA")
goods = []
for i, (g, cur, cx, by, sc, main) in enumerate(SHELF):
    im = Image.fromarray(cut(sheet, g))
    im = im.crop(im.getchannel("A").getbbox())
    w, h = round(im.width * sc), round(im.height * sc)
    x0, y0 = round(cx - w / 2), by - h
    im.resize((round(w * K), round(h * K)), Image.LANCZOS).save(f"{OUT}/g{i}.webp", quality=88, method=6)
    data[f"g{i}"] = {"left": round(x0 / W * 100, 3), "top": round(y0 / H * 100, 3), "width": round(w / W * 100, 3), "height": round(h / H * 100, 3)}
    goods.append({"layer": f"g{i}", "cur": cur, "main": main})
ts = "/* generated by tools/shop/build-shop.py — boxes of the shop layers in percent of the 2000×3000 canvas */\n"
ts += "export type ShopLayer = { left: number; top: number; width: number; height: number };\n"
ts += f"export const SHOP_ART = {{\n  aspect: \"2000 / 3000\",\n  goods: {json.dumps(goods)} as {{ layer: string; cur: \"RUB\" | \"GOLD\" | \"TOKEN\" | \"TOOTH\" | \"PAP\"; main: boolean }}[],\n  layers: {json.dumps(data, indent=2)} as Record<string, ShopLayer>,\n  neck: {json.dumps(neck)},\n  pivots: {json.dumps(pivots)} as Record<string, {{ x: number; y: number }}>,\n}};\n"
open("src/client/art/shop-data.ts", "w").write(ts)
print("neck", neck, "pivots", pivots)
