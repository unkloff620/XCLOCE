"""
Фокус (id fokus): the artist's loose layers (tools/boss/source/fokus/raw/, each cropped to itself, the head's parts at
their own scale) put in place on the 2000×3000 picture raw/reference.png by fit-parts.py (raw/fit.json; the body's
pieces are 1:1 on the sheet, the face's ≈0.45; the mouth's pieces — the chin, the throat, the teeth, the lips — are not
in the picture: placed by hand on the head's own mouth) and place-parts.py (placed/<part>.png).
R — his right arm (the fist on the hip, on the LEFT of the picture), L — his left (the knife, on the right).
→ rig sources for build-boss.py (cropped to CROP): legs, body, armR/lowR/handR + fingerR (the right hand with the
pointing finger: it pushes the glasses up), armL/lowL/handL (the knife), the face: eyes (the whites, under the head's
eye holes), pupils, head, nose, chin (the lower face that drops with the jaw), throat, teeth-up, teeth-low, lips-up /
lips (the lips split at the mouth's corners: the lower one drops with the jaw), browL / browR, temple (the glasses' arm),
glasses, hair; and public/bosses/fokus/{full,portrait}.webp. Prints the joints (rig px) for build-boss.py PIVOT_BY_BOSS.
"""
import json, os
import numpy as np
from PIL import Image

D = "tools/boss/source/fokus"
CROP = (180, 200, 1980, 2920)
fit = json.load(open(f"{D}/raw/fit.json"))


def placed(n):
    return Image.open(f"{D}/placed/{n}.png").convert("RGBA")


def arr(im):
    return np.array(im)


def rig(x, y):
    return [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]


def save(n, im):
    a = arr(im)
    a[a[..., 3] < 8] = 0
    Image.fromarray(a).crop(CROP).save(f"{D}/{n}.png")


for n in ["legs", "body", "armR", "lowR", "handR", "fingerR", "armL", "lowL", "handL", "eyes", "pupils", "head", "nose",
          "chin", "throat", "teeth-up", "teeth-low", "glasses", "hair"]:
    save(n, placed(n))

# the glasses' arm (raw/temple.png, a bar from its top-right end to its bottom-left one): from the hinge at the glasses'
# outer corner to the top of the ear — boss-fokus.tsx bends it between the two when the glasses slide down
HINGE, EAR = (436.0, 124.5), (444.0, 149.0)       # rig units
import cv2
tr = arr(Image.open(f"{D}/raw/temple.png").convert("RGBA"))
A, B = np.array([83.0, 2.0]), np.array([2.0, 81.0])  # the raw bar's ends: the hinge's, the ear's
sheet = lambda p: np.array([p[0] * 2 + CROP[0], p[1] * 2 + CROP[1]])
H2, E2 = sheet(HINGE), sheet(EAR)
v0, v1 = B - A, E2 - H2
k = np.linalg.norm(v1) / np.linalg.norm(v0)
ang = np.arctan2(v1[1], v1[0]) - np.arctan2(v0[1], v0[0])
R = k * np.array([[np.cos(ang), -np.sin(ang)], [np.sin(ang), np.cos(ang)]])
M = np.hstack([R, (H2 - R @ A)[:, None]]).astype(np.float32)
# the bar keeps its own thickness: drawn thicker along the normal than the plain scale gives
warped = cv2.warpAffine(tr, M, (2000, 3000), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
warped[..., 3] = np.clip(warped[..., 3].astype(int) * 2, 0, 255).astype(np.uint8)
Image.fromarray(warped).save(f"{D}/placed/temple.png")
save("temple", Image.fromarray(warped))
print("temple hinge", HINGE, "ear", EAR)


def split(n, axis, at_part):
    """a placed layer cut in two at a line of its own sheet (part px): before / after"""
    f = fit[n]
    cut = round((f["tx"] if axis == "x" else f["ty"]) + at_part * f["s"])
    im = arr(placed(n))
    a, b = im.copy(), im.copy()
    if axis == "x":
        a[:, cut:] = 0
        b[:, :cut] = 0
    else:
        a[cut:] = 0
        b[:cut] = 0
    return Image.fromarray(a), Image.fromarray(b), cut


# the brows: at the widest gap of the sheet
br = arr(Image.open(f"{D}/raw/brows.png"))[..., 3] > 40
cols = br.any(0)
xs = np.nonzero(cols)[0]
gaps = [x for x in range(xs.min(), xs.max()) if not cols[x]]
gap = (gaps[0] + gaps[-1]) / 2 if gaps else br.shape[1] / 2
bR, bL, cut = split("brows", "x", gap)       # his right brow is on the left of the picture
save("browR", bR)
save("browL", bL)
for name, im in (("browR", bR), ("browL", bL)):
    a = arr(im)[..., 3] > 60
    xx = np.nonzero(a.any(0))[0]
    x = xx.max() if name == "browR" else xx.min()   # the inner end
    yy = np.nonzero(a[:, x])[0]
    print(name, "pivot", rig(x, yy.mean()))

# the lips: at the line of the mouth's corners (the leftmost / rightmost lit pixels of the sheet)
lp = arr(Image.open(f"{D}/raw/lips.png"))[..., 3] > 60
ys_l = np.nonzero(lp[:, np.nonzero(lp.any(0))[0].min()])[0]
corner_y = ys_l.mean()
up, low, cut = split("lips", "y", corner_y + 2)
save("lips-up", up)
save("lips", low)
print("mouth line", rig(0, cut)[1])


def mid(a, b):
    m = (arr(placed(a))[..., 3] > 128) & (arr(placed(b))[..., 3] > 128)
    ys, xs = np.nonzero(m)
    return rig(xs.mean(), ys.mean())


h = arr(placed("head"))[..., 3] > 128
ys, xs = np.nonzero(h)
print("head pivot", rig(xs[ys > ys.max() - 40].mean(), ys.max() - 30))
print("armR", mid("armR", "body"), "lowR", mid("armR", "lowR"), "handR", mid("lowR", "handR"))
print("armL", mid("armL", "body"), "lowL", mid("armL", "lowL"), "handL", mid("lowL", "handL"))
for n in ["chin", "nose", "glasses", "lips", "teeth-low", "throat", "eyes", "pupils"]:
    b = placed(n).getbbox()
    print(n, "box", rig(b[0], b[1]), rig(b[2], b[3]))

os.makedirs("public/bosses/fokus", exist_ok=True)
order = ["legs", "body", "lowR", "armR", "handR", "lowL", "armL", "handL", "eyes", "pupils", "head", "nose", "chin", "throat",
         "teeth-up", "teeth-low", "lips", "brows", "temple", "glasses", "hair"]
whole = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
for n in order:
    whole.alpha_composite(placed(n))
whole = whole.crop(CROP)
whole.resize((whole.width // 2, whole.height // 2), Image.LANCZOS).save("public/bosses/fokus/full.webp", quality=88, method=6)
hb = placed("hair").getbbox()
cx = (hb[0] + hb[2]) // 2 - CROP[0]
p = whole.crop((cx - 300, 20, cx + 300, 620)).resize((320, 320), Image.LANCZOS)
p.save("public/bosses/fokus/portrait.webp", quality=88, method=6)
print("ok", whole.size)
