"""
Боцман (id botsman): the artist's layers, all in place on one 2000×3000 sheet — tools/boss/source/botsman/raw/
{coat,legs,head,upperL,foreL,fistL,upperR,foreR,fistR}.png (L — the arm on the left of the picture: down, the fist before
the belly; R — the guard arm up on the right).
→ rig sources for build-boss.py (cropped to the figure): body = the coat (its tails swing — bs-hem, boss-rig.tsx),
legs = the trousers and boots (drawn OVER the coat, as the artist asked), head, armL/lowL/handL, armR/lowR/handR
(shoulder → forearm at the elbow → fist at the wrist; joints: build-boss.py PIVOT_BY_BOSS),
and the pictures for the lists: public/bosses/botsman/{full,portrait}.webp.
"""
import os
from PIL import Image

D = "tools/boss/source/botsman"
R = f"{D}/raw"
CROP = (40, 100, 1880, 2945)


def lay(*names):
    im = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    for n in names:
        im.alpha_composite(Image.open(f"{R}/{n}.png").convert("RGBA"))
    return im.crop(CROP)


for out, src in {"legs": ("legs",), "body": ("coat",), "head": ("head",),
                 "armL": ("upperL",), "lowL": ("foreL",), "handL": ("fistL",),
                 "armR": ("upperR",), "lowR": ("foreR",), "handR": ("fistR",)}.items():
    lay(*src).save(f"{D}/{out}.png")

os.makedirs("public/bosses/botsman", exist_ok=True)
full = lay("coat", "legs", "upperR", "foreR", "fistR", "upperL", "foreL", "fistL", "head")
f = full.resize((full.width // 2, full.height // 2), Image.LANCZOS)
f.save("public/bosses/botsman/full.webp", quality=88, method=6)
# the portrait: the head and the collar, square
p = full.crop((620, 0, 1260, 640)).resize((320, 320), Image.LANCZOS)
p.save("public/bosses/botsman/portrait.webp", quality=88, method=6)
print("ok", full.size)
