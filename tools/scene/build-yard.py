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

# the bosses' own fight rooms (gpt-image-2, the boxing room's camera): arena-<boss id>.png, 1060×1484 → arena/<boss id>.webp
# (Кедр, Мугонатор and Командате fight in their home rooms: room-neon / room-shark / room-boxing copied to arena/)
for f in sorted(os.listdir(SRC)):
    if f.startswith("arena-") and f.endswith(".png") and f != "arena-garage.png":
        b = f[6:-4]
        Image.open(os.path.join(SRC, f)).convert("RGB").save(os.path.join(ARENA, b + ".webp"), "WEBP", quality=82, method=6)
        print(b, os.path.getsize(os.path.join(ARENA, b + ".webp")) // 1024, "KB")

# the night yard (gpt-image-2 from the yard picture, the sky and the puddles kept flat magenta → cut out to see-through)
# and its night sky (tiled like the day one): court-dark.webp, sky-dark.webp, court-backdrop-dark.webp
src = Image.open(os.path.join(SRC, "court-dark.png")).convert("RGB")
day = Image.open(os.path.join(OUT, "court-night.webp"))
src = src.resize(day.size, Image.LANCZOS)
a = np.asarray(src, dtype=np.float32)
r, g, b2 = a[..., 0], a[..., 1], a[..., 2]
# how magenta a pixel is: red and blue high, green low
mag = np.clip(((r + b2) / 2 - g - 70) / 70, 0, 1) * np.clip((np.minimum(r, b2) - 100) / 60, 0, 1)
from scipy import ndimage
near = ndimage.binary_dilation(mag > 0.15, iterations=4)
alpha = (1 - mag) * 255
alpha[ndimage.binary_dilation(mag > 0.5, iterations=1)] = 0
# despill around the cut: the purple cast of the edge pixels goes (red and blue no higher than green allows)
a2 = a.copy()
cast = np.clip((np.minimum(r, b2) - g) / 60, 0, 1) * near
a2[..., 0] = r - (r - np.minimum(r, g + 25)) * cast
a2[..., 2] = b2 - (b2 - np.minimum(b2, g + 45)) * cast
out = Image.fromarray(np.dstack([a2.clip(0, 255), alpha.clip(0, 255)]).astype(np.uint8), "RGBA")
out.save(os.path.join(OUT, "court-dark.webp"), "WEBP", quality=80, method=4)
skyn = Image.open(os.path.join(SRC, "yard-sky-dark.png")).convert("RGB")
skyn = skyn.crop((0, round(skyn.height * 0.25), skyn.width, skyn.height))
skyn = skyn.resize((round(skyn.width * h / skyn.height * 1.8), h), Image.LANCZOS)
arr = np.asarray(skyn, dtype=np.float32)
w = arr.shape[1]
b = w // 4
t = np.linspace(0, 1, b, dtype=np.float32)[None, :, None]
head = arr[:, w - b:] * (1 - t) + arr[:, :b] * t
Image.fromarray(np.concatenate([head, arr[:, b:w - b]], axis=1).clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, "sky-dark.webp"), "WEBP", quality=80, method=4)
bd = Image.new("RGBA", out.size, (0, 0, 0, 255))
bd.paste(skyn.resize((out.width, round(out.width * skyn.height / skyn.width))), (0, 0))
bd.alpha_composite(out)
bd.convert("RGB").resize((400, round(400 * out.height / out.width)), Image.LANCZOS).save(os.path.join(OUT, "court-backdrop-dark.webp"), "WEBP", quality=70, method=4)
print("night yard", out.size)

# the entrance at night: the same place cut from the night yard, with the day entrance's outline (court-entrance-dark.webp)
ent = Image.open(os.path.join(OUT, "court-entrance.webp")).convert("RGBA")
night = Image.open(os.path.join(OUT, "court-dark.webp")).convert("RGBA")
box = (0, round(night.height * 0.3971), round(night.width * 0.3045), round(night.height * 0.3971) + round(night.height * 0.2825))
piece = night.crop(box).resize(ent.size, Image.LANCZOS)
piece.putalpha(ent.getchannel("A"))
piece.save(os.path.join(OUT, "court-entrance-dark.webp"), "WEBP", quality=82, method=4)
print("night entrance", piece.size)
