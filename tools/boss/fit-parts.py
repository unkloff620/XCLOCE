"""
Places loose boss parts (each drawn on its own sheet at its own scale) onto the assembled reference picture.
Input: tools/boss/source/<boss>/raw/{reference,<part>}.png and a plan: part → search window in the reference
(x0, y0, x1, y1) and scale range. Masked template matching, coarse then fine. Fits are merged into raw/fit.json:
reference = sheet * s + (tx, ty).
Usage: python3 tools/boss/fit-parts.py <boss> '<json plan>'
"""
import sys, json, os
import numpy as np
import cv2
from PIL import Image

boss, plan = sys.argv[1], json.loads(sys.argv[2])
D = f"tools/boss/source/{boss}/raw"

def load(n):
    a = np.array(Image.open(f"{D}/{n}.png").convert("RGBA")).astype(np.float32)
    al = a[:, :, 3:] / 255
    return a[:, :, :3] * al + 128 * (1 - al), a[:, :, 3]

ref, _ = load("reference")

def match(win, tpl, m):
    if tpl.shape[0] >= win.shape[0] or tpl.shape[1] >= win.shape[1] or min(tpl.shape[:2]) < 4:
        return None
    r = cv2.matchTemplate(win, tpl, cv2.TM_SQDIFF, mask=m)
    r = np.where(np.isfinite(r), r, np.inf)
    v, _, loc, _ = cv2.minMaxLoc(r)
    return v / max(1.0, float(m.sum())), loc

def search(c, mask, X0, Y0, X1, Y1, scales, k):
    win = cv2.resize(ref[Y0:Y1, X0:X1], None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    best = None
    for s in scales:
        t = cv2.resize(c, None, fx=s * k, fy=s * k, interpolation=cv2.INTER_AREA)
        m = cv2.resize(mask, (t.shape[1], t.shape[0]), interpolation=cv2.INTER_AREA)
        m = np.repeat((m > 0.5).astype(np.float32)[:, :, None], 3, axis=2)
        r = match(win, t, m)
        if r and (best is None or r[0] < best[0]):
            best = (r[0], s, X0 + r[1][0] / k, Y0 + r[1][1] / k)
    return best

fits = json.load(open(f"{D}/fit.json")) if os.path.exists(f"{D}/fit.json") else {}
for p, o in plan.items():
    rgb, al = load(o.get("sheet", p))
    ys, xs = np.nonzero(al > 128)
    oy, ox = ys.min(), xs.min()
    c = rgb[oy:ys.max() + 1, ox:xs.max() + 1]
    mask = (al[oy:ys.max() + 1, ox:xs.max() + 1] > 128).astype(np.float32)
    X0, Y0, X1, Y1 = o["win"]
    s0, s1 = o["s"]
    kc = o.get("k", 0.25)
    err, s, x, y = search(c, mask, X0, Y0, X1, Y1, np.arange(s0, s1, (s1 - s0) / 40), kc)
    # fine: full size around the coarse fit
    pad = int(8 / kc)
    st = (s1 - s0) / 40
    err, s, x, y = search(c, mask, max(0, int(x) - pad), max(0, int(y) - pad), min(ref.shape[1], int(x + c.shape[1] * s) + pad), min(ref.shape[0], int(y + c.shape[0] * s) + pad),
                          np.arange(s - st, s + st, st / 8), 1.0)
    fits[p] = {"s": round(float(s), 4), "tx": round(float(x - ox * s), 1), "ty": round(float(y - oy * s), 1), "err": round(float(err), 1)}
    print(p, fits[p], flush=True)
json.dump(fits, open(f"{D}/fit.json", "w"), indent=1)
