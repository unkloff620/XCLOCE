"""
The «Донат» window of the shop (screens/donate.tsx): the artist's wooden board (the window and each cell), one tab
(inactive; the active one is lifted by CSS) and the currency goods for the cells → public/assets/shop/donate/*.webp.
"""
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from goods import GOODS, cut

S = "tools/shop/source/v3"
OUT = "public/assets/shop/donate"
os.makedirs(OUT, exist_ok=True)

def save(a, name, w):
    im = Image.fromarray(a) if not isinstance(a, Image.Image) else a
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())   # no faint halo in the box
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(f"{OUT}/{name}.webp", quality=88, method=6)
    print(name, im.size)

board = Image.open(f"{S}/board.png").convert("RGBA")
save(board, "board", 900)
save(Image.open(f"{S}/cell.png").convert("RGBA"), "cell", 300)   # the paper tag on a pin
tabs = Image.open(f"{S}/tabs.png").convert("RGBA")
save(tabs.crop((590, 263, 856, 648)), "tab", 180)
sheet = Image.open(f"{S}/goods.png").convert("RGBA")
for g in GOODS:
    save(cut(sheet, g), g, 220)
