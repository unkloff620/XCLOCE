"""Desk art comes on a dark backdrop with a glow: cut the desk out (GrabCut with hints for the dark legs, which melt
into the glow) → tools/scene/source/desk-<id>.png (transparent), then build-scene.py makes the webp.
All four desks share one template (1536×1024, legs at the same places), so the hints are common."""
import os
import cv2, numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "desks")


# y of the back edge of the top in each picture (above it there is only the glow)
TOP_Y = {"desk-001": 258, "desk-002": 234, "desk-003": 250, "desk-004": 244}


def cut(path):
    top = TOP_Y.get(os.path.splitext(os.path.basename(path))[0], 200)
    im = np.array(Image.open(path).convert("RGB"))
    h, w = im.shape[:2]
    bgr = cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    # probable desk: the top band and the two leg boxes
    m[200:470, 0:w] = cv2.GC_PR_FGD
    m[400:870, 30:300] = cv2.GC_PR_FGD
    m[400:870, 1236:1506] = cv2.GC_PR_FGD
    # surely background: borders, above the top, the space between the legs, the glow beside the columns and feet
    m[:top - 6] = cv2.GC_BGD; m[880:] = cv2.GC_BGD; m[:, :18] = cv2.GC_BGD; m[:, -18:] = cv2.GC_BGD
    m[440:880, 330:1206] = cv2.GC_BGD
    m[440:745, 18:112] = cv2.GC_BGD; m[440:745, 1424:1518] = cv2.GC_BGD
    m[440:640, 215:330] = cv2.GC_BGD; m[440:640, 1206:1321] = cv2.GC_BGD
    m[705:880, 238:330] = cv2.GC_BGD; m[705:880, 1206:1298] = cv2.GC_BGD
    # surely desk: the middle of the top, the inside of the columns, a band along the feet
    m[290:340, 120:1416] = cv2.GC_FGD
    m[top + 10:top + 40, 600:940] = cv2.GC_FGD  # the cable holes on the back of the top
    m[440:720, 142:188] = cv2.GC_FGD; m[440:720, 1348:1394] = cv2.GC_FGD
    for (x0, y0, x1, y1) in [(92, 805, 238, 678), (1444, 805, 1298, 678)]:
        cv2.line(m, (x0, y0), (x1, y1), int(cv2.GC_FGD), 22)
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, m, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(m, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # keep big parts, fill enclosed gaps (cable holes)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    k = np.zeros_like(fg)
    for i in range(1, n):
        if st[i, 4] > 3000: k[lab == i] = 1
    inv = (1 - k).astype(np.uint8)
    n2, lab2, _, _ = cv2.connectedComponentsWithStats(inv)
    border = set(np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]])))
    for i in range(1, n2):
        if i not in border: k[lab2 == i] = 1
    a = cv2.GaussianBlur(k.astype(np.float32) * 255, (3, 3), 0).astype(np.uint8)  # soft 1px edge
    return np.dstack([im, a])


if __name__ == "__main__":
    for f in sorted(os.listdir(SRC)):
        if f.endswith(".png"):
            out = cut(os.path.join(SRC, f))
            Image.fromarray(out).save(os.path.join(HERE, "source", f))
            print(f, (out[:, :, 3] > 128).mean().round(3))
