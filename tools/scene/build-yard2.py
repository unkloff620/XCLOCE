"""The second half of the yard (swipe left in the yard): outpainted from the yard picture to the right in two steps
(gpt-image-2 with a mask, the sky and the puddles kept flat magenta), and its night copy:
tools/scene/source/court2-{day,night}.png → public/assets/yard/yard2-bg.webp, yard2-bg-dark.webp (1200×2043, the sky and the
puddles see-through, like court-night.webp / court-dark.webp)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "yard"))
SIZE = (1200, 2043)


def key_magenta(src: Image.Image) -> Image.Image:
    a = np.asarray(src.convert("RGB").resize(SIZE, Image.LANCZOS), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.clip(((r + b) / 2 - g - 70) / 70, 0, 1) * np.clip((np.minimum(r, b) - 100) / 60, 0, 1)
    near = ndimage.binary_dilation(mag > 0.15, iterations=4)
    alpha = (1 - mag) * 255
    alpha[ndimage.binary_dilation(mag > 0.5, iterations=1)] = 0
    out = a.copy()
    cast = np.clip((np.minimum(r, b) - g) / 60, 0, 1) * near
    out[..., 0] = r - (r - np.minimum(r, g + 25)) * cast
    out[..., 2] = b - (b - np.minimum(b, g + 45)) * cast
    return Image.fromarray(np.dstack([out.clip(0, 255), alpha.clip(0, 255)]).astype(np.uint8), "RGBA")


for src, dst in (("court2-day.png", "yard2-bg.webp"), ("court2-night.png", "yard2-bg-dark.webp")):
    key_magenta(Image.open(os.path.join(SRC, src))).save(os.path.join(OUT, dst), "WEBP", quality=80, method=4)
    print(dst, os.path.getsize(os.path.join(OUT, dst)) // 1024, "KB")

# the exchange kiosk: its own object over the yard (a button), day and night (gpt-image-1.5, transparent)
for src, dst in (("court2-kiosk.png", "yard2-kiosk.webp"), ("court2-kiosk-night.png", "yard2-kiosk-dark.webp")):
    k = Image.open(os.path.join(SRC, src)).convert("RGBA")
    k = k.crop(k.split()[3].point(lambda v: 255 if v > 16 else 0).getbbox())
    k = k.resize((420, round(k.height * 420 / k.width)), Image.LANCZOS)
    k.save(os.path.join(OUT, dst), "WEBP", quality=84, method=6)
    print(dst, k.size)
