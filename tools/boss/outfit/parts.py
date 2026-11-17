"""
A boss in another outfit, part by part (the zones of «Захват»). The artist's raw layers (tools/boss/source/<boss>/raw/,
2000×3000, in place) are dressed up ONE BY ONE: every clothing layer goes to the image edit alone and whole (nothing of
it hidden by the other layers), with a picture of the outfit as the reference, so even the parts that the other layers
cover are drawn as this piece's own cloth. The edit is fitted back onto the layer and takes ITS outline (alpha) exactly —
the joints, the pivots and the poses stay the boss's own.

  parts.py inputs <boss>                    → tools/boss/outfit/parts/<boss>-<layer>-in.png (1024², white) + <boss>-parts.json
  (the edits: <boss>-<outfit>-<layer>-<q>.png next to them, made on the user's device — tatgen/parts.py)
  parts.py apply <boss> <outfit> <q>        → tools/boss/source/<boss>-<outfit>/raw/ (the other raw layers copied as they are)
  then: python3 tools/boss/assemble-<boss>.py tools/boss/source/<boss>-<outfit> && python3 tools/boss/build-boss.py <boss>-<outfit>
  parts.py sheet <boss> <outfit>            → a check picture: every piece laid apart (like the artist's sheet) + the whole boss
"""
import os, sys, json, shutil
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "source")
OUT = os.path.join(HERE, "parts")
# the layers with clothes on them (the forearms, the fists and the head stay bare skin — never redrawn)
CLOTHES = ["torso", "upperL", "upperR", "pants"]
PAD = 0.05
# the upper arms: only the sleeve changes, the skin keeps the artist's own pixels — it must match the forearm's skin
# exactly, or the elbow shows a seam when the arm bends
SLEEVE_ONLY = {"upperL", "upperR"}


def sleeve_mask(o):
    """the cloth on a piece: the light, grey (unsaturated) pixels of the T-shirt sleeve, its rips closed, a little grown over its outline"""
    hsv = cv2.cvtColor(o[:, :, :3], cv2.COLOR_RGB2HSV)
    a = o[:, :, 3] > 128
    cloth = (a & (hsv[:, :, 1] < 70) & (hsv[:, :, 2] > 110)).astype(np.uint8)
    cloth = cv2.morphologyEx(cloth, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    n, lb, st, _ = cv2.connectedComponentsWithStats(cloth)
    keep = np.isin(lb, [i for i in range(1, n) if st[i, 4] > 3000]).astype(np.uint8)
    keep = cv2.dilate(keep, np.ones((7, 7), np.uint8)) & a
    return cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.2)


def raw(boss, n):
    return Image.open(os.path.join(SRC, boss, "raw", f"{n}.png")).convert("RGBA")


def inputs(boss):
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for n in CLOTHES:
        im = raw(boss, n)
        x0, y0, x1, y1 = im.getbbox()
        side = round(max(x1 - x0, y1 - y0) * (1 + 2 * PAD))
        ox, oy = (x0 + x1) // 2 - side // 2, (y0 + y1) // 2 - side // 2
        sq = Image.new("RGBA", (side, side), (255, 255, 255, 255))
        sq.alpha_composite(im.crop((ox, oy, ox + side, oy + side)))  # PIL pads outside the sheet with transparency
        sq.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, f"{boss}-{n}-in.png"))
        meta[n] = {"ox": ox, "oy": oy, "side": side}
        print(n, ox, oy, side)
    json.dump(meta, open(os.path.join(OUT, f"{boss}-parts.json"), "w"))


def fit(inp, ed):
    """the edit onto the input: the piece's outline did not move — ECC on the blurred pictures"""
    g = lambda a: cv2.GaussianBlur(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255, (0, 0), 3)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(g(inp), g(ed), warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    except cv2.error as e:
        print("  ECC failed, no fit:", str(e)[:80])
    return cv2.warpAffine(ed, warp, (ed.shape[1], ed.shape[0]), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE), warp


def apply(boss, outfit, q):
    meta = json.load(open(os.path.join(OUT, f"{boss}-parts.json")))
    src = os.path.join(SRC, boss, "raw"); dst = os.path.join(SRC, f"{boss}-{outfit}", "raw")
    if os.path.isdir(dst): shutil.rmtree(dst)
    shutil.copytree(src, dst)
    for n in CLOTHES:
        p = os.path.join(OUT, f"{boss}-{outfit}-{n}-{q}.png")
        if not os.path.exists(p): print(n, "— no edit, kept"); continue
        m = meta[n]; side = m["side"]
        inp = np.array(Image.open(os.path.join(OUT, f"{boss}-{n}-in.png")).convert("RGB"))
        ed = np.array(Image.open(p).convert("RGB").resize((1024, 1024), Image.LANCZOS))
        ed, warp = fit(inp, ed)
        print(n, "fit", warp.round(3).tolist())
        big = cv2.resize(ed, (side, side), interpolation=cv2.INTER_CUBIC)
        orig = np.array(raw(boss, n))
        H, W = orig.shape[:2]
        sheet = np.full((H, W, 3), 255, np.uint8)
        ox, oy = m["ox"], m["oy"]
        sx, sy, ex, ey = max(0, ox), max(0, oy), min(W, ox + side), min(H, oy + side)
        sheet[sy:ey, sx:ex] = big[sy - oy:ey - oy, sx - ox:ex - ox]
        a = orig[:, :, 3]
        # inside the outline, where the edit left white background (its piece a hair narrower): the nearest drawn colour
        hole = (sheet.min(2) > 235) & (a > 0)
        hole = cv2.dilate(hole.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        if hole.any():
            _, lab = cv2.distanceTransformWithLabels(hole.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
            ys, xs = np.nonzero(~hole)
            lut = np.zeros((lab.max() + 1, 3), np.uint8); lut[lab[ys, xs]] = sheet[ys, xs]
            sheet = np.where(hole[..., None], lut[lab], sheet)
        if n in SLEEVE_ONLY:
            k = sleeve_mask(orig)[..., None]
            sheet = (sheet * k + orig[:, :, :3] * (1 - k)).round().astype(np.uint8)
        out = np.dstack([sheet, a])
        Image.fromarray(out.astype(np.uint8)).save(os.path.join(dst, f"{n}.png"))
        print(n, "→", dst, f"(filled {int(hole.sum())} px)")


def check(boss, outfit):
    """the pieces laid apart on white (as on the artist's sheet) + the whole boss, the original next to it"""
    order = ["upperL", "foreL", "fistL", "pants", "torso", "head", "upperR", "foreR", "fistR"]
    spread = {"head": (0, -420), "torso": (0, -120), "pants": (0, 260), "upperL": (-380, -140), "foreL": (-520, 120),
              "fistL": (-420, 420), "upperR": (330, -60), "foreR": (560, -20), "fistR": (420, -380)}
    cols = []
    for b in (boss, f"{boss}-{outfit}"):
        d = os.path.join(SRC, b, "raw")
        apart = Image.new("RGBA", (3200, 3900), (255, 255, 255, 255))
        whole = Image.new("RGBA", (2000, 3000), (255, 255, 255, 255))
        for n in order:
            im = Image.open(os.path.join(d, f"{n}.png")).convert("RGBA")
            dx, dy = spread[n]
            apart.alpha_composite(im, (600 + dx, 450 + dy))
            whole.alpha_composite(im)
        cols += [apart.resize((738, 900)), whole.resize((600, 900))]
    w = sum(c.width for c in cols) + 30 * (len(cols) - 1)
    o = Image.new("RGB", (w, 900), "white"); x = 0
    for c in cols: o.paste(c.convert("RGB"), (x, 0)); x += c.width + 30
    p = os.path.join(OUT, f"{boss}-{outfit}-check.png"); o.save(p); print(p)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "inputs": [inputs(b) for b in sys.argv[2:]]
    elif cmd == "apply": apply(*sys.argv[2:5])
    elif cmd == "sheet": check(*sys.argv[2:4])
