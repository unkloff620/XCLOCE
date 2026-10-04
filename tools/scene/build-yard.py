"""
Yard art: tools/scene/source/yard-{bg,sky}.png, slot-machine.png → public/assets/yard/*.webp
  * bg.webp   — the yard with a transparent sky (1060×1484)
  * sky.webp  — the sky mirrored side by side so it tiles seamlessly; it scrolls behind the yard
  * slot.webp — the slot machine (transparent), used as the button in the yard
"""
import os
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "yard"))
os.makedirs(OUT, exist_ok=True)

bg = Image.open(os.path.join(SRC, "yard-bg.png")).convert("RGBA")
bg.save(os.path.join(OUT, "bg.webp"), "WEBP", quality=76, method=4)

sky = Image.open(os.path.join(SRC, "yard-sky.png")).convert("RGB")
h = 1000
sky = sky.resize((round(sky.width * h / sky.height), h), Image.LANCZOS)
tile = Image.new("RGB", (sky.width * 2, h))
tile.paste(sky, (0, 0))
tile.paste(ImageOps.mirror(sky), (sky.width, 0))  # mirrored copy: the right edge meets the left edge seamlessly
tile.save(os.path.join(OUT, "sky.webp"), "WEBP", quality=80, method=4)

slot = Image.open(os.path.join(SRC, "slot-machine.png")).convert("RGBA")
bbox = slot.getbbox()
slot = slot.crop(bbox)
slot = slot.resize((360, round(slot.height * 360 / slot.width)), Image.LANCZOS)
slot.save(os.path.join(OUT, "slot.webp"), "WEBP", quality=82, method=4)
for f in ("bg", "sky", "slot"):
    p = os.path.join(OUT, f + ".webp")
    print(f, Image.open(p).size, os.path.getsize(p) // 1024, "KB")
