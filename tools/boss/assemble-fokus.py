"""
Фокус (id fokus, 2026-11-25: the new art — a hacker in a hood with a flip phone and a laptop; the old art is «Псих»,
tools/boss/assemble-psih.py). The artist's layers (tools/boss/source/fokus/raw/): the body on the 2000×3000 sheet in
place, B00…B16 (the PSD's order, top first) — phone (the flip phone's lid), handR (the fist with the keypad half), hoodFront
(the hood's rim), hoodShadow (its shadow on the face), B04 the whole head (only to fit the face), neck, hoodBack, handL,
lowL, armL, laptop, lowR, coat, body (the hoodie), armR, legs, coatBack; the face on its own 603×577 sheet, H00…H08 —
brows, glasses, head, teeth-up, chin, teeth-low, throat (the mouth inside), pupils, eyes (the whites). The face is
fitted onto B04 (raw/headfit.json, SIFT + RANSAC: a similarity) and put in place; everything is cropped to CROP → the
rig sources for build-boss.py. Prints the joints (rig px) for build-boss.py PIVOT_BY_BOSS, the eye holes, the hinge
of the phone, the mouth's drop.
"""
import json, os
import numpy as np, cv2
from PIL import Image
from scipy import ndimage

D = "tools/boss/source/fokus"
R = f"{D}/raw"
BODY = {"phone": "B00", "handR": "B01", "hoodFront": "B02", "hoodShadow": "B03", "neck": "B05", "hoodBack": "B06", "handL": "B07",
        "lowL": "B08", "armL": "B09", "laptop": "B10", "lowR": "B11", "coat": "B12", "body": "B13", "armR": "B14", "legs": "B15", "coatBack": "B16"}
FACE = {"brows": "H00", "glasses": "H01", "head": "H02", "teeth-up": "H03", "chin": "H04", "teeth-low": "H05", "throat": "H06", "pupils": "H07", "eyes": "H08"}
M = np.array(json.load(open(f"{R}/headfit.json"))["M"], np.float32)
os.makedirs(f"{D}/placed", exist_ok=True)

L = {n: Image.open(f"{R}/{f}.png").convert("RGBA") for n, f in BODY.items()}
for n, f in FACE.items():
    L[n] = Image.fromarray(cv2.warpAffine(np.array(Image.open(f"{R}/{f}.png").convert("RGBA")), M, (2000, 3000), flags=cv2.INTER_LANCZOS4))
for n, im in L.items():
    a = np.array(im); a[a[..., 3] < 8] = 0; L[n] = Image.fromarray(a)
    L[n].save(f"{D}/placed/{n}.png")
bb = [im.getbbox() for im in L.values()]
CROP = (max(0, min(b[0] for b in bb) - 40), max(0, min(b[1] for b in bb) - 40), min(2000, max(b[2] for b in bb) + 40), 3000)
print("CROP", CROP)
for n, im in L.items():
    im.crop(CROP).save(f"{D}/{n}.png")
rig = lambda x, y: [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]
A = lambda n: np.array(L[n])[..., 3] > 128


def mid(a, b):
    ys, xs = np.nonzero(a & b)
    return rig(xs.mean(), ys.mean()) if len(xs) else None


trunk = A("body") | A("coat")
ys, xs = np.nonzero(A("neck"))
print("head (the neck's bottom)", rig(xs[ys > ys.max() - 40].mean(), ys.max() - 30))
print("armR", mid(A("armR"), trunk), "lowR", mid(A("armR"), A("lowR")), "handR", mid(A("lowR"), A("handR")))
print("armL", mid(A("armL"), trunk), "lowL", mid(A("armL"), A("lowL")), "handL", mid(A("lowL"), A("handL")))
print("phone hinge", mid(A("phone"), A("handR")))
holes = A("eyes") & ~A("head")
lab, n = ndimage.label(holes)
sizes = ndimage.sum(holes, lab, range(1, n + 1))
for k in np.argsort(sizes)[::-1][:2]:
    yy, xx = np.nonzero(lab == k + 1)
    print("hole", rig(xx.min(), yy.min()), rig(xx.max(), yy.max()), "skin under", np.array(L["head"])[max(0, yy.min() - 6), int(xx.mean())][:3])
s = float(np.hypot(M[0, 0], M[1, 0]))
print("mouth drop (rig): the artist's Shift + 3 × ↓ = 30 px on the face sheet →", round(30 * s * 0.5, 2))
for n in ["chin", "teeth-low", "glasses", "brows", "pupils", "hoodFront", "hoodShadow", "laptop", "phone"]:
    b = L[n].getbbox(); print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))
order = ["coatBack", "legs", "armR", "body", "coat", "lowR", "laptop", "armL", "lowL", "handL", "hoodBack", "neck", "throat", "teeth-low", "chin", "teeth-up",
         "eyes", "pupils", "head", "brows", "glasses", "hoodShadow", "hoodFront", "handR", "phone"]
whole = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(L[n])
whole = whole.crop(CROP)
os.makedirs("public/bosses/fokus", exist_ok=True)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/fokus/full.webp", quality=88, method=6)
hb = L["head"].getbbox()
cx, cy = (hb[0] + hb[2]) // 2 - CROP[0], (hb[1] + hb[3]) // 2 - CROP[1]
whole.crop((cx - 330, cy - 330, cx + 330, cy + 330)).resize((320, 320), Image.LANCZOS).save("public/bosses/fokus/portrait.webp", quality=88, method=6)
print("ok", whole.size)
