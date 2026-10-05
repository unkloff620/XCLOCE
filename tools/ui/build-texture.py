"""
UI grain: turns a seamless texture into a detail layer around 50% grey for `background-blend-mode: overlay`.
Over the brown panels it keeps their colour (and any accent gradients) and only adds the scratches, rust and grain.
Input: public/assets/textures/<name>.webp (seamless). Output: public/assets/ui/tex-grain-a.webp (512 px, still seamless).
The grey detail layer is then baked into a see-through picture (black specks + rusty light ones) that gives the same
look on the panel colour with plain alpha — iPhone's WebView did not apply the overlay blend, the UI came out pale.
STRENGTH: how much of the texture's contrast survives (1 = all of it); WARMTH: how much of its colour.
"""
import sys
import numpy as np
from PIL import Image

NAME = sys.argv[1] if len(sys.argv) > 1 else "rust-metal"
STRENGTH = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
WARMTH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5

img = np.asarray(Image.open(f"public/assets/textures/{NAME}.webp").convert("RGB")).astype(np.float32) / 255
lum = img @ np.array([0.299, 0.587, 0.114], np.float32)
col = img - lum[:, :, None]  # the colour part (rust orange)
d = (lum - lum.mean()) / (lum.std() + 1e-6) * 0.11  # normalised light/dark detail
out = 0.5 + d[:, :, None] * STRENGTH + col * WARMTH
out = np.clip(out, 0, 1)
t = np.asarray(Image.fromarray((out * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS)).astype(np.float32) / 255
b = np.array([0x2A, 0x1D, 0x14]) / 255  # the panel colour (--panel) the look is matched on
want = 2 * b * t  # what the overlay blend gave on a dark base
dark = want.mean(axis=2) < b.mean()
a_d = np.clip(1 - want.mean(axis=2) / b.mean(), 0, 1)
a_l = np.clip((t.mean(axis=2) - 0.5) * 0.9, 0.02, 1)
c_l = np.clip(b + (want - b) / a_l[:, :, None], 0, 1)
a = np.where(dark, a_d, a_l)
col = np.where(dark[:, :, None], 0, c_l)
Image.fromarray((np.dstack([col, a]) * 255).round().astype(np.uint8), "RGBA").save("public/assets/ui/tex-grain-a.webp", quality=88, method=6)
print("tex-grain-a from", NAME)
