"""
The jaw when something is held in the mouth (a cigarette, a toothpick — slot «Рот»): the teeth clenched on it, the lower
jaw drops a little now and then while the thing is rolled to the other corner of the mouth.
Input: tools/rig/source/mouth/{inside,teeth-up,teeth-down,lips}.png — the artist's layers on one 623×658 canvas
over the head (ref-full.png is how it all looks together). The lips layer is skin with the lips and the chin, a hole
cut between the lips.
Frames: the lower teeth move down rigidly; the lips layer gets a puppet warp — under the line between the lips it is
pulled down (full in the middle of the chin, fading out towards the cheeks), the upper lip stays.
Output: public/assets/hero/jaw.webp (+ skin-<n>/jaw.webp for every skin tone, the same LAB recolor as build-look.py,
only the lips layer is recolored) — FRAMES frames stacked top to bottom — and src/client/art/jaw-data.ts.
"""
import os, json
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "mouth")
OUT = os.path.join(ROOT, "public", "assets", "hero")
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]  # keep in sync with build-look.py
SKIN_ORIGINAL = 1
# the layers' canvas → rig: the head (public/assets/hero/head.webp at RIG.head) fitted on ref-full.png
K = 581 / 254
RIG_X0, RIG_Y0, REF_X0, REF_Y0 = 376, 43, 19, 7
FRAMES, DROP = 8, 13          # frames of the jaw opening; how far the jaw drops (canvas px)
BOX = (180, 434, 434, 650)    # the part of the canvas the frames cover (x0, y0, x1, y1)
PX = 2                        # output pixels per rig unit

def load(n): return np.array(Image.open(os.path.join(SRC, n + ".png")).convert("RGBA")).astype(np.float32) / 255

def lab(rgb): return cv2.cvtColor(rgb.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)
def unlab(l): return np.clip(cv2.cvtColor(l.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(l.shape), 0, 1)
def hex_lab(h): return lab(np.array([[[int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]]], np.float32))[0, 0]

def skin_weight(im):
    hsv = cv2.cvtColor((im[:, :, :3] * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1) * np.clip((S - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1)
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]

def recolor(im, tone):
    if tone == SKIN_ORIGINAL: return im
    ref, t = hex_lab(SKIN_TONES[SKIN_ORIGINAL]), hex_lab(SKIN_TONES[tone])
    L = lab(im[:, :, :3]); new = L.copy()
    new[:, :, 0] = np.clip(L[:, :, 0] * (t[0] / ref[0]), 0, 100)
    new[:, :, 1] += t[1] - ref[1]; new[:, :, 2] += t[2] - ref[2]
    w = skin_weight(im); out = im.copy(); out[:, :, :3] = unlab(L * (1 - w) + new * w)
    return out

def over(dst, src):
    a = src[:, :, 3:4]
    out = dst.copy()
    out[:, :, 3:4] = a + dst[:, :, 3:4] * (1 - a)
    out[:, :, :3] = (src[:, :, :3] * a + dst[:, :, :3] * dst[:, :, 3:4] * (1 - a)) / np.maximum(out[:, :, 3:4], 1e-6)
    return out

inside, up, down, lips = (load(n) for n in ("inside", "teeth-up", "teeth-down", "lips"))
H, W = lips.shape[:2]
# the line between the lips: the middle of the hole cut in the lips layer (inside its bounding box)
hole = (lips[:, :, 3] < 0.5)
ys, xs = np.nonzero(down[:, :, 3] > 0.5)
cx = (xs.min() + xs.max()) / 2
col = hole[:, int(cx)]
top = next(y for y in range(H) if not col[y])              # the top of the upper lip
gap0 = next(y for y in range(top, H) if col[y])             # the hole between the lips
gap1 = next(y for y in range(gap0, H) if not col[y])
rows = [gap0, gap1 - 1]
split = (min(rows) + max(rows)) / 2
print("lips split at", split, "centre x", cx)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def smooth(a, b, v): t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
vy = smooth(split - 5, split + 7, yy)                       # 0 above the lips' line, 1 under it
hx = 1 - smooth(70, 118, np.abs(xx - cx))                    # full in the middle, nothing at the cheeks

def frame(t, lips_t, up=up, down=down):
    d = DROP * t
    mapy = (yy - d * vy * hx).astype(np.float32)             # pull the lower lip and the chin down
    warped = cv2.remap(lips_t, xx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    low = cv2.warpAffine(down, np.float32([[1, 0, 0], [0, 1, d]]), (W, H), flags=cv2.INTER_LINEAR)
    c = np.zeros((H + 0, W, 4), np.float32)
    for layer in (inside, up, low, warped): c = over(c, layer)
    return c

x0, y0, x1, y1 = BOX
fw, fh = (x1 - x0) / K, (y1 - y0) / K                       # one frame in rig units
ow, oh = round(fw * PX), round(fh * PX)
# the plain teeth, and the diamond grills (slot «Зубы»: teeth-*-diamond.png, the same teeth set with diamonds) → jaw-diamond.webp
VARIANTS = [("jaw", up, down), ("jaw-diamond", load("teeth-up-diamond"), load("teeth-down-diamond"))]
for name, vu, vd in VARIANTS:
  for tone in range(len(SKIN_TONES)):
    lt = recolor(lips, tone)
    sheet = np.zeros((oh * FRAMES, ow, 4), np.float32)
    for i in range(FRAMES):
        f = frame(i / (FRAMES - 1), lt, vu, vd)[y0:y1, x0:x1]
        sheet[i * oh:(i + 1) * oh] = cv2.resize(f, (ow, oh), interpolation=cv2.INTER_AREA)
    im = Image.fromarray((np.clip(np.nan_to_num(sheet), 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    path = os.path.join(OUT, f"{name}.webp") if tone == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{tone}", f"{name}.webp")
    im.save(path, "WEBP", quality=90, method=6)
data = {"x": round(RIG_X0 + (x0 - REF_X0) / K, 2), "y": round(RIG_Y0 + (y0 - REF_Y0) / K, 2), "w": round(fw, 2), "h": round(fh, 2), "frames": FRAMES,
        # the middle of the mouth (rig): the thing in the mouth is flipped around it to the other corner
        "mouth": [round(float(RIG_X0 + (cx - REF_X0) / K), 1), round(float(RIG_Y0 + (split - REF_Y0) / K), 1)]}
ts = "/* Generated by tools/rig/build-mouth.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** the jaw sprite (public/assets/hero/jaw.webp): `frames` frames stacked, each w×h at x, y */\n"
ts += "export const JAW = " + json.dumps(data) + " as const;\n"
open(os.path.join(ROOT, "src", "client", "art", "jaw-data.ts"), "w").write(ts)
print(data, ow, oh)
