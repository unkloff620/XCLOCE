"""
Animates the fingers of the hero's empty left hand (handR — on the screen's right) with a puppet warp
(rigid moving-least-squares deformation, Schaefer et al. 2006): pins on the back of the hand and the wrist stay put,
the pin at a fingertip moves up towards its knuckle (half way for the pin in the middle of the finger), and the image
bends smoothly around them. Run after build-rig.py and build-look.py.

Frames: for each finger (pinky → index) a half and a full lift = 8 frames,
→ public/assets/hero/handR-f<k>.webp and public/assets/hero/skin-<n>/handR-f<k>.webp (same size and place as handR).
The rig (src/client/art/rig.tsx, HandFrames) plays them as a drum roll on the knee.
"""
import os, json, re
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "hero")
UP = 2  # warp at the source resolution (the parts are stored at half size)

rig_ts = open(os.path.join(ROOT, "src", "client", "art", "rig-data.ts")).read()
RIG = json.loads(re.search(r"= (\{.*\}) as const", rig_ts, re.S).group(1))
H = RIG["handR"]

# pins, in source-canvas pixels (2000×2800) — measured on tools/rig/source/v2/handR.png
FIXED = [(1460, 1490), (1395, 1550), (1505, 1535), (1420, 1610), (1485, 1635), (1345, 1630)]
FINGERS = [  # (knuckle, tip): index … pinky, as drawn from left to right
    ((1325, 1670), (1315, 1820)),
    ((1362, 1670), (1367, 1800)),
    ((1402, 1660), (1415, 1785)),
    ((1445, 1675), (1462, 1760)),
]
LIFT = 0.24  # how far a lifted fingertip goes towards its knuckle


def to_local(p):  # source canvas → pixels of the upsampled part image
    return ((p[0] * 0.5 - H["x"]) * UP, (p[1] * 0.5 - H["y"]) * UP)


def mls_rigid_inverse(src_pts, dst_pts, w, h, alpha=1.0):
    """for every output pixel v the source pixel f(v): rigid MLS that maps dst pins → src pins"""
    p = np.asarray(dst_pts, np.float64)  # pins where they end up
    q = np.asarray(src_pts, np.float64)  # the same pins in the original image
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float64)
    v = np.stack([xs, ys], -1).reshape(-1, 1, 2)  # N,1,2
    d2 = ((p[None] - v) ** 2).sum(-1)  # N,K
    wgt = 1.0 / np.maximum(d2, 1e-6) ** alpha
    ws = wgt.sum(1, keepdims=True)
    ps = (wgt[..., None] * p[None]).sum(1) / ws  # N,2
    qs = (wgt[..., None] * q[None]).sum(1) / ws
    ph = p[None] - ps[:, None]  # N,K,2
    qh = q[None] - qs[:, None]
    vp = v[:, 0] - ps  # N,2
    perp = lambda a: np.stack([-a[..., 1], a[..., 0]], -1)
    # f_r(v) = Σ q̂_i A_i,  A_i = w_i [p̂_i; -p̂_i⊥][v-p*; -(v-p*)⊥]^T
    a11 = (ph * vp[:, None]).sum(-1)
    a12 = (ph * -perp(vp)[:, None]).sum(-1)
    pp = -perp(ph)
    a21 = (pp * vp[:, None]).sum(-1)
    a22 = (pp * -perp(vp)[:, None]).sum(-1)
    fx = (wgt * (qh[..., 0] * a11 + qh[..., 1] * a21)).sum(1)
    fy = (wgt * (qh[..., 0] * a12 + qh[..., 1] * a22)).sum(1)
    fr = np.stack([fx, fy], -1)
    norm = np.linalg.norm(fr, axis=-1, keepdims=True)
    f = np.linalg.norm(vp, axis=-1, keepdims=True) * fr / np.maximum(norm, 1e-9) + qs
    return f[:, 0].reshape(h, w).astype(np.float32), f[:, 1].reshape(h, w).astype(np.float32)


def pins_for(finger, amount):
    src, dst = [], []
    for fp in FIXED:
        src.append(to_local(fp)); dst.append(to_local(fp))
    # only the knuckles of the other fingers hold: their tips would pull on the moving one (only its layer is warped)
    for i, (base, tip) in enumerate(FINGERS):
        b, t = np.array(to_local(base)), np.array(to_local(tip))
        src.append(tuple(b)); dst.append(tuple(b))
        if i == finger:
            mid = (b + t) / 2
            k = LIFT * amount
            src += [tuple(mid), tuple(t)]
            dst += [tuple(mid + (b - mid) * k * 0.45), tuple(t + (b - t) * k)]
    return src, dst


def finger_masks(hh, ww):
    """per finger: the pixels nearest to its axis (knuckle → tip), below the knuckle line (soft edge there)"""
    ys, xs = np.mgrid[0:hh, 0:ww].astype(np.float64)
    dist, along = [], []
    for base, tip in FINGERS:
        b, t = np.array(to_local(base)), np.array(to_local(tip))
        d = t - b
        L2 = (d ** 2).sum()
        u = ((xs - b[0]) * d[0] + (ys - b[1]) * d[1]) / L2
        uc = np.clip(u, 0, 1.4)
        px, py = b[0] + uc * d[0], b[1] + uc * d[1]
        dist.append(np.hypot(xs - px, ys - py)); along.append(u)
    dist = np.stack(dist); near = dist.argmin(0)
    masks = []
    for i in range(len(FINGERS)):
        m = (near == i) & (dist[i] < 34 * UP)
        # a hard edge a little below the knuckle: the warp there is still ~0, so the cut does not show
        masks.append((m & (along[i] > 0.02)).astype(np.float32))
    return masks


def premul(img):
    big = cv2.resize(img, (img.shape[1] * UP, img.shape[0] * UP), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    a = big[:, :, 3:4] / 255.0
    return np.concatenate([big[:, :, :3] * a, big[:, :, 3:4]], -1)


def unpremul(pre, size):
    al = pre[:, :, 3:4]
    rgb = np.where(al > 0.5, pre[:, :, :3] / np.maximum(al / 255.0, 1e-6), 0)
    small = cv2.resize(np.concatenate([rgb, al], -1), size, interpolation=cv2.INTER_AREA)
    return np.clip(small + 0.5, 0, 255).astype(np.uint8)


def frame(img, maps, finger, masks):
    """the hand without the moving finger, with the warped finger laid over it"""
    pre = premul(img)
    m = masks[finger][..., None]
    rest = pre * (1 - m)
    fing = cv2.remap(pre * m, maps[0], maps[1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    fa = fing[:, :, 3:4] / 255.0
    out = fing + rest * (1 - fa)  # premultiplied "over"
    return unpremul(out, (img.shape[1], img.shape[0]))


base = np.array(Image.open(os.path.join(OUT, "handR.webp")).convert("RGBA"))
hh, ww = base.shape[0] * UP, base.shape[1] * UP
masks = finger_masks(hh, ww)
frames = []
for finger in (3, 2, 1, 0):  # pinky first
    for amount in (0.5, 1.0):
        s, d = pins_for(finger, amount)
        frames.append((finger, mls_rigid_inverse(s, d, ww, hh)))
tones = [""] + sorted(d for d in os.listdir(OUT) if d.startswith("skin-"))
for tone in tones:
    src = os.path.join(OUT, tone, "handR.webp")
    if not os.path.exists(src):
        continue
    img = np.array(Image.open(src).convert("RGBA"))
    for k, (finger, m) in enumerate(frames, 1):
        Image.fromarray(frame(img, m, finger, masks)).save(os.path.join(OUT, tone, f"handR-f{k}.webp"), "WEBP", quality=90, method=6)
print("hand frames:", len(frames), "× tones:", len(tones))
