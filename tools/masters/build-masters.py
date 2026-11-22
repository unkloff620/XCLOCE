"""
«Мастера» (content/masters.ts): the draft art (tools/masters/source/, generated on white) → public/assets/masters/:
m01…m16.webp — each master cut from his white background (half-length, 512 px), room.webp + table.webp — his workshop and the table
in front of him, board.webp — the workbench of the training path; public/assets/ui/mastery.webp — «Мастерство» (the bulb).
"""
import numpy as np, cv2
from PIL import Image

S, O = "tools/masters/source", "public/assets/masters"


def cut_white(path, size, keep_right=False):
    im = Image.open(path).convert("RGBA")
    a = np.array(im)
    rgb = a[..., :3].astype(int)
    white = (rgb.min(-1) > 232).astype(np.uint8)
    # the background: the white connected to the picture's edges
    h, w = white.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)
    bg = white.copy()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w - 1, h // 2)]:
        if bg[y, x]:
            cv2.floodFill(bg, mask, (x, y), 2)
    out = (bg == 2)
    # the white seen through closed gaps (between an arm and the body, in the hair, the chain's links): flat pure white
    # islands; a master's own white (lab coats, a tank top) is shaded, so it stays. keep_right: Лёха's glass sheet.
    n, lab, st, cen = cv2.connectedComponentsWithStats((rgb.min(-1) > 236).astype(np.uint8), 8)
    for k in range(1, n):
        if st[k][4] < 120 or (keep_right and cen[k][0] > w * 0.6):
            continue
        m = lab == k
        if rgb[m].std() < 6:
            out |= m
    soft = cv2.GaussianBlur(out.astype(np.float32), (0, 0), 1.2)
    a[..., 3] = (a[..., 3] * (1 - soft)).astype(np.uint8)
    im = Image.fromarray(a)
    im = im.crop(im.getbbox())
    im.thumbnail((size, size), Image.LANCZOS)
    return im


for i in range(1, 17):
    cut_white(f"{S}/m{i:02d}.png", 512, keep_right=i == 7).save(f"{O}/m{i:02d}.webp", quality=88, method=6, exact=True)
# the room and its table (the artist's, 2000×3000 both): the master stands between them, the table in front
# the window is cut out (the yard sky drifts behind it)
Image.open(f"{S}/room.png").convert("RGBA").resize((800, 1200), Image.LANCZOS).save(f"{O}/room.webp", quality=82, method=6, exact=True)
Image.open(f"{S}/table.png").convert("RGBA").resize((800, 1200), Image.LANCZOS).save(f"{O}/table.webp", quality=85, method=6)
Image.open(f"{S}/board.png").convert("RGB").resize((1152, 768), Image.LANCZOS).save(f"{O}/board.webp", quality=82, method=6)
cut_white(f"{S}/bulb.png", 128).save("public/assets/ui/mastery.webp", quality=90, method=6, exact=True)
print("ok")
