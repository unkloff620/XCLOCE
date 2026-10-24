"""Cuts the card deck (tools/scene/source/cards/deck.png: 4 rows — ♦ ♥ ♠ ♣, columns 2…10 J Q K A) into
public/assets/cards/<suit>-<rank>.webp (suit 0 ♠ 1 ♥ 2 ♦ 3 ♣ as in content/games.ts, rank 1 = ace … 13 = king) and the
back (tools/scene/source/cards/back.png) into public/assets/cards/back.webp."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "..", "public", "assets", "cards")
os.makedirs(OUT, exist_ok=True)
deck = Image.open(os.path.join(HERE, "source", "cards", "deck.png")).convert("RGBA")
a = np.array(deck)
white = (a[..., 0] > 200) & (a[..., 1] > 200) & (a[..., 2] > 200) & (a[..., 3] > 200)
lab, _ = ndimage.label(white)
boxes = [(o[1].start, o[0].start, o[1].stop, o[0].stop) for i, o in enumerate(ndimage.find_objects(lab)) if (lab[o] == i + 1).sum() > 5000]
assert len(boxes) == 52, len(boxes)
boxes.sort(key=lambda b: (b[1] // 100, b[0]))
ROW_SUIT = [2, 1, 0, 3]  # ♦ ♥ ♠ ♣
for k, (x0, y0, x1, y1) in enumerate(boxes):
    row, col = divmod(k, 13)
    rank = 1 if col == 12 else col + 2
    card = deck.crop((x0 - 3, y0 - 3, x1 + 3, y1 + 3))
    card.save(os.path.join(OUT, f"{ROW_SUIT[row]}-{rank}.webp"), quality=90, method=6)
back = Image.open(os.path.join(HERE, "source", "cards", "back.png")).convert("RGBA")
bb = back.split()[3].point(lambda v: 255 if v > 20 else 0).getbbox()
back = back.crop(bb)
back.resize((240, round(240 * back.height / back.width)), Image.LANCZOS).save(os.path.join(OUT, "back.webp"), quality=88, method=6)
print("cards ok", card.size)
