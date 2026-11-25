"""
Нитка (id nitka, the mentor «Мотя Нитка»): the artist's layers (tools/boss/source/nitka/raw/: the body on the 2000×3000
sheet in place — legs, armR (his right upper arm, the LEFT of the picture, behind the body), body (the tank top), shirtL /
shirtR (the open shirt's halves), armL, lowR / lowL (the forearms), handR / handL (the fists with the needles) and their
bloody copies, headRef (the whole head in place); the face on its own 1000×1000 sheet — throat, teeth-low, teeth-up,
chin, eyes (the whites), pupils, head, brows, glasses). The face sheet is fitted onto headRef (raw/headfit.json, the fit
by hand: scale + shift) and every face part put in place; everything is cropped to CROP → the rig sources for
build-boss.py. Prints the joints (rig px) for build-boss.py PIVOT_BY_BOSS, the eye holes and the mouth's drop.
"""
import json, os
import numpy as np
from PIL import Image

D = "tools/boss/source/nitka"
R = f"{D}/raw"
fit = json.load(open(f"{R}/headfit.json"))
BODY = ["legs", "armR", "body", "shirtL", "shirtR", "armL", "lowR", "handR", "handR-blood", "lowL", "handL", "handL-blood"]
FACE = ["throat", "teeth-low", "teeth-up", "chin", "eyes", "pupils", "head", "brows", "glasses"]
os.makedirs(f"{D}/placed", exist_ok=True)


def placed_face(n):
    sh = Image.open(f"{R}/h-{n}.png").convert("RGBA")
    s = fit["s"]
    sc = sh.resize((round(sh.width * s), round(sh.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    c.alpha_composite(sc, (int(fit["tx"]), int(fit["ty"])))
    return c


L = {n: Image.open(f"{R}/{n}.png").convert("RGBA") for n in BODY}
L.update({n: placed_face(n) for n in FACE})
for n, im in L.items():
    a = np.array(im); a[a[..., 3] < 8] = 0; L[n] = Image.fromarray(a)
    L[n].save(f"{D}/placed/{n}.png")
# the crop: everything with a margin, the feet at the bottom
bb = [im.getbbox() for im in L.values()]
CROP = (max(0, min(b[0] for b in bb) - 40), max(0, min(b[1] for b in bb) - 40), min(2000, max(b[2] for b in bb) + 40), 3000)
print("CROP", CROP)
for n, im in L.items():
    im.crop(CROP).save(f"{D}/{n}.png")


def rig(x, y):
    return [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]


def A(n):
    return np.array(L[n])[..., 3] > 128


def mid(a, b):
    m = a & b
    ys, xs = np.nonzero(m)
    return rig(xs.mean(), ys.mean())


body = A("body") | A("shirtL") | A("shirtR")
h = A("head")
ys, xs = np.nonzero(h)
print("head", rig(xs[ys > ys.max() - 60].mean(), ys.max() - 40))
print("armR", mid(A("armR"), body), "lowR", mid(A("armR"), A("lowR")), "handR", mid(A("lowR"), A("handR")))
print("armL", mid(A("armL"), body), "lowL", mid(A("armL"), A("lowL")), "handL", mid(A("lowL"), A("handL")))
# the eye holes: the whites not covered by the head
from scipy import ndimage
holes = A("eyes") & ~h
lab, n = ndimage.label(holes)
sizes = ndimage.sum(holes, lab, range(1, n + 1))
for k in np.argsort(sizes)[::-1][:2]:
    yy, xx = np.nonzero(lab == k + 1)
    print("hole", rig(xx.min(), yy.min()), rig(xx.max(), yy.max()))
# the mouth: the artist's «Shift + 3 × ↓» in Photoshop = 30 px on the face sheet
print("mouth drop (rig)", round(30 * fit["s"] * 0.5, 2))
for n in ["chin", "teeth-low", "teeth-up", "throat", "glasses", "brows", "pupils"]:
    b = L[n].getbbox(); print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))
# the needles' points: the topmost lit pixel of each hand (the needle sticks up)
for n in ["handR", "handL"]:
    yy, xx = np.nonzero(A(n)); i = yy.argmin(); print(n, "needle top", rig(xx[i], yy[i]))
    i = yy.argmax(); print(n, "needle bottom", rig(xx[i], yy[i]))
os.makedirs("public/bosses/nitka", exist_ok=True)
order = ["legs", "armR", "body", "shirtL", "shirtR", "armL", "lowR", "handR", "throat", "teeth-low", "teeth-up", "chin", "eyes", "pupils", "head", "brows", "glasses", "lowL", "handL"]
whole = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(L[n])
whole = whole.crop(CROP)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/nitka/full.webp", quality=88, method=6)
hb = L["head"].getbbox()
cx, cy = (hb[0] + hb[2]) // 2 - CROP[0], (hb[1] + hb[3]) // 2 - CROP[1]
whole.crop((cx - 330, cy - 330, cx + 330, cy + 330)).resize((320, 320), Image.LANCZOS).save("public/bosses/nitka/portrait.webp", quality=88, method=6)
print("ok", whole.size)
