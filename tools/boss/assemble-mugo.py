"""
Мугонатор (boss 5, the shark): the artist's layers → rig sources for build-boss.py, all on one canvas (the reference,
cropped by CROP).
Body sheets (tail, legs, torso, shoulders, forearms, fists) are drawn on the reference's own 2745×2800 canvas, in place.
Face sheets (head, eyes, pupils, eyes-closed, brows, jaw) share a 1000×1000 canvas; one similarity transform found by
SIFT matching of the head sheet against the reference (raw/headM.json) puts them all in place.
  tail          sways at its root, behind everything
  armR + handR  the far arm (shoulder + forearm, swings at the shoulder) and its fist (turns at the wrist) — behind the body
  body          legs + shorts + torso (breathes)
  head          head with the open grin; eyes / pupils / eyes-closed — the eyes
  brows@0..4    puppet-warped brows (rigid MLS): 0 calm, 1-2 raised, 3-4 frowning
  jaw@0..4      puppet-warped lower jaw: the lip corners pinned, the lip and chin drop — 0 closed (covers the teeth) … 4 wide
  armL + handL  the near arm crossed over the belly and its fist
Also writes public/bosses/mugo/{full,portrait,card}.webp.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "rig"))
from mls import mls_rigid_inverse  # noqa: E402

D = "tools/boss/source/mugo"
R = f"{D}/raw"
CROP = (140, 220, 2370, 2700)
ref = Image.open(f"{R}/reference.png").convert("RGBA")
W, H = ref.size
M = np.array(json.load(open(f"{R}/headM.json"))["M"], np.float32)


def raw(n):
    return np.array(Image.open(f"{R}/{n}.png").convert("RGBA"))


def over(*arrs):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for a in arrs:
        im.alpha_composite(Image.fromarray(a))
    return im


def save(n, im):
    im.crop(CROP).save(f"{D}/{n}.png")


def premul(a):
    al = a[:, :, 3:].astype(np.float32) / 255
    return np.concatenate([a[:, :, :3] * al, a[:, :, 3:]], axis=2).astype(np.float32)


def unpremul(p):
    A = np.clip(p[:, :, 3:], 0, 255)
    rgb = np.where(A > 0.5, p[:, :, :3] / np.maximum(A / 255, 1e-3), 0)
    return np.concatenate([np.clip(rgb, 0, 255), A], axis=2).astype(np.uint8)


def face_to_ref(a):
    """a face-sheet image (1000×1000) → the reference canvas"""
    w = cv2.warpAffine(premul(a), M, (W, H), flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0))
    return unpremul(w)


def puppet(a, src, dst, box):
    """rigid MLS warp of the face-sheet image a inside box (x0, y0, x1, y1): pins src → dst"""
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    s = np.array(src, np.float64) - [x0, y0]
    d = np.array(dst, np.float64) - [x0, y0]
    mx, my = mls_rigid_inverse(s, d, x1 - x0, y1 - y0)
    w = cv2.remap(premul(sub), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    out = np.zeros_like(a)
    out[y0:y1, x0:x1] = unpremul(w)
    return out


# ---- body
save("tail", over(raw("tail")))
save("armR", over(raw("shoulderR"), raw("foreR")))
save("handR", over(raw("handR")))
save("body", over(raw("legs"), raw("torso")))
save("armL", over(raw("shoulderL"), raw("foreL")))
save("handL", over(raw("handL")))

# ---- face
for n in ["head", "eyes", "pupils", "eyes-closed"]:
    save(n, Image.fromarray(face_to_ref(raw(n))))

# brows: two brows, left one 590…743 (outer end left), right one 885…948 (inner end left)
brows = raw("brows")
BL = [(592, 318), (640, 300), (690, 318), (741, 383)]  # outer … inner
BR = [(887, 376), (918, 360), (946, 383)]  # inner … outer
fixed_far = [(560, 250), (980, 250), (560, 470), (980, 470)]


def brow_frame(lift_out, lift_mid, lift_in):
    src, dst = [], []
    for pts, inner_last in [(BL, True), (BR, False)]:
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            t = i / (n - 1) if inner_last else 1 - i / (n - 1)  # 0 outer … 1 inner
            mid = 1 - abs(t - 0.5) * 2
            dy = -(lift_out * (1 - t) + lift_in * t + lift_mid * mid)
            src.append((x, y))
            dst.append((x, y + dy))
    return puppet(brows, src + fixed_far, dst + fixed_far, (560, 250, 980, 470))


BROWS = [(0, 0, 0), (2, 3, 4), (3, 6, 8), (1, 0, -5), (2, 0, -10)]  # calm, raised ×2, frown ×2 (lift: outer, middle, inner)
for i, b in enumerate(BROWS):
    save(f"brows@{i}", Image.fromarray(face_to_ref(brow_frame(*b))))

# jaw: lip corners (560,494) and (879,601) stay, the lip line and the chin drop
jaw = raw("jaw")
LIP = [(600, 518), (640, 542), (680, 561), (720, 580), (760, 596), (800, 607), (840, 611)]
CHIN = [(640, 650), (720, 686), (800, 683)]
CORNERS = [(560, 494), (879, 601), (548, 486), (890, 600)]
JAW = [0, 11, 22, 34, 46]  # drop of the jaw's middle, face-sheet px
for i, d in enumerate(JAW):
    src, dst = list(CORNERS), list(CORNERS)
    for x, y in LIP:
        t = (x - 560) / (879 - 560)
        f = np.sin(np.pi * t) ** 0.8  # nothing at the corners, the most in the middle
        src.append((x, y)); dst.append((x, y + d * f))
    for x, y in CHIN:
        src.append((x, y)); dst.append((x, y + d * 0.95))
    save(f"jaw@{i}", Image.fromarray(face_to_ref(puppet(jaw, src, dst, (520, 460, 920, 780)))))

# ---- pictures for the lists
os.makedirs("public/bosses/mugo", exist_ok=True)
full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
full.alpha_composite(ref)
fx0, fy0, fx1, fy1 = 260, 150, 2420, 2700  # 2:3-ish around the whole figure, tail included
side = max((fx1 - fx0) / 2, (fy1 - fy0) / 3)
cx, cy = (fx0 + fx1) / 2, (fy0 + fy1) / 2
box = (round(cx - side), round(cy - side * 1.5), round(cx + side), round(cy + side * 1.5))
canvas = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
canvas.alpha_composite(full, (max(0, -box[0]), max(0, -box[1])), (max(0, box[0]), max(0, box[1])))
canvas.resize((1024, 1536), Image.LANCZOS).save("public/bosses/mugo/full.webp", quality=88, method=6)
ref.crop((1000, 160, 1640, 800)).resize((512, 512), Image.LANCZOS).save("public/bosses/mugo/portrait.webp", quality=88, method=6)
# the boss card (640×790): head and chest, like the other bosses' cards
cw = 1180
card = Image.new("RGBA", (cw, round(cw * 790 / 640)), (0, 0, 0, 0))
card.alpha_composite(ref, (0, 0), (760, 150, 760 + cw, 150 + card.height))
card.resize((640, 790), Image.LANCZOS).save("public/bosses/mugo/card.webp", quality=88, method=6)
print("ok")
