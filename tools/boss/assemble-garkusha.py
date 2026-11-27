"""
Гаркуша (id garkusha — the artist's new model 2026-11-26: the body redrawn, the arms in three pieces; the old model and
its beaten look removed): the layers (tools/boss/source/garkusha/raw/): the body on the 2000×3000 sheet in place, B00…B07
(the PSD's order, top first) — handR (his right fist with the cash, the left of the picture, held out), handL (the left
one, raised by the face), lowR (the right forearm), armR (the right upper arm), lowL (the left forearm), body (the puffer
jacket), armL (the left upper arm, behind the jacket), legs; the head on its own 535×528 sheet, H00…H03 — head (with the eye
holes), pupilL / pupilR (one picture «pupils» here), eyes (the whites). The head is fitted by hand on the neck (HEAD: its
scale, where the chin's bottom goes). Everything is cropped to CROP → the rig sources for build-boss.py; prints the joints
(rig px) for build-boss.py PIVOT_BY_BOSS and the eye holes.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

D = "tools/boss/source/garkusha"
R = f"{D}/raw"
BODY = {"handR": "B00", "handL": "B01", "lowR": "B02", "armR": "B03", "lowL": "B04", "body": "B05", "armL": "B06", "legs": "B07"}
# H04-brows: the old model's brows (its 1000 px head sheet ×0.526, moved (+4, +5)) fitted onto the new head — it has none
FACE = {"head": "H00", "pupilL": "H01", "pupilR": "H02", "eyes": "H03", "brows": "H04"}
W, H0 = 2000, 3000
# the head goes up over the sheet's top: everything is drawn PAD px lower on a taller canvas
PAD = 120
H = H0 + PAD
# the head's sheet on the body: its scale, where the chin's bottom middle (271, 517 on the sheet) goes — over the neck
HEAD = {"s": 1.15, "cx": 1012, "jaw": 758}
CHIN = (271, 517)
os.makedirs(f"{D}/placed", exist_ok=True)


def find(prefix):
    return next(f for f in os.listdir(R) if f.startswith(prefix + "-"))


def placed_face(f):
    im = Image.open(f"{R}/{find(f)}").convert("RGBA")
    s = HEAD["s"]
    sc = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(sc, (round(HEAD["cx"] - CHIN[0] * s), round(PAD + HEAD["jaw"] - CHIN[1] * s)))
    return c


def placed_body(f):
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(Image.open(f"{R}/{find(f)}").convert("RGBA"), (0, PAD))
    return c


L = {n: placed_body(f) for n, f in BODY.items()}
L.update({n: placed_face(f) for n, f in FACE.items()})
# both pupils are one picture (they look about together)
L["pupils"] = L.pop("pupilL")
L["pupils"].alpha_composite(L.pop("pupilR"))
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
holes = A("eyes") & ~A("head")
lab, n = ndimage.label(holes)
sizes = ndimage.sum(holes, lab, range(1, n + 1))
for k in np.argsort(sizes)[::-1][:2]:
    yy, xx = np.nonzero(lab == k + 1)
    print("hole", rig(xx.min(), yy.min()), rig(xx.max(), yy.max()), "skin over", np.array(L["head"])[max(0, yy.min() - 6), int(xx.mean())][:3])
for n in ["pupils", "eyes", "handR", "handL", "legs"]:
    b = L[n].getbbox(); print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))
order = ["legs", "armL", "body", "lowL", "armR", "lowR", "eyes", "pupils", "head", "brows", "handL", "handR"]
whole = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(L[n])
whole = whole.crop(CROP)
os.makedirs("public/bosses/garkusha", exist_ok=True)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/garkusha/full.webp", quality=75, method=6)
hb = L["head"].getbbox()
cx, cy = (hb[0] + hb[2]) // 2 - CROP[0], (hb[1] + hb[3]) // 2 - CROP[1]
whole.crop((cx - 330, cy - 300, cx + 330, cy + 360)).resize((320, 320), Image.LANCZOS).save("public/bosses/garkusha/portrait.webp", quality=75, method=6)
print("ok", whole.size)
