"""
Кедр (id kedr, the 2nd boss — the new model 2026-11-26, the old one and its beaten look removed): the artist's layers
(tools/boss/source/kedr/raw/): the body on the 2000×3000 sheet in place, B00…B07 (the PSD's order, top first) — handL (his
left hand, open: the right of the picture), lowL (its forearm), armL (its sleeve), body (the T-shirt, the neck), handR (the
fist with the hammer, the left of the picture), lowR, armR, legs; the head on its own 535×528 sheet, H00…H07 — brows, chin
(the lower lip and the jaw: it drops), head (the hair, the face with the eye holes and the mouth's hole), pupils, eyes (the
whites), teeth-up, teeth-low, throat. The head is fitted by hand on the neck (HEAD: its scale, where the chin's bottom
goes). Everything is cropped to CROP → the rig sources for build-boss.py; prints the joints (rig px) for build-boss.py
PIVOT_BY_BOSS, the eye holes, the left hand's knuckles and the hammer's head.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

D = "tools/boss/source/kedr"
R = f"{D}/raw"
BODY = {"handL": "B00", "lowL": "B01", "armL": "B02", "body": "B03", "handR": "B04", "lowR": "B05", "armR": "B06", "legs": "B07"}
FACE = {"brows": "H00", "chin": "H01", "head": "H02", "pupils": "H03", "eyes": "H04", "teeth-up": "H05", "teeth-low": "H06", "throat": "H07"}
W, H0 = 2000, 3000
# the head goes up over the sheet's top: everything is drawn PAD px lower on a taller canvas
PAD = 120
H = H0 + PAD
# the head's sheet on the body: its scale, where the chin's bottom middle (293, 502 on the sheet) goes — over the neck
HEAD = {"s": 1.15, "cx": 1009, "jaw": 525}
os.makedirs(f"{D}/placed", exist_ok=True)


def find(prefix):
    return next(f for f in os.listdir(R) if f.startswith(prefix + "-"))


def placed_face(f):
    im = Image.open(f"{R}/{find(f)}").convert("RGBA")
    s = HEAD["s"]
    sc = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(sc, (round(HEAD["cx"] - 293 * s), round(PAD + HEAD["jaw"] - 502 * s)))
    return c


def placed_body(f):
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(Image.open(f"{R}/{find(f)}").convert("RGBA"), (0, PAD))
    return c


L = {n: placed_body(f) for n, f in BODY.items()}
L.update({n: placed_face(f) for n, f in FACE.items()})
for n, im in L.items():
    a = np.array(im)
    a[a[..., 3] < 8] = 0
    L[n] = Image.fromarray(a)
    L[n].save(f"{D}/placed/{n}.png")
bb = [im.getbbox() for im in L.values()]
CROP = (max(0, min(b[0] for b in bb) - 60), max(0, min(b[1] for b in bb) - 60), min(W, max(b[2] for b in bb) + 60), H)
print("CROP", CROP)
for n, im in L.items():
    im.crop(CROP).save(f"{D}/{n}.png")
rig = lambda x, y: [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]
A = lambda n: np.array(L[n])[..., 3] > 128


def mid(a, b):
    ys, xs = np.nonzero(a & b)
    return rig(xs.mean(), ys.mean()) if len(xs) else None


print("head (the chin over the neck)", rig(HEAD["cx"], PAD + HEAD["jaw"] - 20))
print("armR", mid(A("armR"), A("body")), "lowR", mid(A("armR"), A("lowR")), "handR", mid(A("lowR"), A("handR")))
print("armL", mid(A("armL"), A("body")), "lowL", mid(A("armL"), A("lowL")), "handL", mid(A("lowL"), A("handL")))
# the left hand's knuckles (where its fingers bend when it clenches): by hand off the artist's hand
print("knuckles", rig(1425, PAD + 1488))
holes = A("eyes") & ~A("head")
lab, n = ndimage.label(holes)
sizes = ndimage.sum(holes, lab, range(1, n + 1))
for k in np.argsort(sizes)[::-1][:2]:
    yy, xx = np.nonzero(lab == k + 1)
    print("hole", rig(xx.min(), yy.min()), rig(xx.max(), yy.max()), "skin over", np.array(L["head"])[max(0, yy.min() - 6), int(xx.mean())][:3])
for n in ["chin", "teeth-low", "teeth-up", "throat", "brows", "pupils", "handR", "legs"]:
    b = L[n].getbbox(); print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))
order = ["legs", "armR", "lowR", "handR", "body", "throat", "teeth-up", "teeth-low", "chin", "eyes", "pupils", "head", "brows", "armL", "lowL", "handL"]
whole = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(L[n])
whole = whole.crop(CROP)
os.makedirs("public/bosses/kedr", exist_ok=True)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/kedr/full.webp", quality=75, method=6)
hb = L["head"].getbbox()
cx, cy = (hb[0] + hb[2]) // 2 - CROP[0], (hb[1] + hb[3]) // 2 - CROP[1]
whole.crop((cx - 330, cy - 300, cx + 330, cy + 360)).resize((320, 320), Image.LANCZOS).save("public/bosses/kedr/portrait.webp", quality=75, method=6)
print("ok", whole.size)
