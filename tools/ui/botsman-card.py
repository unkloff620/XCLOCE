"""
Боцман's boss card: the artist's black leather frame (tools/ui/source/boss-card-frame-botsman.png, 1916×821) →
public/assets/ui/boss-card-frame-botsman.webp (1200 wide, the black outside the rounded corners made see-through),
and the green «code rain» for inside it (public/assets/ui/botsman-rain.webp: a tall tile of falling glyph columns,
a bright head and a fading tail each; screens.css scrolls two copies of it at different speeds).
"""
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

src = Image.open("tools/ui/source/boss-card-frame-botsman.png").convert("RGBA")   # cut out by the artist
W = 1200
im = src.resize((W, round(src.height * W / src.width)), Image.LANCZOS)
a = np.array(im)
Image.fromarray(a).save("public/assets/ui/boss-card-frame-botsman.webp", quality=90, method=6)
print("frame", im.size)

# the rain tile: 360×720, columns 12 px apart, each a falling string of glyphs
random.seed(7)
TW, TH, CW = 360, 720, 12
tile = Image.new("RGBA", (TW, TH), (0, 0, 0, 0))
d = ImageDraw.Draw(tile)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 11)
except OSError:
    font = ImageFont.load_default()
glyphs = "0123456789ABCDEFZ$#@<>*+=:ЖЗИЛПФЦШЯБДЮ¥£ΣΞΛΨ"
for cx in range(0, TW, CW):
    for _ in range(random.choice([1, 1, 2])):
        n = random.randint(8, 26)
        y0 = random.randint(0, TH)
        for k in range(n):
            y = (y0 - k * 13) % TH
            t = k / n                                   # 0 at the head, 1 at the tail end
            if k == 0:
                col = (200, 255, 210, 235)
            else:
                g = int(255 * (1 - t) ** 1.4)
                col = (40, 120 + g // 2, 60, int(30 + 190 * (1 - t) ** 1.2))
            ch = random.choice(glyphs)
            try:
                d.text((cx, y), ch, font=font, fill=col)
            except Exception:
                d.text((cx, y), random.choice("0123456789"), font=font, fill=col)
glow = tile.filter(ImageFilter.GaussianBlur(2.2))
out = Image.alpha_composite(glow, tile)
out.save("public/assets/ui/botsman-rain.webp", quality=88, method=6)
print("rain", out.size)
