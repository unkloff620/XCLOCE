"""
The clan coat of arms (gpt-image-1.5 art, tools/clans/source/shield.png: a gold-rimmed shield with a flat white field):
  public/assets/ui/clan-shield.webp       the rim with the field cut out (256×256)
  public/assets/ui/clan-shield-field.webp the field as a white mask (a little wider, it hides under the rim);
                                          client/art/emblems.tsx paints it in the clan colour
Prints the field box in the 64-unit emblem viewBox (where the symbol goes).
Run from the repo root: python3 tools/clans/build-shield.py
"""
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

im = Image.open("tools/clans/source/shield.png").convert("RGBA")
im = im.crop(im.getbbox())
side = max(im.size)
sq = Image.new("RGBA", (side, side))
sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
a = np.array(sq).astype(int)
white = (a[..., 0] > 200) & (a[..., 1] > 200) & (a[..., 2] > 190) & (a[..., 3] > 200)
# the field: the white area connected to the middle
h, w = white.shape
field = np.zeros_like(white)
q = deque([(h // 2, w // 2)])
while q:
    y, x = q.popleft()
    if 0 <= y < h and 0 <= x < w and white[y, x] and not field[y, x]:
        field[y, x] = True
        q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
fm = Image.fromarray((field * 255).astype("uint8"))
cut = fm.filter(ImageFilter.MaxFilter(5))           # cut a hair wider than the white: no white halo
under = fm.filter(ImageFilter.MaxFilter(15))         # the colour reaches under the rim: no gaps
rim = sq.copy()
alpha = np.array(rim.getchannel("A"))
alpha[np.array(cut) > 0] = 0
rim.putalpha(Image.fromarray(alpha))
S = 256
rim.resize((S, S), Image.LANCZOS).save("public/assets/ui/clan-shield.webp", quality=90, method=6)
mask = Image.new("RGBA", sq.size, (255, 255, 255, 0))
mask.putalpha(under)
mask.resize((S, S), Image.LANCZOS).save("public/assets/ui/clan-shield-field.webp", quality=90, method=6)
ys, xs = np.where(field)
k = 64 / side
print("field box (64 units): x %.1f–%.1f, y %.1f–%.1f" % (xs.min() * k, xs.max() * k, ys.min() * k, ys.max() * k))
