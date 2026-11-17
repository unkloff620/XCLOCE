"""
A boss in another outfit (the zones of «Захват»): the image edit of make-input.py's picture
(tools/boss/outfit/<boss>-<outfit>-high.png) is fitted back onto the boss's sheet (an affine fit of the edit onto the input,
then the square's place on the 1700×1750 sheet), and the clothing layers take its colours inside their OWN outline —
the alpha of every layer stays exactly as drawn, so the rig, the pivots and the poses work unchanged. The head, the
hands, the eyes keep the original. → tools/boss/source/<boss>-<outfit>/ (then: python3 tools/boss/build-boss.py <boss>-<outfit>)
usage: apply-outfit.py <boss> <outfit> <layer> [<layer> …]
"""
import os, sys, json, shutil
import numpy as np, cv2
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "source")
boss, outfit, layers = sys.argv[1], sys.argv[2], set(sys.argv[3:])
meta = json.load(open(os.path.join(HERE, f"{boss}-in.json")))
inp = np.array(Image.open(os.path.join(HERE, f"{boss}-in.png")).convert("RGB"))
ed = np.array(Image.open(os.path.join(HERE, f"{boss}-{outfit}-high.png")).convert("RGB").resize((1024, 1024), Image.LANCZOS))
# fit the edit onto the input: the face and the hands did not change — ECC on the outlines
g = lambda a: cv2.GaussianBlur(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255, (0, 0), 2)
warp = np.eye(2, 3, dtype=np.float32)
try:
    _, warp = cv2.findTransformECC(g(inp), g(ed), warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
except cv2.error as e:
    print("ECC failed, no fit", e)
print("fit", warp.round(3).tolist())
ed = cv2.warpAffine(ed, warp, (1024, 1024), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
# the square → the sheet
W, H = meta["sheet"]; side = meta["side"]
big = cv2.resize(ed, (side, side), interpolation=cv2.INTER_CUBIC)
sheet = np.full((H, W, 3), 255, np.uint8)
ox, oy = meta["ox"], meta["oy"]
sx, sy = max(0, ox), max(0, oy)
ex, ey = min(W, ox + side), min(H, oy + side)
sheet[sy:ey, sx:ex] = big[sy - oy:ey - oy, sx - ox:ex - ox]
# where the edit left background (its clothes a little narrower than the old outline), the nearest cloth colour fills in
light = (sheet.min(2) > 190).astype(np.uint8)
n, lb = cv2.connectedComponents(light, connectivity=4)
edge = set(np.unique(np.r_[lb[0], lb[-1], lb[:, 0], lb[:, -1]])) - {0}
bg = np.isin(lb, list(edge))
bg = cv2.dilate(bg.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0  # its grey fringe too
_, lab = cv2.distanceTransformWithLabels(bg.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
ys, xs = np.nonzero(~bg)
lut = np.zeros((lab.max() + 1, 3), np.uint8); lut[lab[ys, xs]] = sheet[ys, xs]
sheet = np.where(bg[..., None], lut[lab], sheet)
src = os.path.join(SRC, boss); dst = os.path.join(SRC, f"{boss}-{outfit}")
os.makedirs(dst, exist_ok=True)
for f in os.listdir(src):
    p = os.path.join(src, f)
    if not f.endswith(".png") or os.path.isdir(p): continue
    name = f[:-4]
    if name in layers:
        im = np.array(Image.open(p).convert("RGBA"))
        im[:, :, :3] = sheet
        # the layer's own outline: a dark line along its edge, as the artist draws them
        inside = (im[:, :, 3] > 127).astype(np.uint8)
        d = cv2.distanceTransform(inside, cv2.DIST_L2, 5)
        line = (d > 0) & (d < 3.2)
        k = np.clip((3.2 - d) / 1.2, 0, 1)[..., None]
        im[:, :, :3] = np.where(line[..., None], (im[:, :, :3] * (1 - k) + np.array([28, 20, 16]) * k).astype(np.uint8), im[:, :, :3])
        Image.fromarray(im).save(os.path.join(dst, f))
    else:
        shutil.copy(p, os.path.join(dst, f))
print("→", dst)
