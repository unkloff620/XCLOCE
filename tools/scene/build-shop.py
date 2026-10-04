"""Shop scene: tools/scene/source/shop/{bg,shelf,rack,drinks}.png → public/assets/shop/*.webp.
Placement follows layout-reference.png (positions in src/client/screens/shop.tsx, SHOP_SPOTS)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "shop")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "shop"))
os.makedirs(OUT, exist_ok=True)
for name, width, q in [("bg", 941, 76), ("shelf", 700, 82), ("rack", 420, 82), ("drinks", 380, 84)]:
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA" if name != "bg" else "RGB")
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=q, method=4)
    print(name, im.size, os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024, "KB")
# furniture spot: the best desk on the carpet (the cut-out desk from tools/scene/source, see cut-desks.py)
d = Image.open(os.path.join(HERE, "source", "desk-004.png")).convert("RGBA")
d = d.crop(d.getbbox())
d.resize((600, round(d.height * 600 / d.width)), Image.LANCZOS).save(os.path.join(OUT, "desk.webp"), "WEBP", quality=86, method=6)
