"""
Боцман (id botsman): the artist's layers, all in place on one 2000×3000 sheet — tools/boss/source/botsman/raw/
{coat,legs,head,upperL,foreL,fistL,upperR,foreR,fistR}.png (L — the arm on the left of the picture: down, the fist before
the belly holding a crowbar (raw/crowbar.png, under the fist); R — the guard arm up on the right).
→ rig sources for build-boss.py (cropped to the figure): body = the coat (its tails swing — bs-hem, boss-rig.tsx),
legs = the trousers and boots (drawn OVER the coat, as the artist asked), head, armL/lowL/handL, armR/lowR/handR
(shoulder → forearm at the elbow → fist at the wrist; joints: build-boss.py PIVOT_BY_BOSS),
and the pictures for the lists: public/bosses/botsman/{full,portrait}.webp.
The face (raw/face/, the artist's 1000×1000 sheets, all in place on one face; head.png — the whole head with its own sad
closed mouth): fitted onto the sheet's head (FACE_K, FACE_AT — the best overlap of the two heads) → head, eyes, pupils,
eyes-closed, browL / browR (the brows split at their gap), throat, teeth-up, teeth-low, lips (the open mouth with its hole:
over the throat and the teeth; hidden when he is hit — the head's sad mouth shows).
"""
import os
import numpy as np
from PIL import Image

D = "tools/boss/source/botsman"
R = f"{D}/raw"
CROP = (40, 100, 1880, 2945)


def lay(*names):
    im = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    for n in names:
        im.alpha_composite(Image.open(f"{R}/{n}.png").convert("RGBA"))
    return im.crop(CROP)


FACE_K, FACE_AT = 0.535, (656, 118)
BROW_GAP = 507                  # between the brows on the face sheet (x)


def face(n):
    f = Image.open(f"{R}/face/{n}.png").convert("RGBA")
    a = np.array(f)
    a[..., 3][a[..., 3] <= 40] = 0          # the head's faint streaks round it
    f = Image.fromarray(a)
    f = f.resize((round(f.width * FACE_K), round(f.height * FACE_K)), Image.LANCZOS)
    sheet = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    sheet.alpha_composite(f, FACE_AT)
    return sheet


for n in ["head", "eyes", "pupils", "eyes-closed", "throat", "teeth-up", "teeth-low", "lips"]:
    face(n).crop(CROP).save(f"{D}/{n}.png")
br = face("brows")
cut = round(FACE_AT[0] + BROW_GAP * FACE_K)
for n, box in {"browL": (0, 0, cut, 3000), "browR": (cut, 0, 2000, 3000)}.items():
    half = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    half.paste(br.crop(box), box[:2])
    half.crop(CROP).save(f"{D}/{n}.png")
    # the inner end (the turn point): the column nearest the gap, its middle — in rig px (cropped, halved)
    a = np.array(half)[..., 3] > 60
    xs = np.nonzero(a.any(0))[0]
    x = xs.max() if n == "browL" else xs.min()
    ys = np.nonzero(a[:, x])[0]
    print(n, "pivot", [round((x - CROP[0]) * 0.5, 1), round((ys.mean() - CROP[1]) * 0.5, 1)])

for out, src in {"legs": ("legs",), "body": ("coat",),
                 "armL": ("upperL",), "lowL": ("foreL",), "handL": ("crowbar", "fistL"),
                 "armR": ("upperR",), "lowR": ("foreR",), "handR": ("fistR",)}.items():
    lay(*src).save(f"{D}/{out}.png")

os.makedirs("public/bosses/botsman", exist_ok=True)
full = lay("coat", "legs", "upperR", "foreR", "fistR", "upperL", "foreL", "crowbar", "fistL")
full.alpha_composite(face("head").crop(CROP))
f = full.resize((full.width // 2, full.height // 2), Image.LANCZOS)
f.save("public/bosses/botsman/full.webp", quality=88, method=6)
# the portrait: the head and the collar, square
p = full.crop((620, 0, 1260, 640)).resize((320, 320), Image.LANCZOS)
p.save("public/bosses/botsman/portrait.webp", quality=88, method=6)
print("ok", full.size)
