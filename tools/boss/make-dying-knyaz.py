"""
Князь below 25% HP (rig knyaz-dying): beaten worse than knyaz-beaten — the jacket in rags, more blood, both eyes bruised —
and a cloth gag in his mouth (its own layer «gag», over the mouth; the grin, the jaw and the cigarette are hidden then).
One image edit of the beaten picture (raw/knyaz-beaten-edit.png → raw/knyaz-dying-edit.png), cut per layer the same way as
make-beaten.py; the gag is taken from the edit by its cloth colour around the mouth. Then: build-boss.py knyaz-dying.
"""
import base64, glob, importlib.util, os, shutil
import numpy as np
import requests
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("mb", os.path.join(HERE, "make-beaten.py"))
mb = importlib.util.module_from_spec(spec); spec.loader.exec_module(mb)
RAW = os.path.join(HERE, "raw", "knyaz-dying-edit.png")
if not os.path.exists(RAW):
    key = open("/tmp/t/openai.env").read().split("=", 1)[1].strip()
    P = ("Edit this game boss character who is already beaten: keep exactly the same character, pose, outline, proportions and cartoon style with dark outlines, "
         "the same position and size. Now he is nearly defeated, much worse: his fluffy jacket is shredded and in rags, the t-shirt ripped, sweatpants torn at the knees, "
         "much more blood and dirt on the clothes; both eyes bruised, a broken bleeding nose, a cut forehead, a strip of plaster on the cheek, deep scrapes and "
         "bleeding cuts all over the arms and hands. A gag in his mouth: a dirty grey rolled cloth rag pulled across his mouth and tied in a knot at the side of his head. "
         "Comic-book style blood, strong but not gory. Keep the white background plain.")
    r = requests.post("https://api.openai.com/v1/images/edits", headers={"Authorization": "Bearer " + key},
                      files={"image": open(os.path.join(HERE, "raw", "knyaz-beaten-edit.png"), "rb")},
                      data={"model": "gpt-image-2", "prompt": P, "size": "1024x1536", "quality": "high"}, timeout=900)
    open(RAW, "wb").write(base64.b64decode(r.json()["data"][0]["b64_json"]))
# make-beaten.edit() reads raw/<boss>-beaten-edit.png: point it at the dying edit for this run
real = mb.edit
def edit(boss, comp):
    orig = os.path.join(HERE, "raw", "knyaz-beaten-edit.png")
    keep = orig + ".keep"
    os.replace(orig, keep); shutil.copy(RAW, orig)
    try:
        return real(boss, comp)
    finally:
        os.replace(keep, orig)
mb.edit = edit
# cut into knyaz-dying
S = os.path.join(HERE, "source", "knyaz")
O = os.path.join(HERE, "source", "knyaz-dying")
mb_main_src = mb.main
def run():
    tmp = os.path.join(HERE, "source", "knyaz-beaten")
    bak = tmp + ".bak"
    os.rename(tmp, bak)
    try:
        mb_main_src("knyaz")
        if os.path.exists(O): shutil.rmtree(O)
        os.rename(tmp, O)
    finally:
        os.rename(bak, tmp)
run()
# the gag: cloth-grey pixels of the fitted edit around the mouth
order = mb.ORDER["knyaz"]
L = {p: np.array(Image.open(os.path.join(S, p + ".png")).convert("RGBA")) for p in order}
H, W = L["body"].shape[:2]
comp = np.full((H, W, 3), 255.0, np.float32)
for p in order:
    a = L[p][..., 3:4] / 255.0
    comp = comp * (1 - a) + L[p][..., :3] * a
e = edit("knyaz", comp)
warped = mb.ti.warp_onto(mb.ti.figure(comp), mb.ti.figure(e), e)
mouth = np.zeros((H, W), bool)
for f in ["lips", "mouth-sad", "teeth-up", "teeth-low", "throat"]:
    mouth |= np.array(Image.open(os.path.join(S, f + ".png")).convert("RGBA"))[..., 3] > 40
ys, xs = np.nonzero(mouth)
head = ndimage.binary_dilation(np.array(Image.open(os.path.join(S, "head.png")).convert("RGBA"))[..., 3] > 128, iterations=40)
band = np.zeros((H, W), bool)
band[max(0, ys.min() - 70):ys.max() + 70, :] = True
rgb = warped
mx, mn = rgb.max(2), rgb.min(2)
sat = (mx - mn) / np.maximum(mx, 1)
cloth = (sat < 0.28) & (mx > 70) & (mx < 235)
dark_line = mx < 70
gag = (cloth | dark_line) & band & head
gag = ndimage.binary_opening(gag, iterations=2)
lab, n = ndimage.label(gag)
if n:
    sz = ndimage.sum(gag, lab, range(1, n + 1))
    # the piece over the mouth and whatever touches it
    over = [i + 1 for i in range(n) if (mouth & (lab == i + 1)).any() or sz[i] > sz.max() * 0.25]
    gag = np.isin(lab, over)
gag = ndimage.binary_fill_holes(ndimage.binary_closing(gag, iterations=4)) & head
# a smooth edge: no specks of skin at the rim of the rag
gag = ndimage.gaussian_filter(gag.astype(np.float32), 2.5) > 0.5
gag = ndimage.binary_erosion(gag, iterations=1)
out = np.zeros((H, W, 4), np.uint8)
out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
out[..., 3] = (ndimage.gaussian_filter(gag.astype(np.float32), 0.8) * 255).astype(np.uint8)
Image.fromarray(out).save(os.path.join(O, "gag.png"))
print("knyaz-dying: gag", int(gag.sum()), "px")
