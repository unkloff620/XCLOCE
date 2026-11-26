"""
«Русская рулетка» of «Бандитский фарт»: the artist's revolver (tools/bandit/source/roulette/, all on one 1000×1000 canvas,
transparent): gun (seen from behind, aimed away — at the back of the head), drum (the cylinder swung out, its six
chambers see-through), round (the cartridge's base, in the drum's top-left chamber); bullet (the side view: the shots
left, top left of the window). → public/assets/bandit/roulette/<name>.webp — the canvas pieces kept whole at 500 px (they
stay lined up), the bullet cropped.
"""
import os
from PIL import Image

S = "tools/bandit/source/roulette"
O = "public/assets/bandit/roulette"
os.makedirs(O, exist_ok=True)
for n in ["gun", "drum", "round"]:
    Image.open(f"{S}/{n}.png").convert("RGBA").resize((500, 500), Image.LANCZOS).save(f"{O}/{n}.webp", quality=90, method=6)
b = Image.open(f"{S}/bullet.png").convert("RGBA")
b = b.crop(b.getbbox())
b.resize((round(b.width * 200 / b.height), 200), Image.LANCZOS).save(f"{O}/bullet.webp", quality=90, method=6)
print("ok")
