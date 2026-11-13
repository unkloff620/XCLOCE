"""
«Кружка с монетой» (mug-coin): the generated picture of the hand with the mug (source/held/mug-coin-gen.png, gpt-image,
on white) placed on the 2000×2800 rig canvas in place of handR → source/held/mug-coin.png (then build-held.py).
The white is cut away, the picture is turned and scaled so the wrist stub lies along the forearm, its skin is matched
to the hero's, and the stub's cut end fades out over the forearm (no seam line across the wrist).
"""
import os, sys
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "held")
CAP = ((785, 165), (996, 262))   # the stub's cut end in the generated picture (its two corners)
ANGLE = float(os.environ.get("MUG_ANGLE", 15))   # turn (deg, clockwise) so the stub follows the forearm
SCALE = float(os.environ.get("MUG_SCALE", 0.47))
AT = (float(os.environ.get("MUG_X", 1522)), float(os.environ.get("MUG_Y", 1452)))  # where the cap's middle lands
FADE = 46                         # px (generated picture) the stub fades over, from its cut end
HERO_SKIN = np.array([255, 181, 122], np.float32)

im = np.array(Image.open(os.path.join(SRC, "mug-coin-gen.png")).convert("RGB"))
H, W = im.shape[:2]
# the white around it: what is near-white and joined to the corners
wh = (im.min(2) > 232).astype(np.uint8)
_, lab = cv2.connectedComponents(wh)
bg = np.isin(lab, [lab[0, 0], lab[0, -1], lab[-1, 0], lab[-1, -1]])
a = (~bg).astype(np.float32)
a = cv2.GaussianBlur(cv2.erode(a, np.ones((2, 2), np.uint8)), (3, 3), 0)

# the skin: match its average to the hero's
hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV)
skin = (hsv[:, :, 0] < 25) & (hsv[:, :, 1] > 60) & (hsv[:, :, 1] < 190) & (hsv[:, :, 2] > 150) & (a > 0.9)
skin[:, :520] = False  # the mug's gold coin is on the left
mean = im[skin].astype(np.float32).mean(0)
rgb = im.astype(np.float32)
w = cv2.GaussianBlur(skin.astype(np.float32), (5, 5), 0)[..., None]
rgb = np.clip(rgb * (1 - w) + rgb * (HERO_SKIN / mean) * w, 0, 255)
print("skin", mean.round(), "→", HERO_SKIN)

# fade the stub's cut end: distance from the cap line, inwards
(cx0, cy0), (cx1, cy1) = CAP
nx, ny = cy1 - cy0, -(cx1 - cx0)
n = np.hypot(nx, ny); nx, ny = nx / n, ny / n
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
d = (xx - cx0) * nx + (yy - cy0) * ny
if d[700, 300] < 0: d = -d   # inwards = towards the mug
a *= np.clip((d - 6) / FADE, 0, 1)

rgba = np.dstack([rgb, a * 255]).astype(np.float32)
# premultiply for a clean warp
pm = rgba.copy(); pm[:, :, :3] *= a[..., None]
mid = ((cx0 + cx1) / 2, (cy0 + cy1) / 2)
M = cv2.getRotationMatrix2D(mid, -ANGLE, SCALE)
M[0, 2] += AT[0] - mid[0]; M[1, 2] += AT[1] - mid[1]
out = cv2.warpAffine(pm, M, (2000, 2800), flags=cv2.INTER_AREA if SCALE < 1 else cv2.INTER_LINEAR, borderValue=0)
al = out[:, :, 3:4] / 255
out[:, :, :3] = np.where(al > 0, out[:, :, :3] / np.maximum(al, 1e-6), 0)
Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(SRC, "mug-coin.png"))
print("ok", Image.open(os.path.join(SRC, "mug-coin.png")).getbbox())

# the item's icon: the whole picture, cut out, as generated (tools/items/build-items.py trims and squares it)
ic = np.dstack([im, ((~bg).astype(np.float32) * 255).astype(np.uint8)])
Image.fromarray(ic).save(os.path.join(HERE, "..", "items", "source", "mug-coin.png"))
