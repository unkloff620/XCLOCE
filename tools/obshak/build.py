"""
«Общак» (content/obshak.ts): the draft art (tools/obshak/source/, generated on white) → public/assets/obshak/icon.webp
(the menu icon on the home screen) and public/assets/items/needle.webp («Игла», the button of the fund's damage in a fight).
"""
import numpy as np, cv2, os
from PIL import Image


def cut_white(path, size):
    a = np.array(Image.open(path).convert("RGBA"))
    rgb = a[..., :3].astype(int)
    white = (rgb.min(-1) > 232).astype(np.uint8)
    h, w = white.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    bg = white.copy()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if bg[y, x]:
            cv2.floodFill(bg, mask, (x, y), 2)
    out = bg == 2
    # white seen through closed gaps (the needle's eye, between the chest and the wire)
    n, lab, st, _ = cv2.connectedComponentsWithStats((rgb.min(-1) > 236).astype(np.uint8), 8)
    for k in range(1, n):
        m = lab == k
        if st[k][4] >= 120 and rgb[m].std() < 6:
            out |= m
    soft = cv2.GaussianBlur(out.astype(np.float32), (0, 0), 1.2)
    a[..., 3] = (a[..., 3] * (1 - soft)).astype(np.uint8)
    im = Image.fromarray(a)
    im = im.crop(im.getbbox())
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


os.makedirs("public/assets/obshak", exist_ok=True)
cut_white("tools/obshak/source/obshak.png", 256).save("public/assets/obshak/icon.webp", quality=88, method=6, exact=True)
cut_white("tools/obshak/source/needle.png", 256).save("public/assets/items/needle.webp", quality=88, method=6, exact=True)
print("ok")
