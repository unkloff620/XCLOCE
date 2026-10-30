"""The yard pigeon in the artist's layers (tools/yard/pigeon/source/*.png, all on one 509×400 canvas)
→ public/assets/yard/pigeon/<layer>.webp, the same box for all so they stack (client/art/pigeons.tsx)."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "..", "public", "assets", "yard", "pigeon"))
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(HERE, "source", "*.png"))):
    if os.path.basename(f).startswith("ref-"):
        continue  # the artist's pose references (walk, peck, fly), not used in the game
    im = Image.open(f).convert("RGBA").resize((254, 200), Image.LANCZOS)
    im.save(os.path.join(OUT, os.path.splitext(os.path.basename(f))[0] + ".webp"), quality=88, method=6)
    print(os.path.basename(f))
