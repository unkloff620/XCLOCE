"""
The feet were redrawn shorter (tools/rig/source/v2/legs.png; the old ones: pieces-old/legs-v1.png): every shoe drawn on
the old feet (tools/rig/source/wear/v1/<id>-longfeet.png) is bent onto the new ones — per foot, the affine that takes the
old foot onto the new one (fitted on the silhouettes), eased in from the ankle down so the shoe's collar stays in place.
Writes tools/rig/source/wear/<id>.png; run build-look.py after.
"""
import os, sys
import numpy as np, cv2
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(HERE, "source", "v2"); WEAR = os.path.join(HERE, "source", "wear")
o = (np.array(Image.open(os.path.join(S, "pieces-old", "legs-v1.png")).convert("RGBA"))[..., 3] > 128).astype(np.float32)
n = (np.array(Image.open(os.path.join(S, "legs.png")).convert("RGBA"))[..., 3] > 128).astype(np.float32)
Y0, Y1, YA, YB = 2300, 2800, 2180, 2420  # the foot box; the warp eases in from YA to YB
H, Wd = o.shape
yy, xx = np.mgrid[0:H, 0:Wd].astype(np.float32)
mapx, mapy = xx.copy(), yy.copy()
for x0, x1 in ((0, 1000), (1000, 2000)):
    a = cv2.GaussianBlur(o[Y0:Y1, x0:x1], (0, 0), 4); b = cv2.GaussianBlur(n[Y0:Y1, x0:x1], (0, 0), 4)
    _, M = cv2.findTransformECC(b, a, np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    cx, cy = xx[:, x0:x1] - x0, yy[:, x0:x1] - Y0
    sx = M[0, 0] * cx + M[0, 1] * cy + M[0, 2] + x0
    sy = M[1, 0] * cx + M[1, 1] * cy + M[1, 2] + Y0
    w = np.clip((yy[:, x0:x1] - YA) / (YB - YA), 0, 1); w = w * w * (3 - 2 * w)
    mapx[:, x0:x1] = xx[:, x0:x1] * (1 - w) + sx * w
    mapy[:, x0:x1] = yy[:, x0:x1] * (1 - w) + sy * w
for item in sys.argv[1:]:
    src = np.array(Image.open(os.path.join(WEAR, "v1", f"{item}-longfeet.png")).convert("RGBA"))
    pad = src.shape[0] - H  # a canvas taller than the rig's has extra room on top
    body = src[pad:]
    pm = cv2.cvtColor(body, cv2.COLOR_RGBA2mRGBA)
    out = cv2.remap(pm, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out = cv2.cvtColor(out, cv2.COLOR_mRGBA2RGBA)
    full = src.copy(); full[pad:] = out
    Image.fromarray(full).save(os.path.join(WEAR, f"{item}.png")); print(item, "fitted")
