"""
Химик's mentor card (the artist's layers, 1200×520, tools/ui/source/himik-card/ — the order of his PSD, top first):
mol (the molecule drawn on the paper — it gets written stroke by stroke), glass-a / glass-b (the flasks and the test tubes in
the corners: the same glass twice, ~60 % and solid — the poison goes between them), frame (the card: the green frame, the
paper, the slime, the lab coat's collar).
→ public/assets/ui/boss-card-frame-himik.webp (the nine-slice frame), himik-card-glass-a/-b.webp and himik-card-poison.webp
(the glass's insides: white in, black out), himik-card-mol.webp (the molecule, cropped) and src/client/art/himik-card-data.ts:
the vessels (their boxes, where the poison stands), the molecule's box and its strokes — the drawing's skeleton traced
into lines, in the order a hand would draw them (each from the end nearest where the last one stopped).
  python3 tools/ui/himik-card.py
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.morphology import skeletonize

SRC = "tools/ui/source/himik-card"
O = "public/assets/ui"
L = {n: Image.open(f"{SRC}/{n}.png").convert("RGBA") for n in ["frame", "mol", "glass-a", "glass-b"]}
L["frame"].save(f"{O}/boss-card-frame-himik.webp", quality=90, method=6)
L["glass-a"].save(f"{O}/himik-card-glass-a.webp", quality=90, method=6)
L["glass-b"].save(f"{O}/himik-card-glass-b.webp", quality=90, method=6)

# the poison's room: the glass's light inside, the big pieces only (the flasks, the tubes)
g = np.array(L["glass-b"]).astype(int)
m = (g[..., 3] > 128) & (g[..., :3].mean(2) > 110)
m = ndimage.binary_erosion(m, iterations=2)
lab, k = ndimage.label(m)
sizes = ndimage.sum(m, lab, range(1, k + 1))
m = np.isin(lab, [i + 1 for i in range(k) if sizes[i] >= 1000])
m = ndimage.binary_closing(m, iterations=2)
pm = np.zeros(m.shape + (3,), np.uint8)
pm[m] = 255
Image.fromarray(pm).save(f"{O}/himik-card-poison.webp", quality=88, method=6)
lab, k = ndimage.label(m)
vessels = []
for sl in ndimage.find_objects(lab):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    vessels.append({"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0})
# where the poison stands in each (the share of its height from the top): the tilted flask half full, the round one more
LEVEL = {(14, 71): 0.5, (1025, 342): 0.42, (1126, 187): 0.3, (1148, 106): 1.2, (171, 411): 0.38, (132, 437): 0.3}
for v in vessels:
    share = next((s for (x, y), s in LEVEL.items() if abs(v["x"] - x) < 8 and abs(v["y"] - y) < 8), 0.4)
    v["lvl"] = round(v["y"] + v["h"] * share, 1)
vessels = [v for v in vessels if v["lvl"] < v["y"] + v["h"]]

# the molecule: cropped; its strokes = the skeleton of its ink, traced into lines
mb = L["mol"].getbbox()
mol = L["mol"].crop(mb)
mol.save(f"{O}/himik-card-mol.webp", quality=90, method=6)
ink = np.array(mol)[..., 3] > 60
sk = skeletonize(ink)
H, W = sk.shape
N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def nbrs(p):
    y, x = p
    return [(y + dy, x + dx) for dy, dx in N8 if 0 <= y + dy < H and 0 <= x + dx < W and sk[y + dy, x + dx]]


pts = set(zip(*np.nonzero(sk)))
deg = {p: len(nbrs(p)) for p in pts}
used = set()  # used edges (pairs)
lines = []


def walk(a, b):
    path = [a, b]
    used.add(frozenset((a, b)))
    while deg[path[-1]] == 2:
        nx = [q for q in nbrs(path[-1]) if frozenset((path[-1], q)) not in used]
        if not nx:
            break
        used.add(frozenset((path[-1], nx[0])))
        path.append(nx[0])
    return path


for p in sorted(pts):
    if deg[p] != 2:
        for q in nbrs(p):
            if frozenset((p, q)) not in used:
                lines.append(walk(p, q))
# the loops left (the ring atoms): start anywhere on them
for p in sorted(pts):
    for q in nbrs(p):
        if frozenset((p, q)) not in used:
            lines.append(walk(p, q))


def rdp(P, eps=1.2):
    if len(P) < 3:
        return P
    a, b = np.array(P[0], float), np.array(P[-1], float)
    d = b - a
    n = np.hypot(*d)
    dist = [abs(d[0] * (p[1] - a[1]) - d[1] * (p[0] - a[0])) / n if n else np.hypot(*(np.array(p, float) - a)) for p in P]
    i = int(np.argmax(dist))
    if dist[i] > eps:
        return rdp(P[: i + 1], eps)[:-1] + rdp(P[i:], eps)
    return [P[0], P[-1]]


lines = [rdp(l) for l in lines]
lines = [l for l in lines if len(l) > 1 and sum(np.hypot(*(np.array(l[i + 1]) - np.array(l[i]))) for i in range(len(l) - 1)) >= 2.5 or len(l) > 2]
# a hand's order: from the left, each next line starting from its end nearest where the pen stopped
order, pen = [], np.array([0.0, H / 2])
left = lines[:]
while left:
    best = min(range(len(left)), key=lambda i: min(np.hypot(*(np.array(left[i][0])[::-1] - pen)), np.hypot(*(np.array(left[i][-1])[::-1] - pen))))
    l = left.pop(best)
    if np.hypot(*(np.array(l[-1])[::-1] - pen)) < np.hypot(*(np.array(l[0])[::-1] - pen)):
        l = l[::-1]
    order.append([[int(x), int(y)] for y, x in l])
    pen = np.array(order[-1][-1], float)
# the blots no line runs through (the round dots): they are dabbed on after the lines
covered = np.zeros_like(ink)
for st in order:
    for x, y in st:
        covered[max(0, y - 3):y + 4, max(0, x - 3):x + 4] = True
blab, bk = ndimage.label(ink)
dots = []
for i, sl in enumerate(ndimage.find_objects(blab)):
    piece = blab[sl] == i + 1
    if not (covered[sl] & piece).any() and piece.sum() > 20:
        ys, xs = np.nonzero(piece)
        dots.append([round(float(xs.mean() + sl[1].start), 1), round(float(ys.mean() + sl[0].start), 1), round(float(np.sqrt(piece.sum() / np.pi)) + 2, 1)])
data = {"vessels": vessels, "dots": dots, "mol": {"x": mb[0], "y": mb[1], "w": mb[2] - mb[0], "h": mb[3] - mb[1]}, "strokes": order}
open("src/client/art/himik-card-data.ts", "w").write(
    "// generated by tools/ui/himik-card.py — Химик's card (the card's pixels, 1200×520): the vessels the poison stands in, the molecule and its strokes\n"
    f"export const HIMIK_CARD = {json.dumps(data, separators=(',', ':'))} as const;\n")
print(len(order), "strokes", sum(len(s) for s in order), "points;", vessels)
