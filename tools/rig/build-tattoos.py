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
    "king": [
        ("tat-king-face", "head", None, "head"),
        ("tat-king-neck", "full", (425, 255, 575, 350), "upper"),
        ("tat-king-chest-l", "full", (335, 350, 498, 540), "upper"),
        ("tat-king-chest-r", "full", (502, 350, 672, 540), "upper"),
        ("tat-king-belly", "full", (390, 545, 615, 745), "upper"),
        ("tat-king-shoulder-l", "full", (240, 345, 352, 448), "upper"),
        ("tat-king-shoulder-r", "full", (650, 345, 765, 452), "upper"),
        ("tat-king-biceps-l", "full", (160, 448, 280, 578), "upper"),
        ("tat-king-biceps-r", "full", (735, 452, 845, 582), "upper"),
        ("tat-king-elbow-l", "full", (112, 555, 166, 630), "upper"),
        ("tat-king-elbow-r", "full", (822, 565, 888, 640), "upper"),
        ("tat-king-forearm-l", "full", (150, 598, 260, 730), "upper"),
        ("tat-king-forearm-r", "full", (732, 640, 858, 795), "upper"),
        ("tat-king-hand-l", "full", (236, 730, 368, 818), "upper"),
        ("tat-king-hand-r", "handR", None, "handR"),
        ("tat-king-knee-l", "full", (88, 775, 200, 915), "torso"),
        ("tat-king-knee-r", "full", (795, 775, 912, 922), "torso"),
        ("tat-king-shin-l", "full", (158, 895, 322, 1185), "torso"),
        ("tat-king-shin-r", "full", (688, 890, 848, 1185), "torso"),
        ("tat-king-foot-l", "full", (182, 1188, 298, 1275), "torso"),
        ("tat-king-foot-r", "full", (702, 1188, 812, 1278), "torso"),
    ],
}
# solid sets (the bosses after Дацкоу, the tattoos join each other): the body is split into 19 places that touch each
# other (each skin pixel goes to the nearest place's centre), every piece takes all the ink of its place, so the whole set
# fits together without seams; the face and the left hand are their own parts
ZONE_CENTRES = {
    "neck": ((500, 300), "upper"), "chest-l": ((420, 420), "upper"), "chest-r": ((580, 420), "upper"), "belly": ((500, 640), "upper"),
    "shoulder-l": ((290, 400), "upper"), "shoulder-r": ((710, 400), "upper"), "biceps-l": ((215, 510), "upper"), "biceps-r": ((785, 510), "upper"),
    "elbow-l": ((160, 600), "upper"), "elbow-r": ((845, 610), "upper"), "forearm-l": ((185, 690), "upper"), "forearm-r": ((790, 705), "upper"),
    "hand-l": ((300, 760), "upper"), "knee-l": ((160, 840), "torso"), "knee-r": ((840, 840), "torso"),
    "shin-l": ((230, 1030), "torso"), "shin-r": ((770, 1030), "torso"), "foot-l": ((230, 1240), "torso"), "foot-r": ((765, 1240), "torso"),
}
SOLID = ["taiga", "roots", "shark", "kraken", "cash", "gold", "ring", "fire", "izba", "firebird", "jackpot", "sunrise"]
_body = np.array(Image.open(os.path.join(ROOT, "tools", "rig", "source", "v2", "torso.png")).convert("RGBA").resize((1000, 1400), Image.LANCZOS))[..., 3] > 20
UPPER_BODY = np.array(Image.open(os.path.join(ROOT, "tools", "rig", "source", "v2", "body.png")).convert("RGBA").resize((1000, 1400), Image.LANCZOS))[..., 3] > 40
_yy, _xx = np.mgrid[0:1400, 0:1000]
_d = np.stack([(_xx - c[0]) ** 2 + (_yy - c[1]) ** 2 for (c, _) in ZONE_CENTRES.values()])
ZONE_OF = np.where(_body, np.argmin(_d, axis=0), -1)
ZONE_IDS = list(ZONE_CENTRES)
for set_id in SOLID:
    SETS[set_id] = [(f"tat-{set_id}-face", "head", None, "head"), (f"tat-{set_id}-hand-r", "handR", None, "handR")] + \
        [(f"tat-{set_id}-{z}", "full", ("zone", i), w) for i, (z, (_, w)) in enumerate(ZONE_CENTRES.items())]

SKIN = (248, 213, 180)

fit = {}
for set_id, pieces in SETS.items():
    for pid, part, zone, where in pieces:
        ink = Image.open(os.path.join(SRC, set_id, f"{part}-ink.png")).convert("RGBA")
        a = np.array(ink)
        keep = np.zeros(a.shape[:2], bool)
        if zone and zone[0] == "zone":
            keep = ZONE_OF == zone[1]
        elif zone:
            x0, y0, x1, y1 = zone
            keep[y0:y1, x0:x1] = True
        else:
            keep[:] = True
        # the chest, the belly and the arms are drawn over the trousers: their ink stays on the upper body (with the arms
        # and the resting hand) only, never on the thigh under the hand
        if part == "full" and where == "upper":
            keep = keep & UPPER_BODY
        # never past the body's own outline (the feet were redrawn shorter after the ink was drawn)
        if part == "full":
            keep = keep & _body
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

# a cover picture per set (the editor's set tile): the chest and the arms of the whole set on skin
for set_id in SETS:
    fp = os.path.join(SRC, set_id, "full-ink.png")
    if not os.path.exists(fp):
        continue
    ink = Image.open(fp).convert("RGBA").crop((140, 290, 860, 790))
    cov = Image.new("RGBA", ink.size, (0, 0, 0, 0)); cov.alpha_composite(ink)
    cov.resize((288, 200), Image.LANCZOS).save(os.path.join(OUT, f"set-{set_id}.webp"), "WEBP", quality=86, method=6)

with open(os.path.join(ROOT, "src", "client", "art", "tattoo-data.ts"), "w") as f:
    f.write("/* Generated by tools/rig/build-tattoos.py — do not edit by hand. Each piece's place in the 1000×1400 rig, on its hero part. */\n")
    f.write(f"export const TATTOO_FIT: Record<string, {{ part: string; x: number; y: number; w: number; h: number }}> = {json.dumps(fit, indent=1, ensure_ascii=False)};\n")
