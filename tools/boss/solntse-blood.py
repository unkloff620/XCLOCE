"""
Солнце beaten (below half HP): blood on his head, face, body, arms and clothes — like Фокус (fokus-blood.py).
The rig's layers put together on white (rig × 2, fitted into 1024×1536: in-body.png) were edited once (edit-body.png);
the edit is fitted back onto the input (ECC, affine), and each layer takes from it only what changed, only where that
layer is the one seen on top (the lava-glow layers do not count: they pulse over their part) — its own outline (alpha)
stays exactly the artist's. → public/bosses/solntse/rig/<part>-blood.webp (boss-sun.tsx shows them when dazed).
  python3 tools/boss/solntse-blood.py
"""
import json
import numpy as np, cv2
from PIL import Image

D = "tools/boss/source/solntse/blood"
R = "public/bosses/solntse/rig"
K = 2
ORDER = ["legs", "legs-glow", "armL", "lowL", "body", "body-glow", "armR", "armR-glow", "chestR", "chestR-glow", "chestL", "apron",
         "mouthIn", "jawLow", "eyes", "pupils", "head", "lowR", "lowR-glow", "poker"]
HURT = ["legs", "armL", "lowL", "body", "armR", "chestR", "chestL", "apron", "jawLow", "head", "lowR", "poker"]

_s = open("src/client/art/boss-rig-data.ts").read()
_i = _s.index('"solntse": {') + len('"solntse": ')
_d = 0
for _k, _c in enumerate(_s[_i:], _i):
    _d += _c == "{"; _d -= _c == "}"
    if _d == 0: break
RIG = json.loads(_s[_i:_k + 1])
W, H = RIG["w"] * K, RIG["h"] * K
P = RIG["parts"]

top = np.full((H, W), -1, int)
comp = np.full((H, W, 3), 255, np.float32)
for i, n in enumerate(ORDER):
    p = P[n]
    im = Image.open(f"{R}/{n}.webp").convert("RGBA").resize((round(p["w"] * K), round(p["h"] * K)), Image.LANCZOS)
    layer = Image.new("RGBA", (W, H)); layer.alpha_composite(im, (round(p["x"] * K), round(p["y"] * K)))
    a = np.array(layer).astype(np.float32)
    al = a[..., 3:] / 255
    comp = comp * (1 - al) + a[..., :3] * al
    if not n.endswith("-glow"): top[a[..., 3] > 128] = i
comp = comp.astype(np.uint8)

# the edit back onto its input, then onto the sheet (the input: the sheet fitted to 1024 wide, centred in 1536)
inp = np.array(Image.open(f"{D}/in-body.png").convert("RGB"))
ed = np.array(Image.open(f"{D}/edit-body.png").convert("RGB").resize((1024, 1536), Image.LANCZOS))
a = cv2.cvtColor(inp, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
b = cv2.cvtColor(ed, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
M = np.eye(2, 3, dtype=np.float32)
_, M = cv2.findTransformECC(a, b, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
print("fit", np.round(M, 4).tolist())
ed = cv2.warpAffine(ed, M, (1024, 1536), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=(255, 255, 255))
h = round(H * 1024 / W); oy = (1536 - h) // 2
sheet = cv2.resize(ed[oy:oy + h], (W, H), interpolation=cv2.INTER_CUBIC)

d = np.abs(sheet.astype(np.int16) - comp.astype(np.int16)).sum(-1).astype(np.float32)
# blood is red: count a change only where the edit went redder/darker-red than the original
red = (sheet[..., 0].astype(np.int16) - np.maximum(sheet[..., 1], sheet[..., 2]).astype(np.int16)) > 40
m = np.clip((d - 60) / 90, 0, 1) * red
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
m = cv2.GaussianBlur(m, (0, 0), 1.2)
idx = {n: i for i, n in enumerate(ORDER)}
for n in HURT:
    mine = (top == idx[n]).astype(np.float32)
    mine = cv2.GaussianBlur(cv2.dilate(mine, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
    w = m * mine
    p = P[n]
    orig_im = Image.open(f"{R}/{n}.webp").convert("RGBA")
    size = orig_im.size
    box = (p["x"] * K, p["y"] * K, (p["x"] + p["w"]) * K, (p["y"] + p["h"]) * K)
    ext = lambda im, mode: im.transform(size, Image.EXTENT, box, mode)
    orig = np.array(orig_im).astype(np.float32)
    ew = np.array(ext(Image.fromarray((w * 255).astype(np.uint8)), Image.BILINEAR)).astype(np.float32)[..., None] / 255
    er = np.array(ext(Image.fromarray(sheet), Image.BICUBIC)).astype(np.float32)
    orig[..., :3] = orig[..., :3] * (1 - ew) + er * ew
    Image.fromarray(orig.astype(np.uint8)).save(f"{R}/{n}-blood.webp", quality=88, method=6, exact=True)
    print(n, size, f"{float(ew.mean()) * 100:.2f}%")
