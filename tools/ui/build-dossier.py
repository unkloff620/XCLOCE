"""
«Личное дело» from the artist's pictures (tools/ui/):
  dossier-page-src.png  — a sheet with its folder tab top-left → dossier-page.webp (the sheet, the tab cut off and the top
                          edge closed with the top-right corner mirrored) and dossier-ptab.webp (the tab alone, for a
                          9-slice tab of any width: the rounded left, the slant on the right)
  dossier-cover-src.png — the cover «Личное дело №__», photo frame, «ФИО» → dossier-cover.webp
  dossier-back-src.png  — the inside of the back cover (under the pages) → dossier-back.webp
"""
import numpy as np
from PIL import Image

pg = Image.open("tools/ui/dossier-page-src.png").convert("RGBA")
W, H = pg.size
TOP = 62          # the sheet's top edge (rows above it are the tab)
TAB_R = 300       # the tab ends here (its slant reaches the edge at ~x 290)
body = pg.copy()
a = np.array(body)
a[:TOP, :TAB_R] = 0
body = Image.fromarray(a)
# close the top edge over the tab's foot: the edge strip from the middle, then the top-right corner mirrored
strip = pg.crop((320, TOP - 2, 320 + TAB_R, TOP + 34))
body.paste(strip, (0, TOP - 2))
corner = pg.crop((W - 90, TOP - 2, W, TOP + 70)).transpose(Image.FLIP_LEFT_RIGHT)
cm = np.array(corner); cm[..., 3] = np.where(cm[..., 3] > 0, cm[..., 3], 0)
body.paste(corner, (0, TOP - 2))
# a clean transparent column left of the left border (what the mirrored corner brought in)
a = np.array(body); left = np.array(pg)[TOP + 120, :, 3]
x0 = int(np.argmax(left > 200)); a[:TOP + 70, :max(0, x0 - 2)] = 0
body = Image.fromarray(a)
bb = body.getbbox()
body = body.crop((bb[0], TOP - 4, bb[2], bb[3]))
body.save("public/assets/ui/dossier-page.webp", quality=88, method=6)
tab = pg.crop((bb[0], 0, TAB_R + 10, TOP + 14))
tab.save("public/assets/ui/dossier-ptab.webp", quality=90, method=6)
print("page", body.size, "tab", tab.size)

for src, out in (("dossier-cover-src.png", "dossier-cover.webp"), ("dossier-back-src.png", "dossier-back.webp")):
    im = Image.open("tools/ui/" + src).convert("RGBA")
    im = im.crop(im.getbbox())
    im.save("public/assets/ui/" + out, quality=88, method=6)
    print(out, im.size)
