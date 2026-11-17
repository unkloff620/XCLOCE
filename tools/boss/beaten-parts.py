"""
A boss's beaten look (below half HP) from the artist's raw layers, part by part — as tools/boss/outfit/parts.py does
the outfits: each layer goes to the image edit alone and whole (blood, rips, bruises drawn on it), the answer is fitted
back onto the layer and takes ITS outline (alpha) exactly, so the joints and the poses stay.

  beaten-parts.py inputs <boss> <layer…>          → tools/boss/beaten/<boss>-<layer>-in.png (1024², white) + <boss>.json
      (a layer "face/head" is the face sheet's head)
  (the edits: <boss>-beaten-<layer>-<q>.png next to them, made on the user's device — tatgen/beaten.py)
  beaten-parts.py apply <boss> <q> <layer…>       → tools/boss/source/<boss>-beaten/raw/ (the other raw layers copied)
  then: python3 tools/boss/assemble-<boss>.py <variant dir> [flags] && python3 tools/boss/build-boss.py <boss>-beaten
"""
import os, sys, json, shutil
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.join(HERE, "beaten")
PAD = 0.05
key = lambda n: n.replace("/", "-")


def inputs(boss, layers):
    os.makedirs(OUT, exist_ok=True)
    mp = os.path.join(OUT, f"{boss}.json")
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    for n in layers:
        im = Image.open(os.path.join(SRC, boss, "raw", f"{n}.png")).convert("RGBA")
        a = np.array(im); a[a[..., 3] < 40] = 0; im = Image.fromarray(a)
        x0, y0, x1, y1 = im.getbbox()
        side = round(max(x1 - x0, y1 - y0) * (1 + 2 * PAD))
        ox, oy = (x0 + x1) // 2 - side // 2, (y0 + y1) // 2 - side // 2
        sq = Image.new("RGBA", (side, side), (255, 255, 255, 255))
        sq.alpha_composite(im.crop((ox, oy, ox + side, oy + side)))
        sq.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, f"{boss}-{key(n)}-in.png"))
        meta[n] = {"ox": ox, "oy": oy, "side": side}
        print(n, ox, oy, side)
    json.dump(meta, open(mp, "w"))


def fit(inp, ed):
    g = lambda a: cv2.GaussianBlur(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255, (0, 0), 3)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(g(inp), g(ed), warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    except cv2.error as e:
        print("  ECC failed, no fit:", str(e)[:80])
    return cv2.warpAffine(ed, warp, (ed.shape[1], ed.shape[0]), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE), warp


def apply(boss, q, layers):
    meta = json.load(open(os.path.join(OUT, f"{boss}.json")))
    src = os.path.join(SRC, boss, "raw"); dst = os.path.join(SRC, f"{boss}-beaten", "raw")
    if os.path.isdir(dst): shutil.rmtree(dst)
    shutil.copytree(src, dst)
    for n in layers:
        p = os.path.join(OUT, f"{boss}-beaten-{key(n)}-{q}.png")
        if not os.path.exists(p): print(n, "— no edit, kept"); continue
        m = meta[n]; side = m["side"]
        inp = np.array(Image.open(os.path.join(OUT, f"{boss}-{key(n)}-in.png")).convert("RGB"))
        ed = np.array(Image.open(p).convert("RGB").resize((1024, 1024), Image.LANCZOS))
        ed, warp = fit(inp, ed)
        print(n, "fit", warp.round(3).tolist())
        big = cv2.resize(ed, (side, side), interpolation=cv2.INTER_CUBIC)
        orig = np.array(Image.open(os.path.join(src, f"{n}.png")).convert("RGBA"))
        H, W = orig.shape[:2]
        sheet = np.full((H, W, 3), 255, np.uint8)
        ox, oy = m["ox"], m["oy"]
        sx, sy, ex, ey = max(0, ox), max(0, oy), min(W, ox + side), min(H, oy + side)
        sheet[sy:ey, sx:ex] = big[sy - oy:ey - oy, sx - ox:ex - ox]
        a = orig[..., 3]
        # the edit's white background inside the outline and the faint soft edge take the nearest colour of the piece itself
        rim = cv2.distanceTransform((a > 0).astype(np.uint8), cv2.DIST_L2, 5) < 28
        hole = ((sheet.min(2) > 235) | (rim & (sheet.min(2) > 185))) & (a > 0)
        hole = (cv2.dilate(hole.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) | ((a > 0) & (a < 160))
        if hole.any():
            ok = ~hole & (a >= 160)
            _, lab = cv2.distanceTransformWithLabels((~ok).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
            ys, xs = np.nonzero(ok)
            lut = np.zeros((lab.max() + 1, 3), np.uint8); lut[lab[ys, xs]] = sheet[ys, xs]
            sheet = np.where(hole[..., None], lut[lab], sheet)
        Image.fromarray(np.dstack([sheet, a]).astype(np.uint8)).save(os.path.join(dst, f"{n}.png"))
        print(n, "→ ok")


if __name__ == "__main__":
    cmd, boss = sys.argv[1], sys.argv[2]
    if cmd == "inputs": inputs(boss, sys.argv[3:])
    elif cmd == "apply": apply(boss, sys.argv[3], sys.argv[4:])
