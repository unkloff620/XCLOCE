"""
Пепе (the event boss): the artist's loose parts (tools/boss/source/pepe/raw, placed on his 2000×2800 reference by
tools/boss/fit-parts.py → raw/fit.json) → public/bosses/pepe/rig/<layer>.webp, each cut to its own box, at SCALE,
and src/client/art/pepe-data.ts: every layer's box and the bone points (the yellow dots of the artist's reference,
found here) in rig px. The rig is drawn and animated by src/client/art/pepe-rig.tsx (2-D mesh deformation only).
Also public/bosses/pepe/{full,portrait,card}.webp.
"""
import json, os
import numpy as np
import cv2
from PIL import Image

R = "tools/boss/source/pepe/raw"
OUT = "public/bosses/pepe"
SCALE = 0.5
fit = json.load(open(f"{R}/fit.json"))
# the eye whites and the four lids are drawn on the head's sheet: the head has holes for the eyes, the whites, the pupils
# and the lids lie behind it, the lids slide over the whites like shutters (the upper ones down, the lower ones up)
LIDS = ["lidLL", "lidLR", "lidUL", "lidUR"]
for n in ["whites", *LIDS]:
    fit[n] = fit["head"]
ORDER = ["legs", "sleeveR", "handR", "body", "sleeveL", "handL", "whites", "pupils", *LIDS, "head", "mouth", "pill"]

def placed(n):
    f = fit[n]
    im = Image.open(f"{R}/{n}.png").convert("RGBA")
    if abs(f["s"] - 1) > 0.002:
        im = im.resize((round(im.width * f["s"]), round(im.height * f["s"])), Image.LANCZOS)
    c = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
    c.alpha_composite(im, (round(f["tx"]), round(f["ty"])))
    return c

layers = {n: placed(n) for n in ORDER}
comp = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
for n in ORDER:
    comp.alpha_composite(layers[n])
# the whole figure's box with some air (the pill flies, the chest swells)
bx = comp.split()[3].point(lambda v: 255 if v > 16 else 0).getbbox()
PAD = 60
# wide sides: the arms go out and up when he flexes, the pill flies over his head
X0, Y0, X1, Y1 = bx[0] - 5 * PAD, bx[1] - 7 * PAD, bx[2] + 5 * PAD, bx[3] + 10
W, H = round((X1 - X0) * SCALE), round((Y1 - Y0) * SCALE)
os.makedirs(f"{OUT}/rig", exist_ok=True)
data = {"w": W, "h": H, "layers": {}, "pts": {}}
for n in ORDER:
    im = layers[n].crop((X0, Y0, X1, Y1))
    b = im.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
    part = im.crop(b)
    part = part.resize((max(1, round(part.width * SCALE)), max(1, round(part.height * SCALE))), Image.LANCZOS)
    part.save(f"{OUT}/rig/{n}.webp", quality=90, method=6)
    data["layers"][n] = [round(b[0] * SCALE, 1), round(b[1] * SCALE, 1), part.width, part.height]
# how far each lid slides to shut its eye (rig px, down for the upper ones, up for the lower ones): the two meet a bit
# below the middle of the white, overlapping a little, on every column of the eye
from scipy import ndimage
wa = np.array(Image.open(f"{R}/whites.png"))[..., 3] > 20
ha = np.array(Image.open(f"{R}/head.png"))[..., 3] > 128
holes = ndimage.binary_fill_holes(ha) & ~ha
data["lids"] = {}
for side, xs in (("L", (0, 490)), ("R", (515, 706))):
    up = np.array(Image.open(f"{R}/lidU{side}.png"))[..., 3] > 128
    lo = np.array(Image.open(f"{R}/lidL{side}.png"))[..., 3] > 128
    su, sl = -1e9, 1e9
    for c in range(*xs):
        e = np.nonzero(wa[:, c])[0]
        if not len(e) or not up[:, c].any() or not lo[:, c].any():
            continue
        m = e.min() + 0.62 * (e.max() - e.min())
        su = max(su, m - np.nonzero(up[:, c])[0].max() + 3)
        sl = min(sl, m - np.nonzero(lo[:, c])[0].min() - 3)
    # then make sure the shut lids cover every bit of the eye hole (the corners too)
    hole = np.zeros_like(wa)
    hole[:, xs[0]:xs[1]] = holes[:, xs[0]:xs[1]]
    for _ in range(40):
        cov = np.roll(up, int(round(su)), axis=0) | np.roll(lo, int(round(sl)), axis=0)
        if not (hole & ~cov).any():
            break
        sl -= 1  # the lower lid comes up a bit more (the upper one keeps the line where they meet)
    data["lids"]["U" + side] = round(su * fit["head"]["s"] * SCALE, 1)
    data["lids"]["L" + side] = round(sl * fit["head"]["s"] * SCALE, 1)
# the bone points (the yellow dots), named by where they are
a = np.array(Image.open(f"{R}/reference.png").convert("RGB")).astype(int)
y = ((a[..., 0] > 190) & (a[..., 1] > 190) & (a[..., 2] < 110)).astype(np.uint8)
op = cv2.morphologyEx(y, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
n, lab, st, cen = cv2.connectedComponentsWithStats(op)
found = [(float(c[0]), float(c[1])) for c, s in zip(cen[1:], st[1:]) if s[4] > 30]
NAMES = {  # the artist's points (reference px) → names; the nearest found dot is taken
    "headTL": (902, 208), "headTR": (1112, 220), "browLtop": (983, 311), "browRtop": (1211, 328), "browL": (988, 357), "browR": (1222, 368),
    "mouthL": (848, 521), "mouthR": (1263, 562), "mouthM": (1116, 581), "cheek": (647, 549), "chinL": (884, 664), "chinR": (1123, 673),
    "neckL": (670, 754), "neckR": (1230, 790), "chest": (1003, 960), "belly": (1003, 1172), "waist": (1003, 1432),
    "shL": (518, 876), "elL": (323, 1080), "wrL": (287, 1318), "handL": (271, 1402), "fingL1": (282, 1485), "fingL1t": (287, 1663), "fingL2t": (417, 1564),
    "shR": (1303, 914), "elR": (1525, 1073), "wrR": (1659, 1262), "handR": (1696, 1320), "fingR2": (1749, 1377), "fingR2t": (1838, 1491), "fingR1t": (1677, 1492),
    "hipL": (779, 1639), "kneeL": (719, 1995), "footL": (660, 2447), "hipR": (1177, 1626), "kneeR": (1196, 1984), "footR": (1156, 2435),
    "pillA": (1490, 1754), "pillM": (1580, 1721), "pillB": (1663, 1686),
}
for k, (px, py) in NAMES.items():
    fx, fy = min(found, key=lambda q: (q[0] - px) ** 2 + (q[1] - py) ** 2)
    data["pts"][k] = [round((fx - X0) * SCALE, 1), round((fy - Y0) * SCALE, 1)]
open("src/client/art/pepe-data.ts", "w").write(
    "/* generated by tools/boss/pepe/assemble.py — Пепе's layers ([x, y, w, h] in rig px) and bone points */\n"
    f"export const PEPE = {json.dumps(data)} as const;\n")
# the still pictures for the lists and the boss screen
full = comp.crop((X0, Y0, X1, Y1))
full.resize((W, H), Image.LANCZOS).save(f"{OUT}/full.webp", quality=88, method=6)
hb = layers["head"].split()[3].getbbox()
side = max(hb[2] - hb[0], hb[3] - hb[1]) + 80
cx, cy = (hb[0] + hb[2]) // 2, (hb[1] + hb[3]) // 2 + 40
comp.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)).resize((512, 512), Image.LANCZOS).save(f"{OUT}/portrait.webp", quality=88, method=6)
comp.crop((X0, Y0, X1, Y0 + round((X1 - X0) * 1.1))).resize((640, round(640 * 1.1)), Image.LANCZOS).save(f"{OUT}/card.webp", quality=86, method=6)
print("rig", W, H, {k: v for k, v in data["layers"].items()})
