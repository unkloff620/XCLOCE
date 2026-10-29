"""
The boss medals (gpt-image-1.5, one sheet per boss: bronze, silver, gold left to right, transparent):
tools/medals/source/<boss>.png → public/assets/medals/<boss>-<bronze|silver|gold>.webp (256×256, the medal centred)
Run from the repo root: python3 tools/medals/build-medals.py
"""
import glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

for f in sorted(glob.glob("tools/medals/source/*.png")):
    boss = os.path.basename(f)[:-4]
    img = Image.open(f).convert("RGBA")
    mask = ndimage.binary_dilation(np.array(img)[:, :, 3] > 30, iterations=6)
    lab, n = ndimage.label(mask)
    boxes = sorted([s for s in ndimage.find_objects(lab) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 20000], key=lambda s: s[1].start)
    assert len(boxes) == 3, (boss, len(boxes))
    for s, tier in zip(boxes, ["bronze", "silver", "gold"]):
        crop = img.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        crop = crop.crop(crop.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox())
        side = max(crop.size) + 6
        sq = Image.new("RGBA", (side, side))
        sq.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
        sq.resize((256, 256), Image.LANCZOS).save(f"public/assets/medals/{boss}-{tier}.webp", quality=88, method=6)
    print(boss)
