"""
Кедр: turns the fitted loose parts (tools/boss/source/kedr/placed, see fit-parts.py / place-parts.py) into rig layers
for build-boss.py, all on one canvas: the reference cropped to the upper body (CROP), so the boss is big in the arena.
  body        legs + shorts + shirt (breathes)
  collar      the shirt fabric round the neck, drawn over the head so the neck seam never shows when the head sways
  head        head with hair, no face;  eyes / pupils / eyes-closed / brows / brows-sad / mouth / mouth-closed — the face
  foreL/foreR the arms with clawed hands (viewer's left / right), scaled from the elbow: reaching for the player
Not in the reference (closed eyes, closed mouth) are placed by the open ones; brows-sad = each brow flipped upside down.
Also writes public/bosses/kedr/{full,portrait}.webp from the assembled reference.
"""
import json
import numpy as np
from PIL import Image

D = "tools/boss/source/kedr"
CROP = (250, 0, 1750, 1800)  # x0, y0, x1, y1 on the 2000×2800 reference
ref = Image.open(f"{D}/raw/reference.png").convert("RGBA")
W, H = ref.size

def placed(n):
    return Image.open(f"{D}/placed/{n}.png").convert("RGBA")

def sheet_at(n, s, tx, ty):
    sh = Image.open(f"{D}/raw/{n}.png").convert("RGBA")
    sc = sh.resize((round(sh.width * s), round(sh.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(sc, (round(tx), round(ty)))
    return c

def save(n, im):
    im.crop(CROP).save(f"{D}/{n}.png")

body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for p in ["legL", "legR", "shorts", "shirt"]:
    body.alpha_composite(placed(p))
save("body", body)

shirt = np.array(placed("shirt"))
lum = shirt[:, :, :3].astype(int).mean(axis=2)
collar = shirt.copy()
fabric = (lum < 70) & (shirt[:, :, 3] > 0)
keep = np.zeros_like(fabric)
keep[440:540, :] = True  # the collar band in front of the neck
collar[~(fabric & keep), 3] = 0
save("collar", Image.fromarray(collar))

save("head", placed("head"))
save("eyes", placed("eyes"))
save("pupils", placed("pupils"))
save("brows", placed("brows"))
save("mouth", placed("mouth-grin"))
f = json.load(open(f"{D}/raw/fit.json"))
g = f["mouth-grin"]
save("mouth-closed", sheet_at("mouth-closed", g["s"], g["tx"], g["ty"]))  # drawn on the same sheet as the grin
save("eyes-closed", sheet_at("eyes-closed", 0.2793, 814.0, 145.6))  # lids over the open eyes' corners

# sad brows: every brow flipped upside down in its own box and lifted a little (inner ends go up)
b = np.array(placed("brows"))
sad = np.zeros_like(b)
a = b[:, :, 3] > 0
mid = (np.nonzero(a)[1].min() + np.nonzero(a)[1].max()) // 2
for x0, x1 in [(0, mid), (mid, W)]:
    ys, xs = np.nonzero(a[:, x0:x1])
    if not len(ys):
        continue
    y0, y1 = ys.min(), ys.max() + 1
    piece = b[y0:y1, x0:x1][::-1]
    lift = 8
    sad[y0 - lift:y1 - lift, x0:x1] = np.where(piece[:, :, 3:] > 0, piece, sad[y0 - lift:y1 - lift, x0:x1])
save("brows-sad", Image.fromarray(sad))

save("foreL", placed("handR"))  # the sheet named "hand right" is the arm on the viewer's left
save("foreR", placed("handL"))

# pictures for the lists: the whole boss (2:3) and the face
full = ref.crop((300, 0, 1700, 2100)).resize((1024, 1536), Image.LANCZOS)
full.save("public/bosses/kedr/full.webp", quality=88, method=6)
ref.crop((690, 30, 1210, 550)).resize((512, 512), Image.LANCZOS).save("public/bosses/kedr/portrait.webp", quality=88, method=6)
print("ok")
