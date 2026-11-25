"""
The hero seen from behind (the wardrobe's turned view, the user 2026-11-26): the artist's back hero
(tools/rig/source/tattoo/_back/hero.png, 2000×2800, the hero's canvas) → public/assets/hero/back.webp (1000×1400, the rig)
and its skin tones public/assets/hero/skin-<n>/back.webp, recoloured like every other part (build-look.py).
"""
import os
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "hero")
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]
SKIN_ORIGINAL = 1


def lab(rgb):
    return cv2.cvtColor(rgb.astype(np.float32) / 255, cv2.COLOR_RGB2LAB)


def rgb(lab_):
    return (np.clip(cv2.cvtColor(lab_.astype(np.float32), cv2.COLOR_LAB2RGB), 0, 1) * 255 + 0.5).astype(np.uint8)


def hex_lab(h):
    return lab(np.array([[[int(h[i:i + 2], 16) for i in (1, 3, 5)]]], np.uint8))[0, 0]


def skin_weight(im):
    hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1)
    w *= np.clip((S - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1)
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]


base = np.array(Image.open(os.path.join(ROOT, "tools", "rig", "source", "tattoo", "_back", "hero.png")).convert("RGBA").resize((1000, 1400), Image.LANCZOS))
Image.fromarray(base).save(os.path.join(OUT, "back.webp"), "WEBP", quality=90, method=6)
L, w, ref = lab(base[:, :, :3]), skin_weight(base), hex_lab(SKIN_TONES[SKIN_ORIGINAL])
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
    os.makedirs(os.path.join(OUT, f"skin-{i}"), exist_ok=True)
    Image.fromarray(out).save(os.path.join(OUT, f"skin-{i}", "back.webp"), "WEBP", quality=90, method=6)
print("back hero + skin tones")
