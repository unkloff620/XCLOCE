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
