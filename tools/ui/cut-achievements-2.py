"""Cuts the 2nd and 3rd achievement icon sheets (gpt-image-1.5, transparent) into square 256 px webp icons:
each icon is a big blob of opaque pixels; the blobs are taken in reading order (rows, then left to right)."""
import numpy as np
from PIL import Image
from scipy import ndimage

SHEETS = {
    "tools/ui/achievements-sheet-2.png": ["ach-blat", "ach-avtor", "ach-allboss", "ach-savings", "ach-slots", "ach-upgrader",
                                          "ach-zonk", "ach-poker", "ach-clan", "ach-leader", "ach-raid", "ach-nishtyak"],
    "tools/ui/achievements-sheet-3.png": ["ach-shop", "ach-bj", "ach-spit"],
}
for src, names in SHEETS.items():
    img = Image.open(src).convert("RGBA")
    a = np.array(img)
    mask = ndimage.binary_dilation(a[:, :, 3] > 20, iterations=12)
    lab, n = ndimage.label(mask)
    boxes = [s for s in ndimage.find_objects(lab) if (s[0].stop - s[0].start) * (s[1].stop - s[1].start) > 6000]
    # reading order: rows by the box centre (a row is ~1/3 of the height), then x
    rowh = img.height / 3
    boxes.sort(key=lambda s: (int(((s[0].start + s[0].stop) / 2) // rowh), s[1].start))
    assert len(boxes) == len(names), (src, len(boxes))
    for s, name in zip(boxes, names):
        crop = img.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
        bb = crop.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        crop = crop.crop(bb)
        side = max(crop.size) + 8
        sq = Image.new("RGBA", (side, side))
        sq.alpha_composite(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
        sq.resize((256, 256), Image.LANCZOS).save(f"public/assets/ui/{name}.webp", quality=88, method=6)
        print(name)
