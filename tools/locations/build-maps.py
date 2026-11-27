"""The locations' task maps (top-down vector cartoon, the user's pick 2026-11-20): tools/locations/source/map/<id>.png (1024×1536)
→ public/assets/locations/map/<id>.webp (720×1080). Where the five task stops stand on each: LOC_MAPS in client/screens/locations.tsx."""
import os, glob
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "locations", "map"))
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(HERE, "source", "map", "*.png"))):
    n = os.path.splitext(os.path.basename(f))[0]
    Image.open(f).convert("RGB").resize((720, 1080), Image.LANCZOS).save(os.path.join(OUT, n + ".webp"), quality=75, method=6)
    print(n)
