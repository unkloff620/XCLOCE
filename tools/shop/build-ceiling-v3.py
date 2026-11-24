"""
The shop's ceiling above the picture (public/assets/shop/v2/ceiling.webp, 1200×900, stands right on the scene's top
edge): the room's ceiling continued upward by an image edit (tools/shop/source/v3/ceiling-gen.png: the top of bg.png
placed at its bottom, rows 922.. of 1536, the rest drawn). Its last rows are evened out to the room's first row, so
there is no seam.
"""
import numpy as np
from PIL import Image

gen = Image.open("tools/shop/source/v3/ceiling-gen.png").convert("RGB")
SEAM = 922                                   # the first row of the room in the generated picture (of 1536, 1024 wide)
up = gen.crop((0, 0, 1024, SEAM)).resize((1200, round(SEAM * 1200 / 1024)), Image.LANCZOS)
up = np.asarray(up).astype(np.float32)[-900:]
room = np.asarray(Image.open("tools/shop/source/v3/bg.png").convert("RGB").resize((1200, 1800), Image.LANCZOS)).astype(np.float32)
# the colour step at the seam: the generated rows near it are shifted toward the room's top rows, fading out upward
diff = room[:6].mean(0) - up[-6:].mean(0)
diff = np.stack([np.convolve(diff[:, k], np.ones(41) / 41, mode="same") for k in range(3)], 1)
fade = np.clip(1 - (np.arange(900)[::-1] / 160), 0, 1)[:, None, None]
up = up + diff[None] * fade
Image.fromarray(np.clip(up, 0, 255).astype(np.uint8)).save("public/assets/shop/v2/ceiling.webp", quality=82, method=6)
print("ceiling ok")
