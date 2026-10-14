"""
Animated boss rigs from the artist's layers: tools/boss/source/<boss>/{body,head,eyes,eyes-closed,foreL,foreR}.png
plus optional face parts {pupils,brows,brows-sad,mouth,mouth-closed} and {collar} (all on one canvas, in place)
→ public/bosses/<boss>/rig/<part>.webp (trimmed, half size) + src/client/art/boss-rig-data.ts.
Pivots: head — bottom of the neck; forearms — the elbow (the end that joins the body).
Loose parts drawn on separate sheets are put in place first by fit-parts.py / place-parts.py (see assemble-kedr.py).
"""
import os, glob, json
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SCALE = 0.5
PARTS = ["tail", "body", "foreL", "foreR", "armL", "lowL", "handL", "armR", "lowR", "handR", "head", "eyes", "eyes-closed", "pupils", "brows", "brows-sad", "mouth", "mouth-closed", "collar"]
# puppet-warped sequences (<part>@0.png, <part>@1.png …): one strip <part>.webp, frames side by side, frame 0 first
FRAMES = ["brows", "jaw"]
# which edge of the part joins the parent: (axis, side) — y/bottom for head and left forearm, x/right for the right one
JOINT = {"head": ("y", "max"), "foreL": ("y", "max"), "foreR": ("x", "max")}
# bosses whose arms come up from below (both elbows at the bottom end)
JOINT_BY_BOSS = {"kedr": {"foreR": ("y", "max")}}
# hand-placed joints (output px): where the arm piece lies over the end of the torso's sleeve, so it turns without a gap
PIVOT_BY_BOSS = {
    "bebyakyan": {"foreL": [228.0, 405.0], "foreR": [617.0, 437.0]},
    # whole arms swing at the shoulder, the hands with money turn at the wrist (inside the arm's swing)
    "garkusha": {"armL": [290.0, 335.0], "handL": [125.0, 560.0], "armR": [540.0, 350.0], "handR": [730.0, 430.0]},
    # the shark: shoulders, wrists and the root of the tail
    # elbows: the far end of each forearm; wrists: where forearm and fist overlap (tools/boss/assemble-mugo.py)
    "mugo": {"armL": [470.0, 300.0], "lowL": [505.0, 415.0], "handL": [738.0, 492.0],
             "armR": [755.0, 290.0], "lowR": [750.0, 405.0], "handR": [990.0, 484.0], "tail": [460.0, 690.0]},
}

import sys, re
DATA = os.path.join(ROOT, "src", "client", "art", "boss-rig-data.ts")
# `build-boss.py garkusha` rebuilds only the named bosses and keeps the others' data as it is
ONLY = set(sys.argv[1:])
out = {}
if ONLY and os.path.exists(DATA):
    out = json.loads(re.search(r"= (\{.*\});\s*$", open(DATA).read(), re.S).group(1))
for d in sorted(x for x in glob.glob(os.path.join(HERE, "source", "*")) if os.path.isdir(x)):
    boss = os.path.basename(d)
    if ONLY and boss not in ONLY:
        continue
    if not os.path.exists(os.path.join(d, "body.png")):
        continue
    dest = os.path.join(ROOT, "public", "bosses", boss, "rig")
    os.makedirs(dest, exist_ok=True)
    rig = {}
    W = H = None
    for p in PARTS:
        f = os.path.join(d, p + ".png")
        if not os.path.exists(f):
            continue
        im = np.array(Image.open(f).convert("RGBA"))
        H, W = im.shape[:2]
        a = im[:, :, 3]
        a[a < 30] = 0
        im[a == 0, :3] = 0
        ys, xs = np.nonzero(a)
        x0, y0, x1, y1 = xs.min() - 3, ys.min() - 3, xs.max() + 4, ys.max() + 4
        crop = Image.fromarray(im[max(0, y0):y1, max(0, x0):x1])
        w, h = round(crop.width * SCALE), round(crop.height * SCALE)
        crop.resize((w, h), Image.LANCZOS).save(os.path.join(dest, p + ".webp"), "WEBP", quality=86, method=4)
        r = {"x": round(max(0, x0) * SCALE, 1), "y": round(max(0, y0) * SCALE, 1), "w": w, "h": h}
        joint = {**JOINT, **JOINT_BY_BOSS.get(boss, {})}
        if p in joint:
            axis, _ = joint[p]
            m = a > 128
            if axis == "y":
                band = ys.max() - (ys.max() - ys.min()) * 0.12
                sel = np.nonzero(m & (np.arange(H)[:, None] >= band))
            else:
                band = xs.max() - (xs.max() - xs.min()) * 0.15
                sel = np.nonzero(m & (np.arange(W)[None, :] >= band))
            r["pivot"] = [round(sel[1].mean() * SCALE, 1), round(sel[0].mean() * SCALE, 1)]
        if p in PIVOT_BY_BOSS.get(boss, {}):
            r["pivot"] = PIVOT_BY_BOSS[boss][p]
        rig[p] = r
    for p in FRAMES:
        fs = sorted(glob.glob(os.path.join(d, f"{p}@*.png")), key=lambda f: int(f.rsplit("@", 1)[1].split(".")[0]))
        if not fs:
            continue
        ims = [np.array(Image.open(f).convert("RGBA")) for f in fs]
        H, W = ims[0].shape[:2]
        a = np.max([im[:, :, 3] for im in ims], axis=0)
        ys, xs = np.nonzero(a >= 30)
        x0, y0, x1, y1 = max(0, xs.min() - 3), max(0, ys.min() - 3), xs.max() + 4, ys.max() + 4
        cw, ch = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
        strip = Image.new("RGBA", (cw * len(ims), ch), (0, 0, 0, 0))
        for i, im in enumerate(ims):
            im[im[:, :, 3] < 30] = 0
            strip.paste(Image.fromarray(im[y0:y1, x0:x1]).resize((cw, ch), Image.LANCZOS), (i * cw, 0))
        strip.save(os.path.join(dest, p + ".webp"), "WEBP", quality=88, method=4)
        rig[p] = {"x": round(x0 * SCALE, 1), "y": round(y0 * SCALE, 1), "w": cw, "h": ch, "frames": len(ims)}
    out[boss] = {"w": round(W * SCALE), "h": round(H * SCALE), "parts": rig}
    print(boss, json.dumps(rig))
ts = "/* Generated by tools/boss/build-boss.py — do not edit by hand. */\n"
ts += "export const BOSS_RIGS: Record<string, { w: number; h: number; parts: Record<string, { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number }> }> = " + json.dumps(out, indent=2) + ";\n"
open(DATA, "w").write(ts)
