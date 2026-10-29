"""
«Личное дело» from the artist's pictures (tools/ui/):
  dossier-page-src.png  — the sheet → dossier-page.webp
  dossier-ptab-src.png  — the folder tab → dossier-ptab.webp (a 9-slice tab of any width: the cut corner on the left,
                          the step down on the right)
  dossier-cover-src.png — the cover «Личное дело №__», photo frame, «ФИО» → dossier-cover.webp
  dossier-back-src.png  — the inside of the back cover (under the pages) → dossier-back.webp
"""
import numpy as np
from PIL import Image

# the sheet: everything above its top edge (faint guide marks) cut away
pg = Image.open("tools/ui/dossier-page-src.png").convert("RGBA")
a = np.array(pg)
top = int(np.argmax(a[:, pg.width // 2, 3] > 200))
a[: max(0, top - 3)] = 0
pg = Image.fromarray(a)
pg = pg.crop(pg.getbbox())
pg.save("public/assets/ui/dossier-page.webp", quality=88, method=6)
# the folder tab: its own picture, trimmed to the drawn shape
tb = Image.open("tools/ui/dossier-ptab-src.png").convert("RGBA")
t = np.array(tb)
ys, xs = np.where(t[..., 3] > 200)
tb = tb.crop((max(0, xs.min() - 6), max(0, ys.min() - 6), xs.max() + 7, ys.max() + 7))
tb = tb.resize((tb.width // 2, tb.height // 2), Image.LANCZOS)
tb.save("public/assets/ui/dossier-ptab.webp", quality=90, method=6)
print("page", pg.size, "tab", tb.size)

for src, out in (("dossier-cover-src.png", "dossier-cover.webp"), ("dossier-back-src.png", "dossier-back.webp")):
    im = Image.open("tools/ui/" + src).convert("RGBA")
    im = im.crop(im.getbbox())
    im.save("public/assets/ui/" + out, quality=88, method=6)
    print(out, im.size)
