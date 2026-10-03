"""
Home scene assets from the artist's drawings (tools/scene/source):
  room-<id>.png   — opaque background, 1060×1484 (the scene canvas)
  desk-N / monitor-N / pc-N / seat-N.png — one object per file on its own canvas (any size, transparent)
Objects are trimmed and resized to the size they take in the scene (see src/content/home-scene.ts),
then saved as WebP to public/assets/home/.
"""
import os, re, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "home")
os.makedirs(OUT, exist_ok=True)
# widths in scene units (the seat in rig units, it lives in the character's space); ×1.5 for sharp phones
WIDTH = {"desk": 500, "monitor": 230, "pc": 130, "seat": 360}
for f in sorted(os.listdir(os.path.join(HERE, "source"))):
    name, _ = os.path.splitext(f)
    im = Image.open(os.path.join(HERE, "source", f))
    if name.startswith("room-"):
        im.convert("RGB").save(os.path.join(OUT, name + ".webp"), "WEBP", quality=82, method=6)
    else:
        kind = re.sub(r"-\d+$", "", name)
        im = im.convert("RGBA"); a = im.getchannel("A").point(lambda v: 0 if v < 30 else v); im.putalpha(a)
        im = im.crop(im.getbbox())
        w = round(WIDTH[kind] * 1.5); h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name + ".webp"), "WEBP", quality=88, method=6)
        print(name, "aspect h/w =", round(im.height / im.width, 4))
    print(name, os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024, "KB")
