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

S = 256
for f in sorted(glob.glob("tools/clans/source/shield-*.png")):
    style = os.path.basename(f)[7:-4]
    im = Image.open(f).convert("RGBA")
    im = im.crop(im.getbbox())
    side = round(max(im.size) * 1.02)
    sq = Image.new("RGBA", (side, side))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    a = np.array(sq).astype(int)
    # the field: white or see-through pixels joined to the middle, walled in by the rim
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
    # the symbol: the biggest square that sits in the field (checked on a coarse grid)
    k = 64 / side
    ys, xs = np.where(field)
    best = (0, 0, 0)
    small = np.array(fm.resize((128, 128)))
    ok = small > 128
    for s in range(100, 20, -2):
        found = None
        for y in range(0, 128 - s):
            for x in range(0, 128 - s):
                if ok[y, x] and ok[y, x + s - 1] and ok[y + s - 1, x] and ok[y + s - 1, x + s - 1] and ok[y + s // 2, x] and ok[y + s // 2, x + s - 1] and ok[y + s - 1, x + s // 2]:
                    # prefer the most central spot
                    d = abs(x + s / 2 - 64)
                    if found is None or d < found[2]:
                        found = (x, y, d)
            if found and found[2] < 3:
                break
        if found and found[2] < 3:
            best = (found[0], found[1], s)
            break
    bx, by, bs = (v * 64 / 128 for v in best)
    print(f'  {style}: {{ x: {bx + 1:.1f}, y: {by + 1:.1f}, s: {bs - 2:.1f} }},')
