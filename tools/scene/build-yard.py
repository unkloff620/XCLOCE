"""
Yard and boss-fight art: tools/scene/source/yard-{bg,sky}.png, slot-machine.png, arena-garage.png → public/assets/{yard,arena}/*.webp
  * bg.webp   — the yard with a transparent sky (1060×1484)
  * sky.webp  — the sky with its ends cross-faded so it tiles seamlessly; it scrolls behind the yard
  * slot.webp — the slot machine (transparent), used as the button in the yard
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "yard"))
os.makedirs(OUT, exist_ok=True)

bg = Image.open(os.path.join(SRC, "yard-bg.png")).convert("RGBA")
bg.save(os.path.join(OUT, "bg.webp"), "WEBP", quality=76, method=4)

sky = Image.open(os.path.join(SRC, "yard-sky.png")).convert("RGB")
sky = sky.crop((0, round(sky.height * 0.25), sky.width, sky.height))  # only the lower sky shows above the houses
h = 800
sky = sky.resize((round(sky.width * h / sky.height * 1.8), h), Image.LANCZOS)  # stretched wide: clouds are horizontal streaks
# seamless wrap: the last quarter of the picture is cross-faded into its start, then cut off
import numpy as np
arr = np.asarray(sky, dtype=np.float32)
w = arr.shape[1]
b = w // 4
t = np.linspace(0, 1, b, dtype=np.float32)[None, :, None]
head = arr[:, w - b:] * (1 - t) + arr[:, :b] * t
tile = Image.fromarray(np.concatenate([head, arr[:, b:w - b]], axis=1).clip(0, 255).astype(np.uint8))
tile.save(os.path.join(OUT, "sky.webp"), "WEBP", quality=80, method=4)

slot = Image.open(os.path.join(SRC, "slot-machine.png")).convert("RGBA")
bbox = slot.getbbox()
slot = slot.crop(bbox)
slot = slot.resize((360, round(slot.height * 360 / slot.width)), Image.LANCZOS)
slot.save(os.path.join(OUT, "slot.webp"), "WEBP", quality=82, method=4)
for f in ("bg", "sky", "slot"):
    p = os.path.join(OUT, f + ".webp")
    print(f, Image.open(p).size, os.path.getsize(p) // 1024, "KB")

# boss fight background (garage; transparent windows show the drifting sky)
ARENA = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "arena"))
os.makedirs(ARENA, exist_ok=True)
g = Image.open(os.path.join(SRC, "arena-garage.png")).convert("RGBA")
g.save(os.path.join(ARENA, "garage.webp"), "WEBP", quality=72, method=4)
print("garage", g.size, os.path.getsize(os.path.join(ARENA, "garage.webp")) // 1024, "KB")
