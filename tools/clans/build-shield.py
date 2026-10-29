"""
The clan coats of arms (gpt-image-1.5 art, tools/clans/source/shield-<style>.png: a shield with a flat white or an empty field):
  public/assets/ui/clan-shield-<style>.webp        the rim with the field cut out (256×256)
  public/assets/ui/clan-shield-<style>-field.webp  the field as a white mask (a little wider, it hides under the rim);
                                                   client/art/emblems.tsx paints it in the clan colour
Prints, per style, the box for the symbol in the 64-unit emblem viewBox (copy it into SHIELDS in emblems.tsx).
Run from the repo root: python3 tools/clans/build-shield.py
"""
import glob, os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

S = 256


def find_field(sq, style):
    """the field: white or see-through pixels joined to the middle, walled in by the rim"""
    a = np.array(sq).astype(int)
    open_px = ((a[..., 0] > 200) & (a[..., 1] > 200) & (a[..., 2] > 190)) | (a[..., 3] < 60)
    h, w = open_px.shape
    field = np.zeros_like(open_px)
    q = deque([(int(h * 0.48), w // 2)])
    while q:
        y, x = q.popleft()
        if not (0 <= y < h and 0 <= x < w):
            raise SystemExit(f"{style}: the field leaks out of the rim")
        if open_px[y, x] and not field[y, x]:
            field[y, x] = True
            q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    return field


for f in sorted(glob.glob("tools/clans/source/shield-*.png")):
    style = os.path.basename(f)[7:-4]
    im = Image.open(f).convert("RGBA")
    im = im.crop(im.getbbox())
    side, dx = round(max(im.size) * 1.08), 0
    for _ in range(2):  # the second pass: a tight square with the field in the middle
        sq = Image.new("RGBA", (side, side))
        sq.alpha_composite(im, ((side - im.width) // 2 + dx, (side - im.height) // 2))
        field = find_field(sq, style)
        xs = np.where(field.any(0))[0]
        shift = round(side / 2 - (xs.min() + xs.max()) / 2)
        dx += shift
        side = max(im.size) + 2 * abs(dx) + 6
    fm = Image.fromarray((field * 255).astype("uint8"))
    cut = fm.filter(ImageFilter.MaxFilter(5))      # a hair wider than the white: no white halo
    under = fm.filter(ImageFilter.MaxFilter(15))    # the colour reaches under the rim: no gaps
    rim = sq.copy()
    alpha = np.array(rim.getchannel("A"))
    alpha[np.array(cut) > 0] = 0
    rim.putalpha(Image.fromarray(alpha))
    rim.resize((S, S), Image.LANCZOS).save(f"public/assets/ui/clan-shield-{style}.webp", quality=90, method=6)
    mask = Image.new("RGBA", sq.size, (255, 255, 255, 0))
    mask.putalpha(under)
    mask.resize((S, S), Image.LANCZOS).save(f"public/assets/ui/clan-shield-{style}-field.webp", quality=90, method=6)
    # the symbol: centred on the deepest point of the field (distance transform), sized by that depth
    fa = np.array(mask.resize((S, S), Image.LANCZOS).getchannel("A")) > 128
    fa = ndimage.binary_erosion(fa, iterations=3)     # undo the widening under the rim
    d = ndimage.distance_transform_edt(fa)
    yy, _ = np.unravel_index(d.argmax(), d.shape)
    k = 64 / S
    print(f'  {style}: {{ cy: {yy * k:.1f}, r: {d.max() * k:.1f} }},')
