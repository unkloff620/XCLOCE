"""
Утилизатор (id utilizator): the artist's layers, all in place on one 2000×3000 sheet — tools/boss/source/utilizator/raw/
{pants,torso,apron,upperR,foreR,gloveR,foreL,gloveL,vials,gasmask}.png and the whole boss full.png.
L — the arm on the left of the picture (the gloved fist before the belly), R — the raised gloved fist on the right.
The upper LEFT arm (the short sleeve and the biceps): raw/upperL.png, the artist's (over the body); without it — cut out of
full.png (the part of the picture no layer covers, a little grown into its neighbours).
→ rig sources for build-boss.py (cropped to the figure): legs = the trousers and boots (under the apron), body = the
T-shirt with the apron over it, armL/lowL, armR/lowR (shoulder → the forearm with its rubber glove at the elbow; the glove
is the fist, no wrist joint), vials and gasmask (hanging off the belt: they swing on their rings — boss-rig.tsx HANG), and
the pictures for the lists: public/bosses/utilizator/{full,portrait}.webp.
The face (raw/face/, the artist's 1000×1000 sheets, all in place on one face; head.png — the head with holes for the eyes
and its own closed mouth): fitted onto the sheet's head (FACE_K, FACE_AT — the best match with full.png) → head,
eyes + pupils (drawn UNDER the head, they show through its holes), eyes-closed (the lids over the holes: he blinks), browL / browR (split at their gap), throat,
teeth-up, teeth-low, lips (the lower face with the open, yelling mouth: over the throat and the teeth).
Prints the joints (rig px: cropped, halved) for build-boss.py PIVOT_BY_BOSS.
"""
import os
import numpy as np
import cv2
from PIL import Image

import sys
# a variant (the beaten looks, tools/boss/beaten-parts.py): its own folder with its raw/; flags: nogloveR / nogloveL —
# the glove is gone, the bare forearm with its fist shows; nomask — the gas mask is gone from the belt; novials — the vials too
D = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("no") else "tools/boss/source/utilizator"
FLAGS = set(a for a in sys.argv[1:] if a.startswith("no"))
VARIANT = D.rstrip("/") != "tools/boss/source/utilizator"
R = f"{D}/raw"
BASE_R = "tools/boss/source/utilizator/raw"
CROP = (300, 140, 1940, 2860)
FACE_K, FACE_AT = 0.544, (658, 129)
BROW_GAP = 505                  # between the brows on the face sheet (x)


def raw(n):
    return Image.open(f"{R}/{n}.png").convert("RGBA")


def arr(im):
    return np.array(im)


def lay(*ims):
    out = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    for im in ims:
        out.alpha_composite(im)
    return out


def face(n):
    f = arr(raw(f"face/{n}"))
    f[..., 3][f[..., 3] <= 40] = 0
    f = Image.fromarray(f)
    f = f.resize((round(f.width * FACE_K), round(f.height * FACE_K)), Image.LANCZOS)
    sheet = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    sheet.alpha_composite(f, FACE_AT)
    return sheet


full = arr(raw("full"))
L = {n: raw(n) for n in ["pants", "torso", "apron", "upperR", "foreR", "gloveR", "foreL", "gloveL", "vials", "gasmask"]}
heads = lay(*[face(n) for n in ["eyes", "pupils", "head", "throat", "teeth-up", "teeth-low", "lips", "brows"]])

# the upper left arm: what of full.png no layer covers (the head aside), grown a little into the torso and the elbow
cover = arr(lay(*L.values(), heads))[..., 3]
miss = ((full[..., 3] > 128) & (cover < 100)).astype(np.uint8)
miss = cv2.morphologyEx(miss, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lb, st, _ = cv2.connectedComponentsWithStats(miss)
arm = lb == (1 + int(np.argmax(st[1:, 4])))
grow = cv2.dilate(arm.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
upperL = full.copy()
upperL[..., 3] = np.where(grow, full[..., 3], 0)
upperL[upperL[..., 3] == 0] = 0
L["upperL"] = Image.fromarray(upperL)
# the artist's own upper left arm (sent later): it replaces the cut-out — drawn over the body
if os.path.exists(f"{R}/upperL.png"):
    u = arr(raw("upperL"))
    u[u[..., 3] < 40] = 0
    L["upperL"] = Image.fromarray(u)


def visible_mask(part, *over):
    """which pixels of a skin layer under its glove show in the boss: its own in full.png (the BASE layers decide, so a
    redrawn variant keeps the same cut) or covered by the glove anyway"""
    p = arr(part).astype(int)
    covered = np.zeros(p.shape[:2], bool)
    for o in over:
        covered |= arr(o)[..., 3] > 128
    own = np.abs(p[..., :3] - full[..., :3].astype(int)).mean(2) < 40
    return (p[..., 3] > 0) & (covered | own | (full[..., 3] < 30))


def masked(part, keep):
    p = arr(part).copy()
    p[..., 3] = np.where(keep, p[..., 3], 0)
    return Image.fromarray(p)


BASE = {n: Image.open(f"{BASE_R}/{n}.png").convert("RGBA") for n in ["foreR", "gloveR", "foreL", "gloveL"]}


def visible_only(part, *over):
    """a skin layer under its glove: keep only the pixels that are its own in full.png or that the glove covers anyway
    (not the bits the torso hides in the picture — they would show over the shirt)"""
    p = arr(part).astype(int)
    covered = np.zeros(p.shape[:2], bool)
    for o in over:
        covered |= arr(o)[..., 3] > 128
    own = np.abs(p[..., :3] - full[..., :3].astype(int)).mean(2) < 40
    keep = (p[..., 3] > 0) & (covered | own | (full[..., 3] < 30))
    p[..., 3] = np.where(keep, p[..., 3], 0)
    return Image.fromarray(p.astype(np.uint8))


out = {
    "legs": lay(L["pants"]),
    "body": lay(L["torso"], L["apron"]),
    "armL": L["upperL"],
    "lowL": lay(masked(L["foreL"], visible_mask(BASE["foreL"], BASE["gloveL"])), *([] if "nogloveL" in FLAGS else [L["gloveL"]])),
    "armR": L["upperR"],
    "lowR": lay(masked(L["foreR"], visible_mask(BASE["foreR"], BASE["gloveR"])), *([] if "nogloveR" in FLAGS else [L["gloveR"]])),
    "vials": L["vials"],
    "gasmask": L["gasmask"],
}
if "novials" in FLAGS:
    del out["vials"]
    if os.path.exists(f"{D}/vials.png"): os.remove(f"{D}/vials.png")
if "nomask" in FLAGS:
    del out["gasmask"]
    if os.path.exists(f"{D}/gasmask.png"): os.remove(f"{D}/gasmask.png")
for k, im in out.items():
    im.crop(CROP).save(f"{D}/{k}.png")
for n in ["head", "eyes", "pupils", "eyes-closed", "throat", "teeth-up", "teeth-low"]:
    face(n).crop(CROP).save(f"{D}/{n}.png")
# the lips with the chin split under the mouth's hole (y 700 on the face sheet, the artist's lips drawn open wide): lips-up — the upper lip
# stays with the head; lips — the lower lip and the chin, the jaw that drops (boss-rig.tsx br-jaw)
MOUTH_CUT = 700   # under the mouth's corners: they stay with the upper piece (pinned), the lower lip and the chin go
lp = face("lips")
cut_y = round(FACE_AT[1] + MOUTH_CUT * FACE_K)
up_, low_ = arr(lp).copy(), arr(lp).copy()
up_[cut_y:] = 0
low_[:cut_y] = 0
Image.fromarray(up_).crop(CROP).save(f"{D}/lips-up.png")
Image.fromarray(low_).crop(CROP).save(f"{D}/lips.png")


def rig(x, y):
    return [round((x - CROP[0]) * 0.5, 1), round((y - CROP[1]) * 0.5, 1)]


br = face("brows")
cut = round(FACE_AT[0] + BROW_GAP * FACE_K)
for n, box in {"browL": (0, 0, cut, 3000), "browR": (cut, 0, 2000, 3000)}.items():
    half = Image.new("RGBA", (2000, 3000), (0, 0, 0, 0))
    half.paste(br.crop(box), box[:2])
    half.crop(CROP).save(f"{D}/{n}.png")
    a = arr(half)[..., 3] > 60
    xs = np.nonzero(a.any(0))[0]
    x = xs.max() if n == "browL" else xs.min()
    ys = np.nonzero(a[:, x])[0]
    print(n, "pivot", rig(x, ys.mean()))


def mid(a, b):
    """the middle of two pieces' overlap — the joint"""
    m = (arr(a)[..., 3] > 128) & (arr(b)[..., 3] > 128)
    ys, xs = np.nonzero(m)
    return rig(xs.mean(), ys.mean())


def ring(im):
    """a thing hanging off the belt: its pin is the top of its ring"""
    a = arr(im)[..., 3] > 128
    ys, xs = np.nonzero(a)
    top = ys.min()
    return rig(xs[ys < top + 12].mean(), top + 10)


h = arr(face("head"))[..., 3] > 128
ys, xs = np.nonzero(h)
print("head pivot", rig(xs[ys > ys.max() - 40].mean(), ys.max() + 30))  # the neck, under the chin
print("armL pivot", mid(L["upperL"], L["torso"]), "lowL", mid(L["upperL"], out["lowL"]))
print("armR pivot", mid(L["upperR"], L["torso"]), "lowR", mid(L["upperR"], out["lowR"]))
print("vials", ring(L["vials"]), "gasmask", ring(L["gasmask"]))

if VARIANT:
    print("variant ok", D, sorted(FLAGS))
    sys.exit(0)
os.makedirs("public/bosses/utilizator", exist_ok=True)
whole = lay(out["legs"], out["armR"], out["body"], heads, out["armL"], out["lowL"].copy(), out["lowR"], out["vials"], out["gasmask"]).crop(CROP)
whole = Image.fromarray(np.where(arr(whole)[..., 3:] > 0, arr(whole), 0).astype(np.uint8))
lay_full = lay(out["legs"], out["armR"], out["body"], face("eyes"), face("pupils"), face("head"), face("throat"),
               face("teeth-up"), face("teeth-low"), face("lips"), br, out["armL"], out["vials"], out["gasmask"], out["lowR"], out["lowL"]).crop(CROP)
f = lay_full.resize((lay_full.width // 2, lay_full.height // 2), Image.LANCZOS)
f.save("public/bosses/utilizator/full.webp", quality=75, method=6)
p = lay_full.crop((470, 0, 1170, 700)).resize((320, 320), Image.LANCZOS)
p.save("public/bosses/utilizator/portrait.webp", quality=75, method=6)
print("ok", lay_full.size)
