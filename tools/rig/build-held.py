"""
Things held in the hero's left hand (the HAND slot; they drop from bosses and are bought in the shop):
tools/rig/source/held/<item>.png — the hand holding the thing, drawn on the 2000×2800 rig canvas in place of handR.
Output (run after build-rig.py):
  public/assets/hero/held/<item>.webp            — trimmed, half size, the original skin tone
  public/assets/hero/skin-<n>/held-<item>.webp   — the other skin tones (only the skin is recolored: low-saturation
                                                    skin hues; a bright orange bottle stays as drawn)
  …-f<k>.webp                                    — puppet-warp frames (mls.py): the hand holds still, the thing sways
                                                    around the grip and its far end flickers
  src/client/art/held-data.ts                    — positions and the number of frames
"""
import os, json, sys
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mls import mls_rigid_inverse, premul, unpremul, warp_all  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held")
OUT = os.path.join(ROOT, "public", "assets", "hero")
SCALE, UP = 0.5, 2
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]  # keep in sync with build-look.py
SKIN_ORIGINAL = 1

# pins in source-canvas pixels: the hand stays, the thing turns around `grip` (degrees per frame), `flicker` points wobble
HELD = {
    "bottle-komandate": {
        "hand": [(1450, 1500), (1380, 1590), (1470, 1640), (1320, 1700), (1380, 1740), (1440, 1730), (1350, 1790), (1395, 1770)],
        "grip": (1300, 1810),
        "thing": [(1230, 1870), (1170, 1925)],
        "flicker": [(1110, 2000), (1150, 1890), (1200, 2000), (1095, 1940)],
        "angles": [1, 2, 3, 4, 5, -1, -2, -3, -4, -5],
    },
}


def lab(rgb):
    return cv2.cvtColor((rgb.astype(np.float32) / 255).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)


def rgb_(l):
    out = cv2.cvtColor(l.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(l.shape)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def hex_lab(h):
    return lab(np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]], np.uint8))[0]


def skin_weight(im):
    """as build-look.py, but only the skin's soft saturation: the thing in the hand keeps its colours"""
    hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1)
    w *= np.clip((S - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1)
    w *= np.clip((185 - S) / 25, 0, 1)  # skin is S ≈ 90…160; the orange glass is ≥ 200
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]


def tint(base, i, region):
    if i == SKIN_ORIGINAL:
        return base
    L = lab(base[:, :, :3])
    w = skin_weight(base) * region
    ref, t = hex_lab(SKIN_TONES[SKIN_ORIGINAL]), hex_lab(SKIN_TONES[i])
    new = L.copy()
    new[:, :, 0] = np.clip(L[:, :, 0] * (t[0] / ref[0]), 0, 100)
    new[:, :, 1] = L[:, :, 1] + (t[1] - ref[1])
    new[:, :, 2] = L[:, :, 2] + (t[2] - ref[2])
    out = base.copy()
    out[:, :, :3] = rgb_(L * (1 - w) + new * w)
    return out


def rot(p, c, deg):
    a = np.radians(deg)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * np.cos(a) - y * np.sin(a), c[1] + x * np.sin(a) + y * np.cos(a))


data = {}
os.makedirs(os.path.join(OUT, "held"), exist_ok=True)
for item, cfg in HELD.items():
    im = np.array(Image.open(os.path.join(SRC, item + ".png")).convert("RGBA"))
    a = im[:, :, 3]
    a[a < 40] = 0
    im[a == 0, :3] = 0
    ys, xs = np.nonzero(a)
    PAD = 24  # room for the sway
    x0, y0, x1, y1 = xs.min() - PAD, ys.min() - PAD, xs.max() + PAD, ys.max() + PAD
    w, h = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    base = np.array(Image.fromarray(im[y0:y1, x0:x1]).resize((w, h), Image.LANCZOS))
    data[item] = {"x": round(x0 * SCALE, 1), "y": round(y0 * SCALE, 1), "w": w, "h": h, "frames": len(cfg["angles"])}
    loc = lambda p: ((p[0] - x0) * SCALE * UP, (p[1] - y0) * SCALE * UP)
    # the skin is only on the hand's side of the grip: past it there is just the thing (its pale label stays as drawn)
    gx, gy = cfg["grip"]
    far = cfg["flicker"][0]
    dx, dy = far[0] - gx, far[1] - gy
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    along = ((xx / SCALE + x0 - gx) * dx + (yy / SCALE + y0 - gy) * dy) / np.hypot(dx, dy)
    region = np.clip((20 - along) / 30, 0, 1)[..., None]
    maps = []
    for k, deg in enumerate(cfg["angles"]):
        src, dst = [], []
        for p in cfg["hand"] + [cfg["grip"]]:
            src.append(loc(p)); dst.append(loc(p))
        for p in cfg["thing"]:
            src.append(loc(p)); dst.append(loc(rot(p, cfg["grip"], deg)))
        for j, p in enumerate(cfg["flicker"]):
            q = rot(p, cfg["grip"], deg * 1.15)
            wob = 5 * np.sin(k * 1.7 + j * 2.3)  # the flame licks a little on its own
            src.append(loc(p)); dst.append(loc((q[0] + wob, q[1] - abs(wob) * 0.6)))
        maps.append(mls_rigid_inverse(src, dst, w * UP, h * UP))
    for i in range(len(SKIN_TONES)):
        img = tint(base, i, region)
        name = os.path.join(OUT, "held", item) if i == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{i}", f"held-{item}")
        Image.fromarray(img).save(name + ".webp", "WEBP", quality=90, method=6)
        pre = premul(img, UP)
        for k, m in enumerate(maps, 1):
            Image.fromarray(unpremul(warp_all(pre, m), (w, h))).save(f"{name}-f{k}.webp", "WEBP", quality=88, method=6)
    print("held", item, data[item])

ts = "/* Generated by tools/rig/build-held.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** things held in the left hand (HAND slot): the hand with the thing, and its puppet-warp frames */\n"
ts += "export const HELD_FIT: Record<string, { x: number; y: number; w: number; h: number; frames: number }> = " + json.dumps(data, indent=2) + ";\n"
open(os.path.join(ROOT, "src", "client", "art", "held-data.ts"), "w").write(ts)
