"""
Утилизатор's fight room, 1024×1536 (the artist's layers, tools/boss/source/utilizator/room/): the night yard (room.png,
the sky cut out), the seamless storm sky (sky.png) that drifts behind it, the lightning (bolt.png, with its own blue haze)
→ public/assets/arena/utilizator/{room,sky,bolt}.webp, plus what the room draws itself (arena-bg.tsx UtilizatorRoom):
rain-a / rain-b.webp — two rain sheets (near: long bright streaks, far: thin faint ones), each tiles top to bottom;
fog.webp — a band of ground fog that tiles left to right; and the flat picture for the places that show it still
(public/assets/arena/utilizator.webp).
"""
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = "tools/boss/source/utilizator/room"
O = "public/assets/arena/utilizator"
room = Image.open(f"{S}/room.png").convert("RGBA")
assert room.size == (1024, 1536), room.size
room.save(f"{O}/room.webp", quality=88, method=6)
sky = Image.open(f"{S}/sky.png").convert("RGB").resize((1024, 1024), Image.LANCZOS)
sky.save(f"{O}/sky.webp", quality=85, method=6)
bolt = Image.open(f"{S}/bolt.png").convert("RGBA").resize((900, 600), Image.LANCZOS)
bolt.save(f"{O}/bolt.webp", quality=88, method=6)


def rain(w, h, n, length, width, alpha, seed, slant=0.18):
    """streaks that wrap top to bottom and side to side (the tile repeats seamlessly while it falls)"""
    random.seed(seed)
    t = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    for _ in range(n):
        x, y = random.uniform(0, w), random.uniform(0, h)
        L = length * random.uniform(0.6, 1.3)
        a = int(alpha * random.uniform(0.45, 1))
        for dy in (-h, 0, h):
            for dx in (-w, 0, w):
                d.line([(x + dx, y + dy), (x + dx - L * slant, y + dy + L)], fill=(200, 220, 255, a), width=width)
    return t.filter(ImageFilter.GaussianBlur(0.6))


rain(1024, 768, 420, 70, 2, 150, 1).save(f"{O}/rain-a.webp", quality=80, method=6)
rain(1024, 768, 900, 38, 1, 95, 2).save(f"{O}/rain-b.webp", quality=80, method=6)

# fog: soft blobs, wrapped left to right
random.seed(3)
W, H = 2048, 420
f = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(f)
for _ in range(90):
    x, y = random.uniform(0, W), random.uniform(H * 0.3, H * 0.85)
    rx, ry = random.uniform(120, 320), random.uniform(40, 110)
    v = random.randint(40, 110)
    for dx in (-W, 0, W):
        d.ellipse([x + dx - rx, y - ry, x + dx + rx, y + ry], fill=v)
f = f.filter(ImageFilter.GaussianBlur(38))
a = np.array(f).astype(np.float32)
ys = np.linspace(0, 1, H)[:, None]
a *= np.clip(np.minimum(ys / 0.35, (1 - ys) / 0.25), 0, 1)        # fades out at the top and the bottom of the band
fog = np.zeros((H, W, 4), np.uint8)
fog[..., 0], fog[..., 1], fog[..., 2] = 170, 190, 205
fog[..., 3] = np.clip(a * 1.6, 0, 255).astype(np.uint8)
Image.fromarray(fog).save(f"{O}/fog.webp", quality=82, method=6)

# the still picture: the sky, a faint bolt, the yard
flat = Image.new("RGBA", (1024, 1536), (0, 0, 0, 255))
flat.paste(sky.convert("RGBA"), (0, -260))
b2 = bolt.copy(); b2.putalpha(Image.fromarray((np.array(bolt)[..., 3] * 0.5).astype(np.uint8)))
flat.alpha_composite(b2, (180, -40))
flat.alpha_composite(room)
flat.convert("RGB").save("public/assets/arena/utilizator.webp", quality=86, method=6)
print("ok")
