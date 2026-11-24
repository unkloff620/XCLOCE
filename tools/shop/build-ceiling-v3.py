"""
The shop's ceiling above the picture for the 2026-11-24 room (tools/shop/source/v3/bg.png): the ceiling band of the room
(above the front beam) mirrored back and forth upward, darker the higher it goes → public/assets/shop/v2/ceiling.webp
(1200×900, stands right on the scene's top edge).
"""
import numpy as np
from PIL import Image

room = np.asarray(Image.open("tools/shop/source/v3/bg.png").convert("RGB").resize((1200, 1800), Image.LANCZOS)).astype(np.float32)
BAND = 96                      # the ceiling rows above the front beam (of 1800)
band = room[:BAND]
rows = []
k = 0
while sum(len(r) for r in rows) < 900:
    rows.append(band[::-1] if k % 2 == 0 else band)
    k += 1
up = np.concatenate(rows)[:900][::-1]          # row 899 touches the picture's row 0
shade = np.linspace(0.45, 1.0, 900)[:, None, None]
Image.fromarray(np.clip(up * shade, 0, 255).astype(np.uint8)).save("public/assets/shop/v2/ceiling.webp", quality=80, method=6)
print("ceiling ok")
