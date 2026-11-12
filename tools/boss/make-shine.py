"""
The crowbar's glint masks (src/client/art/glint.tsx): white where the bare metal shows, transparent elsewhere — the gleam
band is drawn only there. The metal is told by colour: grey, not the black glove that grips it. Also prints the brightest
point near the bar's straight end (where the light flashes), in the picture's own pixels.
  public/bosses/botsman/rig/handL.webp            → public/bosses/botsman/rig/handL-shine.webp (Боцман's fist with the crowbar)
  public/assets/hero/held/gloves-botsman-crowbar.webp → …-crowbar-shine.webp (the hero's crowbar, «Перчатки Боцмана»)
"""
import numpy as np, cv2
from PIL import Image

for src, dst in [("public/bosses/botsman/rig/handL.webp", "public/bosses/botsman/rig/handL-shine.webp"),
                 ("public/assets/hero/held/gloves-botsman-crowbar.webp", "public/assets/hero/held/gloves-botsman-crowbar-shine.webp")]:
    im = np.array(Image.open(src).convert("RGBA"))
    hsv = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2HSV)
    metal = (im[..., 3] > 150) & (hsv[..., 2] > 62) & (hsv[..., 1] < 70)
    metal = cv2.morphologyEx(metal.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(metal)
    keep = np.zeros_like(metal)
    for i in range(1, n):
        if st[i][4] > 30: keep[lab == i] = 1
    a = cv2.GaussianBlur((keep * 255).astype(np.uint8), (3, 3), 0)
    out = np.dstack([np.full_like(a, 255)] * 3 + [a])
    Image.fromarray(out).save(dst, "WEBP", quality=90, lossless=True)
    v = np.where(keep > 0, hsv[..., 2], 0).astype(np.float32)
    v = cv2.GaussianBlur(v, (7, 7), 0)
    y, x = np.unravel_index(np.argmax(v), v.shape)
    print(dst, im.shape[1], im.shape[0], "brightest", x, y, "metal px", int(keep.sum()))
