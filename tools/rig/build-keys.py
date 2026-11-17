"""
«Связка ключей» (item keys-bundle, HAND slot): the hand holding a key ring, drawn by the artist as separate layers
(tools/rig/source/held/keys-bundle/, a 1000×1183 picture): ring-back.png (the ring's left half, behind the keys),
key-1…7.png, ring-front.png (its right half, over the keys), thumb.png (behind the hand), hand.png — the hand over all. The index finger is cut out of hand.png
here (it moves on its own).
Output:
  public/assets/hero/held/keys-bundle-<part>.webp  — each layer trimmed (the hand, the thumb and the finger also in every
                                                     skin tone: public/assets/hero/skin-<n>/held-keys-bundle-<part>.webp)
  tools/rig/source/held/keys-bundle.png            — all of it on the 2000×2800 rig canvas: build-held.py makes the still
                                                     picture (the looks editor, the item) and its place (HELD_FIT) from it
  src/client/art/keys-data.ts                      — the layers' places and the pivots (rig coordinates)
Run build-held.py after this. The animation is rig.tsx KeysHand (screens.css «rig-keys»).
"""
import os, json
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held", "keys-bundle")
OUT = os.path.join(ROOT, "public", "assets", "hero")
ID = "keys-bundle"

# the artist's picture → the rig: its wrist (the cut edge on the right) lands where the mug's wrist is
S = 0.52
U0 = np.array([705.0, 366.0])
R0 = np.array([762.0, 764.0])
rig = lambda u: (np.asarray(u, np.float32) - U0) * S + R0

# the index finger: everything of the hand left of the line from the gap under it to the top of the hand
CUT = ((435.0, 525.0), (492.0, 378.0))
FINGER_PIVOT = (482.0, 402.0)
THUMB_PIVOT = (488.0, 420.0)
# the ring is gripped at its top, the keys hang from its bottom
GRIP = (470.0, 470.0)
HANG = (505.0, 660.0)
# each key hangs from its own hole (the top of its picture, found below)

SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]  # keep in sync with build-look.py
SKIN_ORIGINAL = 1


def lab(rgb):
    return cv2.cvtColor((rgb.astype(np.float32) / 255).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)


def rgb_(l):
    out = cv2.cvtColor(l.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(l.shape)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def hex_lab(h):
    return lab(np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]], np.uint8))[0]


def skin_weight(im):
    hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2HSV).astype(np.float32)
    H, Sa, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1)
    w *= np.clip((Sa - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1)
    w *= np.clip((185 - Sa) / 25, 0, 1)
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]


def tint(base, i):
    if i == SKIN_ORIGINAL:
        return base
    L = lab(base[:, :, :3])
    w = skin_weight(base)
    ref, t = hex_lab(SKIN_TONES[SKIN_ORIGINAL]), hex_lab(SKIN_TONES[i])
    new = L.copy()
    new[:, :, 0] = np.clip(L[:, :, 0] * (t[0] / ref[0]), 0, 100)
    new[:, :, 1] = L[:, :, 1] + (t[1] - ref[1])
    new[:, :, 2] = L[:, :, 2] + (t[2] - ref[2])
    out = base.copy()
    out[:, :, :3] = rgb_(L * (1 - w) + new * w)
    return out


def load(name):
    im = np.array(Image.open(os.path.join(SRC, name + ".png")).convert("RGBA"))
    im[im[:, :, 3] < 8] = 0
    return im


layers = {"ring-back": load("ring-back"), "thumb": load("thumb")}
keys = [f"key-{i}" for i in range(1, 8)]
for k in keys:
    layers[k] = load(k)
hand = load("hand")
# the finger: a soft band across the cut, the hand keeps its side of the band (the finger covers the seam when it moves)
H, W = hand.shape[:2]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
(ax, ay), (bx, by) = CUT
nx, ny = -(by - ay), (bx - ax)
nrm = np.hypot(nx, ny)
d = ((xx - ax) * nx + (yy - ay) * ny) / nrm
if d[525, 390] < 0:  # the normal must point into the finger
    d = -d
fa = np.clip((d + 6) / 8, 0, 1)
finger = hand.copy()
finger[:, :, 3] = (hand[:, :, 3] * fa).astype(np.uint8)
rest = hand.copy()
rest[:, :, 3] = (hand[:, :, 3] * (d < 6)).astype(np.uint8)
layers["hand"] = rest
layers["finger"] = finger
layers["ring-front"] = load("ring-front")
ORDER = ["ring-back", *keys, "ring-front", "thumb", "hand", "finger"]
SKIN_PARTS = {"hand", "finger", "thumb"}

data = {}
os.makedirs(os.path.join(OUT, "held"), exist_ok=True)
for name in ORDER:
    im = layers[name]
    ys, xs = np.nonzero(im[:, :, 3])
    P = 3
    x0, y0, x1, y1 = max(0, xs.min() - P), max(0, ys.min() - P), min(W, xs.max() + P + 1), min(H, ys.max() + P + 1)
    crop = im[y0:y1, x0:x1]
    (rx, ry), (rx1, ry1) = rig((x0, y0)), rig((x1, y1))
    data[name] = {"x": round(float(rx), 1), "y": round(float(ry), 1), "w": round(float(rx1 - rx), 1), "h": round(float(ry1 - ry), 1)}
    for i in range(len(SKIN_TONES)):
        if i != SKIN_ORIGINAL and name not in SKIN_PARTS:
            continue
        img = tint(crop, i)
        path = os.path.join(OUT, "held", f"{ID}-{name}") if i == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{i}", f"held-{ID}-{name}")
        Image.fromarray(img).save(path + ".webp", "WEBP", quality=90, method=6)
    if name.startswith("key-"):
        # the key hangs from the top middle of its picture (its hole)
        top = ys.min()
        row = xs[ys < top + 12]
        data[name]["pivot"] = [round(float(v), 1) for v in rig(((row.min() + row.max()) / 2, top + 8))]
        # the gleam (rig.tsx KeysHand → MetalGlint): white where the key is, and the flash on its head
        shine = np.zeros_like(crop)
        shine[:, :, :3] = 255
        shine[:, :, 3] = crop[:, :, 3]
        Image.fromarray(shine).save(os.path.join(OUT, "held", f"{ID}-{name}-shine.webp"), "WEBP", quality=80, method=6)
        hy = ys.min() + (ys.max() - ys.min()) * 0.22
        hx = xs[(ys > hy - 6) & (ys < hy + 6)].mean()
        data[name]["star"] = [round(float(v), 1) for v in rig((hx, hy))]

pv = lambda p: [round(float(v), 1) for v in rig(p)]
pivots = {"finger": pv(FINGER_PIVOT), "thumb": pv(THUMB_PIVOT), "grip": pv(GRIP), "hang": pv(HANG), "wrist": pv(U0)}

# the still picture on the 2000×2800 canvas (build-held.py: HELD_FIT, the looks editor, the skins)
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for name in ORDER:
    canvas.alpha_composite(Image.fromarray(layers[name]))
big = Image.new("RGBA", (2000, 2800), (0, 0, 0, 0))
k = 2 * S
o = 2 * (R0 - U0 * S)
sc = canvas.resize((round(W * k), round(H * k)), Image.LANCZOS)
big.alpha_composite(sc, (int(round(o[0])), int(round(o[1]))))
big.save(os.path.join(HERE, "source", "held", f"{ID}.png"))

# the item picture: the ring and the keys without the hand, on a 256² square
icon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for name in ["ring-back", *keys, "ring-front"]:
    icon.alpha_composite(Image.fromarray(layers[name]))
bb = icon.getbbox()
icon = icon.crop(bb)
side = max(icon.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.alpha_composite(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
sq.resize((232, 232), Image.LANCZOS)
out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
out.alpha_composite(sq.resize((236, 236), Image.LANCZOS), (10, 10))
out.save(os.path.join(ROOT, "public", "assets", "items", f"{ID}.webp"), "WEBP", quality=90, method=6)

ts = "/* Generated by tools/rig/build-keys.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** «Связка ключей» in the hand: its layers, bottom to top (keys hang from their own pivot), and the pivots */\n"
ts += "export const KEYS_PARTS: Record<string, { x: number; y: number; w: number; h: number; pivot?: [number, number]; star?: [number, number] }> = " + json.dumps(data, indent=2) + ";\n"
ts += "export const KEYS_ORDER = " + json.dumps(ORDER) + " as const;\n"
ts += "export const KEYS_PIVOTS: Record<string, [number, number]> = " + json.dumps(pivots, indent=2) + ";\n"
open(os.path.join(ROOT, "src", "client", "art", "keys-data.ts"), "w").write(ts)
print("ok", pivots)
