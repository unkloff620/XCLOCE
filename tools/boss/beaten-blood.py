"""
The beaten look (below half HP: blood, cuts, bruises, torn clothes) for the bosses rigged from the artist's layers —
Дацкоу, Кедр, Гаркуша, Фокус, Химик (Нитка, Псих, Солнце have their own scripts, the same way).

  python3 tools/boss/beaten-blood.py prep <boss>   → tools/boss/source/<boss>/blood/in-body.png: the placed layers put
                                                     together on white, the boss's box fitted into 1024×1536
  (the image edit of it, low quality — tools/boss/source/<boss>/blood/edit-body.png)
  python3 tools/boss/beaten-blood.py apply <boss>  → public/bosses/<boss>/rig/<part>-blood.webp

The edit is fitted back onto its input (ECC, affine) and every hurt layer takes from it only what changed, only where
that layer is the one seen on top; its own outline (alpha) stays exactly the artist's — a tear shows as the skin or the
dark inside painted over the cloth, never as a hole cut in the layer. The rig (boss-<id>.tsx) shows the -blood pictures
when dazed (the part's box and size are the same as <part>.webp, so nothing moves).
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image

# the draw order (bottom first, as in each assemble-<boss>.py), the layers that get hurt, the crop's margin
BOSSES = {
    "datsik": {"order": ["armL", "body", "legs", "throat", "tongue", "teeth-low", "teeth-up", "eyes", "pupils", "head", "chin", "brows", "hair", "armR", "lowR", "lowL"],
               "hurt": ["armL", "body", "legs", "head", "chin", "armR", "lowR", "lowL"], "margin": 40},
    "fokus": {"order": ["coatBack", "legs", "armR", "body", "coat", "lowR", "laptop", "armL", "lowL", "handL", "hoodBack", "neck", "throat", "teeth-low", "chin", "teeth-up",
                        "eyes", "pupils", "head", "brows", "glasses", "hoodShadow", "hoodFront", "handR", "phone"],
              "hurt": ["coatBack", "legs", "armR", "body", "coat", "lowR", "armL", "lowL", "handL", "hoodBack", "neck", "chin", "head", "hoodFront", "handR"], "margin": 40},
    "himik": {"order": ["legs", "neck", "body", "armR", "lowR", "handR", "flaskR", "flaskR-glass", "thumbR", "fingersR", "coatL", "coatR",
                        "throat", "teeth-up", "eyes", "pupils", "head", "teeth-low", "chin", "mustache", "beard", "brows", "mask",
                        "tube", "tube-glass", "armL", "lowL"],
              "hurt": ["legs", "neck", "body", "armR", "lowR", "handR", "thumbR", "fingersR", "coatL", "coatR", "head", "chin", "armL", "lowL"], "margin": 60,
              "skip": ["poisonR-mask", "poisonL-mask", "maskEar"]},
    "kedr": {"order": ["legs", "armR", "lowR", "handR", "body", "throat", "teeth-up", "teeth-low", "chin", "eyes", "pupils", "head", "brows", "armL", "lowL", "handL"],
             "hurt": ["legs", "armR", "lowR", "handR", "body", "chin", "head", "armL", "lowL", "handL"], "margin": 60},
    "garkusha": {"order": ["legs", "armL", "body", "lowL", "armR", "lowR", "eyes", "pupils", "head", "brows", "handL", "handR"],
                 "hurt": ["legs", "armL", "body", "lowL", "armR", "lowR", "head", "handL", "handR"], "margin": 60},
}
EW, EH = 1024, 1536


def setup(boss):
    cfg = BOSSES[boss]
    D = f"tools/boss/source/{boss}"
    L = {n: Image.open(f"{D}/placed/{n}.png").convert("RGBA") for n in cfg["order"]}
    W, H = next(iter(L.values())).size
    m = cfg["margin"]
    every = [Image.open(f"{D}/placed/{f}").convert("RGBA").getbbox() for f in os.listdir(f"{D}/placed") if f.endswith(".png") and f[:-4] not in cfg.get("skip", [])]
    every = [b for b in every if b]
    crop = (max(0, min(b[0] for b in every) - m), max(0, min(b[1] for b in every) - m), min(W, max(b[2] for b in every) + m), H)
    # the crop fitted into the edit's 1024×1536 (white round it)
    cw, ch = crop[2] - crop[0], crop[3] - crop[1]
    k = min(EW / cw, EH / ch)
    off = ((EW - cw * k) / 2, (EH - ch * k) / 2)
    return cfg, D, L, crop, k, off


def composite(cfg, L, crop):
    comp = np.full((crop[3] - crop[1], crop[2] - crop[0], 3), 255, np.float32)
    top = np.full(comp.shape[:2], -1, int)
    for i, n in enumerate(cfg["order"]):
        a = np.array(L[n]).astype(np.float32)[crop[1]:crop[3], crop[0]:crop[2]]
        al = a[..., 3:] / 255
        comp = comp * (1 - al) + a[..., :3] * al
        top[a[..., 3] > 128] = i
    return comp.astype(np.uint8), top


def prep(boss):
    cfg, D, L, crop, k, off = setup(boss)
    comp, _ = composite(cfg, L, crop)
    sm = cv2.resize(comp, (round(comp.shape[1] * k), round(comp.shape[0] * k)), interpolation=cv2.INTER_AREA)
    out = np.full((EH, EW, 3), 255, np.uint8)
    x, y = round(off[0]), round(off[1])
    out[y:y + sm.shape[0], x:x + sm.shape[1]] = sm
    os.makedirs(f"{D}/blood", exist_ok=True)
    Image.fromarray(out).save(f"{D}/blood/in-body.png")
    print(boss, "crop", crop, "k", round(k, 4), "→", f"{D}/blood/in-body.png")


def rig_parts(boss):
    s = open("src/client/art/boss-rig-data.ts").read()
    i = s.index(f'"{boss}": {{') + len(f'"{boss}": ')
    d = 0
    for j, c in enumerate(s[i:], i):
        d += c == "{"; d -= c == "}"
        if d == 0: break
    return json.loads(s[i:j + 1])["parts"]


def apply(boss):
    cfg, D, L, crop, k, off = setup(boss)
    comp, top = composite(cfg, L, crop)
    inp = np.array(Image.open(f"{D}/blood/in-body.png").convert("RGB"))
    ed = np.array(Image.open(f"{D}/blood/edit-body.png").convert("RGB").resize((EW, EH), Image.LANCZOS))
    g = lambda x: cv2.cvtColor(x, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
    M = np.eye(2, 3, dtype=np.float32)
    _, M = cv2.findTransformECC(g(inp), g(ed), M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    print("fit", np.round(M, 4).tolist())
    ed = cv2.warpAffine(ed, M, (EW, EH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderValue=(255, 255, 255))
    # back to the sheet's crop
    cw, ch = crop[2] - crop[0], crop[3] - crop[1]
    x, y = round(off[0]), round(off[1])
    region = ed[y:y + round(ch * k), x:x + round(cw * k)]
    sheet = cv2.resize(region, (cw, ch), interpolation=cv2.INTER_CUBIC)
    d = np.abs(sheet.astype(np.int16) - comp.astype(np.int16)).sum(-1).astype(np.float32)
    # on the dark clothes the blood and the tears differ less from what was there: a lower bar where it was dark
    dark = comp.astype(np.float32).mean(-1) < 70
    m = np.where(dark, np.clip((d - 38) / 60, 0, 1), np.clip((d - 70) / 90, 0, 1))
    m *= (sheet.min(-1) < 225)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.GaussianBlur(m, (0, 0), 1.2)
    P = rig_parts(boss)
    R = f"public/bosses/{boss}/rig"
    idx = {n: i for i, n in enumerate(cfg["order"])}
    for n in cfg["hurt"]:
        if n not in P: continue
        mine = (top == idx[n]).astype(np.float32)
        mine = cv2.GaussianBlur(cv2.erode(mine, np.ones((5, 5), np.uint8)), (0, 0), 1.0)
        w = m * mine
        p = P[n]
        o = Image.open(f"{R}/{n}.webp").convert("RGBA")
        box = (p["x"] * 2, p["y"] * 2, (p["x"] + p["w"]) * 2, (p["y"] + p["h"]) * 2)
        ext = lambda im, mode: im.transform(o.size, Image.EXTENT, box, mode)
        a = np.array(o).astype(np.float32)
        ew = np.array(ext(Image.fromarray((w * 255).astype(np.uint8)), Image.BILINEAR)).astype(np.float32)[..., None] / 255
        er = np.array(ext(Image.fromarray(sheet), Image.BICUBIC)).astype(np.float32)
        a[..., :3] = a[..., :3] * (1 - ew) + er * ew
        Image.fromarray(a.astype(np.uint8)).save(f"{R}/{n}-blood.webp", quality=75, method=6, exact=True)
        print(n, o.size, f"{float(ew.mean()) * 100:.2f}%")
    # the layers the artist redrew himself (tools/boss/source/<boss>/blood/<part>-artist.png, on the boss's sheet): his own
    # picture, cut to the part's box
    for n in cfg["hurt"]:
        f = f"{D}/blood/{n}-artist.png"
        if n not in P or not os.path.exists(f): continue
        p = P[n]
        o = Image.open(f"{R}/{n}.webp")
        box = (crop[0] + p["x"] * 2, crop[1] + p["y"] * 2, crop[0] + (p["x"] + p["w"]) * 2, crop[1] + (p["y"] + p["h"]) * 2)
        Image.open(f).convert("RGBA").transform(o.size, Image.EXTENT, box, Image.BICUBIC).save(f"{R}/{n}-blood.webp", quality=75, method=6, exact=True)
        print(n, "the artist's")


if __name__ == "__main__":
    {"prep": prep, "apply": apply}[sys.argv[1]](sys.argv[2])
