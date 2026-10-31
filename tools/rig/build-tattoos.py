"""
Tattoo sets (content/tattoos.ts) from ink layers: tools/rig/source/tattoo/<set>/<part>-ink.png — the ink of the whole set on
one hero part, on that part's own canvas (public/assets/hero/<part>.webp), made by an image edit of the part and the
difference against it. Each piece is cut out of its part's layer (a zone box for the parts that carry several pieces),
cropped to its ink and saved as public/assets/hero/tattoo/<id>.webp; its place in rig coordinates goes to
src/client/art/tattoo-data.ts. The item picture (public/assets/items/<id>.webp) is the piece on a patch of skin.
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "rig", "source", "tattoo")
OUT = os.path.join(ROOT, "public", "assets", "hero", "tattoo")
ITEMS = os.path.join(ROOT, "public", "assets", "items")
os.makedirs(OUT, exist_ok=True)
rig = json.loads(open(os.path.join(ROOT, "src", "client", "art", "rig-data.ts")).read().split("=", 1)[1].strip().rstrip(";").replace(" as const", ""))

# set → pieces: id, the ink layer ("full" — the whole body on the 1000×1400 rig canvas; or a hero part's own canvas),
# the zone on that layer (x0, y0, x1, y1) or None for all of it, and where it is drawn: "torso" — on the legs, under
# the trousers; "upper" — over the arms, under the shirt; or a hero part ("head", "handR") that it moves with
SETS = {
    "ice": [
        ("tat-ice-face", "head", None, "head"),
        ("tat-ice-neck", "full", (420, 275, 575, 345), "upper"),
        ("tat-ice-chest-l", "full", (335, 345, 500, 525), "upper"),
        ("tat-ice-chest-r", "full", (500, 345, 670, 525), "upper"),
        ("tat-ice-belly", "full", (385, 555, 615, 725), "upper"),
        ("tat-ice-shoulder-l", "full", (230, 340, 345, 448), "upper"),
        ("tat-ice-shoulder-r", "full", (650, 340, 770, 448), "upper"),
        ("tat-ice-biceps-l", "full", (135, 448, 300, 572), "upper"),
        ("tat-ice-biceps-r", "full", (720, 448, 865, 572), "upper"),
        ("tat-ice-elbow-l", "full", (120, 572, 200, 648), "upper"),
        ("tat-ice-elbow-r", "full", (810, 572, 880, 658), "upper"),
        ("tat-ice-forearm-l", "full", (140, 648, 248, 748), "upper"),
        ("tat-ice-forearm-r", "full", (700, 658, 840, 770), "upper"),
        ("tat-ice-hand-l", "full", (248, 700, 335, 800), "upper"),
        ("tat-ice-hand-r", "handR", None, "handR"),
        ("tat-ice-knee-l", "full", (85, 760, 220, 910), "torso"),
        ("tat-ice-knee-r", "full", (780, 760, 910, 910), "torso"),
        ("tat-ice-shin-l", "full", (160, 910, 325, 1172), "torso"),
        ("tat-ice-shin-r", "full", (675, 910, 845, 1172), "torso"),
        ("tat-ice-foot-l", "full", (185, 1172, 325, 1290), "torso"),
        ("tat-ice-foot-r", "full", (685, 1172, 815, 1290), "torso"),
    ],
}
SKIN = (248, 213, 180)

fit = {}
for set_id, pieces in SETS.items():
    for pid, part, zone, where in pieces:
        ink = Image.open(os.path.join(SRC, set_id, f"{part}-ink.png")).convert("RGBA")
        a = np.array(ink)
        keep = np.zeros(a.shape[:2], bool)
        if zone:
            x0, y0, x1, y1 = zone
            keep[y0:y1, x0:x1] = True
        else:
            keep[:] = True
        alpha = np.where(keep, a[..., 3], 0)
        # specks: tiny blobs of ink away from the drawing go
        lab, n = ndimage.label(alpha > 20)
        if n:
            sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
            for i, s in enumerate(sizes, 1):
                if s < 40:
                    alpha[lab == i] = 0
        a[..., 3] = alpha
        piece = Image.fromarray(a)
        bb = piece.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
        if not bb:
            raise SystemExit(f"{pid}: no ink in its zone")
        bb = (max(0, bb[0] - 2), max(0, bb[1] - 2), min(a.shape[1], bb[2] + 2), min(a.shape[0], bb[3] + 2))
        piece = piece.crop(bb)
        piece.save(os.path.join(OUT, f"{pid}.webp"), "WEBP", quality=88, method=6)
        r = rig[part] if part != "full" else {"x": 0, "y": 0, "w": ink.width, "h": ink.height}
        sx, sy = r["w"] / ink.width, r["h"] / ink.height
        fit[pid] = {"part": where, "x": round(r["x"] + bb[0] * sx, 1), "y": round(r["y"] + bb[1] * sy, 1), "w": round(piece.width * sx, 1), "h": round(piece.height * sy, 1)}
        # the item picture: the piece on a round patch of skin
        S = 256
        icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        patch = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(patch).rounded_rectangle((8, 8, S - 8, S - 8), radius=46, fill=SKIN + (255,), outline=(60, 38, 24, 255), width=6)
        icon.alpha_composite(patch)
        k = min((S - 44) / piece.width, (S - 44) / piece.height)
        pc = piece.resize((max(1, round(piece.width * k)), max(1, round(piece.height * k))), Image.LANCZOS)
        icon.alpha_composite(pc, ((S - pc.width) // 2, (S - pc.height) // 2))
        icon.save(os.path.join(ITEMS, f"{pid}.webp"), "WEBP", quality=86, method=6)
        print(pid, fit[pid])

with open(os.path.join(ROOT, "src", "client", "art", "tattoo-data.ts"), "w") as f:
    f.write("/* Generated by tools/rig/build-tattoos.py — do not edit by hand. Each piece's place in the 1000×1400 rig, on its hero part. */\n")
    f.write(f"export const TATTOO_FIT: Record<string, {{ part: string; x: number; y: number; w: number; h: number }}> = {json.dumps(fit, indent=1, ensure_ascii=False)};\n")
