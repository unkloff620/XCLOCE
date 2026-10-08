"""
Гаркуша (boss 4, id garkusha): turns the artist's loose parts into rig layers for build-boss.py.
Sources: tools/boss/source/garkusha/raw/ — reference (whole boss, 2000×2800); body parts already in place on that canvas:
legs, torso (the vest), armL (sleeve on the viewer's left), fistL (its hand with money), armR (the bent arm on the right),
fistR (its hand); face parts on one 1000×1000 sheet: head (blank eyes), eyes (whites), pupils, eyes-closed, brows,
mouth (open lips with teeth).
Fit (raw/fit.json, reference = sheet·s + (tx, ty)): the face sheet by fit-parts.py:
  python3 tools/boss/fit-parts.py garkusha '{"head": {"win": [740, 0, 1320, 660], "s": [0.4, 0.7]}}'
The head keeps its own closed lips; the open mouth (teeth) shows when he is hit (mouth-closed slot, class "ouch").
Layers (one canvas, cropped to CROP):
  body   legs + torso (breathes)        head   hair, face, lips (sways)
  eyes / pupils / eyes-closed / brows / brows-sad (each brow flipped upside down) / mouth-closed (teeth)
  armL + handL, armR + handR — arms swing at the shoulder, hands turn at the wrist (pivots in build-boss.py)
Also writes public/bosses/garkusha/{full,portrait}.webp.
"""
import json
import numpy as np
from PIL import Image

D = "tools/boss/source/garkusha"
CROP = (180, 20, 1780, 1920)
ref = Image.open(f"{D}/raw/reference.png").convert("RGBA")
W, H = ref.size
fit = json.load(open(f"{D}/raw/fit.json"))["head"]


def body(n):
    return Image.open(f"{D}/raw/{n}.png").convert("RGBA")


def face(n):
    im = Image.open(f"{D}/raw/{n}.png").convert("RGBA")
    s = fit["s"]
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    c.alpha_composite(im, (round(fit["tx"]), round(fit["ty"])))
    return c


def save(n, im):
    im.crop(CROP).save(f"{D}/{n}.png")


b = Image.new("RGBA", (W, H), (0, 0, 0, 0))
b.alpha_composite(body("legs"))
b.alpha_composite(body("torso"))
save("body", b)
save("head", face("head"))
save("eyes", face("eyes"))
save("pupils", face("pupils"))
save("eyes-closed", face("eyes-closed"))
brows = face("brows")
save("brows", brows)
save("mouth-closed", face("mouth"))

# sad brows: every brow flipped upside down in its own box and lifted a little (inner ends go up)
bw = np.array(brows)
sad = np.zeros_like(bw)
a = bw[:, :, 3] > 0
mid = (np.nonzero(a)[1].min() + np.nonzero(a)[1].max()) // 2
for x0, x1 in [(0, mid), (mid, W)]:
    ys, xs = np.nonzero(a[:, x0:x1])
    if not len(ys):
        continue
    y0, y1 = ys.min(), ys.max() + 1
    piece = bw[y0:y1, x0:x1][::-1]
    lift = 8
    sad[y0 - lift:y1 - lift, x0:x1] = np.where(piece[:, :, 3:] > 0, piece, sad[y0 - lift:y1 - lift, x0:x1])
save("brows-sad", Image.fromarray(sad))

save("armL", body("armL"))
save("handL", body("fistL"))
save("armR", body("armR"))
save("handR", body("fistR"))

# pictures for the lists: the whole boss (2:3) and the face
import os
os.makedirs("public/bosses/garkusha", exist_ok=True)
full = Image.new("RGBA", (1867, 2800), (0, 0, 0, 0))
full.alpha_composite(ref.crop((67, 0, 1934, 2800)))
full.resize((1024, 1536), Image.LANCZOS).save("public/bosses/garkusha/full.webp", quality=88, method=6)
ref.crop((780, 40, 1340, 600)).resize((512, 512), Image.LANCZOS).save("public/bosses/garkusha/portrait.webp", quality=88, method=6)
print("ok")
