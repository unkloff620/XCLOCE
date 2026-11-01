"""The dealer in the exchanger's garage, sharp: the yard kiosk's man layers (tools/yard/kiosk/source, 1254×1254) upscaled
×4 with Real-ESRGAN (x4plus anime 6B, run through onnxruntime: tools/exchange/sr — the weights are downloaded and turned
into ONNX by sr/build_onnx.py, not kept in git), shrunk to ×OUT and cut to each part's own box →
public/assets/exchange/dealer-<part>.webp + DEALER_BOX in src/client/art/exchange-data.ts (percent of the kiosk box,
so the kiosk's animations — transform origins on the whole box — still fit)."""
import os, sys, json, re
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(HERE, "sr"))
from up import sr  # noqa: E402  (needs /tmp/t/sr/anime.onnx — see sr/build_onnx.py)
KIOSK = os.path.join(ROOT, "tools", "yard", "kiosk", "source")
OUT = os.path.join(ROOT, "public", "assets", "exchange")
BOX = (8, 2, 1245, 1246)    # the kiosk box (tools/yard/kiosk/build.py)
SCALE = 3                   # output pixels per source pixel
bw, bh = BOX[2] - BOX[0], BOX[3] - BOX[1]
boxes = {}
for part in ["torso", "head", "forearm", "fist", "arm-smoke"]:
    im = np.array(Image.open(os.path.join(KIOSK, part + ".png")).convert("RGBA"))
    a = im[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    x0, y0, x1, y1 = max(0, xs.min() - 6), max(0, ys.min() - 6), min(im.shape[1], xs.max() + 7), min(im.shape[0], ys.max() + 7)
    c = im[y0:y1, x0:x1].astype(np.float32)
    al = c[:, :, 3:4] / 255
    rgb = (c[:, :, :3] * al).astype(np.uint8)                 # on black: the outline is black anyway
    big = sr(rgb).astype(np.float32)
    big_a = sr(np.repeat(c[:, :, 3:4].astype(np.uint8), 3, 2))[:, :, :1].astype(np.float32) / 255
    out_rgb = np.clip(big / np.maximum(big_a, 1e-3), 0, 255)  # un-premultiply
    res = np.dstack([out_rgb, big_a * 255]).astype(np.uint8)
    w, h = (x1 - x0) * SCALE, (y1 - y0) * SCALE
    Image.fromarray(res, "RGBA").resize((w, h), Image.LANCZOS).save(os.path.join(OUT, f"dealer-{part}.webp"), quality=88, method=6)
    boxes[part] = [round((x0 - BOX[0]) / bw * 100, 3), round((y0 - BOX[1]) / bh * 100, 3), round((x1 - x0) / bw * 100, 3), round((y1 - y0) / bh * 100, 3)]
    print(part, boxes[part], w, h, os.path.getsize(os.path.join(OUT, f"dealer-{part}.webp")) // 1024, "KB")
p = os.path.join(ROOT, "src", "client", "art", "exchange-data.ts")
ts = open(p).read()
ts = re.sub(r"\n/\*\* the dealer's parts.*", "", ts, flags=re.S)
ts += "/** the dealer's parts (public/assets/exchange/dealer-<part>.webp, tools/exchange/build-dealer.py): [left, top, width, height] in percent of the kiosk box */\n"
ts += "export const DEALER_BOX: Record<string, [number, number, number, number]> = " + json.dumps(boxes) + ";\n"
open(p, "w").write(ts)
