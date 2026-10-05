"""
Puts the fitted parts (raw/fit.json) on the reference canvas: tools/boss/source/<boss>/placed/<part>.png, all in place.
Also writes raw/check.png: the reference faded, every placed part on top — to eyeball the fit.
"""
import sys, json, os
import numpy as np
from PIL import Image

boss = sys.argv[1]
D = f"tools/boss/source/{boss}"
ref = Image.open(f"{D}/raw/reference.png").convert("RGBA")
fits = json.load(open(f"{D}/raw/fit.json"))
os.makedirs(f"{D}/placed", exist_ok=True)
check = Image.new("RGBA", ref.size, (255, 255, 255, 255))
faded = ref.copy(); faded.putalpha(Image.fromarray((np.array(ref)[:, :, 3] * 0.35).astype(np.uint8)))
check.alpha_composite(faded)
for p, f in fits.items():
    sheet = Image.open(f"{D}/raw/{f.get('sheet', p)}.png").convert("RGBA")
    w, h = round(sheet.width * f["s"]), round(sheet.height * f["s"])
    sc = sheet.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", ref.size, (0, 0, 0, 0))
    x, y = round(f["tx"]), round(f["ty"])
    canvas.alpha_composite(sc, (max(0, x), max(0, y)), (max(0, -x), max(0, -y)))
    canvas.save(f"{D}/placed/{p}.png")
    if not p.startswith("_"):
        check.alpha_composite(canvas)
check.save(f"{D}/raw/check.png")
print("placed", list(fits))
