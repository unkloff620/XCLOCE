"""
Bakes the appearance variants of the rig (run after build-rig.py):
  * hair: tools/rig/source/hair-<style>.png (1254×1254 template canvas) → fitted onto the head, recolored to every
    HAIR_COLORS entry → public/assets/hero/hair/<style>-<n>.webp + HAIR_FIT in src/client/art/rig-look.ts
  * clothes: tools/rig/source/wear/<item-id>.png (drawn on the 2000×2800 rig canvas, in place)
    → public/assets/hero/wear/<item-id>.webp + WEAR_FIT; hats also get hair variants cut under the brim
    (public/assets/hero/hair/<style>-<n>-<hat>.webp)
  * skin: every skin-colored pixel of the body parts recolored to every SKIN_TONES entry
    → public/assets/hero/skin-<n>/<part>.webp (tone 1 is the original art: plain public/assets/hero/<part>.webp)
Recoloring is done in LAB: hue/chroma move to the target, lightness keeps the artist's shading; black outlines stay.
Keep the color lists in sync with src/content/home.ts.
"""
import os, json
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source")
OUT = os.path.join(ROOT, "public", "assets", "hero")
RIG_SCALE = 0.5
HAIR_STYLES = ["sidepart", "slick", "shaggy", "spiky"]
HAIR_FIT = (0.46, 751.6, 40)  # template → 2000×2800 source canvas of the v1 head: scale, x, y (fitted by eye)
# v1 head → v2 head on the same canvas (OpenCV ECC on the head silhouettes); hair is moved with the head
HEAD_WARP = np.array([[1.03917, 0.00046, -78.873], [0.00242, 1.02046, -74.156]], np.float32)
HAIR_COLORS = ["#4a2c1a", "#1d1a24", "#c9822f", "#f0d27a", "#b8401f", "#8d6bff", "#3fd2ff", "#e8e8f0"]
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]
SKIN_ORIGINAL = 1
PARTS = ["torso", "head", "armUL", "armUR", "foreL", "foreR", "eyes"]  # parts with skin (the eyelids too)


def lab(rgb):  # uint8 rgb (..., 3) → float LAB (L 0..100)
    return cv2.cvtColor((rgb.astype(np.float32) / 255).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)


def rgb(lab_):
    out = cv2.cvtColor(lab_.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(lab_.shape)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def hex_lab(h):
    return lab(np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]], np.uint8))[0]


def save(im, path, q=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(im).save(path, "WEBP", quality=q, method=4)


# ---------------- hair ----------------
def hair_recolor(im, target, ref):
    L = lab(im[:, :, :3])
    t = hex_lab(target)
    w = np.clip((L[:, :, 0] - 12) / 18, 0, 1)[..., None]  # 0 on the black outline, 1 on the hair body
    new = L.copy()
    # keep the shading contrast, a little softer on very light colors so they don't burn out
    k = 1.0 if t[0] < 70 else 0.75
    new[:, :, 0] = np.clip(t[0] + (L[:, :, 0] - ref[0]) * k, 0, 100)
    new[:, :, 1] = t[1] + (L[:, :, 1] - ref[1]) * 0.5
    new[:, :, 2] = t[2] + (L[:, :, 2] - ref[2]) * 0.5
    out = im.copy()
    out[:, :, :3] = rgb(L * (1 - w) + new * w)
    return out


# ---------------- clothes ----------------
# clothes were drawn for the v1 body (tools/rig/source/wear); they come back once redrawn for the v2 body
WEAR_SLOT = {}
wear, hat_alpha = {}, {}
for item, slot in WEAR_SLOT.items():
    a = np.array(Image.open(os.path.join(SRC, "wear", item + ".png")).convert("RGBA"))
    al = a[:, :, 3]
    al[al < 40] = 0
    n, lab_, st, _ = cv2.connectedComponentsWithStats((al > 0).astype(np.uint8))
    for i in range(1, n):
        if st[i][4] < 400: al[lab_ == i] = 0
    a[al == 0, :3] = 0
    ys, xs = np.nonzero(al)
    x0, y0, x1, y1 = xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5
    w, h = round((x1 - x0) * RIG_SCALE), round((y1 - y0) * RIG_SCALE)
    save(np.array(Image.fromarray(a[y0:y1, x0:x1]).resize((w, h), Image.LANCZOS)), os.path.join(OUT, "wear", item + ".webp"), 90)
    wear[item] = {"slot": slot, "x": round(x0 * RIG_SCALE, 1), "y": round(y0 * RIG_SCALE, 1), "w": w, "h": h}
    if slot == "HEAD":
        hat_alpha[item] = al > 128
    print("wear", item, wear[item])


def under_hat(small, fx, fy, f, mask):
    """keep only the hair below the hat: per column, below the lowest hat pixel (columns past the hat: below its brim)"""
    cols = mask.any(axis=0)
    bottom = np.where(cols, mask.shape[0] - 1 - np.argmax(mask[::-1], axis=0), 0)
    brim = bottom[cols].max()
    out = small.copy()
    hh, ww = small.shape[:2]
    for i in range(ww):
        sx = int(round((fx + i) / RIG_SCALE))  # source-canvas column
        cut = bottom[sx] if 0 <= sx < mask.shape[1] and cols[sx] else brim
        cut_rig = cut * RIG_SCALE - 6  # a few px of overlap under the hat edge
        j0 = int(np.clip(np.ceil(cut_rig - fy), 0, hh))
        out[:j0, i] = 0
    return out


s, tx, ty = HAIR_FIT
fit = {}
for style in HAIR_STYLES:
    im = Image.open(os.path.join(SRC, f"hair-{style}.png")).convert("RGBA")
    a = np.array(im)
    a[a[:, :, 3] < 30] = 0
    ys, xs = np.nonzero(a[:, :, 3])
    x0, y0, x1, y1 = xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7
    # template → v1 canvas → v2 head (HEAD_WARP) → half-size rig canvas, then trimmed
    T = np.array([[s, 0, tx], [0, s, ty], [0, 0, 1]], np.float32)
    M = (RIG_SCALE * (np.vstack([HEAD_WARP, [0, 0, 1]]) @ T))[:2].astype(np.float32)
    PAD = 120  # hair may rise above the top of the rig canvas
    M[1, 2] += PAD
    full = cv2.warpAffine(a, M, (1000, 1400 + PAD), flags=cv2.INTER_AREA, borderValue=(0, 0, 0, 0))
    ys2, xs2 = np.nonzero(full[:, :, 3] > 8)
    X0, Y0, X1, Y1 = max(0, xs2.min() - 2), max(0, ys2.min() - 2), xs2.max() + 3, ys2.max() + 3
    small = np.ascontiguousarray(full[Y0:Y1, X0:X1])
    f = s * RIG_SCALE
    w, h = small.shape[1], small.shape[0]
    fit[style] = {"x": float(X0), "y": float(Y0 - PAD), "w": int(w), "h": int(h)}
    body = small[:, :, 3] > 200
    Lb = lab(small[:, :, :3])[body]
    ref = np.median(Lb[Lb[:, 0] > 30], axis=0)
    for i, c in enumerate(HAIR_COLORS):
        col = hair_recolor(small, c, ref)
        save(col, os.path.join(OUT, "hair", f"{style}-{i}.webp"))
        for hat, mask in hat_alpha.items():
            save(under_hat(col, fit[style]["x"], fit[style]["y"], f, mask), os.path.join(OUT, "hair", f"{style}-{i}-{hat}.webp"))
    print("hair", style, fit[style])

# ---------------- skin ----------------
def skin_weight(im):
    hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1)  # hue 4..24 (OpenCV half-degrees)
    w *= np.clip((S - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1)
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]


ref = hex_lab(SKIN_TONES[SKIN_ORIGINAL])
for part in PARTS:
    base = np.array(Image.open(os.path.join(OUT, part + ".webp")).convert("RGBA"))
    L = lab(base[:, :, :3])
    w = skin_weight(base)
    for i, c in enumerate(SKIN_TONES):
        if i == SKIN_ORIGINAL:
            continue
        t = hex_lab(c)
        new = L.copy()
        new[:, :, 0] = np.clip(L[:, :, 0] * (t[0] / ref[0]), 0, 100)
        new[:, :, 1] = L[:, :, 1] + (t[1] - ref[1])
        new[:, :, 2] = L[:, :, 2] + (t[2] - ref[2])
        out = base.copy()
        out[:, :, :3] = rgb(L * (1 - w) + new * w)
        save(out, os.path.join(OUT, f"skin-{i}", part + ".webp"), 90)
print("skin tones", len(SKIN_TONES) - 1, "×", len(PARTS))

ts = "/* Generated by tools/rig/build-look.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "export const HAIR_FIT = " + json.dumps(fit, indent=2) + " as const;\n"
ts += "/** worn clothes drawn on the rig; hats in this list also have hair variants cut under them */\n"
ts += "export const WEAR_FIT = " + json.dumps(wear, indent=2) + " as const;\n"
ts += f"export const SKIN_ORIGINAL = {SKIN_ORIGINAL};\n"
open(os.path.join(ROOT, "src", "client", "art", "rig-look.ts"), "w").write(ts)
