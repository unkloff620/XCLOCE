"""
«Рейтинг» on a sheet of old parchment (the user's pick, tools/ui/source/rating-sheet.png: gpt-image, the paper on flat black).
→ public/assets/ui/rating-sheet.webp: the black keyed out, trimmed to the paper (the tape strips stick out a little);
  public/assets/ui/rating-tab.webp: a scrap of the same paper (a piece of its torn left edge, the edge facing left) — the
  side tabs (screens.css .rt-side-tab).
"""
import numpy as np
from PIL import Image, ImageFilter

im = np.array(Image.open("tools/ui/source/rating-sheet.png").convert("RGB")).astype(np.float32)
# the black around: alpha by brightness (the burnt edges are dark brown, never near black)
v = im.max(2)
a = np.clip((v - 14) / (48 - 14), 0, 1)
# fill pin holes inside the paper (a dark stain is never transparent): close the mask
m = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
a = np.maximum(a, np.array(m) / 255 * (np.array(m) > 250))
# un-premultiply over black so the edge does not stay dark-haloed
rgb = np.where(a[..., None] > 0.02, np.clip(im / np.maximum(a[..., None], 0.02), 0, 255), 0)
out = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8))
out = out.crop(out.getbbox())
print("sheet", out.size)
out.save("public/assets/ui/rating-sheet.webp", quality=86, method=6)

# the tab: a piece off the torn left edge (between the tapes), the torn side to the left
W, H = out.size
y0 = int(H * 0.30)
tab = out.crop((0, y0, int(W * 0.30), y0 + int(W * 0.26)))
ta = np.array(tab)
# its right side: a straight cut that fades under the sheet
x = np.arange(ta.shape[1])
fade = np.clip((ta.shape[1] - x) / 24, 0, 1)
ta[..., 3] = (ta[..., 3] * fade[None, :]).astype(np.uint8)
# the top and bottom: cut straight off the sheet — tear them (a jagged line) and burn them brown like the paper's edge
rng = np.random.default_rng(7)
h, w = ta.shape[:2]
def jag():
    # a soft wavy tear: a few knots every ~14 px joined smoothly, plus a fine grain
    k = rng.normal(0, 1, w // 14 + 3)
    n = np.interp(np.arange(w) / 14, np.arange(len(k)), k)
    n = np.convolve(np.pad(n, 10, mode="edge"), np.hanning(17) / np.hanning(17).sum(), "same")[10:10 + w] * 6
    return np.clip(14 + n + rng.normal(0, 0.35, w), 3, 30)
top, bot = jag(), jag()
yy = np.arange(h)[:, None]
d = np.minimum(yy - top[None, :], (h - 1 - yy) - bot[None, :])          # px inside the torn line
ta[..., 3] = (ta[..., 3] * np.clip(d / 1.5, 0, 1)).astype(np.uint8)
burn = np.clip(1 - d / 22, 0, 1)[..., None] * 0.55
edge = np.array([92, 52, 18], np.float32)
ta[..., :3] = (ta[..., :3] * (1 - burn) + edge * burn).astype(np.uint8)
tab = Image.fromarray(ta)
tab.thumbnail((240, 240), Image.LANCZOS)
print("tab", tab.size)
tab.save("public/assets/ui/rating-tab.webp", quality=88, method=6)
