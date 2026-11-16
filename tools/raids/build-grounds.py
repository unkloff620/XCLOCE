"""
The bigger yards' ground (content/raids.ts groundH): yard-ground2.webp with its band of three places repeated —
the picture's upper half, the band k more times, its lower half (k = n − 1 for yard n), the joins feathered.
  python3 tools/raids/build-grounds.py   → public/assets/raids/yard-ground-<n>.webp (n = 2…5)
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
A = os.path.join(ROOT, "public", "assets", "raids")
BAND_Y, BAND_H, FEATHER = 768, 246, 40
src = np.array(Image.open(os.path.join(A, "yard-ground2.webp")).convert("RGB")).astype(np.float32)
H, W = src.shape[:2]
top, band, bottom = src[:BAND_Y], src[BAND_Y:BAND_Y + BAND_H], src[BAND_Y:]


def stack(parts):
    """the pieces one under another; each join is a soft blend over FEATHER px (the piece below fades in)"""
    out = parts[0]
    for p in parts[1:]:
        # the lower piece is laid over the upper one's last rows: take FEATHER rows more from the source above it
        ramp = np.linspace(0, 1, FEATHER)[:, None, None]
        # blend the upper piece's bottom rows with the rows of the source that sit just above the lower piece
        lead = src[BAND_Y - FEATHER:BAND_Y]
        out[-FEATHER:] = out[-FEATHER:] * (1 - ramp) + lead * ramp
        out = np.concatenate([out, p], 0)
    return out


for n in range(2, 6):
    k = n - 1
    img = stack([top.copy()] + [band.copy() for _ in range(k)] + [bottom.copy()])
    assert img.shape[0] == H + k * BAND_H, img.shape
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(A, f"yard-ground-{n}.webp"), "WEBP", quality=82)
    print(n, img.shape)
