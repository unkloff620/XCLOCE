"""
Ларёчник — the defender of the kiosks in «Захват» (src/client/screens/raids.tsx), drawn by the artist in layers on one
2000×3000 sheet, in place: tools/boss/source/larek/raw/{pants,torso,head,upperL,foreL,fistL,upperR,foreR,fistR}.png.
L is the arm on the left of the picture (his right arm, the brass knuckles low), R — on the right (his left, the fist raised).
The right shoulder (R) goes under the T-shirt's sleeve, its forearm and fist over it; the arm with the brass knuckles (L) lies all over the body (boss-rig.tsx BEHIND + SPLIT_BEHIND).
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


# the head redrawn with holes for the eyes (raw/face/, 1000×1000): the head, the pupils, the closed lids — put on the
# sheet over the old head (the face matched by template: scale 0.735, at (666, 47)). The eye whites are the head's
# holes filled white; the closed lids get the holes filled with the skin round them, so a blink hides the whites.
import numpy as np, cv2
FACE_K, FACE_AT = 0.735, (666, 47)
def face(n):
    im = Image.open(f"{R}/face/{n}.png").convert("RGBA")
    w = round(im.width * FACE_K)
    sheet = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    sheet.alpha_composite(im.resize((w, w), Image.LANCZOS), FACE_AT)
    return sheet
head = face("head")
ha = np.array(head)[:, :, 3] > 128
# the holes: what is not head but can't be reached from the outside
outside = np.zeros((3002, 2002), np.uint8)
inv = (~ha).astype(np.uint8)
cv2.floodFill(inv, outside, (0, 0), 2)
holes = (inv == 1)
# only the two eyes (the biggest holes); gaps between the hair locks stay see-through
_, lab, st, _ = cv2.connectedComponentsWithStats(holes.astype(np.uint8))
keep = 1 + np.argsort(-st[1:, cv2.CC_STAT_AREA])[:2]
holes = np.isin(lab, keep)
holes = cv2.dilate(holes.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
eyes = np.zeros((3000, 2000, 4), np.uint8); eyes[holes] = (250, 248, 244, 255)
head.save(f"{R}/head.png")
Image.fromarray(eyes).save(f"{R}/eyes.png")
face("pupils").save(f"{R}/pupils.png")
# the skin round each hole (a ring a few px out), its median colour fills the hole under the lids
ring = cv2.dilate(holes.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool) & ~holes & ha
rp = np.array(head)[ring][:, :3].astype(int)
rp = rp[rp.sum(1) >= np.percentile(rp.sum(1), 60)]  # the lit skin, not the outline of the lids
skin = np.median(rp, axis=0).astype(np.uint8)
closed = np.zeros((3000, 2000, 4), np.uint8); closed[holes] = (*skin, 255)
# the lids' sheet is white inside the lids: that white is cut away, the skin shows there
lids = np.array(face("closed")); lids[lids[:, :, :3].min(2) > 215, 3] = 0
cl = Image.fromarray(closed); cl.alpha_composite(Image.fromarray(lids)); cl.save(f"{R}/closed.png")


def lay(*names):
    im = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    for n in names:
        im.alpha_composite(Image.open(f"{R}/{n}.png").convert("RGBA"))
    return im.crop(CROP)


for out, src in {"legs": ("pants",), "body": ("torso",), "head": ("head",), "eyes": ("eyes",), "pupils": ("pupils",), "eyes-closed": ("closed",),
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
