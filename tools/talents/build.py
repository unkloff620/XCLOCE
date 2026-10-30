"""Talent art: tools/talents/source/*.png (generated drafts) → public/assets/talents/*.webp
tiles (the square scenes) 192×192, heroes (transparent, cut to the figure) 640 tall, panel textures 900 wide."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "assets", "talents")
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(HERE, "source", "*.png"))):
    name = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f)
    if name.startswith("hero-"):
        im = im.convert("RGBA")
        im = im.crop(im.split()[3].point(lambda a: 255 if a > 16 else 0).getbbox())
        k = 640 / im.height
        im = im.resize((round(im.width * k), 640), Image.LANCZOS)
        im.save(os.path.join(OUT, name + ".webp"), quality=86, method=6)
    elif name.startswith("panel-"):
        im = im.convert("RGB")
        im.resize((900, round(900 * im.height / im.width)), Image.LANCZOS).save(os.path.join(OUT, name + ".webp"), quality=74, method=6)
    else:
        im.convert("RGB").resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, name + ".webp"), quality=84, method=6)
    print(name)
