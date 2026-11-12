"""
«Перчатки Боцмана» (gloves-botsman, slot «Кисть»): black gloves on both hands, the left one (handR, on the screen's right)
holds Боцман's crowbar and plays with it.
Sources: tools/rig/source/held/gloves-botsman/ — drawn on the 2000×2800 rig canvas:
  glove-right.png — the glove over the right hand (resting on the knee, a part of the forearm foreL): it stays as it is
  glove-left.png  — the left hand in its glove, in place of handR; its fingers lie over the crowbar
  crowbar.png     — the crowbar under the left glove's fingers
Output:
  public/assets/hero/held/gloves-botsman-{right,fist,open,squeeze,crowbar}.webp  — half size (no skin shows: one tone)
  public/assets/items/gloves-botsman.webp                                        — the item icon
  src/client/art/gloves-data.ts                                                  — boxes and pivots
  src/app/screens.css, between «gloves-botsman:begin/end» — the keyframes
The left hand's frames: «open» (the fingers let go: they straighten) and «squeeze» (they clench: the tips pulled in to the
knuckles) are puppet warps (rigid MLS, as build-hand.py) of the glove.
The motion is simulated with springs and baked into keyframes: the wrist rocks the crowbar slowly (its weight lags behind on
a spring at the grip), then the hand dips, flicks up and lets go — the crowbar flies up turning a full 360° and drops back
into the fist, which clenches; the catch knocks the hand down and the crowbar wobbles on the spring till it settles.
"""
import os, sys, json, math
import numpy as np
from PIL import Image
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from mls import mls_rigid_inverse  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.join(HERE, "source", "held", "gloves-botsman")
OUT = os.path.join(ROOT, "public", "assets", "hero", "held")
ID = "gloves-botsman"
SCALE = 0.5
PAD = 6

# rig-canvas px: where the fist grips the crowbar (it turns about this), the wrist (handR's pivot, rig-data.ts ×2)
GRIP = (1400, 1706)
MID = (1312, 1722)  # the crowbar's middle: in the air it turns about it
WRIST = (1463.4, 1520.0)
# the left glove's back of the hand holds still; the fingers (knuckle, tip), from the little finger's side
FIXED = [(1380, 1500), (1450, 1520), (1500, 1560), (1330, 1600), (1480, 1610), (1420, 1580)]
FINGERS = [((1335, 1640), (1315, 1825)), ((1370, 1640), (1365, 1810)), ((1410, 1640), (1415, 1790)), ((1465, 1645), (1465, 1765))]


def rgba(p):
    return np.array(Image.open(p).convert("RGBA"))


def premul(a):
    f = a.astype(np.float32)
    al = f[:, :, 3:] / 255
    return np.concatenate([f[:, :, :3] * al, f[:, :, 3:]], 2)


def unpremul(p):
    A = np.clip(p[:, :, 3:], 0, 255)
    rgb = np.where(A > 0.5, p[:, :, :3] / np.maximum(A / 255, 1e-3), 0)
    return np.clip(np.concatenate([rgb, A], 2) + 0.5, 0, 255).astype(np.uint8)


def clean(im):
    a = im[:, :, 3].copy()
    a[a < 30] = 0
    im = im.copy()
    im[:, :, 3] = a
    im[a == 0, :3] = 0
    return im


def box(im, extra=0):
    ys, xs = np.nonzero(im[:, :, 3])
    x0, y0, x1, y1 = xs.min() - PAD - extra, ys.min() - PAD - extra, xs.max() + PAD + extra, ys.max() + PAD + extra
    x0, y0 = x0 - x0 % 2, y0 - y0 % 2
    x1, y1 = x1 + (x1 - x0) % 2, y1 + (y1 - y0) % 2
    return int(x0), int(y0), int(x1), int(y1)


def save(img, x0, y0, x1, y1, name):
    w, h = (x1 - x0) // 2, (y1 - y0) // 2
    small = unpremul(cv2.resize(premul(img[y0:y1, x0:x1]), (w, h), interpolation=cv2.INTER_AREA))
    Image.fromarray(small).save(os.path.join(OUT, f"{ID}-{name}.webp"), "WEBP", quality=90, method=6)
    return {"x": x0 * SCALE, "y": y0 * SCALE, "w": w, "h": h}


def warp(im, x0, y0, x1, y1, moves):
    """the glove (its box) with the fingertips moved: moves = [(dx, dy) per finger] for the tips, half of it for the middles"""
    crop = im[y0:y1, x0:x1]
    hh, ww = crop.shape[:2]
    loc = lambda p: (p[0] - x0, p[1] - y0)
    src, dst = [], []
    for p in FIXED:
        src.append(loc(p)); dst.append(loc(p))
    for (k, t), (dx, dy) in zip(FINGERS, moves):
        k, t = np.array(loc(k), float), np.array(loc(t), float)
        mid = (k + t) / 2
        src += [tuple(k), tuple(mid), tuple(t)]
        dst += [tuple(k), (mid[0] + dx * 0.45, mid[1] + dy * 0.45), (t[0] + dx, t[1] + dy)]
    fx, fy = mls_rigid_inverse(src, dst, ww, hh)
    out = cv2.remap(premul(crop), fx, fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    full = np.zeros_like(im)
    full[y0:y1, x0:x1] = unpremul(out)
    return full


os.makedirs(OUT, exist_ok=True)
right = clean(rgba(os.path.join(SRC, "glove-right.png")))
left = clean(rgba(os.path.join(SRC, "glove-left.png")))
bar = clean(rgba(os.path.join(SRC, "crowbar.png")))

data = {"right": save(right, *box(right), "right")}
# the hand's frames share one box, roomy enough for the straightened fingers
lb = box(left, 40)
data["hand"] = save(left, *lb, "fist")
# open: the fingers straighten away from the bar (down and out); squeeze: the tips pulled in towards the knuckles
OPEN = [(-34, 40), (-24, 44), (-14, 42), (-4, 36)]
SQUEEZE = [(12, -26), (10, -28), (8, -26), (6, -22)]
save(warp(left, *lb, OPEN), *lb, "open")
save(warp(left, *lb, SQUEEZE), *lb, "squeeze")
data["crowbar"] = save(bar, *box(bar), "crowbar")
data["grip"] = [GRIP[0] * SCALE, GRIP[1] * SCALE]
data["wrist"] = [WRIST[0] * SCALE, WRIST[1] * SCALE]

# the icon: both gloves and the crowbar, square on transparent
icon = np.zeros_like(right)
for layer in (right, bar, left):
    a = layer[:, :, 3:].astype(np.float32) / 255
    icon[:, :, :3] = (icon[:, :, :3] * (1 - a) + layer[:, :, :3] * a).astype(np.uint8)
    icon[:, :, 3] = np.maximum(icon[:, :, 3], layer[:, :, 3])
x0, y0, x1, y1 = box(icon, 10)
s = max(x1 - x0, y1 - y0)
cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
sq = np.zeros((s, s, 4), np.uint8)
sx0, sy0 = cx - s // 2, cy - s // 2
sq[max(0, -sy0):, max(0, -sx0):] = icon[max(0, sy0):sy0 + s, max(0, sx0):sx0 + s][: s - max(0, -sy0), : s - max(0, -sx0)]
Image.fromarray(unpremul(cv2.resize(premul(sq), (256, 256), interpolation=cv2.INTER_AREA))).save(
    os.path.join(ROOT, "public", "assets", "items", f"{ID}.webp"), "WEBP", quality=90, method=6)

# ---------------- the motion: springs, baked into keyframes ----------------
T, DT = 6.4, 1 / 60
SWAY_END, WIND, FLICK = 3.6, 3.95, 4.12  # the rocking ends; the wind-up (the wrist cocked back); the flick (the wrist turned in)
LET_GO, FLIGHT, HEIGHT = 4.07, 0.78, 120.0  # the fingers let go; s in the air; how high over the line from the throw to the catch
CATCH = LET_GO + FLIGHT
FLICK_TO = 68.0  # ° — the wrist turns in towards the body (the fingertips up to the belt), as the artist marked


def smooth(a, b, t0, t1, t):
    u = min(1, max(0, (t - t0) / (t1 - t0)))
    return a + (b - a) * u * u * (3 - 2 * u)


def hand_target(t):
    """where the wrist is led (angle °, + = the fingers turn in to the body; drop in rig units) — a spring follows it"""
    if t < SWAY_END:
        env = smooth(0, 1, 0, 0.6, t) * smooth(1, 0, SWAY_END - 0.7, SWAY_END, t)
        return 6.0 * math.sin(2 * math.pi * t / 1.9) * env, 1.5 * math.sin(2 * math.pi * t / 0.95) * env
    if t < WIND:
        return smooth(0, -9, SWAY_END, WIND, t), smooth(0, 7, SWAY_END, WIND, t)
    if t < FLICK:
        return smooth(-9, FLICK_TO, WIND, FLICK, t), smooth(7, -6, WIND, FLICK, t)
    if t < CATCH - 0.15:
        return smooth(FLICK_TO, 4, FLICK + 0.05, FLICK + 0.45, t), smooth(-6, -3, FLICK, FLICK + 0.4, t)
    return smooth(4, 0, CATCH - 0.15, CATCH + 0.6, t), smooth(-3, 0, CATCH - 0.15, CATCH + 0.6, t)


def rot(deg, cx, cy):
    r = math.radians(deg)
    c, s_ = math.cos(r), math.sin(r)
    return np.array([[c, -s_, cx - c * cx + s_ * cy], [s_, c, cy - s_ * cx - c * cy], [0, 0, 1]])


def move(dx, dy):
    return np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1.0]])


W_ = (WRIST[0] * SCALE, WRIST[1] * SCALE)
G_ = (GRIP[0] * SCALE, GRIP[1] * SCALE)
M_ = (MID[0] * SCALE, MID[1] * SCALE)

# pass 1: the wrist (a stiff spring after its target; the catch knocks it down)
n = round(T / DT)
hand = []
ang, angv, drop, dropv = 0.0, 0.0, 0.0, 0.0
for i in range(n + 1):
    t = i * DT
    ta, td = hand_target(t)
    if abs(t - CATCH) < DT / 2:
        dropv += 150
        angv += -70
    angv += (900 * (ta - ang) - 50 * angv) * DT; ang += angv * DT
    dropv += (600 * (td - drop) - 32 * dropv) * DT; drop += dropv * DT
    hand.append((ang, drop, angv))
H = [move(0, d) @ rot(a, *W_) for a, d, _ in hand]

# pass 2: the crowbar. Held: it turns at the grip on a soft spring (the wrist's turns swing it the other way). In the air:
# its middle flies from where it was let go to where the fist will be at the catch (a parabola), turning a full turn
# against the clock about its middle; drawn in the hand's frame (the hand's own picture group), so: hand⁻¹ · world.
i_go, i_catch = round(LET_GO / DT), round(CATCH / DT)
phi, phiv = 0.0, 0.0
local = []
for i in range(n + 1):
    t = i * DT
    if i < i_go or i >= i_catch:
        ha = (hand[i][2] - hand[i - 1][2]) / DT if i else 0.0
        if i == i_catch:
            phi, phiv = 0.0, -110.0  # the weight landing in the fist
        phiv += (-150 * phi - 6 * phiv - 0.8 * ha) * DT; phi += phiv * DT
        L = rot(phi, *G_)
        if i == i_go - 1:
            go_world = H[i] @ L
            go_phi = hand[i][0] + phi
    else:
        u = (i - i_go) / (i_catch - i_go)
        m0 = go_world @ np.array([M_[0], M_[1], 1.0])
        m1 = H[i_catch] @ np.array([M_[0], M_[1], 1.0])
        m = m0 + (m1 - m0) * u
        m[1] -= 4 * HEIGHT * u * (1 - u)
        th0, th1 = go_phi, hand[i_catch][0]
        th = th0 + (th1 - th0 - 360) * u
        world = move(m[0], m[1]) @ rot(th, 0, 0) @ move(-M_[0], -M_[1])
        L = np.linalg.inv(H[i]) @ world
    local.append(L)

keys = []
for i in range(n + 1):
    t = i * DT
    frame = "open" if LET_GO - 0.02 <= t < CATCH - 0.02 else "squeeze"
    keys.append((t / T * 100, hand[i][0], hand[i][1], local[i], frame))
last = keys[-1]
assert abs(last[1]) < 0.5 and abs(last[2]) < 0.5 and np.abs(last[3] - np.eye(3)).max() < 1.0, last
keys[-1] = (100.0, 0.0, 0.0, np.eye(3), "squeeze")

step = 2  # every other simulated frame (30 keys a second), linear between
sel = keys[::step] + ([keys[-1]] if (len(keys) - 1) % step else [])
hand_kf = " ".join(f"{p:.2f}% {{ transform: translate(0px, {d:.2f}px) rotate({a:.2f}deg); }}" for p, a, d, *_ in sel)
mat = lambda L: f"matrix({L[0,0]:.4f}, {L[1,0]:.4f}, {L[0,1]:.4f}, {L[1,1]:.4f}, {L[0,2]:.2f}, {L[1,2]:.2f})"
bar_kf = " ".join(f"{p:.2f}% {{ transform: {mat(L)}; }}" for p, a, d, L, _ in sel)


def frame_kf(name):
    out, cur = [], None
    for p, *_, fr in keys:
        on = fr == name
        if on != cur:
            out.append(f"{p:.2f}% {{ opacity: {1 if on else 0}; }}")
            cur = on
    return " ".join(out)


css = f"""/* gloves-botsman:begin — generated by tools/rig/build-gloves.py, do not edit by hand.
   «Перчатки Боцмана»: the wrist rocks the crowbar, dips, flicks it up (a full turn in the air) and catches it; the crowbar
   lags on a spring at the grip (its weight); the glove's frames (fist / open / squeeze) switch as the fingers let go and clench */
.rig-gloves {{ transform-origin: {WRIST[0] * SCALE}px {WRIST[1] * SCALE}px; transform-box: view-box; animation: rig-gloves {T}s linear infinite; }}
.rig-crowbar {{ transform-origin: 0px 0px; transform-box: view-box; animation: rig-crowbar {T}s linear infinite; }}
.rig-gf {{ animation-duration: {T}s; animation-timing-function: steps(1, end); animation-iteration-count: infinite; }}
.rig-gf-fist {{ opacity: 0; }} .rig-gf-squeeze {{ animation-name: rig-gf-squeeze; }} .rig-gf-open {{ animation-name: rig-gf-open; opacity: 0; }}
@keyframes rig-gloves {{ {hand_kf} }}
@keyframes rig-crowbar {{ {bar_kf} }}
@keyframes rig-gf-open {{ {frame_kf("open")} }}
@keyframes rig-gf-squeeze {{ {frame_kf("squeeze")} }}
.rig.still .rig-gloves, .rig.still .rig-crowbar, .rig.still .rig-gf {{ animation: none; }} .rig.still .rig-gf:not(.rig-gf-fist) {{ opacity: 0; }} .rig.still .rig-gf-fist {{ opacity: 1; }}
@media (prefers-reduced-motion: reduce) {{ .rig-gloves, .rig-crowbar, .rig-gf {{ animation: none; }} .rig-gf:not(.rig-gf-fist) {{ opacity: 0; }} .rig-gf-fist {{ opacity: 1; }} }}
/* gloves-botsman:end */"""
cp = os.path.join(ROOT, "src", "app", "screens.css")
s = open(cp).read()
a, b = s.find("/* gloves-botsman:begin"), s.find("/* gloves-botsman:end */")
s = s[:a] + css + s[b + len("/* gloves-botsman:end */"):] if a >= 0 else s.rstrip("\n") + "\n\n" + css + "\n"
open(cp, "w").write(s)

ts = "/* Generated by tools/rig/build-gloves.py — do not edit by hand. Rig coordinates (1000×1400). */\n"
ts += "/** «Перчатки Боцмана»: the right glove (over foreL), the left hand's frames, the crowbar; the grip and the wrist */\n"
ts += f'export const GLOVES_ID = "{ID}";\n'
ts += "export const GLOVES = " + json.dumps(data, indent=2) + " as const;\n"
open(os.path.join(ROOT, "src", "client", "art", "gloves-data.ts"), "w").write(ts)
print(json.dumps(data))
