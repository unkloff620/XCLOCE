"""The exchanger screen (screens/exchange.tsx): the garage background (tools/exchange/source/garage.png, generated, approved
in style 1 «Гаражный барыга») → public/assets/exchange/garage.webp. The dealer behind the table is the yard kiosk's
animated layers (public/assets/yard/kiosk), placed by CSS (.xg-dealer)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "exchange"))
os.makedirs(OUT, exist_ok=True)
im = Image.open(os.path.join(HERE, "source", "garage.png")).convert("RGB")
im.resize((768, 1152), Image.LANCZOS).save(os.path.join(OUT, "garage.webp"), quality=80, method=6)
print(os.path.getsize(os.path.join(OUT, "garage.webp")) // 1024, "KB")
