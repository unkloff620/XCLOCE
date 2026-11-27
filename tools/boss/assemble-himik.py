"""
Химик (id himik, the 16th boss — the third «Отморозок», the user 2026-11-26): the artist's layers (tools/boss/source/himik/raw/):
the body on the 2000×3000 sheet in place, B00…B15 (the PSD's order, top first) — lowL (his left forearm with the
glove, the right of the picture), armL (its sleeve), tube-glass / tube (the narrow test tube in that hand: the same
glass twice, 70 % and solid — the poison goes between them), coatR / coatL (the lab coat's two halves), fingersR /
thumbR (his right glove's fingers and thumb over the round flask), flaskR-glass / flaskR (the round flask, the same
pair), handR (the glove's palm), lowR (the forearm in the rolled cuff), armR (the sleeve), legs, body (the shirt), neck;
the head on its own 684×685 sheet, H00…H11 — maskEar (the mask hanging off his ear: below half HP), mask (on the face),
brows, beard, mustache, chin (the lower lip and the jaw), teeth-low (over the head, under the chin: it drops with the jaw), head (the hair, the face with the eye holes and the
mouth's hole), pupils, teeth-up (under the head, in its mouth's hole: they stay with the head), eyes (the whites), throat. The head is fitted by hand on the neck (HEAD: its scale and
where its jaw goes). Everything is cropped to CROP → the rig sources for build-boss.py; and the poison's masks
(poisonR-mask / poisonL-mask: the inside of each glass, white) for boss-himik.tsx. Prints the joints (rig px) for
build-boss.py PIVOT_BY_BOSS, the eye holes, the glasses' mouths.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

D = "tools/boss/source/himik"
R = f"{D}/raw"
BODY = {"lowL": "B00", "armL": "B01", "tube-glass": "B02", "tube": "B03", "coatR": "B04", "coatL": "B05", "fingersR": "B06",
        "thumbR": "B07", "flaskR-glass": "B08", "flaskR": "B09", "handR": "B10", "lowR": "B11", "armR": "B12", "legs": "B13",
        "body": "B14", "neck": "B15"}
FACE = {"maskEar": "H00", "mask": "H01", "brows": "H02", "beard": "H03", "mustache": "H04", "chin": "H05", "teeth-low": "H06",
        "head": "H07", "pupils": "H08", "teeth-up": "H09", "eyes": "H10", "throat": "H11"}
W, H = 2000, 3000
# the head's sheet on the body: its scale, where its jaw's middle (343, 470 on the sheet) goes — over the neck
HEAD = {"s": 1.0, "cx": 1052, "jaw": 560}
os.makedirs(f"{D}/placed", exist_ok=True)


def find(prefix):
    return next(f for f in os.listdir(R) if f.startswith(prefix + "-"))


def placed_face(f):
    im = Image.open(f"{R}/{find(f)}").convert("RGBA")
    s = HEAD["s"]
    sc = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(sc, (round(HEAD["cx"] - 343 * s), round(HEAD["jaw"] - 470 * s)))
    return c


L = {n: Image.open(f"{R}/{find(f)}").convert("RGBA") for n, f in BODY.items()}
L.update({n: placed_face(f) for n, f in FACE.items()})
# the thumb's sheet has a faint haze all over: only its real pixels
for n, im in L.items():
    a = np.array(im)
    a[a[..., 3] < 8] = 0
    L[n] = Image.fromarray(a)


def inside(n):
    """the inside of a glass (its solid copy): the light pixels within its outline, the biggest piece, a little in"""
    a = np.array(L[n]).astype(int)
    m = (a[..., 3] > 128) & (a[..., :3].mean(2) > 105)
    m = ndimage.binary_erosion(m, iterations=3)
    lab, k = ndimage.label(m)
    big = np.argmax(ndimage.sum(m, lab, range(1, k + 1))) + 1
    m = ndimage.binary_fill_holes(lab == big)
    out = np.zeros((H, W, 4), np.uint8)
    out[m] = (255, 255, 255, 255)
    return Image.fromarray(out)


L["poisonR-mask"] = inside("flaskR")
L["poisonL-mask"] = inside("tube")
for n, im in L.items():
    im.save(f"{D}/placed/{n}.png")
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


print("head (the jaw's middle over the neck)", rig(HEAD["cx"], HEAD["jaw"] - 10))
print("armR", mid(A("armR"), A("body") | A("neck")), "lowR", mid(A("armR"), A("lowR")), "handR", mid(A("lowR"), A("handR")))
print("armL", mid(A("armL"), A("body") | A("neck")), "lowL", mid(A("armL"), A("lowL")))
# the eye holes: the whites not under the head
holes = A("eyes") & ~A("head")
lab, n = ndimage.label(holes)
sizes = ndimage.sum(holes, lab, range(1, n + 1))
for k in np.argsort(sizes)[::-1][:2]:
    yy, xx = np.nonzero(lab == k + 1)
    print("hole", rig(xx.min(), yy.min()), rig(xx.max(), yy.max()), "skin over", np.array(L["head"])[max(0, yy.min() - 6), int(xx.mean())][:3])
for n in ["chin", "teeth-low", "brows", "pupils", "mask", "maskEar", "beard", "mustache", "flaskR", "tube", "coatR", "coatL", "legs"]:
    b = L[n].getbbox(); print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))
# the glasses' mouths: the round flask's top middle, the tube's upper-left end
fr = A("flaskR"); ys, xs = np.nonzero(fr); top = ys.min(); print("flask mouth", rig(xs[ys < top + 12].mean(), top))
tb = A("tube"); ys, xs = np.nonzero(tb); s = xs + ys; i = np.argsort(s)[:40]; print("tube mouth", rig(xs[i].mean(), ys[i].mean()))
order = ["legs", "neck", "body", "armR", "lowR", "handR", "flaskR", "flaskR-glass", "thumbR", "fingersR", "coatL", "coatR",
         "throat", "teeth-up", "eyes", "pupils", "head", "teeth-low", "chin", "mustache", "beard", "brows", "mask",
         "tube", "tube-glass", "armL", "lowL"]
whole = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(L[n])
whole = whole.crop(CROP)
os.makedirs("public/bosses/himik", exist_ok=True)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/himik/full.webp", quality=75, method=6)
hb = L["head"].getbbox()
cx, cy = (hb[0] + hb[2]) // 2 - CROP[0], (hb[1] + hb[3]) // 2 - CROP[1]
whole.crop((cx - 300, cy - 280, cx + 300, cy + 320)).resize((320, 320), Image.LANCZOS).save("public/bosses/himik/portrait.webp", quality=75, method=6)
print("ok", whole.size)
