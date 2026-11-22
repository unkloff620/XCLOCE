"""
«Зарубы» bags (tools/zarub/source/bag-<mode>.webp — the generated ones): the white left in the handles' gaps cut out, and
three colours per difficulty, so the three bags of a difficulty differ — «Пацанские»: green (as drawn), blue, burgundy;
«Блатные»: brown (as drawn), yellow, red; «Авторитетные»: grey-black (as drawn), white, purple. Only the bag's own
leather / canvas is recoloured (its hue and darkness), the brown handles, the brass, the rings and the papers stay.
→ public/assets/zarub/bag-<mode>-<0|1|2>.webp
"""
import numpy as np, cv2
from PIL import Image

S, O = "tools/zarub/source", "public/assets/zarub"


def cut_white(a):
    """near-white blobs (the background left inside the handles) → transparent"""
    rgb = a[..., :3].astype(int)
    white = (rgb.min(-1) > 228) & (a[..., 3] > 0)
    n, lab, st, _ = cv2.connectedComponentsWithStats(white.astype(np.uint8), 8)
    out = a.copy()
    for i in range(1, n):
        if st[i, 4] >= 120:
            m = lab == i
            m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            # the soft edge round the blob: pale pixels next to it go too
            pale = m & (rgb.min(-1) > 200)
            out[pale, 3] = 0
    return out


def hsv(a):
    return cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(np.float32)  # h 0..255


def back(h):
    return cv2.cvtColor(np.clip(h, 0, 255).astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)


def recolour(a, mask, f):
    """f(h, s, v) → (h, s, v) on the masked pixels (soft mask 0..1)"""
    H = hsv(a)
    h, s, v = H[..., 0], H[..., 1], H[..., 2]
    nh, ns, nv = f(h.copy(), s.copy(), v.copy())
    new = back(np.stack([nh, ns, nv], -1)).astype(np.float32)
    m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 0.8)[..., None]
    out = a.copy()
    out[..., :3] = (a[..., :3] * (1 - m) + new * m).astype(np.uint8)
    return out


deg = lambda d: d * 255 / 360
for mode in ("pacan", "blat", "avtor"):
    a = cut_white(np.array(Image.open(f"{S}/bag-{mode}.webp").convert("RGBA")))
    H = hsv(a); h, s, v = H[..., 0], H[..., 1] / 255, H[..., 2] / 255
    alpha = a[..., 3] > 0
    if mode == "pacan":
        body = alpha & (h > deg(41)) & (h < deg(140)) & (s > 0.2) & (v < 0.55)
        variants = [
            None,
            lambda h, s, v: (np.full_like(h, deg(215)), np.minimum(255, s * 1.25), v * 1.05),   # blue
            lambda h, s, v: (np.full_like(h, deg(350)), np.minimum(255, s * 1.45), v * 0.92),   # burgundy
        ]
    elif mode == "blat":
        body = alpha & (h > deg(4)) & (h < deg(36)) & (v < 0.62) & (s > 0.18)
        variants = [
            None,
            lambda h, s, v: (np.full_like(h, deg(46)), np.minimum(255, s * 1.35), np.minimum(255, v * 1.75)),  # yellow
            lambda h, s, v: (np.full_like(h, deg(358)), np.minimum(255, s * 1.5), np.minimum(255, v * 1.35)),  # red
        ]
    else:
        body = alpha & (s < 0.28) & (v > 0.06) & (v < 0.5)
        variants = [
            None,
            lambda h, s, v: (h, s * 0.3, np.minimum(255, 120 + v * 1.9)),                           # white
            lambda h, s, v: (np.full_like(h, deg(278)), np.full_like(s, 150), np.minimum(255, 40 + v * 1.7)),  # purple
        ]
    for k, f in enumerate(variants):
        out = a if f is None else recolour(a, body, f)
        Image.fromarray(out).save(f"{O}/bag-{mode}-{k}.webp", quality=88, method=6, exact=True)
    print(mode, "body", round(float(body.mean()) * 100, 1), "%")
