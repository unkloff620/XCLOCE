"""
Бабафей (boss 6, id babafey): turns the artist's loose parts into rig layers for build-boss.py.
Sources: tools/boss/source/babafey/raw/ — body parts in place on one 2000×2800 sheet: legs, torso, armL (sleeve, viewer's
left), foreL (its forearm with the red cuff), handL-balalaika (the hand raised with the balalaika), armR, foreR, handR
(the open palm); the face on one 1000×1000 sheet: head (closed smile, blank eyes), head-open (the same with a hole for
the mouth), throat (dark inside of the mouth), teeth-up, teeth-low, eyes (whites), eyes-closed, brows; pupil.png — one
iris, put into both eyes.
No reference picture: the face sheet is placed by hand (HEAD_S, chin over the collar at CHIN), the sheets get PAD px of
air on top for the hair.
Layers (one canvas, cropped to CROP):
  body   legs + torso (breathes)                     head / head-open + throat + teeth-up + teeth-low (the jaw)
  eyes / pupils / eyes-closed / browL / browR (each brow alone — the emotions are made by the brows)
  armL → lowL → handL, armR → lowR → handR — shoulder, elbow, wrist (pivots in build-boss.py)
Also writes public/bosses/babafey/{full,portrait,card}.webp.
"""
import os
import numpy as np
from PIL import Image

D = "tools/boss/source/babafey"
R = f"{D}/raw"
PAD = 200                   # air on top (hair) and on the sides (the bigger body)
BODY_S = 1.25               # the body sheet is drawn bigger than the artist's, around the neck (ANCHOR stays in place)
ANCHOR = (1014, 560)
W, H = 2000 + 2 * PAD, 3500
CROP = (150, 10, 2340, 3496)
HEAD_S = 0.88
CHIN = (1014, 600)          # where the chin (sheet point 512, 922) goes on the body sheet
PUPIL_D = 27                # iris height on the face sheet
EYE_C = [(443, 583), (633, 578)]


def body(n):
    im = Image.open(f"{R}/{n}.png").convert("RGBA")
    im = im.resize((round(im.width * BODY_S), round(im.height * BODY_S)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(im, (round(PAD + ANCHOR[0] * (1 - BODY_S)), round(PAD + ANCHOR[1] * (1 - BODY_S))))
    return c


def rig_px(x, y, body_sheet=True):
    """a point of the artist's body sheet → build-boss.py output px (for the pivots)"""
    if body_sheet:
        x, y = ANCHOR[0] + (x - ANCHOR[0]) * BODY_S, ANCHOR[1] + (y - ANCHOR[1]) * BODY_S
    return [round((x + PAD - CROP[0]) * 0.5, 1), round((y + PAD - CROP[1]) * 0.5, 1)]


def face_sheet(im):
    im = im.resize((round(im.width * HEAD_S), round(im.height * HEAD_S)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(im, (round(PAD + CHIN[0] - 512 * HEAD_S), round(PAD + CHIN[1] - 922 * HEAD_S)))
    return c


def face(n):
    return face_sheet(Image.open(f"{R}/{n}.png").convert("RGBA"))


def save(n, im):
    im.crop(CROP).save(f"{D}/{n}.png")


b = body("legs")
b.alpha_composite(body("torso"))
save("body", b)
for n in ["head", "head-open", "throat", "teeth-up", "teeth-low", "eyes", "eyes-closed"]:
    save(n, face(n))

# both brows apart, so each can move on its own
brows = np.array(Image.open(f"{R}/brows.png").convert("RGBA"))
for side, (x0, x1) in {"browL": (0, 542), "browR": (542, 1000)}.items():
    one = np.zeros_like(brows)
    one[:, x0:x1] = brows[:, x0:x1]
    save(side, face_sheet(Image.fromarray(one)))

# the iris into both eyes (clipped to the whites in the rig)
pupil = Image.open(f"{R}/pupil.png").convert("RGBA")
k = PUPIL_D / pupil.height
pupil = pupil.resize((round(pupil.width * k), round(pupil.height * k)), Image.LANCZOS)
sheet = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
for cx, cy in EYE_C:
    sheet.alpha_composite(pupil, (round(cx - pupil.width / 2), round(cy - pupil.height / 2)))
save("pupils", face_sheet(sheet))

save("armL", body("armL"))
save("lowL", body("foreL"))
save("handL", body("handL-balalaika"))
save("armR", body("armR"))
save("lowR", body("foreR"))
save("handR", body("handR"))

# pictures for the lists: the whole boss, the face, the card (waist up)
ref = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for im in [b, body("armL"), body("foreL"), body("handL-balalaika"), body("armR"), body("foreR"), body("handR"), face("head")]:
    ref.alpha_composite(im)
eyes = face("eyes")
pup = face_sheet(sheet)
pa = np.array(pup)
pa[:, :, 3] = (pa[:, :, 3].astype(int) * (np.array(eyes)[:, :, 3] > 60)).astype(np.uint8)
ref.alpha_composite(Image.fromarray(pa))
for n in ["browL", "browR"]:
    ref.alpha_composite(Image.open(f"{D}/{n}.png").convert("RGBA"), CROP[:2])
ref.save(f"{R}/reference.png")
os.makedirs("public/bosses/babafey", exist_ok=True)
bb = ref.getbbox()
x0, y0, x1, y1 = bb[0] - 20, bb[1] - 10, bb[2] + 20, bb[3] + 10
full = ref.crop((x0, y0, x1, y1))
full.resize((1024, round(1024 * full.height / full.width)), Image.LANCZOS).save("public/bosses/babafey/full.webp", quality=88, method=6)
hx = PAD + CHIN[0]
hy = PAD + CHIN[1] - 922 * HEAD_S
ref.crop((round(hx - 360), round(hy + 120), round(hx + 360), round(hy + 840))).resize((512, 512), Image.LANCZOS).save("public/bosses/babafey/portrait.webp", quality=88, method=6)
print("crop bbox", bb)
# joints on the artist's sheet: shoulder, elbow, wrist of each arm; the brows' inner ends on the face sheet
J = {"armL": (770, 770), "lowL": (590, 1120), "handL": (420, 900), "armR": (1290, 760), "lowR": (1470, 1080), "handR": (1690, 1300)}
# lowR is overridden in build-boss.py: the bend is at the lower edge just before the cuff (the user's point)
piv = {k: rig_px(*v) for k, v in J.items()}
for k, (fx, fy) in {"browL": (520, 545), "browR": (568, 545)}.items():
    piv[k] = rig_px(CHIN[0] + (fx - 512) * HEAD_S, CHIN[1] + (fy - 922) * HEAD_S, False)
print("pivots", piv)
