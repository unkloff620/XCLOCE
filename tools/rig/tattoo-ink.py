"""
Ink layers of a tattoo set from the image edits — the ONE way to make them (then run build-tattoos.py):
  python3 tools/rig/tattoo-ink.py [--sparse] <set> [<set> …]
  --sparse: a set of separate motifs on bare skin (not a full suit): no ink pushed out to the outline, no coverage check
Inputs (tools/rig/source/tattoo/):
  _base/in.png, full.png      the bare hero the edits were made on (1024×1536, the rig at 0,51 ×1.434) and his body alpha
  _base/head-in.png, handR-in.png, geo.json   the head and the right hand alone (1024², placed by geo.json)
  _edits/<set>-hq.png         the whole body inked (an image edit of _base/in.png)
  _edits/<set>-head.png, <set>-hand.png       the head and the hand inked
Output: <set>/full-ink.png (1000×1400 rig canvas), <set>/head-ink.png, <set>/handR-ink.png.
  --back: the set's back (the user 2026-11-25): _back/in.png, full.png (the hero from behind, WITH his head — the back
  rig has places on it), the edit _edits/<set>-back.png (an edit of _back/in.png with _back/skin-mask.png and the set's
  front edit as the second image) → <set>/back-ink.png

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


def warp_onto(target, moving_mask, moving_img, with_mask=False):
    """warp moving_img so its figure (moving_mask) lies on target (rule 1): box fit, then a dense flow between outlines;
    `with_mask`: also the warped figure (where the edit's own outline ended up)"""
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
    img = cv2.remap(moving_img, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return (img, cur) if with_mask else img


def match_skin(a, b, skin):
    """scale the edit's colours so its bare skin is the hero's skin: the bare skin is the commonest colour of the edit's
    lighter half of the skin (the ink is darker or far more saturated)"""
    flat = ndimage.binary_erosion(skin, iterations=6) & (a.mean(2) > 150)
    bb = b[flat]
    lum = bb.mean(1)
    light = bb[lum > np.percentile(lum, 50)]
    q = (light // 8).astype(int)
    keys, cnt = np.unique(q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2], return_counts=True)
    k = keys[np.argmax(cnt)]
    mode = np.array([k // 10000, k // 100 % 100, k % 100]) * 8 + 4
    near = light[np.abs(light - mode).max(1) < 20]
    gain = np.median(a[flat], 0) / np.maximum(np.median(near, 0), 1)
    gain = np.clip(gain, 0.8, 1.6)
    print("skin gain", np.round(gain, 3), "edit skin", np.median(near, 0).round(), "hero skin", np.median(a[flat], 0))
    return np.clip(b * np.float32(gain), 0, 255)


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


def fill_gaps(out, skin, lines, sparse=False):
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
    if sparse:
        out[~skin] = 0
        return out
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


def main(sid, sparse=False, back=False):
    base = os.path.join(T, "_back" if back else "_base")
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
    b0 = prep(os.path.join(T, "_edits", f"{sid}-back.png" if back else f"{sid}-hq.png"))
    # both figures by the same rule (holes between the arms and the body filled), so the outlines compare like for like
    # the base is HEADLESS: an edit that drew a head (or squeezed the body) cannot be fitted — the ink would smear
    ta, tb = figure(a), figure(b0)
    ha, hb = np.ptp(np.nonzero(ta)[0]), np.ptp(np.nonzero(tb)[0])
    iou = (ta & tb).sum() / max(1, (ta | tb).sum())  # the edit must keep the hero's figure (the mask): kuznya 0.99, a smeared one 0.90
    if (abs(hb / ha - 1) > 0.06 or iou < 0.92) and "--force" not in sys.argv:  # --force: the old sets made before the mask
        raise SystemExit(f"{sid}: the edit's figure is {hb / ha:.0%} of the base's height, overlap {iou:.2f} — it drew a head or moved the body; "
                         "redo the edit of the headless _base/in.png (with the skin mask), never ask to keep a head")
    b, bm = warp_onto(ta, tb, b0, with_mask=True)
    if sparse:
        # a light set leaves bare skin, and the edit often draws that skin a shade darker (tanned): matched to the hero's
        # own skin first, or the whole body gets a thin brown film of «ink» (the user 2026-11-26: the skin must show)
        b = match_skin(a, b, skin)
    out, lines = unmix(a, b, ndimage.binary_erosion(body, iterations=3) & ~shorts)
    # the edit's own outline: where its limbs are thinner than the hero's (the flow does not always get them all the
    # way), it lands inside the body as a dark line along the edge — taken out and inpainted like the hero's own lines
    own = (np.abs(sdf(bm)) < 8) & (b.mean(2) < 110) & (ndimage.distance_transform_edt(body) > 5)
    own = ndimage.binary_dilation(own, iterations=2) & body
    out[own, 3] = 0
    out = fill_gaps(out, skin, lines | own, sparse)
    covered = ndimage.binary_fill_holes(ndimage.binary_closing(out[..., 3] > 30, iterations=3))
    bare = (skin & ~covered).sum() / skin.sum()
    os.makedirs(os.path.join(T, sid), exist_ok=True)
    Image.fromarray(out).save(os.path.join(T, sid, "back-ink.png" if back else "full-ink.png"))
    if back:
        print(sid, "back: bare skin", round(bare * 100, 1), "%")
        if bare > MAX_BARE and not sparse:
            raise SystemExit(f"{sid}: {bare:.1%} of the back's skin left bare (> {MAX_BARE:.0%}) — redo the edit")
        return
    # the head and the hand: small, drawn alone — a rigid fit is enough
    geo = json.load(open(os.path.join(base, "geo.json")))
    for p, src in (("head", f"{sid}-head.png"), ("handR", f"{sid}-hand.png")):
        # an old set redone from its body edit only: its head and hand ink stay as they were
        # (a new set needs none: build-tattoos.py cuts every piece out of full-ink.png — no face, no right hand)
        if not os.path.exists(os.path.join(T, "_edits", src)):
            continue
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
    if bare > MAX_BARE and not sparse:
        raise SystemExit(f"{sid}: {bare:.1%} of the skin left bare (> {MAX_BARE:.0%}) — the edit is not a full suit, redo it")


if __name__ == "__main__":
    sparse = "--sparse" in sys.argv
    for s in [a for a in sys.argv[1:] if not a.startswith("--")]:
        main(s, sparse, "--back" in sys.argv)
