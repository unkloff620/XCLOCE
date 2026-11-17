"""
Утилизатор's boss card (the artist's two layers, 1200×520, in place): the rusty hazard plate (tools/ui/source/utilizator-plate.png)
under the acid slime frame (utilizator-slime.png) → public/assets/ui/boss-card-frame-utilizator.webp (the nine-slice frame),
and for the slime's light (screens.css «Утилизатор's card»):
  utilizator-slime-glow.webp — the slime brightened plus a soft green halo, kept inside the card's outline (screen-blended, pulses),
  utilizator-slime-mask.webp — the slime's own shape (the glint runs only over it).
"""
import numpy as np
from PIL import Image, ImageFilter, ImageChops

plate = Image.open("tools/ui/source/utilizator-plate.png").convert("RGBA")
slime = Image.open("tools/ui/source/utilizator-slime.png").convert("RGBA")
a = np.array(slime)
a[..., 3][a[..., 3] < 24] = 0
slime = Image.fromarray(a)
frame = plate.copy()
frame.alpha_composite(slime)
frame.save("public/assets/ui/boss-card-frame-utilizator.webp", quality=90, method=6)

# the glow: the bright greens of the slime lit up + a blurred green halo spreading from it
rgb = a[..., :3].astype(np.float32)
green = (rgb[..., 1] > 120) & (rgb[..., 1] > rgb[..., 0] * 1.05) & (rgb[..., 1] > rgb[..., 2] * 1.4)
alpha = a[..., 3].astype(np.float32) / 255 * green
lit = np.zeros_like(a)
lit[..., 0], lit[..., 1], lit[..., 2] = 150, 255, 40
lit[..., 3] = (alpha * 255).astype(np.uint8)
lit = Image.fromarray(lit)
halo = Image.new("RGBA", lit.size, (0, 0, 0, 0))
for r, k in [(18, 0.9), (7, 0.8)]:
    h = lit.filter(ImageFilter.GaussianBlur(r))
    ha = np.array(h); ha[..., 3] = np.clip(ha[..., 3].astype(np.float32) * k * 1.8, 0, 255).astype(np.uint8)
    halo.alpha_composite(Image.fromarray(ha))
core = np.array(lit); core[..., 3] = (core[..., 3] * 0.45).astype(np.uint8)
halo.alpha_composite(Image.fromarray(core))
# the light stays inside the card: no halo outside the frame's own outline (the slime and the plate)
ha = np.array(halo)
ha[..., 3] = (ha[..., 3].astype(np.float32) * (np.array(frame)[..., 3] / 255)).astype(np.uint8)
Image.fromarray(ha).save("public/assets/ui/utilizator-slime-glow.webp", quality=88, method=6)

m = np.zeros_like(a); m[..., :3] = 255; m[..., 3] = a[..., 3]
Image.fromarray(m).save("public/assets/ui/utilizator-slime-mask.webp", quality=90, method=6)
print("ok", frame.size)
