"""
Князь (boss 8, id knyaz): the artist's parts → rig layers for build-boss.py.
Sources: tools/boss/source/knyaz/raw/ — the body parts in place on one 2000×3000 sheet: legs, body, armL (the sleeve on the
viewer's left, shoulder to cuff), handL (the fist with the hardware wallet held like a knife), armR (the upper arm on the
viewer's right), lowR (its forearm with the fist), head7 (the whole head in place, only to fit the face sheet); the face
on one 608×642 sheet (f-*): head (closed lips), head-open (no lips), throat, teeth-up, teeth-low, lips-open (the open
grin's lips), mouth-closed, eyes (whites), pupils, brows.
Made here: eyes-closed (lids painted from the skin over the whites, a lash line at the bottom), brows@0…4 (the brows bent
like a puppet: 0 calm, 1–2 raised, 3–4 frowning — the inner ends down).
Also writes public/bosses/knyaz/{full,portrait,card}.webp.
"""
import os
import numpy as np
import cv2
from PIL import Image, ImageDraw

D = "tools/boss/source/knyaz"
R = f"{D}/raw"
W, H = 2000, 3000
FACE_AT = (760, 79)          # the face sheet on the body sheet (head7 matched: same size)


def load(n):
    return np.array(Image.open(f"{R}/{n}.png").convert("RGBA"))


def put(n, a):
    Image.fromarray(a).save(f"{D}/{n}.png")


def face(a):
    out = np.zeros((H, W, 4), np.uint8)
    h, w = a.shape[:2]
    out[FACE_AT[1]:FACE_AT[1] + h, FACE_AT[0]:FACE_AT[0] + w] = a
    return out


def clean(a, lim=24):
    a = a.copy()
    a[a[:, :, 3] < lim] = 0
    return a


for n in ["legs", "body"]:
    put(n, clean(load(n)))
if os.path.exists(f"{D}/armL.png"):
    os.remove(f"{D}/armL.png")
# ---- the sleeve with the wallet hand (viewer's left): the elbow bends like a puppet — the forearm (towards the cuff)
# turns around the elbow, the turn growing from the elbow out; the hand turns with it by the same angle (boss-rig.tsx) ----
sl = clean(load("armL")).astype(np.float32)
EL_L, CUFF_L = (430.0, 1268.0), (222.0, 1164.0)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vx, vy = CUFF_L[0] - EL_L[0], CUFF_L[1] - EL_L[1]
tt = ((xx - EL_L[0]) * vx + (yy - EL_L[1]) * vy) / (vx * vx + vy * vy)
wl = np.clip((tt - 0.02) / 0.4, 0, 1).astype(np.float32)
ARM_L_DEG = [0, 6, 12, 18, 24]
for k, deg in enumerate(ARM_L_DEG):
    th = np.deg2rad(deg) * wl
    c, s_ = np.cos(th), np.sin(th)
    dx, dy = xx - EL_L[0], yy - EL_L[1]
    sx = (EL_L[0] + c * dx + s_ * dy).astype(np.float32)
    sy = (EL_L[1] - s_ * dx + c * dy).astype(np.float32)
    o = cv2.remap(np.ascontiguousarray(sl), sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    put(f"armLb@{k}", np.clip(np.nan_to_num(o), 0, 255).astype(np.uint8))
print("left elbow", EL_L, "angles", ARM_L_DEG)
# the hand with the wallet, redrawn: the fist with the body of the wallet, and its swivel cover on its own (it swings);
# both were cut from a 331×671 box that sits at HAND_AT on the sheet
HAND_AT = (54, 864)


def boxed(n):
    out = np.zeros((H, W, 4), np.uint8)
    a = clean(load(n))
    h, w = a.shape[:2]
    out[HAND_AT[1]:HAND_AT[1] + h, HAND_AT[0]:HAND_AT[0] + w] = a
    return out


put("handL", boxed("handL2-crop"))
put("cover", boxed("cover-crop"))
for old in ["armR", "lowR"]:
    if os.path.exists(f"{D}/{old}.png"):
        os.remove(f"{D}/{old}.png")

# ---- the arm on the viewer's right (behind the body): upper arm + forearm with the fist in one picture, the elbow bent
# like a puppet — the forearm turns around the elbow, the turn fading out across the joint (no seam) ----
up, low = clean(load("armR")), clean(load("lowR"))
ELBOW = (1655.0, 1290.0)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
dist = np.hypot(xx - ELBOW[0], yy - ELBOW[1])
# the forearm turns fully a little past the elbow, the part right at the elbow turns less (it bends, not snaps)
wgt = np.clip((dist - 20) / 110, 0, 1).astype(np.float32)
for k, deg in enumerate([0, 4, 8, 12, 16]):
    th = np.deg2rad(deg) * wgt
    c, s_ = np.cos(th), np.sin(th)
    dx, dy = xx - ELBOW[0], yy - ELBOW[1]
    sx = (ELBOW[0] + c * dx + s_ * dy).astype(np.float32)
    sy = (ELBOW[1] - s_ * dx + c * dy).astype(np.float32)
    lw = cv2.remap(np.ascontiguousarray(low.astype(np.float32)), sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    fr = Image.fromarray(up)
    fr.alpha_composite(Image.fromarray(np.clip(np.nan_to_num(lw), 0, 255).astype(np.uint8)))
    out = np.array(fr)
    put(f"armRb@{k}", np.clip(np.nan_to_num(out), 0, 255).astype(np.uint8))
names = {"head": "f-head", "head-open": "f-head-open", "throat": "f-throat", "teeth-up": "f-teeth-up", "teeth-low": "f-teeth-low",
         "lips": "f-lips-open", "mouth-closed": "f-mouth-closed", "eyes": "f-eyes", "pupils": "f-pupils"}
for k, n in names.items():
    put(k, face(clean(load(n))))

# ---- the lids: skin over each eye white, a dark lash line along its lower edge ----
eyes = load("f-eyes")
headf = load("f-head-open")
m = eyes[:, :, 3] > 40
n, lab = cv2.connectedComponents(m.astype(np.uint8))
lids = np.zeros_like(eyes)
for i in range(1, n):
    e = lab == i
    if e.sum() < 80:
        continue
    ys, xs = np.nonzero(e)
    # the skin just above the eye (under the brow)
    ring = (cv2.dilate(e.astype(np.uint8), np.ones((15, 15), np.uint8)) > 0) & ~(cv2.dilate(e.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)
    patch = headf[ring & (headf[:, :, 3] > 200)][:, :3].astype(int)
    patch = patch[patch.sum(1) > np.percentile(patch.sum(1), 40)]       # the skin, not the dark lid line
    col = (np.median(patch, axis=0) * 0.96).astype(np.uint8)
    lid = cv2.dilate(e.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    lids[lid, :3] = col
    lids[lid, 3] = 255
    # the lash line: the bottom edge of the eye, a little thick, curved like a closed eye
    img = Image.fromarray(lids)
    d = ImageDraw.Draw(img)
    pts = []
    for x in range(xs.min(), xs.max() + 1, 2):
        col_y = ys[xs == x]
        if len(col_y):
            pts.append((x, int(col_y.max() * 0.55 + col_y.min() * 0.45) + 2))
    d.line(pts, fill=(40, 22, 14, 255), width=3, joint="curve")
    lids = np.array(img)
lids[:, :, 3] = (cv2.GaussianBlur(lids[:, :, 3].astype(np.float32), (0, 0), 0.6)).astype(np.uint8)
# the lids drawn by the artist (f-eyes-closed) win over the painted ones
put("eyes-closed", face(clean(load("f-eyes-closed"))) if os.path.exists(f"{R}/f-eyes-closed.png") else face(lids))

# ---- the brows bent like a puppet: each brow on its own, its inner end (towards the nose) and its middle move ----
brows = load("f-brows").astype(np.float32)
bm = brows[:, :, 3] > 30
ys, xs = np.nonzero(bm)
MID = 255                                   # between the brows on the sheet
hh, ww = bm.shape
yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
left = xx < MID
x0l, x1l = xs[xs < MID].min(), xs[xs < MID].max()
x0r, x1r = xs[xs >= MID].min(), xs[xs >= MID].max()
# t: 0 at the outer end, 1 at the inner end of each brow
t = np.where(left, (xx - x0l) / max(1, x1l - x0l), (x1r - xx) / max(1, x1r - x0r)).clip(0, 1)
arch = np.sin(np.pi * t)                     # the middle of the brow
FR = [("calm", 0, 0), ("up", 5, 0), ("up2", 10, 0), ("frown", 0, 6), ("frown2", 0, 11), ("sad", 0, -6), ("sad2", 0, -10)]
for k, (_, up, frown) in enumerate(FR):
    # a pixel moves by dy (down +): raised — the whole brow up, the middle most; frowning — the inner end down, the outer up
    dy = -up * (0.55 + 0.45 * arch) + frown * (t * 1.2 - 0.25)
    out = cv2.remap(np.ascontiguousarray(brows), xx, (yy - dy).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    put(f"brows@{k}", face(np.clip(np.nan_to_num(out), 0, 255).astype(np.uint8)))

# ---- the sad mouth: the closed lips with their corners pulled down (hit, and always below half HP) ----
lips = clean(load("f-mouth-closed")).astype(np.float32)
lm = lips[:, :, 3] > 40
ys_, xs_ = np.nonzero(lm)
cx, half = (xs_.min() + xs_.max()) / 2, (xs_.max() - xs_.min()) / 2
yy2, xx2 = np.mgrid[0:lips.shape[0], 0:lips.shape[1]].astype(np.float32)
tq = np.clip(np.abs(xx2 - cx) / half, 0, 1)
dyq = 9 * tq ** 1.6 - 2 * (1 - tq)          # the corners down, the middle a touch up
sad = cv2.remap(np.ascontiguousarray(lips), xx2, (yy2 - dyq).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
put("mouth-sad", face(np.clip(np.nan_to_num(sad), 0, 255).astype(np.uint8)))

# ---- the whole boss (closed mouth, calm brows) for the cards ----
ref = Image.new("RGBA", (W, H))
for n in ["legs", "armLb@0", "handL", "cover", "body", "head", "eyes", "pupils", "brows@0", "armRb@0"]:
    ref.alpha_composite(Image.open(f"{D}/{n}.png").convert("RGBA"))
ref.save(f"{R}/reference-rig.png")
os.makedirs("public/bosses/knyaz", exist_ok=True)
bb = ref.getbbox()
full = ref.crop((bb[0] - 20, bb[1] - 10, bb[2] + 20, bb[3] + 10))
full.resize((1024, round(1024 * full.height / full.width)), Image.LANCZOS).save("public/bosses/knyaz/full.webp", quality=88, method=6)
# the portrait: the head and the shoulders; the card: the upper body like the other bosses (640×790)
hx, hy = 1066, 380
ref.crop((hx - 420, hy - 330, hx + 420, hy + 510)).resize((512, 512), Image.LANCZOS).save("public/bosses/knyaz/portrait.webp", quality=88, method=6)
cw = 1240
ref.crop((hx - cw // 2 - 120, 60, hx + cw // 2 - 120, 60 + round(cw * 790 / 640))).resize((640, 790), Image.LANCZOS).save("public/bosses/knyaz/card.webp", quality=88, method=6)
print("bbox", bb)
