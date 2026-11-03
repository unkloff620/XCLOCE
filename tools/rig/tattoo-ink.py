"""
Ink layers of a tattoo set from the image edits — the ONE way to make them (then run build-tattoos.py):
  python3 tools/rig/tattoo-ink.py <set> [<set> …]
Inputs (tools/rig/source/tattoo/):
  _base/in.png, full.png      the bare hero the edits were made on (1024×1536, the rig at 0,51 ×1.434) and his body alpha
  _base/head-in.png, handR-in.png, geo.json   the head and the right hand alone (1024², placed by geo.json)
  _edits/<set>-hq.png         the whole body inked (an image edit of _base/in.png)
  _edits/<set>-head.png, <set>-hand.png       the head and the hand inked
Output: <set>/full-ink.png (1000×1400 rig canvas), <set>/head-ink.png, <set>/handR-ink.png.

The rules (each was a bug once):
  1. the edit never lands exactly on the hero: its figure is first warped onto the hero's outline (a dense flow between
     the two silhouettes), then the ink is unmixed from the skin;
  2. the hero's own dark lines drop out of the unmix: those holes, and the strip between the outline and the edited
     figure's edge, are filled with the ink right next to them;
  3. no ink on the shorts, a few px inside the outline at most;
  4. the coverage is checked: a set leaves less than MAX_BARE of the inkable skin bare, or the script fails.
"""
import json, sys, os
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
T = os.path.join(ROOT, "tools", "rig", "source", "tattoo")
HERO = os.path.join(ROOT, "public", "assets", "hero")
MAX_BARE = 0.04


def prep(f):
    """a 1024×1536 picture → the 1000×1400 rig canvas"""
    return np.array(Image.open(f).convert("RGB").crop((0, 51, 1024, 51 + 1434)).resize((1000, 1400), Image.LANCZOS)).astype(np.float32)


def figure(img):
    """the figure on a white background: everything not connected to the border through near-white"""
    white = img.min(2) > 236
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    return ~np.isin(lab, list(border))


def sdf(m):
    m = m.astype(np.uint8)
    return (cv2.distanceTransform(m, cv2.DIST_L2, 5) - cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)).astype(np.float32)


def fit_box(target, moving_mask, moving_img):
    """the edit is often drawn bigger or shifted: scale and move it so the figures' boxes match"""
    ty, tx = np.nonzero(target)
    my_, mx_ = np.nonzero(moving_mask)
    sx = (tx.max() - tx.min()) / max(1, mx_.max() - mx_.min())
    sy = (ty.max() - ty.min()) / max(1, my_.max() - my_.min())
    M = np.float32([[sx, 0, tx.min() - mx_.min() * sx], [0, sy, ty.min() - my_.min() * sy]])
    H, W = target.shape
    img = cv2.warpAffine(moving_img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    m = cv2.warpAffine(moving_mask.astype(np.uint8) * 255, M, (W, H), flags=cv2.INTER_LINEAR) > 127
    return m, img


def warp_onto(target, moving_mask, moving_img):
    """warp moving_img so its figure (moving_mask) lies on target (rule 1): box fit, then a dense flow between outlines"""
    moving_mask, moving_img = fit_box(target, moving_mask, moving_img)
    H, W = target.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx, my = xx.copy(), yy.copy()
    a8 = ((np.clip(sdf(target), -30, 30) + 30) * 4).astype(np.uint8)
    cur = moving_mask
    for _ in range(6):
        b8 = ((np.clip(sdf(cur), -30, 30) + 30) * 4).astype(np.uint8)
        flow = cv2.calcOpticalFlowFarneback(a8, b8, None, 0.5, 4, 31, 10, 7, 1.5, 0)
        for k in range(2):
            flow[..., k] = cv2.GaussianBlur(flow[..., k], (0, 0), 5)
        nx = cv2.remap(mx, xx + flow[..., 0], yy + flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        ny = cv2.remap(my, xx + flow[..., 0], yy + flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        mx, my = nx, ny
        cur = cv2.remap(moving_mask.astype(np.uint8) * 255, mx, my, cv2.INTER_LINEAR) > 127
    return cv2.remap(moving_img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def unmix(a, b, inside):
    """the ink over the skin: b = (1-α)·a + α·ink, α as small as possible"""
    skin = np.maximum(a, 1)
    al = np.max((skin - b) / skin, axis=2)
    al = np.clip((al - 0.06) / 0.94, 0, 1)
    lines = ndimage.binary_dilation(a.mean(2) < 120, iterations=2)
    al[~inside] = 0
    al[lines] = 0
    al = ndimage.gaussian_filter(al, 0.5)
    al[al < 0.06] = 0
    k = np.where(al > 0.01, al, 1)[..., None]
    ink = np.clip((b - (1 - al[..., None]) * a) / k, 0, 255)
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = ink.astype(np.uint8)
    out[..., 3] = (np.clip(al * 1.05, 0, 1) * 255).astype(np.uint8)
    return out, lines


def fill_gaps(out, skin, lines):
    """rule 2: inpaint the holes the hero's own lines cut in the inked area (only those: a light stroke of the tattoo has a
    low alpha on purpose), then push the ink out to the outline"""
    A = out[..., 3]
    covered = ndimage.binary_fill_holes(ndimage.binary_closing(A > 60, iterations=9)) & skin
    holes = covered & lines
    m = (ndimage.binary_dilation(holes, iterations=2) & covered).astype(np.uint8) * 255
    rgb = cv2.inpaint(np.ascontiguousarray(out[..., :3]), m, 7, cv2.INPAINT_TELEA)
    al = cv2.inpaint(np.ascontiguousarray(A), m, 7, cv2.INPAINT_TELEA)
    h = m > 0
    out[h, :3] = rgb[h]
    out[h, 3] = np.maximum(al[h], A[h])
    # the strip along the outline (outside the inked area only — never over the light strokes inside it): the nearest
    # solid ink, copied outwards
    solid = out[..., 3] > 150
    inked = ndimage.binary_fill_holes(ndimage.binary_closing(out[..., 3] > 30, iterations=3))
    dist, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    gap = skin & ~inked & (dist < 40)
    ys, xs = np.nonzero(gap)
    out[ys, xs] = out[iy[ys, xs], ix[ys, xs]]
    bl = cv2.GaussianBlur(out, (0, 0), 1.2)
    g = ndimage.binary_dilation(gap, iterations=1)
    out[g] = bl[g]
    out[~skin] = 0
    return out


def main(sid):
    base = os.path.join(T, "_base")
    a = prep(os.path.join(base, "in.png"))
    body = np.array(Image.open(os.path.join(base, "full.png")))[..., 3] > 128
    # rule 3: the skin that may carry ink — the body minus the shorts (their dark navy cloth), a little inside the outline
    shorts = body & (a[..., 2] > a[..., 0] + 6) & (a.max(2) < 110)
    shorts = ndimage.binary_closing(shorts, iterations=4)
    lab, n = ndimage.label(shorts)
    if n:
        sz = ndimage.sum(shorts, lab, range(1, n + 1))
        shorts = ndimage.binary_dilation(lab == (np.argmax(sz) + 1), iterations=3)
    skin = body & ~shorts & (ndimage.distance_transform_edt(body) > 3)
    b0 = prep(os.path.join(T, "_edits", f"{sid}-hq.png"))
    # both figures by the same rule (holes between the arms and the body filled), so the outlines compare like for like
    b = warp_onto(figure(a), figure(b0), b0)
    out, lines = unmix(a, b, ndimage.binary_erosion(body, iterations=3) & ~shorts)
    out = fill_gaps(out, skin, lines)
    covered = ndimage.binary_fill_holes(ndimage.binary_closing(out[..., 3] > 30, iterations=3))
    bare = (skin & ~covered).sum() / skin.sum()
    os.makedirs(os.path.join(T, sid), exist_ok=True)
    Image.fromarray(out).save(os.path.join(T, sid, "full-ink.png"))
    # the head and the hand: small, drawn alone — a rigid fit is enough
    geo = json.load(open(os.path.join(base, "geo.json")))
    for p, src in (("head", f"{sid}-head.png"), ("handR", f"{sid}-hand.png")):
        g = geo[p]
        a2 = np.array(Image.open(os.path.join(base, f"{p}-in.png")).convert("RGB")).astype(np.float32)
        b2 = np.array(Image.open(os.path.join(T, "_edits", src)).convert("RGB")).astype(np.float32)
        r = np.array(Image.open(os.path.join(HERO, f"{p}.webp")).convert("RGBA").resize((round(g["w"] * g["k"]), round(g["h"] * g["k"])), Image.LANCZOS))[..., 3] > 128
        m = np.zeros(a2.shape[:2], bool)
        m[g["oy"]:g["oy"] + r.shape[0], g["ox"]:g["ox"] + r.shape[1]] = r
        b2 = warp_onto(figure(a2), figure(b2), b2)
        ink, _ = unmix(a2, b2, ndimage.binary_erosion(m, iterations=3))
        al = ink[..., 3].astype(np.float32)
        al[al < 70] = 0
        lab2, n2 = ndimage.label(al > 0)
        if n2:
            sz = ndimage.sum(np.ones_like(al), lab2, range(1, n2 + 1))
            al[~np.isin(lab2, np.where(sz >= max(60, sz.max() * 0.05))[0] + 1)] = 0
        ink[..., 3] = al.astype(np.uint8)
        I = Image.fromarray(ink).crop((g["ox"], g["oy"], g["ox"] + r.shape[1], g["oy"] + r.shape[0])).resize((g["w"], g["h"]), Image.LANCZOS)
        I.save(os.path.join(T, sid, f"{p}-ink.png"))
    print(sid, "bare skin", round(bare * 100, 1), "%")
    if bare > MAX_BARE:
        raise SystemExit(f"{sid}: {bare:.1%} of the skin left bare (> {MAX_BARE:.0%}) — the edit is not a full suit, redo it")


if __name__ == "__main__":
    for s in sys.argv[1:]:
        main(s)
