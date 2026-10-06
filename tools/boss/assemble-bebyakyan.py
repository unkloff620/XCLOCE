"""
Командате (boss 3, id bebyakyan): turns the artist's loose parts into rig layers for build-boss.py.
Sources: tools/boss/source/bebyakyan/raw/ — reference (whole boss, 2000×2800), face (the assembled face on the same
712×628 sheet as head), head (no eyes/brows/mouth), torso, legs, torch (arm on the viewer's left), fist (viewer's right),
eyes, pupils, eyes-closed, brows, mouth-grin, mouth-duck.
Fits (raw/fit.json, reference = sheet·s + (tx, ty)): body parts by fit-parts.py against the reference; face parts by
fit-parts.py against face.png (run with the sheets copied to tools/boss/source/bbface, kept in tools/boss/raw/bebyakyan-face), shifted by the face's place (666, 5) at scale 1.
Closed lids sit on the open eyes' transform (14 px lower); the duck lips are centred under the nose in place of the grin.
Layers (one canvas, cropped to CROP):
  body   legs + torso (breathes)        head   hair, ears, nose (sways)
  eyes / pupils / eyes-closed / brows / brows-sad (each brow flipped upside down) / mouth (grin) / mouth-closed (duck lips)
  foreL  the arm with the red candle    foreR  the fist
Also writes public/bosses/bebyakyan/{full,portrait}.webp.
"""
import numpy as np
from PIL import Image

D = "tools/boss/source/bebyakyan"
CROP = (180, 0, 1780, 1900)
ref = Image.open(f"{D}/raw/reference.png").convert("RGBA")
W, H = ref.size

def placed(n):
    return Image.open(f"{D}/placed/{n}.png").convert("RGBA")

def save(n, im):
    im.crop(CROP).save(f"{D}/{n}.png")

body = Image.new("RGBA", (W, H), (0, 0, 0, 0))
body.alpha_composite(placed("legs"))
body.alpha_composite(placed("torso"))
save("body", body)
save("head", placed("head"))
save("eyes", placed("eyes"))
save("pupils", placed("pupils"))
save("eyes-closed", placed("eyes-closed"))
save("brows", placed("brows"))
save("mouth", placed("mouth-grin"))
save("mouth-closed", placed("mouth-duck"))

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
    lift = 10
    sad[y0 - lift:y1 - lift, x0:x1] = np.where(piece[:, :, 3:] > 0, piece, sad[y0 - lift:y1 - lift, x0:x1])
save("brows-sad", Image.fromarray(sad))

save("foreL", placed("torch"))
save("foreR", placed("fist"))

# pictures for the lists: the whole boss (2:3) and the face
full = Image.new("RGBA", (1867, 2800), (0, 0, 0, 0))
full.alpha_composite(ref.crop((67, 0, 1934, 2800)))
full.resize((1024, 1536), Image.LANCZOS).save("public/bosses/bebyakyan/full.webp", quality=88, method=6)
ref.crop((740, 20, 1300, 580)).resize((512, 512), Image.LANCZOS).save("public/bosses/bebyakyan/portrait.webp", quality=88, method=6)
print("ok")
