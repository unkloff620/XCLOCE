"""
Пепе's beaten look (below half HP): his layers (public/bosses/pepe/rig/<id>.webp, placed by src/client/art/pepe-data.ts)
are drawn together, beaten up by one image edit, fitted back and cut per layer as in tools/boss/make-beaten.py →
public/bosses/pepe/rig-beaten/<id>.webp (the same size and place: the soft meshes stay as they are).
"""
import json, os, re, shutil, sys, importlib.util
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
spec = importlib.util.spec_from_file_location("mb", os.path.join(ROOT, "tools", "boss", "make-beaten.py"))
mb = importlib.util.module_from_spec(spec); spec.loader.exec_module(mb)
data = json.loads(re.search(r"PEPE = (\{.*\}) as const;", open(os.path.join(ROOT, "src", "client", "art", "pepe-data.ts")).read(), re.S).group(1))
ORDER = ["legs", "sleeveR", "handR", "body", "sleeveL", "handL", "whites", "pupils", "lidLL", "lidLR", "lidUL", "lidUR", "head", "mouth", "pill"]
HURT = {"legs", "sleeveR", "handR", "body", "sleeveL", "handL", "head"}
SRC = os.path.join(ROOT, "public", "bosses", "pepe", "rig")
OUT = os.path.join(ROOT, "public", "bosses", "pepe", "rig-beaten")
os.makedirs(OUT, exist_ok=True)
W, H = round(data["w"]), round(data["h"])
L, box = {}, {}
for p in ORDER:
    x, y, w, h = data["layers"][p]
    im = Image.open(os.path.join(SRC, p + ".webp")).convert("RGBA").resize((round(w), round(h)))
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0)); c.paste(im, (round(x), round(y)))
    L[p] = np.array(c); box[p] = (round(x), round(y), round(w), round(h))
comp = np.full((H, W, 3), 255.0, np.float32)
for p in ORDER:
    a = L[p][..., 3:4] / 255.0
    comp = comp * (1 - a) + L[p][..., :3] * a
mb.LOOK["pepe"] = "Pepe the frog in a blue sweatshirt and blue shorts holding a pill"
e = mb.edit("pepe", comp)
warped = mb.ti.warp_onto(mb.ti.figure(comp), mb.ti.figure(e), e)
top = np.full((H, W), -1)
for i, p in enumerate(ORDER): top[L[p][..., 3] > 128] = i
white = ndimage.binary_dilation(warped.min(2) > 225, iterations=2)
for i, p in enumerate(ORDER):
    x, y, w, h = box[p]
    if p in HURT:
        im = L[p].copy()
        m = (top == i) & ndimage.binary_erosion(L[p][..., 3] > 128, iterations=5) & ~white
        k = ndimage.gaussian_filter(m.astype(np.float32), 2)[..., None]
        im[..., :3] = np.clip(im[..., :3] * (1 - k) + warped * k, 0, 255).astype(np.uint8)
        Image.fromarray(im[y:y + h, x:x + w]).save(os.path.join(OUT, p + ".webp"), "WEBP", quality=88, method=4)
    else:
        shutil.copy(os.path.join(SRC, p + ".webp"), os.path.join(OUT, p + ".webp"))
print("pepe beaten")
