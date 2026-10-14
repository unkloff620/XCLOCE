"""
«Бабочка» — a butterfly knife in the hero's left hand (slot «Кисть», item hand-butterfly).
Sources: tools/rig/source/held/butterfly/
  fist.png, open.png             — the hand clenched and the hand open, drawn in place of handR on the 2000×2800 rig canvas
  handle-a.png, handle-b.png     — the two handles (a pin hole at each end)
  blade.png                      — the blade, its tang with two pin holes
  example-*.png                  — the artist's reference of how it should look (not used)
Mechanics (as a real balisong): each handle turns on its own pin of the tang. The hero holds handle A; the blade turns
on A's pin, handle B on the blade's second pin. Open: blade out, both handles behind the tang. Closed: the blade turned
180° (folded onto handle A), handle B a full turn round (it covers the blade from the other side).
Output (run after build-rig.py / build-look.py):
  public/assets/hero/held/butterfly-fist.webp, butterfly-open.webp, butterfly-open-f<k>.webp  — the hand (half size)
  public/assets/hero/skin-<n>/held-butterfly-*.webp                                           — the other skin tones
  public/assets/hero/held/butterfly-{handle-a,handle-b,blade}.webp — knife parts in the knife's frame (2× rig scale)
  public/assets/items/hand-butterfly.webp                          — the item icon (the open knife)
  src/client/art/butterfly-data.ts                                  — boxes, pins, where the knife lies in each hand
The fingers of the open hand move by a puppet warp (rigid MLS, as build-hand.py): the blade passes under them, they lift.
"""
import os, sys, json
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mls import mls_rigid_inverse  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held", "butterfly")
OUT = os.path.join(ROOT, "public", "assets", "hero")
SCALE = 0.5  # rig canvas → rig units
KNIFE_UP = 2  # knife pictures are stored at 2× rig scale (thin metal lines)
SKIN_TONES = ["#f8d5b4", "#fcb477", "#dda57a", "#b97a4e", "#8a5534", "#5e3a24"]  # keep in sync with build-look.py
SKIN_ORIGINAL = 1

# ---- the knife, in the part pictures' own pixels (490×573, all three drawn along the same diagonal)
T1, T2 = np.array([403.8, 416.3]), np.array([371.3, 448.8])  # tang pin holes: handle A's, handle B's
PA, LA = np.array([67.8, 89.2]), np.array([426.1, 430.2])  # handle A: pin hole, latch hole
PB, LB = np.array([59.4, 95.0]), np.array([384.1, 462.0])  # handle B
BLADE_ANG = 42.2  # direction tip → tang (the blade's long axis)
KNIFE_SCALE = 0.55  # part pixels → rig-canvas pixels
# where the open knife lies (rig-canvas px): the tang's middle and the direction the blade points (deg, y down)
IN_FIST = {"at": (1550, 1678), "dir": 38}  # out of the little-finger side, along the thigh; the butt peeks at the thumb
IN_OPEN = {"at": (1246, 1678), "dir": 150}  # pinned between the thumb and the index tips; handle A under the palm

# ---- the open hand's fingers (rig-canvas px): the back of the hand holds, a fingertip goes towards its knuckle
FIXED = [(1430, 1595), (1480, 1550), (1510, 1520), (1500, 1630), (1395, 1610)]
FINGERS = [  # (knuckle, tip): thumb, index, middle, ring, little
    ((1345, 1580), (1262, 1635)),
    ((1365, 1650), (1263, 1740)),
    ((1395, 1665), (1290, 1780)),
    ((1420, 1680), (1330, 1795)),
    ((1450, 1695), (1385, 1795)),
]
LIFT = 0.3
# 1 index half, 2 index, 3 middle, 4 ring, 5 little half, 6 little, 7 the thumb presses (screens.css «Бабочка»)
FINGER_FRAMES = [(1, 0.5), (1, 1.0), (2, 1.0), (3, 1.0), (4, 0.5), (4, 1.0), (0, 0.6)]


def rgba(p):
    return np.array(Image.open(p).convert("RGBA"))


def clean(im):
    """drop haze and specks: only the biggest blob of the drawing stays"""
    a = im[:, :, 3].copy()
    a[a < 40] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8))
    keep = 1 + int(np.argmax(st[1:, 4]))
    a[lab != keep] = 0
    im = im.copy()
    im[:, :, 3] = a
    im[a == 0, :3] = 0
    return im


def premul(a):
    f = a.astype(np.float32)
    al = f[:, :, 3:] / 255
    return np.concatenate([f[:, :, :3] * al, f[:, :, 3:]], 2)


def unpremul(p):
    A = np.clip(p[:, :, 3:], 0, 255)
    rgb = np.where(A > 0.5, p[:, :, :3] / np.maximum(A / 255, 1e-3), 0)
    return np.clip(np.concatenate([rgb, A], 2) + 0.5, 0, 255).astype(np.uint8)


def shrink(img, w, h):
    return unpremul(cv2.resize(premul(img), (w, h), interpolation=cv2.INTER_AREA))


# ---- skin tones (as build-look.py)
def lab(rgb):
    return cv2.cvtColor((rgb.astype(np.float32) / 255).reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(rgb.shape)


def rgb_(l):
    out = cv2.cvtColor(l.astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_LAB2RGB).reshape(l.shape)
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def hex_lab(h):
    return lab(np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)]], np.uint8))[0]


def skin_weight(im):
    hsv = cv2.cvtColor(im[:, :, :3], cv2.COLOR_RGB2HSV).astype(np.float32)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    w = np.clip(1 - np.maximum(0, np.maximum(4 - H, H - 24)) / 4, 0, 1)
    w *= np.clip((S - 50) / 30, 0, 1) * np.clip((V - 50) / 40, 0, 1)
    return cv2.GaussianBlur(w, (3, 3), 0)[..., None]


def tint(base, i):
    if i == SKIN_ORIGINAL:
        return base
    L = lab(base[:, :, :3])
    w = skin_weight(base)
    ref, t = hex_lab(SKIN_TONES[SKIN_ORIGINAL]), hex_lab(SKIN_TONES[i])
    new = L.copy()
    new[:, :, 0] = np.clip(L[:, :, 0] * (t[0] / ref[0]), 0, 100)
    new[:, :, 1] = L[:, :, 1] + (t[1] - ref[1])
    new[:, :, 2] = L[:, :, 2] + (t[2] - ref[2])
    out = base.copy()
    out[:, :, :3] = rgb_(L * (1 - w) + new * w)
    return out


def save_tones(img, name):
    for i in range(len(SKIN_TONES)):
        path = os.path.join(OUT, "held", name) if i == SKIN_ORIGINAL else os.path.join(OUT, f"skin-{i}", f"held-{name}")
        Image.fromarray(tint(img, i)).save(path + ".webp", "WEBP", quality=90, method=6)


# ---------------- the hands ----------------
os.makedirs(os.path.join(OUT, "held"), exist_ok=True)
data = {}
PAD = 6
hands = {}
for name in ("fist", "open"):
    im = clean(rgba(os.path.join(SRC, name + ".png")))
    ys, xs = np.nonzero(im[:, :, 3])
    x0, y0, x1, y1 = xs.min() - PAD, ys.min() - PAD, xs.max() + PAD, ys.max() + PAD
    x0, y0 = x0 - x0 % 2, y0 - y0 % 2  # whole rig units
    x1, y1 = x1 + (x1 - x0) % 2, y1 + (y1 - y0) % 2
    w, h = (x1 - x0) // 2, (y1 - y0) // 2
    data[name] = {"x": float(x0 * SCALE), "y": float(y0 * SCALE), "w": int(w), "h": int(h)}
    hands[name] = (im[y0:y1, x0:x1], x0, y0, w, h)
    save_tones(shrink(hands[name][0], w, h), f"butterfly-{name}")

# the open hand's finger frames: each finger warped on its own layer (the others would pull it), as build-hand.py
crop, ox, oy, w, h = hands["open"]
hh, ww = crop.shape[:2]
loc = lambda p: (p[0] - ox, p[1] - oy)
ys, xs = np.mgrid[0:hh, 0:ww].astype(np.float64)
dist, along = [], []
for base, tip in FINGERS:
    b, t = np.array(loc(base)), np.array(loc(tip))
    d = t - b
    u = ((xs - b[0]) * d[0] + (ys - b[1]) * d[1]) / (d ** 2).sum()
    uc = np.clip(u, 0, 1.4)
    dist.append(np.hypot(xs - (b[0] + uc * d[0]), ys - (b[1] + uc * d[1]))); along.append(u)
dist = np.stack(dist)
near = dist.argmin(0)
masks = [(((near == i) & (dist[i] < 34) & (along[i] > 0.02)).astype(np.float32)) for i in range(len(FINGERS))]
pre = premul(crop)
for k, (finger, amount) in enumerate(FINGER_FRAMES, 1):
    src, dst = [], []
    for p in FIXED:
        src.append(loc(p)); dst.append(loc(p))
    for i, (base, tip) in enumerate(FINGERS):
        b, t = np.array(loc(base)), np.array(loc(tip))
        src.append(tuple(b)); dst.append(tuple(b))
        if i == finger:
            mid = (b + t) / 2
            q = LIFT * amount
            src += [tuple(mid), tuple(t)]
            dst += [tuple(mid + (b - mid) * q), tuple(t + (b - t) * q)]
    mx, my = mls_rigid_inverse(src, dst, ww, hh)
    m = masks[finger][..., None]
    rest = pre * (1 - m)
    fing = cv2.remap(pre * m, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out = fing + rest * (1 - fing[:, :, 3:4] / 255)
    save_tones(shrink(unpremul(out), w, h), f"butterfly-open-f{k}")
data["frames"] = len(FINGER_FRAMES)


# ---------------- the knife ----------------
def M_rot(th, c=(0, 0), s=1.0, t=(0, 0)):
    r = np.radians(th)
    R = s * np.array([[np.cos(r), -np.sin(r)], [np.sin(r), np.cos(r)]])
    c = np.array(c, float)
    M = np.eye(3)
    M[:2, :2] = R
    M[:2, 2] = c - R @ c + np.array(t, float)
    return M


ang = lambda v: np.degrees(np.arctan2(v[1], v[0]))
# the handles of the open knife, in the blade picture's pixels: pin on its tang hole, along the blade's axis
HA0 = M_rot(BLADE_ANG - ang(LA - PA), T1) @ M_rot(0, t=T1 - PA)
HB0 = M_rot(BLADE_ANG - ang(LB - PB), T2) @ M_rot(0, t=T2 - PB)
# the knife's frame (rig units): the tang's middle at 0,0, the blade pointing at −x
Tm = (T1 + T2) / 2
s = KNIFE_SCALE * SCALE
K = M_rot(180 - (BLADE_ANG + 180), (0, 0), s) @ M_rot(0, t=-Tm)
pt = lambda M, p: (M @ np.array([p[0], p[1], 1.0]))[:2]
knife = {"t1": [round(float(v), 2) for v in pt(K, T1)], "t2": [round(float(v), 2) for v in pt(K, T2)]}
pics = {}
for name, M in (("handle-a", K @ HA0), ("handle-b", K @ HB0), ("blade", K)):
    im = clean(rgba(os.path.join(SRC, name + ".png")))
    h0, w0 = im.shape[:2]
    corners = np.array([pt(M, c) for c in [(0, 0), (w0, 0), (0, h0), (w0, h0)]])
    bx0, by0 = np.floor(corners.min(0)) - 1
    bx1, by1 = np.ceil(corners.max(0)) + 1
    W, H = int((bx1 - bx0) * KNIFE_UP), int((by1 - by0) * KNIFE_UP)
    Mi = M_rot(0, (0, 0), KNIFE_UP) @ M_rot(0, t=(-bx0, -by0)) @ M
    # warp at 4× the output, then shrink: crisp outlines
    UP4 = 4
    big = cv2.warpAffine(premul(im), (M_rot(0, (0, 0), UP4) @ Mi)[:2].astype(np.float32), (W * UP4, H * UP4), flags=cv2.INTER_LINEAR)
    pic = unpremul(cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA))
    ys_, xs_ = np.nonzero(pic[:, :, 3] > 8)
    tx0, ty0, tx1, ty1 = xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1
    pic = pic[ty0:ty1, tx0:tx1]
    Image.fromarray(pic).save(os.path.join(OUT, "held", f"butterfly-{name}.webp"), "WEBP", quality=92, method=6)
    pics[name] = pic
    knife[name] = {"x": round(float(bx0 + tx0 / KNIFE_UP), 2), "y": round(float(by0 + ty0 / KNIFE_UP), 2), "w": round(pic.shape[1] / KNIFE_UP, 2), "h": round(pic.shape[0] / KNIFE_UP, 2)}
for key, cfg in (("fist", IN_FIST), ("open", IN_OPEN)):
    knife[key] = {"x": cfg["at"][0] * SCALE, "y": cfg["at"][1] * SCALE, "rot": cfg["dir"] - 180}
data["knife"] = knife

# the item icon: the open knife, lying diagonally (blade up-right), as the other item pictures (256 px, centred)
ext = {k: knife[k] for k in ("handle-a", "handle-b", "blade")}
X0 = min(v["x"] for v in ext.values()); Y0 = min(v["y"] for v in ext.values())
X1 = max(v["x"] + v["w"] for v in ext.values()); Y1 = max(v["y"] + v["h"] for v in ext.values())
canvas = Image.new("RGBA", (int((X1 - X0) * KNIFE_UP) + 2, int((Y1 - Y0) * KNIFE_UP) + 2))
for k in ("handle-a", "handle-b", "blade"):
    canvas.alpha_composite(Image.fromarray(pics[k]), (int(round((ext[k]["x"] - X0) * KNIFE_UP)), int(round((ext[k]["y"] - Y0) * KNIFE_UP))))
canvas = canvas.rotate(-135, resample=Image.BICUBIC, expand=True)  # blade (−x) → up-right
canvas = canvas.crop(canvas.getbbox())
side = round(max(canvas.size) * 1.04)
sq = Image.new("RGBA", (side, side))
sq.alpha_composite(canvas, ((side - canvas.width) // 2, (side - canvas.height) // 2))
sq.resize((256, 256), Image.LANCZOS).save(os.path.join(ROOT, "public", "assets", "items", "hand-butterfly.webp"), "WEBP", quality=88, method=4)

ts = "/* Generated by tools/rig/build-butterfly.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** «Бабочка» in the left hand: the fist and the open hand (+ finger frames), the knife's parts in its own frame\n"
ts += " * (tang middle at 0,0, the open blade pointing at −x; t1/t2 — the pins of handle A and handle B) and where it lies in\n"
ts += " * each hand (x, y — the tang's middle; rot — deg) */\n"
ts += "export const BUTTERFLY = " + json.dumps(data, indent=2, ensure_ascii=False) + " as const;\n"
open(os.path.join(ROOT, "src", "client", "art", "butterfly-data.ts"), "w").write(ts)
print(json.dumps(data))
