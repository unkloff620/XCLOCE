"""
Tattoo sets (content/tattoos.ts) from ink layers made by tools/rig/tattoo-ink.py: tools/rig/source/tattoo/<set>/<part>-ink.png — the ink of the whole set on
one hero part, on that part's own canvas (public/assets/hero/<part>.webp), made by an image edit of the part and the
difference against it. Each piece is cut out of its part's layer (a zone box for the parts that carry several pieces),
cropped to its ink and saved as public/assets/hero/tattoo/<id>.webp; its place in rig coordinates goes to
src/client/art/tattoo-data.ts. The item picture (public/assets/items/<id>.webp) is the piece on a patch of skin.
"""
import glob, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "tools", "rig", "source", "tattoo")
OUT = os.path.join(ROOT, "public", "assets", "hero", "tattoo")
ITEMS = os.path.join(ROOT, "public", "assets", "items")
os.makedirs(OUT, exist_ok=True)
rig = json.loads(open(os.path.join(ROOT, "src", "client", "art", "rig-data.ts")).read().split("=", 1)[1].strip().rstrip(";").replace(" as const", ""))

# The 21 tattoo places are the artist's own layers (tools/rig/source/tattoo/_zones/<place>.png, 2000×2800, the hero's
# canvas; the user 2026-11-24): neck, the traps, the chest, the belly, the shoulders, the biceps, the forearms (with the
# elbows), the resting left hand, the thighs, the knees, the shins and the feet. No face and no right hand (it holds the
# weapon). Every set is cut by them: each body pixel belongs to its place, or to the nearest place where the layers leave
# a gap; the upper body (body.png: the chest, the belly, the arms, the resting hand) only to an "upper" place and the
# legs only to a "torso" place — so a thigh next to a forearm is never given to the arm. "upper" is drawn over the arms,
# under the shirt; "torso" on the legs, under the trousers.
ZONE_DEFS = {
    "neck": "upper", "trap-l": "upper", "trap-r": "upper", "chest-l": "upper", "chest-r": "upper", "belly": "upper",
    "shoulder-l": "upper", "shoulder-r": "upper", "biceps-l": "upper", "biceps-r": "upper", "forearm-l": "upper", "forearm-r": "upper",
    "hand-l": "upper", "thigh-l": "torso", "thigh-r": "torso", "knee-l": "torso", "knee-r": "torso",
    "shin-l": "torso", "shin-r": "torso", "foot-l": "torso", "foot-r": "torso",
}
ZONE_IDS = list(ZONE_DEFS)
SOLID = ["ice", "king", "taiga", "roots", "shark", "kraken", "cash", "gold", "ring", "fire", "izba", "firebird", "jackpot", "sunrise", "safe", "realm", "samurai", "viking", "inferno", "swamp", "oven", "maid", "yakuza", "ducky", "racer", "nightshift", "dynamite", "masks", "luck", "hustler", "katran", "smotr", "dragon", "cyber", "garages", "industry", "market", "blocks", "oldtown", "shod-domes", "shod-bear", "shod-raven", "pk-mast", "pk-royal", "pk-bluff", "ut-acid", "ut-storm", "kuznya", "zatmenie", "ozhog",
         # «Зарубы» (content/zarub.ts): 27 sets from the bags
         "zr-barak", "zr-bones", "zr-ash", "zr-deep", "zr-gasmask", "zr-gears", "zr-bratva", "zr-totem", "zr-kush",
         "zr-sakura", "zr-ghost", "zr-wings", "zr-crest", "zr-katana", "zr-clock", "zr-amphora", "zr-abyss", "zr-anchor",
         "zr-plague", "zr-jaguar", "zr-peak", "zr-chronicle", "zr-fog", "zr-corsair", "zr-heaven", "zr-grin", "zr-ball"]
_body = np.array(Image.open(os.path.join(ROOT, "tools", "rig", "source", "v2", "torso.png")).convert("RGBA").resize((1000, 1400), Image.LANCZOS))[..., 3] > 20
UPPER_BODY = np.array(Image.open(os.path.join(ROOT, "tools", "rig", "source", "v2", "body.png")).convert("RGBA").resize((1000, 1400), Image.LANCZOS))[..., 3] > 40
_layer = {z: np.array(Image.open(os.path.join(SRC, "_zones", f"{z}.png")).convert("L").resize((1000, 1400), Image.LANCZOS)) > 127 for z in ZONE_IDS}
def _nearest(ids):
    lab = np.full((1400, 1000), -1, int)
    for z in ids:
        lab[_layer[z] & (lab < 0)] = ZONE_IDS.index(z)
    _, (iy, ix) = ndimage.distance_transform_edt(lab < 0, return_indices=True)
    return lab[iy, ix]
_up_of = _nearest([z for z, w in ZONE_DEFS.items() if w == "upper"])
_lo_of = _nearest([z for z, w in ZONE_DEFS.items() if w == "torso"])
ZONE_OF = np.where(_body, np.where(UPPER_BODY, _up_of, _lo_of), -1)
SETS = {set_id: [(f"tat-{set_id}-{z}", "full", ("zone", i), w) for i, (z, w) in enumerate(ZONE_DEFS.items())] for set_id in SOLID}

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
        icon.resize((128, 128), Image.LANCZOS).save(os.path.join(ITEMS, f"{pid}.webp"), "WEBP", quality=84, method=6)  # shown at 64 px at most
        print(pid, fit[pid])

# a cover picture per set (the editor's set tile): the chest and the arms of the whole set on skin
for set_id in SETS:
    fp = os.path.join(SRC, set_id, "full-ink.png")
    if not os.path.exists(fp):
        continue
    ink = Image.open(fp).convert("RGBA").crop((140, 290, 860, 790))
    cov = Image.new("RGBA", ink.size, (0, 0, 0, 0)); cov.alpha_composite(ink)
    cov.resize((288, 200), Image.LANCZOS).save(os.path.join(OUT, f"set-{set_id}.webp"), "WEBP", quality=86, method=6)

# ---------------- the editor's places (client/art/places-data.ts) ----------------
# Two different grids over the hero in the character editor:
#   «Наколки» — the 21 tattoo places (the artist's zones above);
#   «Вещи»    — where things are worn: head, eyes, mouth, neck, top, bottom, shoes, the right hand.
# For each: a yellow outline of every place (zones.webp / slots.webp), a map to tell which place a tap hit
# (zone-map.png / slot-map.png: the red channel = the place's number + 1, half size) and a picture of every place
# (filled lightly, outlined brightly) drawn over the hero when it is chosen (place-<grid>-<id>.webp).
def _part_mask(p, thr=60):
    r = rig[p]
    im = Image.open(os.path.join(ROOT, "public", "assets", "hero", f"{p}.webp")).convert("RGBA").resize((round(r["w"]), round(r["h"])))
    m = Image.new("L", (1000, 1400), 0); m.paste(im.getchannel("A"), (round(r["x"]), round(r["y"])))
    return np.array(m) > thr
def _oval(x0, y0, x1, y1):
    m = Image.new("L", (1000, 1400), 0); ImageDraw.Draw(m).ellipse((x0, y0, x1, y1), fill=255)
    return np.array(m) > 0
HEAD_M, HANDR_M = _part_mask("head"), _part_mask("handR")
_trq = np.array(Image.open(os.path.join(ROOT, "tools", "rig", "source", "v2", "torso.png")).convert("RGB").resize((1000, 1400), Image.LANCZOS)).astype(int)
CLOTH = ndimage.binary_opening((_trq.max(axis=2) < 80) & _body, iterations=2)  # the shorts of the base body
_seen = _body & ~HEAD_M & ~HANDR_M  # the body where nothing is drawn over it
def _zone(z):
    return (ZONE_OF == ZONE_IDS.index(z)) & _seen
zones = {}
for z in ZONE_IDS:
    zones[z] = _zone(z) & ~CLOTH  # nothing is inked under the shorts
_e, _h = rig["eyes"], rig["head"]
slots = {
    "MOUTH": _oval(_h["x"] + _h["w"] * 0.36, _h["y"] + _h["h"] * 0.71, _h["x"] + _h["w"] * 0.64, _h["y"] + _h["h"] * 0.86),
    "FACE": _oval(_e["x"] - 8, _e["y"] - 20, _e["x"] + _e["w"] + 8, _e["y"] + _e["h"] + 10),
    "HAND": HANDR_M,
}
slots["HEAD"] = HEAD_M & ~slots["MOUTH"] & ~slots["FACE"]
slots["ACCESSORY"] = _zone("neck")
slots["SHIRT"] = np.any([_zone(z) for z in ("chest-l", "chest-r", "belly", "shoulder-l", "shoulder-r", "biceps-l", "biceps-r", "forearm-l", "forearm-r", "trap-l", "trap-r")], axis=0)
slots["PANTS"] = np.any([_zone(z) for z in ("thigh-l", "thigh-r", "knee-l", "knee-r", "shin-l", "shin-r")], axis=0)
slots["SHOES"] = np.any([_zone(z) for z in ("foot-l", "foot-r")], axis=0)

def _outline(m, w=2):
    return m & ~ndimage.binary_erosion(m, iterations=w)
def _grid(masks, name):
    edge = np.zeros((1400, 1000), bool)
    for m in masks.values():
        edge |= _outline(ndimage.binary_opening(m, iterations=1), 2)
    glow = ndimage.binary_dilation(edge, iterations=3) & ~edge
    g = np.zeros((1400, 1000, 4), np.uint8)
    g[glow] = (40, 24, 0, 140)
    g[edge] = (255, 214, 40, 235)
    Image.fromarray(g).save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=90, method=6)
def _map(masks, name, order):
    idx = np.zeros((1400, 1000), np.uint8)
    for i, k in enumerate(order):  # later ones lie over the earlier
        idx[masks[k]] = i + 1
    small = idx[::2, ::2]
    rgba = np.zeros((700, 500, 4), np.uint8); rgba[..., 0] = small; rgba[..., 3] = np.where(small > 0, 255, 0)
    Image.fromarray(rgba).save(os.path.join(OUT, f"{name}-map.png"))
def _pictures(masks, grid):
    out = {}
    for k, m in masks.items():
        m = ndimage.binary_opening(m, iterations=1)
        ys, xs = np.nonzero(m)
        if not len(xs):
            continue
        x0, y0, x1, y1 = max(0, xs.min() - 8), max(0, ys.min() - 8), min(1000, xs.max() + 9), min(1400, ys.max() + 9)
        edge = _outline(m, 4)
        glow = ndimage.binary_dilation(edge, iterations=4) & ~m
        g = np.zeros((1400, 1000, 4), np.uint8)
        g[m] = (255, 220, 70, 120)
        g[glow] = (255, 200, 40, 110)
        g[edge] = (255, 236, 120, 255)
        Image.fromarray(g[y0:y1, x0:x1]).save(os.path.join(OUT, f"place-{grid}-{k}.webp"), "WEBP", quality=88, method=6)
        out[k] = {"x": int(x0), "y": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)}
    return out
ZONE_ORDER = ZONE_IDS
SLOT_ORDER = ["SHOES", "PANTS", "SHIRT", "ACCESSORY", "HEAD", "FACE", "MOUTH", "HAND"]
_grid(zones, "zones"); _map(zones, "zone", ZONE_ORDER)
_grid(slots, "slots"); _map(slots, "slot", SLOT_ORDER)
places = {"zone": {"order": ZONE_ORDER, "fit": _pictures(zones, "zone")}, "slot": {"order": SLOT_ORDER, "fit": _pictures(slots, "slot")}}
with open(os.path.join(ROOT, "src", "client", "art", "places-data.ts"), "w") as f:
    f.write("/* Generated by tools/rig/build-tattoos.py — do not edit by hand. The character editor's places (1000×1400 rig):\n"
            " * order — the place's number in the tap map (red channel − 1), fit — the box of its highlight picture. */\n")
    f.write(f"export const PLACES = {json.dumps(places, indent=1)} as const;\n")

with open(os.path.join(ROOT, "src", "client", "art", "tattoo-data.ts"), "w") as f:
    f.write("/* Generated by tools/rig/build-tattoos.py — do not edit by hand. Each piece's place in the 1000×1400 rig, on its hero part. */\n")
    f.write(f"export const TATTOO_FIT: Record<string, {{ part: string; x: number; y: number; w: number; h: number }}> = {json.dumps(fit, indent=1, ensure_ascii=False)};\n")
