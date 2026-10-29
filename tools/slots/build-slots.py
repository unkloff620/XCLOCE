"""
The slot machine room (gpt-image-2 / gpt-image-1.5 art, tools/slots/source/):
  slot-room.png → public/assets/slots/room.webp (1024×1536: the machine with three empty reels, the display, the button)
  sym-<id>.png  → public/assets/slots/<id>.webp (the reel symbols, trimmed and centred on a 256 px square)
"""
import glob, os
from PIL import Image

os.makedirs("public/assets/slots", exist_ok=True)
Image.open("tools/slots/source/slot-room.png").convert("RGB").save("public/assets/slots/room.webp", quality=86, method=6)
for f in sorted(glob.glob("tools/slots/source/sym-*.png")):
    n = os.path.basename(f)[4:-4]
    im = Image.open(f).convert("RGBA")
    im = im.crop(im.getbbox())
    k = 236 / max(im.size)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    c = Image.new("RGBA", (256, 256))
    c.alpha_composite(im, ((256 - im.width) // 2, (256 - im.height) // 2))
    c.save(f"public/assets/slots/{n}.webp", quality=90, method=6)
    print(n)
