"""
Псих's fight room — his flat (the artist's layers, tools/boss/source/psih/room/, all 2000×3600, the user 2026-11-27):
room (the flat, ~97 % opaque — made solid; the red light of the police lights in the window and on the ceiling and the
floor is drawn in it), bag (the punching bag on its chains — and the cables on the ceiling), door (the safe's door, hinged
on its right), lamp (the hanging lamp), tv (the old TV, its screen in static), boombox (on the TV).
Live (src/client/art/arena-psih.tsx): the bag swings without a stop, the safe's door slowly swings to and fro, the TV's
screen is static noise, the boombox shakes to the music, the police lights in the window go red — blue — red.
→ public/assets/arena/psih/ in 1024×1843 + src/client/art/arena-psih-data.ts (the boxes and the points),
public/assets/arena/psih.webp (the still picture) and tools/scene/source/room-psycho.png (the home room).
"""
import json, os
import numpy as np, cv2
from PIL import Image
from scipy import ndimage

S = "tools/boss/source/psih/room"
O = "public/assets/arena/psih"
os.makedirs(O, exist_ok=True)
W, H = 2000, 3600
K = 1024 / W
L = {n: Image.open(f"{S}/{n}.png").convert("RGBA") for n in ["room", "bag", "door", "lamp", "tv", "boombox"]}
a = np.array(L["room"])
a[..., 3] = 255
L["room"] = Image.fromarray(a)
data = {}
P = lambda x, y: [round(x * K, 1), round(y * K, 1)]


def full(name, im, q=84):
    im.resize((1024, round(H * K)), Image.LANCZOS).save(f"{O}/{name}.webp", quality=q, method=6)


def part(name, im, q=88, b=None):
    b = b or im.getbbox()
    w, h = round((b[2] - b[0]) * K), round((b[3] - b[1]) * K)
    im.crop(b).resize((w, h), Image.LANCZOS).save(f"{O}/{name}.webp", quality=q, method=6)
    data[name] = {"x": round(b[0] * K, 1), "y": round(b[1] * K, 1), "w": w, "h": h}
    return b


full("room", L["room"], 86)
part("bag", L["bag"])
part("door", L["door"])
part("lamp", L["lamp"])
part("tv", L["tv"])
part("boombox", L["boombox"])
# the bag hangs from the ceiling: the chains turn round where they come down (the top band — the hooks and the ceiling's
# cables — stays put)
data["bagPivot"] = P(215, 160)
# the safe's door turns on its hinges (its right edge)
db = L["door"].getbbox()
data["hinge"] = P(db[2] - 12, (db[1] + db[3]) / 2)
# the boombox shakes on its bottom
bb = L["boombox"].getbbox()
data["boomFoot"] = P((bb[0] + bb[2]) / 2, bb[3])

# the TV's screen: the grey static's shape (its convex hull — a rounded screen), the noise in frames over it
t = np.array(L["tv"])
hsv = cv2.cvtColor(t[..., :3], cv2.COLOR_RGB2HSV)
grey = (hsv[..., 1] < 45) & (hsv[..., 2] > 60) & (t[..., 3] > 200)
lab, k = ndimage.label(ndimage.binary_closing(grey, iterations=3))
sz = ndimage.sum(grey, lab, range(1, k + 1))
scr = lab == int(np.argmax(sz)) + 1
cnt, _ = cv2.findContours(scr.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
hull = cv2.convexHull(max(cnt, key=cv2.contourArea))
screen = np.zeros(scr.shape, np.uint8)
cv2.fillPoly(screen, [hull], 1)
screen = cv2.erode(screen, np.ones((5, 5), np.uint8))
ys, xs = np.nonzero(screen)
sb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
sw, sh = sb[2] - sb[0], sb[3] - sb[1]
lum = t[sb[1]:sb[3], sb[0]:sb[2], :3].astype(np.float32).mean(2) / 255
lum = cv2.GaussianBlur(lum, (0, 0), 8)  # the screen's own light (brighter in the middle, darker at the rim)
alpha = cv2.GaussianBlur(screen[sb[1]:sb[3], sb[0]:sb[2]].astype(np.float32), (0, 0), 1.2)
rng = np.random.default_rng(7)
FR = 8
frames = []
for f in range(FR):
    n = rng.random((sh // 3 + 1, sw // 3 + 1)).astype(np.float32)
    n = cv2.resize(n, (sw, sh), interpolation=cv2.INTER_NEAREST)
    # a brighter band rolling down the screen and a faint line pattern, as on an old TV
    yy = np.arange(sh)[:, None] / sh
    band = 0.18 * np.exp(-(((yy - (f / FR)) % 1.0 - 0.5) ** 2) / 0.01)
    lines = 0.06 * (np.arange(sh)[:, None] % 6 < 2)
    v = np.clip((0.25 + 0.95 * n) * (0.45 + 0.9 * lum) + band - lines, 0, 1)
    rgbn = np.dstack([v * 235, v * 238, v * 245])
    frames.append(np.dstack([rgbn, alpha * 255]).astype(np.uint8))
strip = np.concatenate(frames, 1)
fw, fh = round(sw * K), round(sh * K)
Image.fromarray(strip).resize((fw * FR, fh), Image.LANCZOS).save(f"{O}/tv-noise.webp", quality=75, method=6)
data["noise"] = {"x": round(sb[0] * K, 1), "y": round(sb[1] * K, 1), "w": fw, "h": fh, "frames": FR}

# the police lights: the red light (in the window, on the ceiling, its reflections on the floor on the right) — a blue copy
# of it (the same brightness) and a dark copy (the light out between the flashes), each only where that light is
rgb = np.array(L["room"].convert("RGB"))
hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
Hh, Ss, Vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
yy, xx = np.mgrid[0:H, 0:W]
red = ((Hh < 9) | (Hh > 170)).astype(np.float32)
m = np.clip((Ss - 120) / 60, 0, 1) * np.clip((Vv - 95) / 60, 0, 1) * red
zone = np.maximum(((xx > 1280) & (yy < 1180)).astype(np.float32), ((xx > 1500) & (yy > 2250)).astype(np.float32) * np.clip((Vv - 150) / 50, 0, 1))
m = cv2.GaussianBlur(cv2.dilate(m * zone, np.ones((3, 3), np.uint8)), (0, 0), 2.5)
m = np.clip(m * 1.25, 0, 1)
lmax = rgb.max(2).astype(np.float32)
blue = np.dstack([lmax * 0.22, lmax * 0.42, lmax * 1.0]).clip(0, 255)
dark = rgb.astype(np.float32) * 0.35
ys, xs = np.nonzero(m > 0.02)
pb = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
part("police-blue", Image.fromarray(np.dstack([blue, m * 255]).astype(np.uint8)), b=pb)
part("police-dark", Image.fromarray(np.dstack([dark, m * 255]).astype(np.uint8)), b=pb)
# where the light comes in (the window), for the glow thrown into the room
data["window"] = P(1800, 600)

open("src/client/art/arena-psih-data.ts", "w").write("/* Generated by tools/boss/build-psih-room.py — do not edit by hand. */\nexport const PSIH_ROOM = " + json.dumps(data, indent=2) + " as const;\n")

still = Image.new("RGBA", (W, H), (0, 0, 0, 255))
for n in ["room", "bag", "door", "lamp", "tv", "boombox"]:
    still.alpha_composite(L[n])
still.convert("RGB").resize((1024, round(H * K)), Image.LANCZOS).save("public/assets/arena/psih.webp", quality=75, method=6)
# the home room: the scene canvas 1060×1484 — the picture ×0.62, 90 px off the left and 430 off the top (as Химик's lab:
# content/home-scene.ts PSYCHO_ON_SCENE; on the home screen the live room goes on above the canvas — ROOM_TALL)
HK, HX, HY = 0.62, 90, 430
still.convert("RGB").resize((round(W * HK), round(H * HK)), Image.LANCZOS).crop((HX, HY, HX + 1060, HY + 1484)).save("tools/scene/source/room-psycho.png")
print(json.dumps(data))
