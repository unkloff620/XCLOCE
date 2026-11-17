"""
«Колбы Утилизатора» (item vials-utilizator, HAND slot — Утилизатор's thing for «Авторитетный»): the artist's layers
(tools/rig/source/held/vials-utilizator/, a 527×534 picture, all in place): ring.png (the ring on the finger), vial-1…3.png
(hanging off it by their eyes), clip-1…3.png (the bits of the ring that pass over each eye — over the vials), hand.png (over all).
The hand twirls the ring round its finger, clockwise; the vials swing out on it and dangle each on its own eye
(rig.tsx VialsHand, screens.css «rv-»).
Output:
  public/assets/hero/held/vials-utilizator-<part>.webp (the hand also in every skin tone: skin-<n>/held-vials-utilizator-hand.webp)
  tools/rig/source/held/vials-utilizator.png — all of it on the 2000×2800 rig canvas (build-held.py: the still picture)
  public/assets/items/vials-utilizator.webp  — the item picture (the ring with the vials)
  src/client/art/vials-data.ts               — the layers' places and the pivots (rig coordinates)
Run build-held.py after this.
"""
import os, json, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held", "vials-utilizator")
OUT = os.path.join(ROOT, "public", "assets", "hero")
ID = "vials-utilizator"
# the artist's picture → the rig: its wrist (the cut edge on the right) lands where the other held hands' wrist is,
# the hand as big as the hand with the keys
S = 0.46
U0 = np.array([463.0, 160.0])
R0 = np.array([762.0, 764.0])
rig = lambda u: (np.asarray(u, np.float32) - U0) * S + R0
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]
SKIN_ORIGINAL = 1


def load(n):
    im = np.array(Image.open(os.path.join(SRC, n + ".png")).convert("RGBA"))
    im[im[..., 3] < 8] = 0
    return im


# the skin tint (as build-keys.py)
import cv2
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


VIALS = ["vial-1", "vial-2", "vial-3"]
CLIPS = ["clip-1", "clip-2", "clip-3"]
L = {n: load(n) for n in ["ring", *VIALS, *CLIPS, "hand"]}
ORDER = ["ring", *VIALS, *CLIPS, "hand"]
H, W = L["hand"].shape[:2]

# the spin's pivot: where the finger goes through the ring (the overlap of the ring and the hand)
ov = (L["ring"][..., 3] > 128) & (L["hand"][..., 3] > 128)
ys, xs = np.nonzero(ov)
SPIN = (float(xs.mean()), float(ys.mean())) if len(xs) else (180.0, 240.0)
data = {}
os.makedirs(os.path.join(OUT, "held"), exist_ok=True)
for n in ORDER:
    im = L[n]
    ys, xs = np.nonzero(im[..., 3])
    P = 3
    x0, y0, x1, y1 = max(0, xs.min() - P), max(0, ys.min() - P), min(W, xs.max() + P + 1), min(H, ys.max() + P + 1)
    crop = im[y0:y1, x0:x1]
    (rx, ry), (rx1, ry1) = rig((x0, y0)), rig((x1, y1))
    data[n] = {"x": round(float(rx), 1), "y": round(float(ry), 1), "w": round(float(rx1 - rx), 1), "h": round(float(ry1 - ry), 1)}
    for i in range(len(SKIN_TONES)):
        if i != SKIN_ORIGINAL and n != "hand": continue
        p = os.path.join(OUT, "held", f"{ID}-{n}") if i == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{i}", f"held-{ID}-{n}")
        Image.fromarray(tint(crop, i)).save(p + ".webp", "WEBP", quality=90, method=6)
    if n in VIALS:
        # the vial hangs from its eye: the top middle of its picture
        top = ys.min(); row = xs[ys < top + 10]
        data[n]["pivot"] = [round(float(v), 1) for v in rig(((row.min() + row.max()) / 2, top + 6))]
pivots = {"spin": [round(float(v), 1) for v in rig(SPIN)], "wrist": [round(float(v), 1) for v in rig(U0)]}

canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in ORDER: canvas.alpha_composite(Image.fromarray(L[n]))
big = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
k = 2 * S; o = 2 * (R0 - U0 * S)
big.alpha_composite(canvas.resize((round(W * k), round(H * k)), Image.LANCZOS), (int(round(o[0])), int(round(o[1]))))
big.save(os.path.join(HERE, "source", "held", f"{ID}.png"))

icon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in ["ring", *VIALS, *CLIPS]: icon.alpha_composite(Image.fromarray(L[n]))
icon = icon.crop(icon.getbbox()); side = max(icon.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0)); sq.alpha_composite(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
out = Image.new("RGBA", (256, 256), (0, 0, 0, 0)); out.alpha_composite(sq.resize((236, 236), Image.LANCZOS), (10, 10))
out.save(os.path.join(ROOT, "public", "assets", "items", f"{ID}.webp"), "WEBP", quality=90, method=6)

ts = "/* Generated by tools/rig/build-vials.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** «Колбы Утилизатора» in the hand: its layers (the vials hang from their own pivot) and the pivots */\n"
ts += "export const VIALS_PARTS: Record<string, { x: number; y: number; w: number; h: number; pivot?: [number, number] }> = " + json.dumps(data, indent=2) + ";\n"
ts += "export const VIALS_ORDER = " + json.dumps(ORDER) + " as const;\n"
ts += "export const VIALS_PIVOTS: Record<string, [number, number]> = " + json.dumps(pivots, indent=2) + ";\n"
open(os.path.join(ROOT, "src", "client", "art", "vials-data.ts"), "w").write(ts)
print("ok", pivots, "spin src", SPIN, "grip canvas", [round(v * 2) for v in rig(SPIN)], "far", [round(v * 2) for v in rig((110, 520))])
