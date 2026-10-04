"""
Fits a redrawn variant of a boss (tools/boss/raw/<boss>-<variant>/<part>.png, any canvas size) onto the base rig canvas:
each layer is matched to the same layer of tools/boss/source/<boss>/ (bbox guess refined with OpenCV ECC on the alpha / dark
outlines) and written to tools/boss/source/<boss>-<variant>/<part>.png. Then run build-boss.py.
Usage: python3 tools/boss/align-variant.py datsik-beaten
"""
import os, sys
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
base = name.split("-")[0]
RAW, BASE, OUT = (os.path.join(HERE, "raw", name), os.path.join(HERE, "source", base), os.path.join(HERE, "source", name))
os.makedirs(OUT, exist_ok=True)


def load(f):
    return np.array(Image.open(f).convert("RGBA"))


def feat(a, dark):
    al = a[:, :, 3] > 128
    if dark:  # eyes: the outlines and brows, the painted dirt around them differs between the variants
        return ((a[:, :, :3].astype(int).mean(2) < 90) & al).astype(np.float32)
    return al.astype(np.float32)


def bbox(m):
    n, lab, st, _ = cv2.connectedComponentsWithStats((m > 0.5).astype(np.uint8))
    keep = [i for i in range(1, n) if st[i][4] > 300]
    ys, xs = np.nonzero(np.isin(lab, keep))
    return xs.min(), ys.min(), xs.max(), ys.max()


for f in sorted(os.listdir(RAW)):
    p = os.path.splitext(f)[0]
    src, ref = load(os.path.join(RAW, f)), load(os.path.join(BASE, f))
    H, W = ref.shape[:2]
    dark = p.startswith("eyes")
    o, b = feat(ref, dark), feat(src, dark)
    ob, bb = bbox(o), bbox(b)
    s = (ob[2] - ob[0]) / (bb[2] - bb[0])
    guess = np.array([[s, 0, ob[0] - bb[0] * s], [0, s, ob[1] - bb[1] * s]], np.float32)
    k = 0.25
    o_s = cv2.GaussianBlur(cv2.resize(o, None, fx=k, fy=k), (9, 9), 0)
    b_s = cv2.GaussianBlur(cv2.resize(b, None, fx=k, fy=k), (9, 9), 0)
    g = guess.copy(); g[:, 2] *= k
    cc, inv = cv2.findTransformECC(o_s, b_s, cv2.invertAffineTransform(g).astype(np.float32), cv2.MOTION_AFFINE,
                                   (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    w = cv2.invertAffineTransform(inv); w[:, 2] /= k
    out = cv2.warpAffine(src, w, (W, H), flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0))
    Image.fromarray(out).save(os.path.join(OUT, f))
    print(p, "match", round(cc, 3))
