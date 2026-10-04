"""Location backgrounds: tools/scene/source/locations/<id>.png (tall, ~941×1672)
→ public/assets/locations/<id>.webp (full-screen backdrop of the location page)
→ public/assets/locations/<id>-card.webp (wide banner for the list card, cropped around BANNER_Y)."""
import os, glob
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "locations"))
os.makedirs(OUT, exist_ok=True)
BANNER = (720, 280)  # 360×140 card at 2×
BANNER_Y = {"openspace": 0.3, "market": 0.42, "board": 0.45, "basement": 0.45, "serverroom": 0.45}  # centre of the banner crop, share of the height
for f in sorted(glob.glob(os.path.join(HERE, "source", "locations", "*.png"))):
    name = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert("RGB")
    # tall pictures: 800 wide; wide ones: 1500 tall at most (the page shows a phone-shaped middle part)
    k = 800 / im.width if im.height > im.width else min(1.0, 1500 / im.height)
    full = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    full.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=78, method=4)
    w = im.width
    h = round(w * BANNER[1] / BANNER[0])
    cy = round(im.height * BANNER_Y.get(name, 0.4))
    y0 = max(0, min(im.height - h, cy - h // 2))
    im.crop((0, y0, w, y0 + h)).resize(BANNER, Image.LANCZOS).save(os.path.join(OUT, name + "-card.webp"), "WEBP", quality=80, method=4)
    print(name, full.size, os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024, "KB")
