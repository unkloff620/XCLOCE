"""Exchanger panel: tools/scene/source/ui/exchange-panel.png → public/assets/ui/exchange-panel.webp.
The artist's mock has two currency buttons painted as selected; they are replaced by copies of a neutral button,
the selection is drawn by the page."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
im = Image.open(os.path.join(HERE, "source", "ui", "exchange-panel.png")).convert("RGB")
# neutral button boxes (x0, y0, x1, y1) and the painted-selected ones to cover
row1 = (300, 292, 568, 438)  # 2nd button, top row
im.paste(im.crop(row1), (300 - 263, 292))  # 1st button of the top row
row2 = (566, 778, 830, 922)  # 3rd button, bottom row
im.paste(im.crop(row2), (566 - 262, 778))  # 2nd button of the bottom row
out = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "ui", "exchange-panel.webp"))
im.save(out, "WEBP", quality=84, method=4)
im.resize((563, 698)).save("/tmp/claude-0/nav/expanel.png")
print(os.path.getsize(out) // 1024, "KB")
