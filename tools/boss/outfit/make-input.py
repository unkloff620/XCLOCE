"""
A boss's rig layers (tools/boss/source/<boss>/) put together on white and cut to a square around him → the picture an image
edit dresses him up on (tools/boss/outfit/<boss>-in.png, 1024²) + where that square lies on the 1700×1750 sheet
(tools/boss/outfit/<boss>-in.json) — apply-outfit.py maps the edit back with it.
"""
import os, sys, json
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "source")
ORDER = ["armL", "lowL", "handL", "legs", "body", "eyes", "pupils", "head", "armR", "lowR", "handR"]
for boss in sys.argv[1:]:
    d = os.path.join(SRC, boss)
    size = Image.open(os.path.join(d, "body.png")).size
    c = Image.new("RGBA", size, (0, 0, 0, 0))
    for n in ORDER:
        p = os.path.join(d, n + ".png")
        if os.path.exists(p): c.alpha_composite(Image.open(p).convert("RGBA"))
    x0, y0, x1, y1 = c.getbbox()
    side = max(x1 - x0, y1 - y0)
    ox, oy = x0 - (side - (x1 - x0)) // 2, y0 - (side - (y1 - y0)) // 2
    w = Image.new("RGBA", (side, side), (255, 255, 255, 255))
    sx, sy = max(0, ox), max(0, oy)
    w.alpha_composite(c.crop((sx, sy, min(size[0], ox + side), min(size[1], oy + side))), (sx - ox, sy - oy))
    w.convert("RGB").resize((1024, 1024), Image.LANCZOS).save(os.path.join(HERE, f"{boss}-in.png"))
    json.dump({"ox": ox, "oy": oy, "side": side, "sheet": size}, open(os.path.join(HERE, f"{boss}-in.json"), "w"))
    print(boss, ox, oy, side)
