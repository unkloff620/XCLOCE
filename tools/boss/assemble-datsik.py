"""
Дацкоу (id datsik, the new full-height art 2026-11-25): the artist's layers (tools/boss/source/datsik/raw/): the body on
the 2000×3004 sheet in place, B00…B06 (the PSD's order, top first) — lowL (his left forearm with the fist, the right of
the picture), lowR (his right forearm with the fist), armR (his right upper arm in the sleeve), legs (the jeans, the
belt, the sneakers), hair, body (the T-shirt with the neck), armL (his left upper arm, behind the T-shirt); the face on
its own 1000×1000 sheet, H00…H08 — brows, chin (the lower lip and the jaw), head (bald, with the eye holes and the
mouth's hole), pupils, eyes (the whites), teeth-up, teeth-low, tongue, throat (the mouth inside). The artist gave no
head in the body, so the face is fitted by hand into the hair's opening (raw/headfit.json: scale, the face's middle,
the chin's line — the face goes between the T-shirt with its neck and the hair). Everything is cropped to CROP → the rig
sources for build-boss.py. Prints the joints (rig px) for build-boss.py PIVOT_BY_BOSS, the eye holes, the mouth's drop.
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

D = "tools/boss/source/datsik"
R = f"{D}/raw"
fit = json.load(open(f"{R}/headfit.json"))
BODY = {"lowL": "B00", "lowR": "B01", "armR": "B02", "legs": "B03", "hair": "B04", "body": "B05", "armL": "B06"}
FACE = {"brows": "H00", "chin": "H01", "head": "H02", "pupils": "H03", "eyes": "H04", "teeth-up": "H05", "teeth-low": "H06", "tongue": "H07", "throat": "H08"}
W, H = 2000, 3004
os.makedirs(f"{D}/placed", exist_ok=True)
s = fit["s"]
tx, ty = round(fit["cx"] - 507 * s), round(fit["chin"] - 935 * s)


def placed_face(f):
    im = Image.open(f"{R}/{f}.png").convert("RGBA")
    sc = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(sc, (tx, ty))
    return c


L = {n: Image.open(f"{R}/{f}.png").convert("RGBA") for n, f in BODY.items()}
L.update({n: placed_face(f) for n, f in FACE.items()})
for n, im in L.items():
    a = np.array(im); a[a[..., 3] < 8] = 0; L[n] = Image.fromarray(a)
    L[n].save(f"{D}/placed/{n}.png")
bb = [im.getbbox() for im in L.values()]
CROP = (max(0, min(b[0] for b in bb) - 40), max(0, min(b[1] for b in bb) - 40), min(W, max(b[2] for b in bb) + 40), H)
print("CROP", CROP)
for n, im in L.items():
    im.crop(CROP).save(f"{D}/{n}.png")
rig = lambda x, y: [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]
A = lambda n: np.array(L[n])[..., 3] > 128


def mid(a, b):
    ys, xs = np.nonzero(a & b)
    return rig(xs.mean(), ys.mean()) if len(xs) else None


print("head (the chin's middle over the neck)", rig(fit["cx"], fit["chin"] - 25))
print("armR", mid(A("armR"), A("body")), "lowR", mid(A("armR"), A("lowR")))
print("armL", mid(A("armL"), A("body")), "lowL", mid(A("armL"), A("lowL")))
holes = A("eyes") & ~A("head")
lab, n = ndimage.label(holes)
sizes = ndimage.sum(holes, lab, range(1, n + 1))
for k in np.argsort(sizes)[::-1][:2]:
    yy, xx = np.nonzero(lab == k + 1)
    print("hole", rig(xx.min(), yy.min()), rig(xx.max(), yy.max()), "skin over", np.array(L["head"])[max(0, yy.min() - 5), int(xx.mean())][:3])
print("mouth drop (rig): 30 px on the face sheet →", round(30 * s * 0.5, 2))
for n in ["chin", "teeth-low", "tongue", "brows", "pupils", "hair"]:
    b = L[n].getbbox(); print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))
order = ["armL", "body", "legs", "throat", "tongue", "teeth-low", "teeth-up", "eyes", "pupils", "head", "chin", "brows", "hair", "armR", "lowR", "lowL"]
whole = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(L[n])
whole = whole.crop(CROP)
os.makedirs("public/bosses/datsik", exist_ok=True)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/datsik/full.webp", quality=75, method=6)
hb = L["head"].getbbox()
cx, cy = (hb[0] + hb[2]) // 2 - CROP[0], (hb[1] + hb[3]) // 2 - CROP[1]
whole.crop((cx - 280, cy - 260, cx + 280, cy + 300)).resize((320, 320), Image.LANCZOS).save("public/bosses/datsik/portrait.webp", quality=75, method=6)
print("ok", whole.size)
