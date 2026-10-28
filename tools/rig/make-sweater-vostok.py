"""
Восток's sweatshirt for the hero → tools/rig/source/wear/sweater-vostok.png (2000×2800 rig canvas, in place),
then run build-look.py (rig layer) and tools/items/build-items.py (icon).

Assembled from art already in the repo, no generation:
  * the cut: hoodie-hodl (long sleeves, drawn for the hero's pose) — hood, drawstrings, the HODL print and the pocket
    painted out, the neck cut down to the crew neck of tee-white, recolored in LAB to Восток's off-white fabric;
  * the details: cut from Восток's own body art (tools/boss/source/vodovoz/body.png) — the print (crown, ЛУДОМАН,
    tally, x-eyed smiley), the waist belt with its two buckles, the buckled straps on the shoulders, and a little of
    his dirty-cloth texture.
"""
import os
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
BOSS = os.path.join(HERE, "..", "boss", "source", "vodovoz", "body.png")
OUT = os.path.join(SRC, "wear", "sweater-vostok.png")
VX, VY = 829, 671  # top-left of Восток's torso in his canvas: the crop coordinates below are relative to it


def load(p):
    return np.array(Image.open(p).convert("RGBA"))


def lab(rgb):
    return cv2.cvtColor((rgb.astype(np.float32) / 255).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)


def rgb(l):
    out = cv2.cvtColor(l.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(l.shape)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def over(dst, src, x=0, y=0):
    """alpha-composite src (RGBA uint8) onto dst at (x, y), in place; dst keeps its own alpha union"""
    h, w = src.shape[:2]
    d = dst[y:y + h, x:x + w].astype(np.float32)
    s = src.astype(np.float32)
    sa = s[:, :, 3:] / 255
    da = d[:, :, 3:] / 255
    oa = sa + da * (1 - sa)
    oc = (s[:, :, :3] * sa + d[:, :, :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    dst[y:y + h, x:x + w] = np.dstack([oc, oa * 255]).clip(0, 255).astype(np.uint8)


hood = load(os.path.join(SRC, "wear", "hoodie-hodl.png"))
tee = load(os.path.join(SRC, "wear", "tee-white.png"))
vk = load(BOSS)
H, W = hood.shape[:2]
A = hood[:, :, 3].copy()
L = lab(hood[:, :, :3])

# ---- 1. paint out the print, the pocket, the drawstrings ----
fab = (A > 200) & (L[:, :, 1] > 25) & (L[:, :, 0] > 25)  # the purple cloth itself
hole = np.zeros((H, W), np.uint8)
yy, xx = np.mgrid[0:H, 0:W]
boxes = [(700, 860, 1310, 1080),   # HODL
         (690, 1160, 1320, 1440),  # pocket
         (860, 660, 1150, 870)]    # drawstrings with their grommets
for x0, y0, x1, y1 in boxes:
    inb = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1) & (A > 200)
    loc = L[y0:y1, x0:x1, 0][fab[y0:y1, x0:x1]]
    med = np.median(loc)
    # not cloth (letters, metal), or clearly darker than the cloth around (drawn lines, pocket shadow)
    hole[inb & (~fab | (L[:, :, 0] < med - 9))] = 255
hole = cv2.dilate(hole, np.ones((9, 9), np.uint8))
hood[:, :, :3] = cv2.inpaint(hood[:, :, :3], hole, 14, cv2.INPAINT_TELEA)
# the inpaint leaves flat smears: smooth them into the cloth around
blur = cv2.GaussianBlur(hood[:, :, :3], (0, 0), 6)
k = cv2.GaussianBlur(hole.astype(np.float32) / 255, (0, 0), 4)[..., None]
hood[:, :, :3] = (hood[:, :, :3] * (1 - k) + blur * k).astype(np.uint8)

# ---- 2. the neck: hood off, crew neck of the tee ----
ta = tee[:, :, 3] > 40
tee_top = np.array([np.argmax(ta[:, x]) if ta[:, x].any() else H for x in range(W)])
cut = np.zeros((H, W), bool)
X0, X1 = 640, 1360
for x in range(X0, X1):
    cut[:tee_top[x] + 6, x] = True
A2 = A.copy()
A2[cut] = 0
# a soft dark outline along the new shoulder line
edge = (A2 > 128).astype(np.uint8)
ring = edge - cv2.erode(edge, np.ones((11, 11), np.uint8))
ring[:, :X0 - 20] = 0
ring[:, X1 + 20:] = 0
hood[:, :, 3] = A2
inner = cv2.erode((A2 > 200).astype(np.uint8), np.ones((25, 25), np.uint8)) > 0
crease = np.zeros((H, W), np.uint8)
L0 = lab(hood[:, :, :3])[:, :, 0]
for x0, y0, x1, y1 in [(640, 600, 890, 790), (1110, 600, 1360, 790)]:
    reg = np.zeros((H, W), bool)
    reg[y0:y1, x0:x1] = True
    med = np.median(L0[reg & inner])
    crease[reg & inner & (L0 < med - 8)] = 255
crease = cv2.dilate(crease, np.ones((9, 9), np.uint8))
# fill from the clean cloth around (normalised blur), not from the outlines inpaint would smear in
good = (inner & (crease == 0)).astype(np.float32)
num = cv2.GaussianBlur(hood[:, :, :3].astype(np.float32) * good[..., None], (0, 0), 18)
den = cv2.GaussianBlur(good, (0, 0), 18)[..., None]
fill = num / np.maximum(den, 1e-4)
kk = cv2.GaussianBlur(crease.astype(np.float32) / 255, (0, 0), 3)[..., None]
hood[:, :, :3] = (hood[:, :, :3] * (1 - kk) + fill * kk).clip(0, 255).astype(np.uint8)

# ---- 3. recolor to Восток's cloth ----
L = lab(hood[:, :, :3])
cloth = (A2 > 200) & (L[:, :, 1] > 20)
ref = np.median(L[cloth], axis=0)
target = lab(np.array([[[242, 214, 196]]], np.uint8))[0, 0]
w = np.clip((L[:, :, 0] - 10) / 16, 0, 1)[..., None]  # 0 on the black outline
new = L.copy()
new[:, :, 0] = np.clip(target[0] + (L[:, :, 0] - ref[0]) * 0.8, 0, 100)
new[:, :, 1] = target[1] + (L[:, :, 1] - ref[1]) * 0.06
new[:, :, 2] = target[2] + (L[:, :, 2] - ref[2]) * 0.06
mix = L * (1 - w) + new * w
mix[:, :, 1:] = new[:, :, 1:] * w  # no purple left even in the dark folds and lines: they go neutral dark
out = hood.copy()
out[:, :, :3] = rgb(mix)
out[ring > 0, :3] = (out[ring > 0, :3] * 0.15 + np.array([28, 22, 24]) * 0.85).astype(np.uint8)

# the crew neck: the tee's ribbing, recolored the same way, laid over the cut
neck = tee.copy()
neck_box = np.zeros((H, W), bool)
for x in range(800, 1200):
    if tee_top[x] < H:
        neck_box[tee_top[x]:tee_top[x] + 46, x] = True
nm = neck_box & (neck[:, :, 3] > 0)
nL = lab(neck[:, :, :3])
nref = np.median(nL[nm & (nL[:, :, 0] > 60)], axis=0)
nw = np.clip((nL[:, :, 0] - 10) / 16, 0, 1)[..., None]
nn = nL.copy()
nn[:, :, 0] = np.clip(target[0] + (nL[:, :, 0] - nref[0]) * 0.9 - 4, 0, 100)
nn[:, :, 1] = target[1]
nn[:, :, 2] = target[2]
neck[:, :, :3] = rgb(nL * (1 - nw) + nn * nw)
fade = cv2.GaussianBlur(nm.astype(np.float32), (0, 0), 3)
neck[:, :, 3] = (neck[:, :, 3] * np.clip(fade * 2 - 0.3, 0, 1) * nm).astype(np.uint8)
over(out, neck)

# ---- 4. his dirty-cloth texture: the high-pass of his fabric, tiled faintly over ours ----
vL = lab(vk[:, :, :3])[:, :, 0]
patch = vL[VY + 800:VY + 870, VX + 150:VX + 390].copy()  # plain cloth under the belt (no chain, no print)
hp = patch - cv2.GaussianBlur(patch, (0, 0), 6)
g = np.random.default_rng(3)
tile = sum(cv2.resize(g.normal(0, 1, (H // f, W // f)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC) * a
           for f, a in [(2, 0.7), (4, 0.5)])
tile *= hp.std() / tile.std()  # as rough as his cloth, without a pattern repeating
oL = lab(out[:, :, :3])
m = (out[:, :, 3] > 0) & (oL[:, :, 0] > 40)
oL[:, :, 0] = np.where(m, np.clip(oL[:, :, 0] + tile * 0.3, 0, 100), oL[:, :, 0])
# a few grubby smudges
rng = np.random.default_rng(7)
smudge = np.zeros((H, W), np.float32)
for _ in range(26):
    cx, cy = rng.integers(560, 1440), rng.integers(620, 1500)
    cv2.circle(smudge, (int(cx), int(cy)), int(rng.integers(20, 70)), float(rng.uniform(0.4, 1)), -1)
smudge = cv2.GaussianBlur(smudge, (0, 0), 28)
oL[:, :, 0] = np.where(m, oL[:, :, 0] - smudge * 4, oL[:, :, 0])
oL[:, :, 2] = np.where(m, oL[:, :, 2] + smudge * 3, oL[:, :, 2])
out[:, :, :3] = rgb(oL)
cloth_mask = out[:, :, 3].copy()


# ---- 5. details cut from Восток ----
def vcut(x0, y0, x1, y1, poly=None):
    """a piece of Восток's torso (crop coords), optionally limited to a polygon"""
    p = vk[VY + y0:VY + y1, VX + x0:VX + x1].copy()
    if poly is not None:
        m = np.zeros(p.shape[:2], np.uint8)
        cv2.fillPoly(m, [np.array([(x - x0, y - y0) for x, y in poly], np.int32)], 255)
        m = cv2.GaussianBlur(m, (0, 0), 1.2)
        p[:, :, 3] = (p[:, :, 3].astype(np.float32) * m / 255).astype(np.uint8)
    return p


def place(piece, M, clip=True):
    """warp a piece onto the rig canvas with a 2×3 affine and lay it on the sweater (clipped to the cloth)"""
    wp = cv2.warpAffine(piece, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0))
    if clip:
        wp[:, :, 3] = (wp[:, :, 3].astype(np.float32) * (cloth_mask > 0)).astype(np.uint8)
    over(out, wp)


def affine(src_pts, dst_pts):
    return cv2.getAffineTransform(np.float32(src_pts), np.float32(dst_pts))


# the print: only the black ink, multiplied into our cloth (keeps our folds under it)
pr = vcut(135, 255, 515, 610)
pL = lab(pr[:, :, :3])[:, :, 0]
ink = np.clip((62 - pL) / 30, 0, 1) * (pr[:, :, 3] > 200)
pr[:, :, :3] = np.array([30, 26, 28], np.uint8)
pr[:, :, 3] = (ink * 245).astype(np.uint8)
ph, pw = pr.shape[:2]
s = 1.32
cx, top = 1004, 905  # centre of the chest, top of the crown
M = np.float32([[s, 0, cx - pw * s / 2], [0, s, top]])
wp = cv2.warpAffine(pr, M, (W, H), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0, 0))
a_ink = (wp[:, :, 3:].astype(np.float32) / 255) * (cloth_mask[..., None] > 0)
shade = (out[:, :, :3].astype(np.float32) / np.array([242, 214, 196])).clip(0.6, 1.1)
out[:, :, :3] = (out[:, :, :3] * (1 - a_ink) + wp[:, :, :3] * shade * a_ink).astype(np.uint8)

# the waist belt with both buckles (polygon traced on his torso, crop coords)
belt_poly = [(40, 636), (140, 640), (300, 668), (470, 696), (592, 722),
             (592, 780), (470, 790), (300, 734), (140, 712), (40, 712)]
belt = vcut(40, 630, 595, 795, belt_poly)
bh, bw = belt.shape[:2]
# left end → left of the waist, right end → right of the waist, a little lower on the right like his
place(belt, affine([(0, 10), (bw, 95), (0, 80)], [(600, 1312), (1405, 1372), (600, 1392)]))

# buckled straps on the shoulders, laid along the upper arms
strapR = vcut(530, 120, 611, 340)
strapL = strapR[:, ::-1].copy()  # his left strap is half hidden by the turn of the body: mirror the right one
for piece, top_c, bot_c in [(strapL, (560, 690), (405, 1000)), (strapR, (1440, 690), (1595, 1000))]:
    ph, pw = piece.shape[:2]
    v = np.subtract(bot_c, top_c).astype(np.float32)
    ln = np.hypot(*v)
    u = v / ln
    n = np.float32([-u[1], u[0]])
    wid = ln * pw / ph
    a = np.float32(top_c) - n * wid / 2
    place(piece, affine([(0, 0), (pw, 0), (0, ph)], [a, a + n * wid, a + v]))

Image.fromarray(out).save(OUT)
print("saved", OUT)
