"""
A yard drawn by the artist as layers (tools/raids/source/<yard>/: bg.png and one 1024×1536 layer per building, each
building drawn where it stands): the ground → public/assets/raids/<yard>/ground.webp, each building cut out (its white
haze dropped, the dark shadow kept) → <yard>/b-<kind>.webp, and its place (the middle of its foot, its width, in % of
the picture) printed for content/raids.ts.
  python3 tools/raids/build-yard-art.py garages
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
yard = sys.argv[1]
src = os.path.join(ROOT, "tools", "raids", "source", yard)
out = os.path.join(ROOT, "public", "assets", "raids", yard)
os.makedirs(out, exist_ok=True)
Image.open(os.path.join(src, "bg.png")).convert("RGB").save(os.path.join(out, "ground.webp"), "WEBP", quality=84)
places = {}
for f in sorted(os.listdir(src)):
    kind = f[:-4]
    if kind == "bg" or not f.endswith(".png"):
        continue
    a = np.array(Image.open(os.path.join(src, f)).convert("RGBA"))
    al = a[:, :, 3].astype(np.float32)
    light = a[:, :, :3].astype(np.float32).mean(2)
    # the haze: half-transparent and light → gone; the shadow under it (dark) stays
    haze = (al < 235) & (light > 150)
    a[haze, 3] = 0
    solid = Image.fromarray(((a[:, :, 3] > 200) * 255).astype(np.uint8)).getbbox()
    box = Image.fromarray(((a[:, :, 3] > 12) * 255).astype(np.uint8)).getbbox()
    img = Image.fromarray(a).crop(box)
    img.save(os.path.join(out, f"b-{kind}.webp"), "WEBP", quality=90)
    W, H = a.shape[1], a.shape[0]
    places[kind] = {"x": round((box[0] + box[2]) / 2 / W * 100, 2), "y": round(box[3] / H * 100, 2), "w": round((box[2] - box[0]) / W * 100, 2), "foot": round(solid[3] / H * 100, 2)}
print(json.dumps(places))

# the yard's photo on its card (raids.tsx RaidsScreen): the ground with its buildings, a 16:9 cut of the busy middle
import re
ts = open(os.path.join(ROOT, "src", "content", "raids.ts"), encoding="utf-8").read()
blk = ts[ts.index(f'art: "{yard}"'):]
blk = blk[:blk.index("] },")]
ground = Image.open(os.path.join(out, "ground.webp")).convert("RGBA")
W, H = ground.size
bs = []
for m in re.finditer(r'kind: "?(\w+)"?(?:, pic: "(\w+)")?, x: ([\d.]+), y: ([\d.]+), w: ([\d.]+)', blk):
    kind = {"G": "garage", "K": "kiosk", "B": "barrack", "O": "boiler", "S": "shop", "H": "khrush"}.get(m.group(1), m.group(1))
    bs.append((m.group(2) or kind, float(m.group(3)), float(m.group(4)), float(m.group(5))))
for pic, x, y, w in sorted(bs, key=lambda b: b[2]):
    im = Image.open(os.path.join(out, f"b-{pic}.webp")).convert("RGBA")
    bw = round(W * w / 100); bh = round(im.height * bw / im.width)
    ground.alpha_composite(im.resize((bw, bh), Image.LANCZOS), (round(W * x / 100 - bw / 2), round(H * y / 100 - bh)))
ch = round(W * 9 / 16)
top = int(H * 0.30) - ch // 2
ground.crop((0, top, W, top + ch)).convert("RGB").resize((640, 360), Image.LANCZOS).save(os.path.join(out, "photo.webp"), "WEBP", quality=84)
print("photo", len(bs), "buildings")
