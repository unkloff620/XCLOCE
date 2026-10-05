"""
UI grain: turns a seamless texture into a detail layer around 50% grey for `background-blend-mode: overlay`.
Over the brown panels it keeps their colour (and any accent gradients) and only adds the scratches, rust and grain.
Input: public/assets/textures/<name>.webp (seamless). Output: public/assets/ui/tex-grain.webp (512 px, still seamless).
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
Image.fromarray((out * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save("public/assets/ui/tex-grain.webp", quality=85, method=6)
print("tex-grain from", NAME, "mean", float(out.mean()))
