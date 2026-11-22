"""
A yard drawn by the artist as three pictures (tools/raids/source2/<yard>/, 2000×3000): bg.png — the ground, buildings.png —
all the buildings in place on a transparent layer, plan.png — the plan sheet («План», the order of the capture).
→ public/assets/raids/<yard>/: ground.webp (1024×1536), b-<pic>.webp — each building cut out by its own silhouette,
plan.webp, photo.webp (the card's photo); and the yard's buildings for src/content/raids.ts (printed: bottom → top,
the main one — the biggest — last; the kinds in KINDS by that order).
  python3 tools/raids/build-yard-v2.py garages
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

KINDS = {
    "garages": ["shed", "tower", "tower", "garage", "garage", "booth", "boiler", "warehouse", "office"],
    "promzona": ["workshop", "tower", "warehouse", "warehouse", "workshop", "boiler", "warehouse", "office", "warehouse"],
    "rynok": ["kiosk", "tower", "tent", "kiosk", "row", "row", "row", "row", "row", "row", "pavilion", "pavilion"],
}
yard = sys.argv[1]
S = f"tools/raids/source2/{yard}"
O = f"public/assets/raids/{yard}"
os.makedirs(O, exist_ok=True)
for f in os.listdir(O):
    if f.startswith("b-"): os.remove(f"{O}/{f}")
bg = Image.open(f"{S}/bg.png").convert("RGB")
W, H = bg.size
bg.resize((1024, 1536), Image.LANCZOS).save(f"{O}/ground.webp", quality=84, method=6)
pl = Image.open(f"{S}/plan.png").convert("RGBA")
pl.thumbnail((900, 900), Image.LANCZOS)
pl.save(f"{O}/plan.webp", quality=86, method=6, exact=True)

a = np.array(Image.open(f"{S}/buildings.png").convert("RGBA"))
n, lab, st, _ = cv2.connectedComponentsWithStats((a[..., 3] > 128).astype(np.uint8), 8)
comps = [i for i in range(1, n) if st[i][4] > 2500]
main = max(comps, key=lambda i: st[i][4])
order = sorted([i for i in comps if i != main], key=lambda i: -(st[i][1] + st[i][3])) + [main]
kinds = KINDS[yard] + ["main"]
assert len(kinds) == len(order), (len(kinds), len(order))
seen: dict = {}
out = []
for k, (i, kind) in enumerate(zip(order, kinds)):
    m = cv2.dilate((lab == i).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    im = a.copy()
    im[..., 3] = np.where(m, im[..., 3], 0)
    box = Image.fromarray(im[..., 3]).point(lambda v: 255 if v > 8 else 0).getbbox()
    seen[kind] = seen.get(kind, 0) + 1
    pic = kind if kinds.count(kind) == 1 else f"{kind}{seen[kind]}"
    c = Image.fromarray(im).crop(box)
    c = c.resize((max(1, c.width // 2), max(1, c.height // 2)), Image.LANCZOS)
    c.save(f"{O}/b-{pic}.webp", quality=90, method=6, exact=True)
    bid = f"{yard}-main" if kind == "main" else f"{yard}-{k + 1}"
    out.append({"id": bid, "kind": kind, **({"pic": pic} if pic != kind else {}),
                "x": round((box[0] + box[2]) / 2 / W * 100, 2), "y": round(box[3] / H * 100, 2), "w": round((box[2] - box[0]) / W * 100, 2)})
print(json.dumps(out, ensure_ascii=False))

# the card's photo: the ground with its buildings, a 16:9 cut of the busy middle
full = bg.convert("RGBA")
full.alpha_composite(Image.fromarray(a))
ys = [st[i][1] for i in comps] + [st[i][1] + st[i][3] for i in comps]
mid = (min(ys) + max(ys)) // 2
ch = round(W * 9 / 16)
top = max(0, min(H - ch, mid - ch // 2))
full.crop((0, top, W, top + ch)).convert("RGB").resize((640, 360), Image.LANCZOS).save(f"{O}/photo.webp", quality=84, method=6)
