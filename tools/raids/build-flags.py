"""The yards' flags (items raid-flag-1…5): the artist's pictures without a background (tools/raids/source/flag-N.png)
→ trimmed to the cloth, centred in a square, public/assets/items/raid-flag-N.webp (256×256, transparent)."""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "assets", "items")
for n in range(1, 6):
    im = Image.open(os.path.join(HERE, "source", f"flag-{n}.png")).convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
    w, h = im.size; s = int(max(w, h) * 1.04)
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - w) // 2, (s - h) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f"raid-flag-{n}.webp"), "WEBP", quality=90)
    print(n, "ok")
