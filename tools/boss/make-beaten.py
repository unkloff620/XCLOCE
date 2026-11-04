"""
A boss's beaten look (below half HP the rig switches to <boss>-beaten, src/client/art/boss-rig.tsx):
  python3 tools/boss/make-beaten.py <boss> [<boss> …]      (then: python3 tools/boss/build-boss.py <boss>-beaten)
1. the rig's layers (tools/boss/source/<boss>/) are drawn together, back to front (ORDER);
2. one image edit beats him up (torn bloodied clothes, bruises and cuts) — the same pose and outline;
3. the edit is fitted onto the original figure (tattoo-ink.py's box fit + dense flow between the outlines);
4. each damaged layer (HURT) takes the edit's colours where it is the top layer of the picture, a few px inside its own
   outline — its alpha stays exactly as it was, so the beaten parts lie on the same places and the rig does not jump;
   the rest of the layers (eyes, brows, mouths, teeth, things in the hands) are copied as they are;
5. puppet strips (<part>@<k>.png): frame 0 is cut as above, the other frames get its damage carried over along the
   flow between the frames.
The key is read from /tmp/t/openai.env (never printed). Writes tools/boss/source/<boss>-beaten/ and keeps the edit in raw/.
"""
import base64, glob, importlib.util, os, shutil, sys
import numpy as np
import cv2
import requests
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
_spec = importlib.util.spec_from_file_location("ti", os.path.join(ROOT, "tools", "rig", "tattoo-ink.py"))
ti = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ti)

# back to front, as the rig draws them; HURT — the layers that get beaten
ORDER = {
    "datsik": ["body", "head", "eyes", "foreL", "foreR"],
    "garkusha": ["body", "head", "eyes", "pupils", "brows", "armR", "handR", "armL", "handL"],
    "bebyakyan": ["body", "head", "eyes", "pupils", "brows", "mouth", "foreL", "foreR"],
    "babafey": ["armL", "body", "head", "eyes", "pupils", "browL", "browR", "armR", "lowR", "handR", "lowL", "handL"],
    "vodovoz": ["armR", "armL", "legs", "body", "head", "eyes", "pupils", "browL", "browR", "mouth-closed", "headset", "lowL", "handL", "bag", "lowR", "handR"],
    "knyaz": ["armRb@0", "legs", "body", "head", "eyes", "pupils", "brows@0", "armLb@0", "handL", "cover"],
}
SKIN_AND_CLOTHES = {"body", "head", "head-open", "legs", "foreL", "foreR", "armL", "armR", "lowL", "lowR", "handL", "handR", "armLb@0", "armRb@0"}
LOOK = {
    "datsik": "a curly-haired guy in a white t-shirt and dark trousers",
    "garkusha": "a guy in a black puffer jacket and black trousers with stacks of money in his fists",
    "bebyakyan": "a guy in a black-and-white jacket and white trousers with a burning bottle",
    "babafey": "a guy in an embroidered folk shirt and black trousers with a balalaika",
    "vodovoz": "a guy in a beige strapped jumpsuit with a yellow delivery bag and headphones",
    "knyaz": "a curly-haired guy in a fluffy cream jacket, a black t-shirt and grey sweatpants with a hardware wallet",
}
PROMPT = ("Edit this game boss character ({look}): keep exactly the same character, pose, outline, face, proportions, colours and cartoon style "
          "with dark outlines, exactly the same position and size in the picture. He is badly beaten in a fight: his clothes are torn and battle-damaged — "
          "ripped holes with frayed edges, dirt and cartoon blood stains; his skin shows it too — a black eye, a bleeding nose, a cut on the eyebrow with a "
          "trickle of blood, bruises, scrapes and small bleeding cuts on the arms, hands and legs. Whatever he holds stays the same. Comic-book style blood, "
          "readable but not gory. Keep the white background plain.")


def edit(boss, comp):
    raw = os.path.join(HERE, "raw", f"{boss}-beaten-edit.png")
    H, W = comp.shape[:2]
    # padded to 2:3 for the 1024×1536 edit
    PW, PH = max(W, round(H * 2 / 3)), max(H, round(W * 1.5))
    ox, oy = (PW - W) // 2, (PH - H) // 2
    if not os.path.exists(raw):
        pad = Image.new("RGB", (PW, PH), (255, 255, 255))
        pad.paste(Image.fromarray(comp.astype(np.uint8)), (ox, oy))
        tmp = f"/tmp/{boss}-beaten-in.png"
        pad.resize((1024, 1536), Image.LANCZOS).save(tmp)
        key = open("/tmp/t/openai.env").read().split("=", 1)[1].strip()
        r = requests.post("https://api.openai.com/v1/images/edits", headers={"Authorization": "Bearer " + key},
                          files={"image": open(tmp, "rb")}, data={"model": "gpt-image-2", "prompt": PROMPT.format(look=LOOK[boss]), "size": "1024x1536", "quality": "high"}, timeout=900)
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        open(raw, "wb").write(base64.b64decode(r.json()["data"][0]["b64_json"]))
    e = Image.open(raw).convert("RGB").resize((PW, PH), Image.LANCZOS).crop((ox, oy, ox + W, oy + H))
    return np.array(e).astype(np.float32)


def carry(frame0, frame0_hurt, frame):
    """the damage of frame 0 carried onto another frame of the same strip, along the flow between them"""
    g0 = cv2.cvtColor(frame0[..., :3], cv2.COLOR_RGB2GRAY)
    gk = cv2.cvtColor(frame[..., :3], cv2.COLOR_RGB2GRAY)
    flow = cv2.calcOpticalFlowFarneback(gk, g0, None, 0.5, 4, 21, 5, 7, 1.5, 0)
    H, W = g0.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    delta = frame0_hurt[..., :3].astype(np.float32) - frame0[..., :3].astype(np.float32)
    d = cv2.remap(delta, xx + flow[..., 0], yy + flow[..., 1], cv2.INTER_LINEAR)
    out = frame.copy()
    inside = ndimage.binary_erosion(frame[..., 3] > 128, iterations=4)[..., None]
    out[..., :3] = np.clip(frame[..., :3] + d * inside, 0, 255).astype(np.uint8)
    return out


def main(boss):
    S = os.path.join(HERE, "source", boss)
    O = os.path.join(HERE, "source", boss + "-beaten")
    os.makedirs(O, exist_ok=True)
    order = ORDER[boss]
    L = {p: np.array(Image.open(os.path.join(S, p + ".png")).convert("RGBA")) for p in order}
    H, W = next(iter(L.values())).shape[:2]
    comp = np.full((H, W, 3), 255.0, np.float32)
    for p in order:
        a = L[p][..., 3:4] / 255.0
        comp = comp * (1 - a) + L[p][..., :3] * a
    e = edit(boss, comp)
    warped = ti.warp_onto(ti.figure(comp), ti.figure(e), e)
    top = np.full((H, W), -1)
    for i, p in enumerate(order):
        top[L[p][..., 3] > 128] = i
    white = ndimage.binary_dilation(warped.min(2) > 225, iterations=2)
    hurt = {}
    for i, p in enumerate(order):
        if p not in SKIN_AND_CLOTHES:
            continue
        im = L[p].copy()
        m = (top == i) & ndimage.binary_erosion(L[p][..., 3] > 128, iterations=7) & ~white
        w = ndimage.gaussian_filter(m.astype(np.float32), 2)[..., None]
        im[..., :3] = np.clip(im[..., :3] * (1 - w) + warped * w, 0, 255).astype(np.uint8)
        hurt[p] = im
    # the head with the mouth open looks like the head: the same damage where the head is on top
    if os.path.exists(os.path.join(S, "head-open.png")) and "head" in order:
        ho = np.array(Image.open(os.path.join(S, "head-open.png")).convert("RGBA"))
        m = (top == order.index("head")) & ndimage.binary_erosion(ho[..., 3] > 128, iterations=7) & ~white
        w = ndimage.gaussian_filter(m.astype(np.float32), 2)[..., None]
        ho[..., :3] = np.clip(ho[..., :3] * (1 - w) + warped * w, 0, 255).astype(np.uint8)
        hurt["head-open"] = ho
    for f in glob.glob(os.path.join(S, "*.png")):
        n = os.path.splitext(os.path.basename(f))[0]
        if n in hurt:
            Image.fromarray(hurt[n]).save(os.path.join(O, n + ".png"))
        elif "@" in n and n.split("@")[0] + "@0" in hurt:
            f0 = n.split("@")[0] + "@0"
            Image.fromarray(carry(L[f0], hurt[f0], np.array(Image.open(f).convert("RGBA")))).save(os.path.join(O, n + ".png"))
        else:
            shutil.copy(f, os.path.join(O, n + ".png"))
    print(boss, "beaten:", sorted(hurt))


if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(main, sys.argv[1:]))
