"""
Нитка beaten (below half HP): blood, cuts and bruises on his head, his arms and hands, the shirt torn and bloody, the
tank top and the jeans bloody, a knee torn — like Фокус (fokus-blood.py). The placed layers put together on white
(2000×3000 → 1024×1536: blood/in-body.png) were edited once (blood/edit-body.png); the edit is fitted back (ECC, affine)
and each layer takes from it only what changed, only where that layer is the one seen on top — its own outline (alpha)
stays exactly the artist's. → public/bosses/nitka/rig/<part>-blood.webp (boss-nitka.tsx shows them below half HP).
  python3 tools/boss/nitka-blood.py
"""
import json
import numpy as np, cv2
from PIL import Image

D = "tools/boss/source/nitka"
R = "public/bosses/nitka/rig"
CROP = (247, 99)
ORDER = ["legs", "armR", "body", "shirtR", "shirtL", "armL", "lowR", "handR", "throat", "teeth-low", "teeth-up", "chin", "eyes", "pupils", "head", "brows", "glasses", "lowL", "handL"]
HURT = ["legs", "armR", "body", "shirtR", "shirtL", "armL", "lowR", "lowL", "chin", "head"]  # the fists: the artist's own bloody copies (handR-blood, handL-blood)
_s = open("src/client/art/boss-rig-data.ts").read()
_i = _s.index('"nitka": {') + len('"nitka": ')
_d = 0
for _k, _c in enumerate(_s[_i:], _i):
    _d += _c == "{"; _d -= _c == "}"
    if _d == 0: break
P = json.loads(_s[_i:_k + 1])["parts"]

top = np.full((3000, 2000), -1, int)
comp = np.full((3000, 2000, 3), 255, np.float32)
for i, n in enumerate(ORDER):
    a = np.array(Image.open(f"{D}/placed/{n}.png").convert("RGBA")).astype(np.float32)
    al = a[..., 3:] / 255
    comp = comp * (1 - al) + a[..., :3] * al
    top[a[..., 3] > 128] = i
comp = comp.astype(np.uint8)
inp = np.array(Image.open(f"{D}/blood/in-body.png").convert("RGB"))
ed = np.array(Image.open(f"{D}/blood/edit-body.png").convert("RGB").resize((1024, 1536), Image.LANCZOS))
g = lambda x: cv2.cvtColor(x, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
M = np.eye(2, 3, dtype=np.float32)
_, M = cv2.findTransformECC(g(inp), g(ed), M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
print("fit", np.round(M, 4).tolist())
ed = cv2.warpAffine(ed, M, (1024, 1536), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=(255, 255, 255))
sheet = cv2.resize(ed, (2000, 3000), interpolation=cv2.INTER_CUBIC)
d = np.abs(sheet.astype(np.int16) - comp.astype(np.int16)).sum(-1).astype(np.float32)
m = np.clip((d - 70) / 90, 0, 1)
m *= (sheet.min(-1) < 225)  # never the white round him (the edit's edges)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
m = cv2.GaussianBlur(m, (0, 0), 1.2)
idx = {n: i for i, n in enumerate(ORDER)}
for n in HURT:
    mine = (top == idx[n]).astype(np.float32)
    mine = cv2.GaussianBlur(cv2.erode(mine, np.ones((5, 5), np.uint8)), (0, 0), 1.0)
    w = m * mine
    p = P[n]
    o = Image.open(f"{R}/{n}.webp").convert("RGBA")
    box = (CROP[0] + p["x"] * 2, CROP[1] + p["y"] * 2, CROP[0] + (p["x"] + p["w"]) * 2, CROP[1] + (p["y"] + p["h"]) * 2)
    ext = lambda im, mode: im.transform(o.size, Image.EXTENT, box, mode)
    a = np.array(o).astype(np.float32)
    ew = np.array(ext(Image.fromarray((w * 255).astype(np.uint8)), Image.BILINEAR)).astype(np.float32)[..., None] / 255
    er = np.array(ext(Image.fromarray(sheet), Image.BICUBIC)).astype(np.float32)
    a[..., :3] = a[..., :3] * (1 - ew) + er * ew
    Image.fromarray(a.astype(np.uint8)).save(f"{R}/{n}-blood.webp", quality=88, method=6, exact=True)
    print(n, o.size, f"{float(ew.mean()) * 100:.2f}%")
