"""
Гопник — the defender of the raid buildings (Ходки, src/client/screens/raids.tsx), drawn by the artist in layers on one
2000×3000 sheet, in place: tools/boss/source/gopnik/raw/{pants,torso,head,upperL,foreL,fistL,upperR,foreR,fistR}.png.
L is the arm on the left of the picture (his right arm), R — on the right (his left arm, the forearm across the belly).
→ rig sources for build-boss.py, cropped to the hips (the fight shows him down to the hips):
  legs = pants (they stay put), body = torso (leans into the punches at the waist), head, armL/lowL/handL, armR/lowR/handR (shoulder → forearm at the elbow → fist at the wrist).
The joints (build-boss.py PIVOT_BY_BOSS) are the middles of where the pieces overlap.
"""
import os
from PIL import Image

D = "tools/boss/source/gopnik"
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
