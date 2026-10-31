"""
The artist's whole body (tools/rig/source/v2/body.png: the torso with both arms and the resting hand, legs.png: the legs
with the shorts — both on the 2000×2800 rig canvas) → the rig's parts, so the clothes, the editor and the skin tones
keep working: torso.png = the legs under the body, armUL / foreL / armUR / foreR = the body cut by the old pieces'
shapes (pieces-old/). The arms no longer bend, so the pieces join without seams. Run build-rig.py and build-look.py after.
"""
import os
import numpy as np
from PIL import Image
import cv2

S = os.path.join(os.path.dirname(os.path.abspath(__file__)), "source", "v2")

def clean(im):
    a = np.array(im)
    al = a[..., 3]
    al[al < 40] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats((al > 0).astype(np.uint8))
    for i in range(1, n):
        if st[i][4] < 400: al[lab == i] = 0
    a[..., 3] = al
    return Image.fromarray(a)

body = clean(Image.open(os.path.join(S, "body.png")).convert("RGBA"))
legs = clean(Image.open(os.path.join(S, "legs.png")).convert("RGBA"))
torso = legs.copy(); torso.alpha_composite(body)
torso.save(os.path.join(S, "torso.png"))
B = np.array(body)
for p in ["armUL", "foreL", "armUR", "foreR"]:
    m = np.array(Image.open(os.path.join(S, "pieces-old", p + ".png")).convert("RGBA"))[..., 3] > 60
    m = cv2.dilate(m.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    a = B.copy(); a[..., 3] = np.where(m, a[..., 3], 0)
    Image.fromarray(a).save(os.path.join(S, p + ".png"))
    print(p, int((a[..., 3] > 128).sum()))
