"""
Вадим (id vadim): the artist's layers → rig layers for build-boss.py, all on one 2000×3000 sheet.
Sources: tools/boss/source/vadim/raw/ — in place on the sheet: legs, body (the suit with the neck), head, armL / armR (the
upper sleeves, viewer's left / right), foreL / foreR (the forearms with the cuffs), handR (the fist with the knife);
on their own sheets: fistKeys (the left fist holding a car key), link (a small split ring), ring (the key ring), fob (the
car fob), key (a door key), and refKeys — the artist's picture of how they hang together (1000×1000).
The key pieces are laid out as on refKeys, scaled by KS and moved so the fist's wrist lies on the left cuff (WRIST).
Every piece of the bunch is its own layer and hangs free (boss-rig.tsx VadimRig, useDangle):
  keyRing — the big ring with the split ring through the hole of the key in the fist (one piece: they never come apart);
  keyFob  — the fob on its own little ring at the bottom of the big one;  keyKey — the door key on its ring at the side.
Writes tools/boss/source/vadim/{legs,body,head,armL,lowL,handL,keyRing,keyFob,keyKey,armR,lowR,handR}.png and
public/bosses/vadim/{full,portrait}.webp.
"""
import os, json
import numpy as np
from PIL import Image

D = "tools/boss/source/vadim"
R = f"{D}/raw"
W, H = 2000, 3000
KS = 1.23                       # the keys sheet (refKeys) → the body sheet (the fist as big as the knife fist)
REF_WRIST = (557.0, 339.0)      # the fist's wrist on refKeys
WRIST = (296.0, 1017.0)         # … lies here on the body sheet (the left cuff's opening)
FIST_AT = (276, 19)             # fistKeys on refKeys (its own sheet's top left) …
FIST_K = 0.78                   # … drawn smaller there
# the pieces on refKeys: (sheet, top left, turn in degrees)
LINK1 = ("link", (471, 406), 0)
RING = ("ring", (383, 447), 0)
LINK2 = ("link", (468, 592), 0)
FOB = ("fob", (369, 628), 0)
LINK3 = ("link", (541.5, 562.5), 49)
KEY = ("key", (547, 595), 0)
# the pins on refKeys: where each piece hangs from its parent (the big ring with its split ring — from the key's hole)
PINS = {"keyRing": (477, 410), "keyFob": (474, 600), "keyKey": (521, 578)}
KK = 0.72                       # the bunch smaller than on refKeys (the fist keeps its size), shrunk towards the key's hole
HOLE = PINS["keyRing"]


def load(n):
    return Image.open(f"{R}/{n}.png").convert("RGBA")


def to_body(p):
    return (WRIST[0] + (p[0] - REF_WRIST[0]) * KS, WRIST[1] + (p[1] - REF_WRIST[1]) * KS)


def to_body_keys(p):
    return to_body((HOLE[0] + (p[0] - HOLE[0]) * KK, HOLE[1] + (p[1] - HOLE[1]) * KK))


def keys_layer(pieces):
    """pieces drawn on a refKeys-sized sheet, shrunk by KK towards the key's hole, then moved and scaled onto the body sheet"""
    ref = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
    for name, (x, y), deg in pieces:
        im = load(name)
        if deg:
            cx, cy = x + im.width / 2, y + im.height / 2
            im = im.rotate(deg, resample=Image.BICUBIC, expand=True)
            x, y = cx - im.width / 2, cy - im.height / 2
        ref.alpha_composite(im, (round(x), round(y)))
    k = KS * KK
    big = ref.resize((round(1000 * k), round(1000 * k)), Image.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ox, oy = to_body_keys((0, 0))
    out.alpha_composite(big, (round(ox), round(oy)))
    return out


def save(n, im):
    a = np.array(im)
    a[a[:, :, 3] < 20] = 0
    Image.fromarray(a).save(f"{D}/{n}.png")


for n, src in [("legs", "legs"), ("body", "body"), ("head", "head"), ("armL", "armL"), ("lowL", "foreL"),
               ("armR", "armR"), ("lowR", "foreR"), ("handR", "handR")]:
    save(n, load(src))
fist = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
fk = load("fistKeys")
fist.alpha_composite(fk.resize((round(fk.width * FIST_K), round(fk.height * FIST_K)), Image.LANCZOS), FIST_AT)
big = fist.resize((round(1000 * KS), round(1000 * KS)), Image.LANCZOS)
hand = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ox, oy = to_body((0, 0))
hand.alpha_composite(big, (round(ox), round(oy)))
save("handL", hand)
save("keyRing", keys_layer([RING, LINK1]))
save("keyFob", keys_layer([LINK2, FOB]))
save("keyKey", keys_layer([LINK3, KEY]))
pins = {k: [round(c * 0.5, 1) for c in to_body_keys(p)] for k, p in PINS.items()}
print("pins (rig units):", json.dumps(pins))

# the whole boss (lists, the profile): the layers in their drawing order
full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for n in ["legs", "armL", "armR", "body", "lowL", "lowR", "handR", "head", "handL", "keyRing", "keyFob", "keyKey"]:
    full.alpha_composite(Image.open(f"{D}/{n}.png").convert("RGBA"))
a = np.array(full)[:, :, 3]
ys, xs = np.nonzero(a > 20)
box = (max(0, xs.min() - 20), max(0, ys.min() - 20), min(W, xs.max() + 20), min(H, ys.max() + 20))
os.makedirs("public/bosses/vadim", exist_ok=True)
crop = full.crop(box)
crop.resize((crop.width // 2, crop.height // 2), Image.LANCZOS).save("public/bosses/vadim/full.webp", "WEBP", quality=86, method=4)
hb = Image.open(f"{D}/head.png").getbbox()
side = round((hb[3] - hb[1]) * 1.5)
cx = (hb[0] + hb[2]) // 2
pt = full.crop((cx - side // 2, hb[1] - 30, cx + side // 2, hb[1] - 30 + side))
pt.resize((512, 512), Image.LANCZOS).save("public/bosses/vadim/portrait.webp", "WEBP", quality=86, method=4)
print("full", box)
