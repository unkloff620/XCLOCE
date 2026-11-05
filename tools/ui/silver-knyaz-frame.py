"""
Князь's boss card in silver: the gold plate in chains with gold bars (tools/ui/boss-card-frame-knyaz-gold.webp, kept as the
source) recoloured in LAB — the colour taken out to a faint cool tint, the lightness kept with a little more contrast
(the shine of the metal) → public/assets/ui/boss-card-frame-knyaz.webp. The glint over it is silver too (screens.css).
"""
import os
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
src = Image.open(os.path.join(ROOT, "tools", "ui", "boss-card-frame-knyaz-gold.webp")).convert("RGBA")
a = np.array(src)
rgb = a[:, :, :3].astype(np.float32) / 255
lab = cv2.cvtColor(rgb.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)
L = lab[:, :, 0]
# a little more contrast round the middle grey: polished silver, not flat grey
L2 = np.clip(50 + (L - 50) * 1.12 + 4, 0, 100)
lab[:, :, 0] = L2
lab[:, :, 1] = lab[:, :, 1] * 0.06 - 0.5
lab[:, :, 2] = lab[:, :, 2] * 0.06 - 4.5
out = cv2.cvtColor(lab.reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(rgb.shape)
a[:, :, :3] = np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)
Image.fromarray(a).save(os.path.join(ROOT, "public", "assets", "ui", "boss-card-frame-knyaz.webp"), "WEBP", quality=90, method=6)
print("silver frame", src.size)
