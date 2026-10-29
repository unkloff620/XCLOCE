"""
«Личное дело» pages: tools/ui/dossier-sheet-src.png (gpt-image-2, the chosen light dossier sheet) →
public/assets/ui/dossier-sheet.webp (the dark surround cut away) and the folder tabs dossier-tab-on / dossier-tab-off.webp,
cut from the same paper: the left side upright with a rounded corner, the right side slanting down, an ink line on top
and both sides, the bottom open (it joins its page). The open tab is the page's own light paper, the others a shade darker.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from collections import deque

src = Image.open("tools/ui/dossier-sheet-src.png").convert("RGB")
a = np.asarray(src).astype(int)
H, W, _ = a.shape
dark = a.sum(axis=2) < 60
# flood the near-black surround from the border
mask = np.zeros((H, W), bool)
q = deque([(y, x) for x in range(W) for y in (0, H - 1)] + [(y, x) for y in range(H) for x in (0, W - 1)])
while q:
    y, x = q.popleft()
    if y < 0 or y >= H or x < 0 or x >= W or mask[y, x] or not dark[y, x]: continue
    mask[y, x] = True
    q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
alpha = Image.fromarray(np.where(mask, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
sheet = src.convert("RGBA"); sheet.putalpha(alpha)
bb = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
sheet = sheet.crop(bb)
sheet.save("public/assets/ui/dossier-sheet.webp", quality=88, method=6)
print("sheet", sheet.size, bb)

# the tabs: paper from the calm middle of the sheet
TW, TH, S = 420, 100, 4
paper = src.crop((260, 520, 260 + TW // 2, 520 + TH // 2)).resize((TW, TH), Image.LANCZOS)
m = Image.new("L", (TW * S, TH * S), 0)
d = ImageDraw.Draw(m)
r, top, slant, lx = 22, 8, 44, 4
d.polygon([(lx * S, TH * S), (lx * S, (top + r) * S), ((lx + r) * S, top * S), ((TW - slant - 6) * S, top * S), ((TW - 4) * S, TH * S)], fill=255)
d.pieslice((lx * S, top * S, (lx + 2 * r) * S, (top + 2 * r) * S), 180, 270, fill=255)
m = m.resize((TW, TH), Image.LANCZOS)
inner = ImageChops.subtract(m, m.filter(ImageFilter.GaussianBlur(10)))
pa = np.asarray(paper).astype(float) * (1 - 0.22 * np.clip(np.asarray(inner) / 255 * 2.2, 0, 1))[..., None]
ring = np.asarray(ImageChops.subtract(m.filter(ImageFilter.MaxFilter(7)), m)).copy()
ring[TH - 3:, :] = 0
for name, k in (("on", 1.0), ("off", 0.8)):
    body = Image.fromarray((pa * k).clip(0, 255).astype(np.uint8)).convert("RGBA"); body.putalpha(m)
    ink = Image.new("RGBA", (TW, TH), (46, 28, 14, 0)); ink.putalpha(Image.fromarray(ring))
    out = Image.new("RGBA", (TW, TH)); out.alpha_composite(body); out.alpha_composite(ink)
    out.save(f"public/assets/ui/dossier-tab-{name}.webp", quality=90, method=6)
print("tabs", TW, TH)
