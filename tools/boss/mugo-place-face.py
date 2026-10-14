"""
Мугонатор: the face sheets (head, eyes, pupils, eyes-closed, brows, jaw — all on one 1000×1000 canvas) are put onto
the 2745×2800 reference with one similarity transform found by SIFT feature matching (head sheet ↔ reference, RANSAC):
raw/headM.json. Output: placed/<part>.png on the reference canvas.
"""
import json, os
import numpy as np, cv2
from PIL import Image
D = "tools/boss/source/mugo"
ref = Image.open(f"{D}/raw/reference.png")
M = np.array(json.load(open(f"{D}/raw/headM.json"))["M"], np.float32)
os.makedirs(f"{D}/placed", exist_ok=True)
for n in ["head", "eyes", "pupils", "eyes-closed", "brows", "jaw"]:
    a = np.array(Image.open(f"{D}/raw/{n}.png").convert("RGBA"))
    # premultiply so the warp does not bleed the white of empty pixels into the edges
    al = a[:, :, 3:].astype(np.float32) / 255
    pm = np.concatenate([a[:, :, :3] * al, a[:, :, 3:]], axis=2).astype(np.float32)
    w = cv2.warpAffine(pm, M, ref.size, flags=cv2.INTER_LANCZOS4, borderValue=(0, 0, 0, 0))
    A = np.clip(w[:, :, 3:], 0, 255)
    rgb = np.where(A > 0, w[:, :, :3] / np.maximum(A, 1e-3) * 255, 0)
    out = np.concatenate([np.clip(rgb, 0, 255), A], axis=2).astype(np.uint8)
    Image.fromarray(out).save(f"{D}/placed/{n}.png")
print("ok")
