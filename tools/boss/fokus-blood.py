"""
Фокус beaten (below half HP): blood on his clothes and his skin, bruises and the blood under the nose on his face.
The artist's look redrawn by two image edits (tools/boss/source/fokus/blood/): edit-body.png — the whole boss (in-body.png,
the layers put together on white, 1024×1536), edit-face.png — his face up close (in-face.png, 1024×1024). Each edit is
fitted back onto its input (ECC, affine), and every layer takes from it only what changed (the blood, the bruises),
only where that layer is the one seen on top — its own outline (alpha) stays exactly the artist's.
→ public/bosses/fokus/rig/<part>-blood.webp (the same box and size as <part>.webp; boss-fokus.tsx shows them when dazed).
"""
import numpy as np, cv2
from PIL import Image

D = "tools/boss/source/fokus"
B = f"{D}/blood"
CROP = (180, 200, 1980, 2920)
SW, SH = 1800, 2720
ORDER = ["legs", "body", "lowR", "armR", "handR", "lowL", "armL", "handL", "eyes", "pupils", "head", "nose", "chin", "throat",
         "teeth-up", "teeth-low", "lips", "brows", "temple", "glasses", "hair"]
BODY_PARTS = ["legs", "body", "lowR", "armR", "handR", "lowL", "armL", "handL"]
FACE_PARTS = ["head", "nose", "chin", "lips-up", "lips"]
HIRES = {"head", "nose", "chin", "lips-up", "lips"}


def placed(n):
    return np.array(Image.open(f"{D}/placed/{n}.png").convert("RGBA"))[CROP[1]:CROP[3], CROP[0]:CROP[2]]


def fit(inp, edit):
    """the edit warped back onto its input (both RGB arrays of one size)"""
    a = cv2.cvtColor(inp, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    b = cv2.cvtColor(edit, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    M = np.eye(2, 3, dtype=np.float32)
    try:
        _, M = cv2.findTransformECC(a, b, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    except cv2.error as e:
        print("ECC failed", e)
    print("fit", np.round(M, 4).tolist())
    return cv2.warpAffine(edit, M, (inp.shape[1], inp.shape[0]), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=(255, 255, 255))


def to_sheet(img, box):
    """an edit's pixels (fitted) onto the 1800×2720 sheet: box — where the edit's frame lies on the sheet (x0, y0, x1, y1)"""
    x0, y0, x1, y1 = box
    big = cv2.resize(img, (round(x1 - x0), round(y1 - y0)), interpolation=cv2.INTER_CUBIC)
    out = np.full((SH, SW, 3), 255, np.uint8)
    sx0, sy0 = max(0, round(x0)), max(0, round(y0))
    ex0, ey0 = sx0 - round(x0), sy0 - round(y0)
    w = min(SW - sx0, big.shape[1] - ex0); h = min(SH - sy0, big.shape[0] - ey0)
    out[sy0:sy0 + h, sx0:sx0 + w] = big[ey0:ey0 + h, ex0:ex0 + w]
    have = np.zeros((SH, SW), bool); have[sy0:sy0 + h, sx0:sx0 + w] = True
    return out, have


# the composite (what is seen) and which layer is on top at each pixel
top = np.full((SH, SW), -1, int)
comp = np.full((SH, SW, 3), 255, np.float32)
for i, n in enumerate(ORDER):
    p = placed(n).astype(np.float32)
    al = p[..., 3:] / 255
    comp = comp * (1 - al) + p[..., :3] * al
    top[p[..., 3] > 128] = i
comp = comp.astype(np.uint8)

# the body edit: the sheet scaled into 1024×1536 (height-fit, 4 px off the left)
s = 1536 / SH
bw = round(SW * s); off = (1024 - bw) // 2
inb = np.array(Image.open(f"{B}/in-body.png").convert("RGB"))
edb = np.array(Image.open(f"{B}/edit-body.png").convert("RGB").resize((1024, 1536), Image.LANCZOS))
edb = fit(inb, edb)[:, off:off + bw]
body_sheet, body_have = to_sheet(edb, (0, 0, SW, SH))
# the face edit: the square (639, 235)–(1121, 717) of the 2000×3000 picture
fx0, fy0, fx1, fy1 = 639 - CROP[0], 235 - CROP[1], 1121 - CROP[0], 717 - CROP[1]
inf = np.array(Image.open(f"{B}/in-face.png").convert("RGB"))
edf = np.array(Image.open(f"{B}/edit-face.png").convert("RGB").resize((1024, 1024), Image.LANCZOS))
face_sheet, face_have = to_sheet(fit(inf, edf), (fx0, fy0, fx1, fy1))


def changed(edit, have):
    """how much the edit changed the look here (0…1): the colour difference, soft at its edges"""
    d = np.abs(edit.astype(np.int16) - comp.astype(np.int16)).sum(-1).astype(np.float32)
    m = np.clip((d - 60) / 90, 0, 1) * have
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return cv2.GaussianBlur(m, (0, 0), 1.2)


mb, mf = changed(body_sheet, body_have), changed(face_sheet, face_have)
idx = {n: i for i, n in enumerate(ORDER)}


import json, re
_s = open("src/client/art/boss-rig-data.ts").read()
_i = _s.index('"fokus": {') + len('"fokus": ')
_d, _k = 0, _i
for _k, _c in enumerate(_s[_i:], _i):
    _d += _c == "{"; _d -= _c == "}"
    if _d == 0: break
RIG = json.loads(_s[_i:_k + 1])["parts"]


def rig_box(n):
    """the part's rig picture box on the sheet (rig units × 2 — the rig is the sheet at half size) and the picture's size"""
    r = RIG[n]
    im = Image.open(f"public/bosses/fokus/rig/{n}.webp")
    return (r["x"] * 2, r["y"] * 2, (r["x"] + r["w"]) * 2, (r["y"] + r["h"]) * 2), im.size


for parts, edit, m in ((BODY_PARTS, body_sheet, mb), (FACE_PARTS, face_sheet, mf)):
    for n in parts:
        # seen on top here (lips-up / lips: the one placed sheet «lips» holds both)
        k = idx.get(n, idx["lips"])
        mine = (top == k).astype(np.float32)
        mine = cv2.GaussianBlur(cv2.dilate(mine, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
        w = m * mine
        (x0, y0, x1, y1), size = rig_box(n)
        ext = lambda im, mode: im.transform(size, Image.EXTENT, (x0, y0, x1, y1), mode)
        # the rig's own picture (its outline exactly), its colours mixed with the edit's where the edit changed it
        orig = np.array(Image.open(f"public/bosses/fokus/rig/{n}.webp").convert("RGBA")).astype(np.float32)
        ew = np.array(ext(Image.fromarray((w * 255).astype(np.uint8)), Image.BILINEAR)).astype(np.float32)[..., None] / 255
        er = np.array(ext(Image.fromarray(edit), Image.BICUBIC)).astype(np.float32)
        orig[..., :3] = orig[..., :3] * (1 - ew) + er * ew
        Image.fromarray(orig.astype(np.uint8)).save(f"public/bosses/fokus/rig/{n}-blood.webp", quality=88, method=6, exact=True)
        w = ew
        print(n, size, f"{float(w.mean()) * 100:.2f}%")
