"""
Animated boss rigs from the artist's layers: tools/boss/source/<boss>/{body,head,eyes,eyes-closed,foreL,foreR}.png
plus optional face parts {pupils,brows,brows-sad,mouth,mouth-closed} and {collar} (all on one canvas, in place)
→ public/bosses/<boss>/rig/<part>.webp (trimmed, half size) + src/client/art/boss-rig-data.ts.
Pivots: head — bottom of the neck; forearms — the elbow (the end that joins the body).
Loose parts drawn on separate sheets are put in place first by fit-parts.py / place-parts.py (see assemble-nitka.py).
"""
import os, glob, json
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SCALE = 0.5
# bosses drawn at the generator's size (1024×1536) keep it: halving would make them blurry on a phone
SCALE_BY_BOSS = {}
# parts whose picture is stored at this many times the rig's pixels (same place and size in the rig): Восток's face
# is small on a big body, so its parts keep twice the detail
HIRES_BY_BOSS = {"vodovoz": (2, {"head", "eyes", "pupils", "eyes-closed", "browL", "browR", "mouth-closed", "throat",
                                 "teeth-up", "teeth-low", "head-open", "jaw"}),
                  "vadim": (2, {"head", "eyes", "pupils", "eyes-closed", "browL", "browR", "throat", "teeth-up", "teeth-low", "lips", "mouth-sad", "duck"}),
                  "botsman": (2, {"head", "eyes", "pupils", "eyes-closed", "browL", "browR", "throat", "teeth-up", "teeth-low", "lips"}),
                  "utilizator": (2, {"head", "eyes", "pupils", "eyes-closed", "browL", "browR", "throat", "teeth-up", "teeth-low", "lips", "lips-up"}),
                  "psih": (2, {"head", "eyes", "pupils", "browL", "browR", "throat", "teeth-up", "teeth-low", "lips", "lips-up", "nose", "chin", "temple", "glasses", "hair"}),
                  "solntse": (2, {"head", "eyes", "pupils", "mouthIn", "jawLow"}),
                  "himik": (2, {"head", "eyes", "pupils", "brows", "chin", "throat", "teeth-up", "teeth-low", "beard", "mustache", "mask", "maskEar"}),
                  "datsik": (2, {"head", "eyes", "pupils", "brows", "chin", "throat", "tongue", "teeth-up", "teeth-low"}),
                  "fokus": (2, {"head", "eyes", "pupils", "brows", "glasses", "throat", "teeth-up", "teeth-low", "chin", "hoodFront", "hoodShadow", "phone"}),
                  "kedr": (2, {"head", "eyes", "pupils", "brows", "chin", "throat", "teeth-up", "teeth-low"}),
                  "nitka": (2, {"head", "eyes", "pupils", "brows", "glasses", "throat", "teeth-up", "teeth-low", "chin"}),
                  "knyaz": (2, {"head", "head-open", "eyes", "pupils", "eyes-closed", "throat", "teeth-up", "teeth-low", "lips", "mouth-closed", "mouth-sad", "gag"})}
PARTS = ["tail", "legs", "shirtR", "shirtL", "handR-blood", "handL-blood", "legs-glow", "body", "body-glow", "apron", "chestR", "chestR-glow", "chestL", "poker", "mouthIn", "jawLow", "armR-glow", "lowR-glow", "headset", "foreL", "foreR", "armL", "lowL", "handL", "bag", "vials", "gasmask", "cover", "keyRing", "keyFob", "keyKey", "duck", "armR", "lowR", "handR", "head", "head-open", "throat", "teeth-up", "teeth-low", "jaw", "lips", "lips-up", "mouth-sad", "eyes", "eyes-closed", "pupils", "brows", "brows-sad", "browL", "browR", "mouth", "mouth-closed", "collar", "gag", "fingerR", "nose", "chin", "temple", "glasses", "hair", "phone", "hoodFront", "hoodShadow", "neck", "hoodBack", "laptop", "coat", "coatBack", "tongue",
         "coatR", "coatL", "fingersR", "thumbR", "flaskR", "flaskR-glass", "tube", "tube-glass", "beard", "mustache", "mask", "maskEar",
         "poisonR-mask", "poisonL-mask"]
# puppet-warped sequences (<part>@0.png, <part>@1.png …): one strip <part>.webp, frames side by side, frame 0 first
FRAMES = ["brows", "jaw", "armRb", "armLb"]
# which edge of the part joins the parent: (axis, side) — y/bottom for head and left forearm, x/right for the right one
JOINT = {"head": ("y", "max"), "foreL": ("y", "max"), "foreR": ("x", "max")}
# bosses whose arms come up from below (both elbows at the bottom end)
JOINT_BY_BOSS = {}
# hand-placed joints (output px): where the arm piece lies over the end of the torso's sleeve, so it turns without a gap
PIVOT_BY_BOSS = {
    # Боцман (2000×3000 sheet cropped at (40, 100), tools/boss/assemble-botsman.py): the neck, shoulders, elbows, wrists
    "botsman": {"head": [440.0, 230.0], "armL": [260.0, 330.0], "lowL": [229.5, 532.5], "handL": [359.0, 644.5],
                "armR": [600.0, 350.0], "lowR": [719.0, 417.0], "handR": [826.5, 291.0],
                "browL": [436.5, 149.5], "browR": [450.0, 149.8]},  # the brows: printed by assemble-botsman.py
    # Утилизатор (2000×3000 sheet cropped at (300, 140), tools/boss/assemble-utilizator.py): the neck, the shoulders (the
    # upper arms' overlaps with the T-shirt), the elbows (where the gloved forearms lie on the upper arms), the brows'
    # inner ends, the rings of the vials and the gas mask on the belt — printed by that script
    "utilizator": {"head": [316.0, 228.0], "armL": [132.0, 340.0], "lowL": [80.3, 502.8],
                   "armR": [454.8, 366.5], "lowR": [559.0, 507.9], "vials": [255.3, 649.0], "gasmask": [440.7, 636.0],
                   "browL": [311.5, 110.2], "browR": [325.0, 109.5]},
    # Фокус (tools/boss/assemble-fokus.py, the 2000×3000 picture cropped at (180, 200)): the neck, the shoulders, the
    # elbows, the wrists (the finger hand turns on the same wrist as the fist), the brows' inner ends
    # (the old Фокус's art went to «Псих» 2026-11-25: tools/boss/source/psih)
    "psih": {"head": [371.0, 226.0], "armR": [236.0, 336.0], "lowR": [64.3, 455.6], "handR": [190.5, 541.6], "fingerR": [190.5, 541.6],
              "armL": [470.0, 334.0], "lowL": [630.3, 487.3], "handL": [803.5, 505.3], "browR": [364.0, 117.8], "browL": [380.0, 118.5]},
    # Солнце (tools/boss/assemble-solntse.py, the 2000×3000 sheet cropped at (40, 40)): the neck, the shoulders (where
    # the upper arms meet the trunk), the elbows (the forearms' upper ends)
    # Нитка (tools/boss/assemble-nitka.py, the 2000×3000 sheet cropped at (247, 99)): the neck, the shoulders (the upper
    # arms over the shirt), the elbows, the wrists (the fists with the needles) — printed by that script
    "nitka": {"head": [370.0, 240.0], "armR": [254.6, 345.4], "lowR": [124.4, 454.5], "handR": [129.3, 337.4], "handR-blood": [129.3, 337.4],
              "armL": [528.6, 338.1], "lowL": [588.0, 456.8], "handL": [599.1, 391.8], "handL-blood": [599.1, 391.8]},
    # Фокус (the new art 2026-11-25, tools/boss/assemble-fokus.py, the 2000×3000 sheet cropped at (218, 73)): the neck,
    # the shoulders, the elbows, the wrists, the flip phone's hinge (the lid swings shut on it) — printed by that script
    "fokus": {"head": [395.9, 300.0], "armR": [273.8, 377.0], "lowR": [89.6, 452.1], "handR": [95.2, 381.6], "phone": [234.5, 238.2],
              "armL": [589.3, 393.3], "lowL": [656.7, 500.8], "handL": [523.9, 564.3]},
    # Дацкоу (the new full-height art 2026-11-25, tools/boss/assemble-datsik.py, the sheet cropped at (448, 73)): the neck
    # (under the chin), the shoulders, the elbows (the forearms carry the fists) — printed by that script
    "datsik": {"head": [297.5, 262.0], "armR": [145.0, 339.1], "lowR": [39.4, 477.0], "armL": [408.0, 345.0], "lowL": [519.6, 488.0]},  # the elbows: the
               # outer point of the elbow — where the artist turned the forearm in Photoshop (the user 2026-11-25)
    # Химик (tools/boss/assemble-himik.py, the 2000×3000 sheet cropped at (253, 45)): the neck under the jaw, the shoulders,
    # the elbows, the right wrist (the glove with the round flask) — printed by that script
    "himik": {"head": [399.5, 252.5], "armR": [282.0, 398.0], "lowR": [194.4, 576.2], "handR": [154.8, 634.8],
              "armL": [548.0, 382.0], "lowL": [649.8, 537.6]},
    # Кедр (the new model 2026-11-26, tools/boss/assemble-kedr.py, the sheet 120 px lower, cropped at (193, 44)): the neck
    # under the chin, the shoulders, the elbows, the wrists (the hammer's fist, the open left hand) — printed by that script
    "kedr": {"head": [408.0, 290.5], "armR": [284.7, 422.4], "lowR": [231.8, 580.3], "handR": [170.4, 718.4],
             "armL": [547.9, 432.2], "lowL": [588.6, 564.8], "handL": [610.4, 737.8]},
    "solntse": {"head": [508.0, 196.0], "armR": [362.0, 268.0], "lowR": [92.0, 414.0], "armL": [578.0, 300.0], "lowL": [668.0, 505.0]},
    "bebyakyan": {"foreL": [228.0, 405.0], "foreR": [617.0, 437.0]},
    # whole arms swing at the shoulder, the hands with money turn at the wrist (inside the arm's swing)
    "garkusha": {"armL": [290.0, 335.0], "handL": [125.0, 560.0], "armR": [540.0, 350.0], "handR": [730.0, 430.0]},
    # the shark: shoulders, wrists and the root of the tail
    # elbows: the far end of each forearm; wrists: where forearm and fist overlap (tools/boss/assemble-mugo.py)
    "mugo": {"armL": [470.0, 300.0], "lowL": [505.0, 415.0], "handL": [738.0, 492.0],
             "armR": [755.0, 290.0], "lowR": [750.0, 405.0], "handR": [990.0, 484.0], "tail": [460.0, 690.0]},
    # Бабафей: shoulders, elbows, wrists (the balalaika turns in the raised hand); each brow at its inner end
    "babafey": {"armL": [379.5, 506.2], "lowL": [267.0, 725.0], "handL": [160.8, 587.5],
                "armR": [704.5, 500.0], "lowR": [817.0, 700.0], "handR": [954.5, 837.5],
                "browL": [535.5, 249.1], "browR": [556.6, 249.1]},  # printed by assemble-babafey.py
    # Восток (layers by the artist, 2000×2800): neck, shoulders, elbows, wrists; the bag hangs from the left fist
    "vodovoz": {"head": [590.0, 395.0], "armL": [432.0, 435.0], "lowL": [322.0, 588.0], "handL": [222.0, 478.0],
                "bag": [182.0, 448.0], "armR": [686.0, 440.0], "lowR": [772.0, 614.0], "handR": [652.0, 508.0],
                "browL": [604.0, 257.6], "browR": [619.0, 262.3]},
    # Князь (2000×3000 sheet, tools/boss/assemble-knyaz.py): the neck, the shoulders, the right elbow, the wrist with the wallet
    "knyaz": {"head": [533.0, 320.0], "handL": [132.0, 515.0], "cover": [98.5, 645.5]},
    # Вадим (2000×3000 sheet, tools/boss/assemble-vadim.py): neck, shoulders, elbows, wrists; the key bunch in the left
    # fist — each piece hangs on its pin (the big ring with its split ring in the key's hole, the fob and the key on the ring)
    # Гопник (Ходки, tools/boss/assemble-gopnik.py): neck, shoulders, elbows, wrists — the middles of the pieces' overlaps
    "gopnik": {"head": [475.0, 260.0], "armL": [365.0, 345.0], "lowL": [307.0, 509.0], "handL": [145.5, 648.0],
               "armR": [598.0, 345.0], "lowR": [627.5, 501.0], "handR": [449.5, 583.5]},
    # Ларёчник (ларьки в «Захвате», tools/boss/assemble-larek.py): the neck, the shoulders (the inner ends of the upper
    # arms, under the sleeves), the elbows and the wrists — the middles of the pieces' overlaps (printed by that script)
    "larek": {"head": [418.4, 311.1], "armL": [276.8, 431.5], "lowL": [116.2, 510.4], "handL": [163.3, 639.0],
              "armR": [531.6, 450.2], "lowR": [710.3, 498.8], "handR": [736.6, 352.9]},
    "vadim": {"head": [510.0, 370.0], "armL": [400.0, 460.0], "lowL": [272.0, 555.0], "handL": [148.0, 508.0],
              "armR": [665.0, 450.0], "lowR": [750.0, 570.0], "handR": [858.0, 492.0],
              "keyRing": [98.8, 552.2], "keyFob": [97.5, 636.3], "keyKey": [118.3, 626.6],
              "browL": [488.3, 267.1], "browR": [497.6, 266.6]},
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
    # a variant (<boss>-beaten) takes its boss's settings
    base = boss.split("-")[0]
    pick = lambda m, dflt: m.get(boss, m.get(base, dflt))
    SCALE = pick(SCALE_BY_BOSS, 0.5)
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
        k, hires = pick(HIRES_BY_BOSS, (1, set()))
        k = k if p in hires else 1
        crop.resize((w * k, h * k), Image.LANCZOS).save(os.path.join(dest, p + ".webp"), "WEBP", quality=86, method=4)
        r = {"x": round(max(0, x0) * SCALE, 1), "y": round(max(0, y0) * SCALE, 1), "w": w, "h": h}
        joint = {**JOINT, **pick(JOINT_BY_BOSS, {})}
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
        if p in pick(PIVOT_BY_BOSS, {}):
            r["pivot"] = pick(PIVOT_BY_BOSS, {})[p]
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
# a content hash per picture: the client asks for <part>.webp?v=<hash>, so a redrawn part is never taken from a stale cache
import hashlib
for boss, rg in out.items():
    for p, r in rg["parts"].items():
        fp = os.path.join(ROOT, "public", "bosses", boss, "rig", p + ".webp")
        if os.path.exists(fp):
            r["v"] = hashlib.md5(open(fp, "rb").read()).hexdigest()[:8]
ts = "/* Generated by tools/boss/build-boss.py — do not edit by hand. */\n"
ts += "export const BOSS_RIGS: Record<string, { w: number; h: number; parts: Record<string, { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string }> }> = " + json.dumps(out, indent=2) + ";\n"
open(DATA, "w").write(ts)
