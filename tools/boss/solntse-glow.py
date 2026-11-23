"""
Солнце's lava side glows (the user 2026-11-23): from the rig sources (tools/boss/source/solntse/<part>.png, after
assemble-solntse.py) the bright cracks of the lava half — bright orange among dark scales — are taken out of the right
(lava) arm, the forearm, the lava half of the trunk and the right pec, and the left leg's rips, softened into a glow:
<part>-glow.png beside them (the same canvas). boss-sun.tsx draws them over their parts, pulsing (screens.css).
"""
import numpy as np, cv2
from PIL import Image

D = "tools/boss/source/solntse"
# the lava side only: x limit on the 1920-wide crop (the yellow side starts right of it)
PARTS = {"armR": None, "lowR": None, "body": 760, "chestR": 840, "legs": 860}
for p, xmax in PARTS.items():
    a = np.array(Image.open(f"{D}/{p}.png").convert("RGBA")).astype(np.int32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    # the lava: bright and very saturated orange-yellow (not the brown cloth, not the steel buckles)
    hot = (r > 225) & (g > 95) & (r - b > 150) & (g - b > 45) & (al > 128)
    # among dark scales or cloth (the yellow skin side has none around)
    dark = ((lum < 100) & (al > 128)).astype(np.float32)
    near = cv2.blur(dark, (31, 31))
    crack = hot & (near > 0.14)
    crack = cv2.morphologyEx(crack.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)).astype(bool)
    if xmax:
        crack[:, xmax:] = False
    m = crack.astype(np.float32)
    core = cv2.GaussianBlur(m, (0, 0), 1.5)
    halo = cv2.GaussianBlur(m, (0, 0), 14.0)
    # the core inside the part, the halo spills a little past its outline (the heat in the air)
    inside = cv2.GaussianBlur((al > 0).astype(np.float32), (0, 0), 6)
    k = np.clip(core * 1.2 * (al > 0) + halo * 2.6 * np.clip(inside * 1.6, 0, 1), 0, 1)
    out = np.zeros(a.shape, np.uint8)
    out[..., 0] = 255
    out[..., 1] = np.clip(110 + 140 * np.clip(core * 1.5, 0, 1), 0, 255).astype(np.uint8)
    out[..., 2] = np.clip(40 + 80 * core.clip(0, 1), 0, 255).astype(np.uint8)
    out[..., 3] = (k * 235).astype(np.uint8)
    Image.fromarray(out).save(f"{D}/{p}-glow.png")
    print(p, int(crack.sum()))
