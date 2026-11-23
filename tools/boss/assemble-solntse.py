"""
Солнце (id solntse, the 13th boss): the artist's layers (tools/boss/source/solntse/raw/, the body's pieces on one
2000×3000 sheet, in place; the head's five layers on a 1000×1000 sheet of their own) → rig sources for build-boss.py
(cropped to CROP). The head is put on the artist's stand-in head (raw/head-dummy.png) by fit-parts.py (raw/fit.json,
«headfull»: all five layers together). R — his right arm (the lava one, the poker in its fist, on the LEFT of the
picture), L — his left (the yellow fist, on the right). The pieces: legs, body, apron, chestR / chestL (the pecs that
swell with the breath), armR / armL (the shoulders), lowR / lowL (the forearm with the fist), poker (in the right fist),
mouthIn (the open mouth: the throat and the upper teeth), jawLow (the lower jaw with the lower teeth), eyes, pupils, head
(holes for the eyes and the mouth). Prints the joints (rig px) for build-boss.py PIVOT_BY_BOSS, and writes
public/bosses/solntse/{full,portrait}.webp.
"""
import json, os
import numpy as np
from PIL import Image

D = "tools/boss/source/solntse"
R = f"{D}/raw"
CROP = (40, 40, 1960, 2800)
fit = json.load(open(f"{R}/fit.json"))["headfull"]
BODY = ["legs", "body", "apron", "chestR", "chestL", "armR", "armL", "lowR", "lowL", "poker"]
HEAD = ["mouthIn", "jawLow", "eyes", "pupils", "head"]


def sheet(n):
    if n in BODY:
        return Image.open(f"{R}/{n}.png").convert("RGBA")
    im = Image.open(f"{R}/{n}.png").convert("RGBA")
    w = round(im.width * fit["s"])
    c = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    c.alpha_composite(im.resize((w, w), Image.LANCZOS), (round(fit["tx"]), round(fit["ty"])))
    return c


def rig(x, y):
    return [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]


placed = {n: sheet(n) for n in BODY + HEAD}
for n, im in placed.items():
    a = np.array(im)
    a[a[..., 3] < 8] = 0
    Image.fromarray(a).crop(CROP).save(f"{D}/{n}.png")


def mid(a, b):
    m = (np.array(placed[a])[..., 3] > 128) & (np.array(placed[b])[..., 3] > 128)
    ys, xs = np.nonzero(m)
    return rig(xs.mean(), ys.mean())


h = np.array(placed["head"])[..., 3] > 128
ys, xs = np.nonzero(h)
print("head pivot (the chin's bottom)", rig(xs[ys > ys.max() - 40].mean(), ys.max() - 30))
print("armR", mid("armR", "body"), "lowR", mid("armR", "lowR"))
print("armL", mid("armL", "body"), "lowL", mid("armL", "lowL"))
for n in ["chestR", "chestL", "jawLow", "mouthIn", "eyes", "pupils", "head", "poker", "lowR", "lowL", "body", "apron"]:
    b = placed[n].getbbox()
    print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))

os.makedirs("public/bosses/solntse", exist_ok=True)
order = ["legs", "body", "apron", "chestR", "chestL", "armL", "armR", "poker", "lowL", "lowR"] + HEAD
whole = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(placed[n])
whole = whole.crop(CROP)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/solntse/full.webp", quality=88, method=6)
hb = placed["head"].getbbox()
cx = (hb[0] + hb[2]) // 2 - CROP[0]
p = whole.crop((cx - 330, 0, cx + 330, 660)).resize((320, 320), Image.LANCZOS)
p.save("public/bosses/solntse/portrait.webp", quality=88, method=6)
print("ok", whole.size)
