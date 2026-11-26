"""
The mentors' («Отморозки») pass keys: the artist's one rusty key (tools/items/mentor-key/base.png) recoloured for each
mentor — the metal takes his colour (its light and shade kept: the grey's brightness mapped onto the colour, dark to
light), the rust spots and the outline stay as drawn → public/assets/items/mentor-key-<id>.webp (the item key-<id>,
content/bosses.ts passLook), 256 px like the other items (trimmed, centred on a square).
  python3 tools/items/mentor-keys.py
"""
import colorsys
import numpy as np
from PIL import Image

COLORS = {"pepe": "#3ddc84", "nitka": "#3f7fe0", "himik": "#e6d82c", "psih": "#e8333a"}
base = np.array(Image.open("tools/items/mentor-key/base.png").convert("RGBA")).astype(np.float32) / 255
rgb, a = base[..., :3], base[..., 3]
mx, mn = rgb.max(2), rgb.min(2)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
# the metal: the greys (the rust is orange, saturated); the outline (very dark) stays as it is
metal = np.clip((0.32 - sat) / 0.12, 0, 1) * np.clip((lum - 0.12) / 0.1, 0, 1)
for mid, hexc in COLORS.items():
    c = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
    # the grey's brightness onto the colour: 0 → black, the key's mid grey → the colour, white → white
    l = np.clip((lum - 0.18) / 0.62, 0, 1)[..., None]
    tint = np.where(l < 0.55, c * (0.25 + 0.75 * l / 0.55), c + (1 - c) * (np.maximum(l - 0.55, 0) / 0.45) ** 1.4)
    out = rgb * (1 - metal[..., None]) + tint * metal[..., None]
    im = Image.fromarray((np.dstack([out, a]) * 255).clip(0, 255).astype(np.uint8))
    im = im.crop(im.getbbox())
    side = round(max(im.size) * 1.04)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(f"public/assets/items/mentor-key-{mid}.webp", quality=90, method=6)
    print(mid, "ok")
