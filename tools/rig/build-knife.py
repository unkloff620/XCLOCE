"""
«Нож Психа» (item knife-psih, HAND slot — Псих's thing): the artist's layers on the hero's 2000×2800 canvas, in place
(tools/rig/source/held/knife-psih/, bottom first): knife, thumb (behind the palm), hand, finger-back, finger-front.
The hand rests with the knife under its fingers; now and then it flicks the knife up, the knife spins over once in the
air and the hand catches it; the fingers and the thumb fidget in between (rig.tsx KnifeHand; the artist's video).
Output:
  public/assets/hero/held/knife-psih-<part>.webp (the skin layers also in every skin tone)
  tools/rig/source/held/knife-psih.png — all of it on the canvas (build-held.py: the still picture)
  public/assets/items/knife-psih.webp  — the item picture
  src/client/art/knife-data.ts         — the layers' places and the pivots (rig coordinates)
Run build-held.py after this.
"""
import os, json, sys
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held", "knife-psih")
OUT = os.path.join(ROOT, "public", "assets", "hero")
ID = "knife-psih"
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]
SKIN_ORIGINAL = 1
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


ORDER = ["knife", "thumb", "hand", "finger-back", "finger-front"]
SKIN = {"thumb", "hand", "finger-back", "finger-front"}


def load(n):
    im = np.array(Image.open(os.path.join(SRC, n + ".png")).convert("RGBA"))
    im[im[..., 3] < 8] = 0
    # stray specks off the drawing (a dot far from the hand) are dropped: they would stretch the boxes
    from scipy import ndimage
    lab, k = ndimage.label(im[..., 3] > 0)
    if k > 1:
        sz = ndimage.sum(np.ones(lab.shape), lab, range(1, k + 1))
        im[np.isin(lab, [i + 1 for i, v in enumerate(sz) if v < 60])] = 0
    return im


L = {n: load(n) for n in ORDER}
R = lambda v: round(float(v) / 2, 1)
data = {}
os.makedirs(os.path.join(OUT, "held"), exist_ok=True)
for n in ORDER:
    im = L[n]
    ys_, xs_ = np.nonzero(im[..., 3])
    P = 4
    x0, y0, x1, y1 = xs_.min() - P, ys_.min() - P, xs_.max() + P + 1, ys_.max() + P + 1
    x0, y0 = x0 - x0 % 2, y0 - y0 % 2
    x1, y1 = x1 + x1 % 2, y1 + y1 % 2
    half = np.array(Image.fromarray(im[y0:y1, x0:x1]).resize(((x1 - x0) // 2, (y1 - y0) // 2), Image.LANCZOS))
    data[n] = {"x": x0 / 2, "y": y0 / 2, "w": (x1 - x0) / 2, "h": (y1 - y0) / 2}
    for i in range(len(SKIN_TONES)):
        if i != SKIN_ORIGINAL and n not in SKIN: continue
        p = os.path.join(OUT, "held", f"{ID}-{n}") if i == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{i}", f"held-{ID}-{n}")
        Image.fromarray(tint(half, i)).save(p + ".webp", "WEBP", quality=90, method=6)


def end(n, dx, dy, back=14):
    """the end of a layer furthest along (dx, dy), a little back inside it: a finger's root (where it joins the palm)"""
    a = L[n][..., 3] > 128
    ys_, xs_ = np.nonzero(a)
    p = xs_ * dx + ys_ * dy
    near = p > p.max() - 25
    x, y = float(xs_[near].mean()), float(ys_[near].mean())
    k = np.hypot(dx, dy)
    return x - dx / k * back, y - dy / k * back


# the knife: its middle (it spins round it in the air); the wrist: the hand's top right end (into the sleeve)
ka = L["knife"][..., 3] > 128
ky, kx = np.nonzero(ka)
knife_c = ((kx.min() + kx.max()) / 2, (ky.min() + ky.max()) / 2)
pivots = {"knife": [R(v) for v in knife_c], "wrist": [R(v) for v in end("hand", 1, -0.7, 60)],
          "finger-front": [R(v) for v in end("finger-front", 1, -1)], "finger-back": [R(v) for v in end("finger-back", 1, -1)],
          "thumb": [R(v) for v in end("thumb", 1, 0)]}

canvas = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
for n in ORDER: canvas.alpha_composite(Image.fromarray(L[n]))
canvas.save(os.path.join(HERE, "source", "held", f"{ID}.png"))

ic = Image.fromarray(L["knife"]); ic = ic.crop(ic.getbbox()).rotate(35, expand=True, resample=Image.BICUBIC); ic = ic.crop(ic.getbbox())
side = max(ic.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.alpha_composite(ic, ((side - ic.width) // 2, (side - ic.height) // 2))
out = Image.new("RGBA", (256, 256), (0, 0, 0, 0)); out.alpha_composite(sq.resize((236, 236), Image.LANCZOS), (10, 10))
out.save(os.path.join(ROOT, "public", "assets", "items", f"{ID}.webp"), "WEBP", quality=90, method=6)

ts = "/* Generated by tools/rig/build-knife.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** «Нож Психа» in the hand: its layers and the pivots (the knife's middle, the wrist, the fingers' and the thumb's roots) */\n"
ts += "export const KNIFE_PARTS: Record<string, { x: number; y: number; w: number; h: number }> = " + json.dumps(data, indent=2) + ";\n"
ts += "export const KNIFE_PIVOTS: Record<string, [number, number]> = " + json.dumps(pivots) + ";\n"
open(os.path.join(ROOT, "src", "client", "art", "knife-data.ts"), "w").write(ts)
print("ok", pivots)
