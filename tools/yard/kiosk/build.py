"""The exchange kiosk in the yard, in the artist's layers (tools/yard/kiosk/source/*.png, all on one 1254×1254 canvas):
cut to the kiosk's own box and saved as public/assets/yard/kiosk/<layer>.webp (the same box for all, so they stack).
Prints the box and every layer's place in it (percent) for the CSS (screens.css «обменник»)."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "public", "assets", "yard", "kiosk"))
os.makedirs(OUT, exist_ok=True)
scene = Image.open(os.path.join(HERE, "source", "00-scene.png")).convert("RGBA")
box = scene.split()[3].point(lambda a: 255 if a > 24 else 0).getbbox()
bw, bh = box[2] - box[0], box[3] - box[1]
W = 640
print("box", box, "aspect", round(bh / bw, 4))
for f in sorted(glob.glob(os.path.join(HERE, "source", "*.png"))):
    name = os.path.splitext(os.path.basename(f))[0]
    if name.startswith("00-"):
        continue
    im = Image.open(f).convert("RGBA").crop(box)
    # the white of the opaque layers' empty space is not used: only the alpha counts
    im = im.resize((W, round(bh * W / bw)), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".webp"), quality=86, method=6)
    lb = Image.open(f).convert("RGBA").split()[3].point(lambda a: 255 if a > 24 else 0).getbbox()
    pct = [round((lb[0] - box[0]) / bw * 100, 1), round((lb[1] - box[1]) / bh * 100, 1), round((lb[2] - box[0]) / bw * 100, 1), round((lb[3] - box[1]) / bh * 100, 1)]
    print(name, "x0 y0 x1 y1 %", pct, os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024, "KB")
