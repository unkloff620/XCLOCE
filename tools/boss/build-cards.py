"""
Waist-up pictures for the boss list cards: public/bosses/<id>/card.webp (aspect ≈ the card's picture box, 0.81).
The whole head with some air above it, the upper clothes, no legs. Crop boxes are in the source picture's pixels;
a negative top adds transparent space above the head.
"""
from PIL import Image

CARDS = {
    # boss: (source, (x0, y0, x1, y1))
    "datsik": ("public/bosses/datsik/full.webp", (0, -90, 1024, 1174)),
    "kedr": ("tools/boss/source/kedr/raw/reference.png", (420, -70, 1460, 1214)),
}
W = 640
for boss, (src, (x0, y0, x1, y1)) in CARDS.items():
    im = Image.open(src).convert("RGBA")
    canvas = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    canvas.alpha_composite(im.crop((max(0, x0), max(0, y0), min(im.width, x1), min(im.height, y1))), (max(0, -x0), max(0, -y0)))
    out = canvas.resize((W, round(W * canvas.height / canvas.width)), Image.LANCZOS)
    out.save(f"public/bosses/{boss}/card.webp", quality=88, method=6)
    print(boss, out.size)
