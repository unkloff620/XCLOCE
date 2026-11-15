"""
Ларёчник — the defender of the kiosks in «Захват» (src/client/screens/raids.tsx), drawn by the artist in layers on one
2000×3000 sheet, in place: tools/boss/source/larek/raw/{pants,torso,head,upperL,foreL,fistL,upperR,foreR,fistR}.png.
L is the arm on the left of the picture (his right arm, the brass knuckles low), R — on the right (his left, the fist raised).
Both shoulders go under the T-shirt's sleeves; the forearms and the fists lie over it (boss-rig.tsx SPLIT_BOTH).
→ rig sources for build-boss.py, cropped to the hips (the fight shows him down to the hips):
  legs = pants (they stay put), body = torso (leans into the punches at the waist), head, armL/lowL/handL, armR/lowR/handR (shoulder → forearm at the elbow → fist at the wrist).
The joints (build-boss.py PIVOT_BY_BOSS) are the middles of where the pieces overlap.
"""
import os
from PIL import Image

D = "tools/boss/source/larek"
R = f"{D}/raw"
# the sheet down to the hips, with room for the fists to swing out
CROP = (150, 50, 1850, 1800)


def lay(*names):
    im = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    for n in names:
        im.alpha_composite(Image.open(f"{R}/{n}.png").convert("RGBA"))
    return im.crop(CROP)


for out, src in {"legs": ("pants",), "body": ("torso",), "head": ("head",),
                 "armL": ("upperL",), "lowL": ("foreL",), "handL": ("fistL",),
                 "armR": ("upperR",), "lowR": ("foreR",), "handR": ("fistR",)}.items():
    lay(*src).save(f"{D}/{out}.png")
print("ok")

# the joints for build-boss.py PIVOT_BY_BOSS: the middle of where two pieces overlap (the shoulder — where the upper
# arm goes under the T-shirt), in the rig's px (the crop, then half size)
import numpy as np
def m(n): return np.array(Image.open(f"{R}/{n}.png").convert("RGBA"))[:, :, 3] > 128
def mid(a, b):
    ys, xs = np.nonzero(m(a) & m(b))
    return px(xs, ys)
def px(xs, ys): return [round(float(xs.mean() - CROP[0]) / 2, 1), round(float(ys.mean() - CROP[1]) / 2, 1)]
def inner(a, side):
    # the shoulder: the inner end of the upper arm (the last 15% of it towards the body, under the sleeve)
    ys, xs = np.nonzero(m(a))
    w = xs.max() - xs.min()
    k = xs >= xs.max() - w * 0.15 if side == "L" else xs <= xs.min() + w * 0.15
    return px(xs[k], ys[k])
print({"head": mid("head", "torso"), "armL": inner("upperL", "L"), "lowL": mid("upperL", "foreL"), "handL": mid("foreL", "fistL"),
       "armR": inner("upperR", "R"), "lowR": mid("upperR", "foreR"), "handR": mid("foreR", "fistR")})
