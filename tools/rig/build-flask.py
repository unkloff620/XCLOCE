"""
«Колба Химика» (item flask-himik, HAND slot — Химик's thing): the artist's layers on the hero's 2000×2800 canvas, in place
(tools/rig/source/held/flask-himik/, bottom first): fingers-back (the fingers behind the neck), glass (the round flask,
solid), glass-front (the same glass, see-through: drawn over the liquid), hand, fingers (in front of the neck), thumb.
The flask hangs from the fingers by its neck and swings; the liquid inside keeps level and sloshes (rig.tsx FlaskHand).
Output:
  public/assets/hero/held/flask-himik-<part>.webp (the skin layers also in every skin tone: skin-<n>/held-flask-himik-<part>.webp)
  public/assets/hero/held/flask-himik-inside.webp — the flask's inside (white): the liquid's mask
  tools/rig/source/held/flask-himik.png — all of it on the canvas (build-held.py: the still picture)
  public/assets/items/flask-himik.webp  — the item picture
  src/client/art/flask-data.ts          — the layers' places and the pivots (rig coordinates)
Run build-held.py after this.
"""
import os, json, sys
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held", "flask-himik")
OUT = os.path.join(ROOT, "public", "assets", "hero")
ID = "flask-himik"
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]
SKIN_ORIGINAL = 1
ORDER = ["fingers-back", "glass", "glass-front", "hand", "fingers", "thumb"]
SKIN = {"fingers-back", "hand", "fingers", "thumb"}


def lab(rgb): return cv2.cvtColor((rgb.astype(np.float32) / 255).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)
def rgb_(l): return np.clip(cv2.cvtColor(l.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(l.shape) * 255 + 0.5, 0, 255).astype(np.uint8)
def hex_lab(h): return lab(np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]], np.uint8))[0]
def skin_weight(im):
    hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2HSV).astype(np.float32)
    H, Sa, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1)
    w *= np.clip((Sa - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1) * np.clip((185 - Sa) / 25, 0, 1)
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]
def tint(base, i):
    if i == SKIN_ORIGINAL: return base
    L = lab(base[..., :3]); w = skin_weight(base)
    ref, t = hex_lab(SKIN_TONES[SKIN_ORIGINAL]), hex_lab(SKIN_TONES[i])
    new = L.copy()
    new[..., 0] = np.clip(L[..., 0] * (t[0] / ref[0]), 0, 100); new[..., 1] = L[..., 1] + (t[1] - ref[1]); new[..., 2] = L[..., 2] + (t[2] - ref[2])
    out = base.copy(); out[..., :3] = rgb_(L * (1 - w) + new * w)
    return out


def load(n):
    im = np.array(Image.open(os.path.join(SRC, n + ".png")).convert("RGBA"))
    im[im[..., 3] < 8] = 0
    return im


L = {n: load(n) for n in ORDER}
# the inside of the flask: the glass's shape a little in from its outline (the liquid never covers the glass's own line)
glass = (L["glass"][..., 3] > 128).astype(np.uint8)
inside = cv2.erode(glass, np.ones((13, 13), np.uint8))
L["inside"] = np.dstack([np.full(glass.shape, 255, np.uint8)] * 3 + [cv2.GaussianBlur(inside * 255, (0, 0), 1.5)])
# the flask's shape: the lip (the widest row up top), the neck, the round bulb (its middle and radius)
ys, xs = np.nonzero(glass)
rows = {y: np.nonzero(glass[y])[0] for y in range(ys.min(), ys.max() + 1)}
wid = {y: r.max() - r.min() for y, r in rows.items() if len(r)}
top = ys.min()
neck_y = min((y for y in wid if top + 40 < y < top + 160), key=lambda y: wid[y])          # the neck's narrowest row
lip_y = max((y for y in wid if top <= y < neck_y), key=lambda y: wid[y])                  # the lip's widest
belly_y = max((y for y in wid if y > neck_y), key=lambda y: wid[y])                       # the bulb's widest row
bulb_r = wid[belly_y] / 2
bulb_c = ((rows[belly_y].min() + rows[belly_y].max()) / 2, ys.max() - bulb_r)
grip = ((rows[neck_y].min() + rows[neck_y].max()) / 2, (lip_y + neck_y) / 2)              # it hangs from the fingers on its neck
bottom = ys.max()
print("lip", lip_y, "neck", neck_y, "bulb", bulb_c, bulb_r, "grip", grip, "bottom", bottom)

R = lambda v: round(float(v) / 2, 1)
data = {}
os.makedirs(os.path.join(OUT, "held"), exist_ok=True)
for n in [*ORDER, "inside"]:
    im = L[n]
    ys_, xs_ = np.nonzero(im[..., 3])
    P = 4
    x0, y0, x1, y1 = xs_.min() - P, ys_.min() - P, xs_.max() + P + 1, ys_.max() + P + 1
    x0, y0 = x0 - x0 % 2, y0 - y0 % 2
    x1, y1 = x1 + x1 % 2, y1 + y1 % 2
    crop = im[y0:y1, x0:x1]
    half = np.array(Image.fromarray(crop).resize(((x1 - x0) // 2, (y1 - y0) // 2), Image.LANCZOS))
    data[n] = {"x": x0 / 2, "y": y0 / 2, "w": (x1 - x0) / 2, "h": (y1 - y0) / 2}
    for i in range(len(SKIN_TONES)):
        if i != SKIN_ORIGINAL and n not in SKIN: continue
        p = os.path.join(OUT, "held", f"{ID}-{n}") if i == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{i}", f"held-{ID}-{n}")
        Image.fromarray(tint(half, i)).save(p + ".webp", "WEBP", quality=90, method=6)

# the wrist: where the hand goes into the sleeve (its top right end)
h = L["hand"][..., 3] > 128
hy, hx = np.nonzero(h)
far = np.argmax(hx - hy * 0.6)
wrist = (float(hx[far]) - 40, float(hy[far]) + 40)
pivots = {"grip": [R(grip[0]), R(grip[1])], "bulb": [R(bulb_c[0]), R(bulb_c[1])], "wrist": [R(wrist[0]), R(wrist[1])]}
shape = {"bulbR": R(bulb_r), "bottom": R(bottom), "neckY": R(neck_y), "lipY": R(lip_y)}

canvas = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
for n in ORDER: canvas.alpha_composite(Image.fromarray(L[n]))
canvas.save(os.path.join(HERE, "source", "held", f"{ID}.png"))

# the item picture: the flask alone, a little liquid drawn in it (as on the hero)
ic = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
ic.alpha_composite(Image.fromarray(L["glass"]))
liq = np.zeros((2800, 2000, 4), np.uint8)
yy = np.mgrid[0:2800, 0:2000][0]
lvl = bulb_c[1] - bulb_r * 0.1
m = (inside > 0) & (yy > lvl)
t = np.clip((yy - lvl) / (bottom - lvl), 0, 1)[..., None]
col = (np.array([255, 120, 230]) * (1 - t) + np.array([200, 20, 170]) * t)
liq[..., :3] = col.astype(np.uint8); liq[..., 3] = m * 235
ic.alpha_composite(Image.fromarray(liq))
ic.alpha_composite(Image.fromarray(L["glass-front"]))
ic = ic.crop(ic.getbbox()); side = max(ic.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.alpha_composite(ic, ((side - ic.width) // 2, (side - ic.height) // 2))
out = Image.new("RGBA", (256, 256), (0, 0, 0, 0)); out.alpha_composite(sq.resize((236, 236), Image.LANCZOS), (10, 10))
out.save(os.path.join(ROOT, "public", "assets", "items", f"{ID}.webp"), "WEBP", quality=90, method=6)

ts = "/* Generated by tools/rig/build-flask.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** «Колба Химика» in the hand: its layers, the pivots (the grip on the neck, the bulb's middle, the wrist) and the flask's shape */\n"
ts += "export const FLASK_PARTS: Record<string, { x: number; y: number; w: number; h: number }> = " + json.dumps(data, indent=2) + ";\n"
ts += "export const FLASK_PIVOTS: Record<string, [number, number]> = " + json.dumps(pivots) + ";\n"
ts += "export const FLASK_SHAPE = " + json.dumps(shape) + " as const;\n"
open(os.path.join(ROOT, "src", "client", "art", "flask-data.ts"), "w").write(ts)
print("ok", pivots, shape)
