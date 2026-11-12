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
OPEN = [(-16, 26), (-10, 28), (-4, 26), (2, 22)]
SQUEEZE = [(8, -20), (6, -22), (4, -20), (2, -16)]
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
SWAY_END, DIP, FLICK, LET_GO = 3.8, 4.06, 4.16, 4.14
FLIGHT, HEIGHT = 0.7, 115.0  # s in the air; how high the crowbar goes (rig units)
CATCH = LET_GO + FLIGHT
V0, G = 4 * HEIGHT / FLIGHT, 8 * HEIGHT / FLIGHT ** 2


def smooth(a, b, t0, t1, t):
    u = min(1, max(0, (t - t0) / (t1 - t0)))
    return a + (b - a) * u * u * (3 - 2 * u)


def hand_target(t):
    """where the wrist is led (angle °, drop in rig units) — the springs below follow it"""
    if t < SWAY_END:
        env = smooth(0, 1, 0, 0.6, t) * smooth(1, 0, SWAY_END - 0.7, SWAY_END, t)
        return 6.0 * math.sin(2 * math.pi * t / 1.9) * env, 1.5 * math.sin(2 * math.pi * t / 0.95) * env
    if t < DIP:
        return smooth(0, -5, SWAY_END, DIP, t), smooth(0, 9, SWAY_END, DIP, t)
    if t < FLICK:
        return smooth(-5, 7, DIP, FLICK, t), smooth(9, -10, DIP, FLICK, t)
    if t < CATCH - 0.12:
        return smooth(7, 2, FLICK, FLICK + 0.25, t), smooth(-10, -2, FLICK, FLICK + 0.25, t)
    return smooth(2, 0, CATCH - 0.12, CATCH + 0.6, t), smooth(-2, 0, CATCH - 0.12, CATCH + 0.6, t)


keys = []
ang, angv, drop, dropv = 0.0, 0.0, 0.0, 0.0  # the wrist (spring-led)
phi, phiv = 0.0, 0.0  # the crowbar's own turn at the grip, against the hand (its weight)
prev_angv = 0.0
t = 0.0
n = round(T / DT)
for i in range(n + 1):
    t = i * DT
    ta, td = hand_target(t)
    # the wrist: a stiff spring (quick, a little bounce)
    acc = 520 * (ta - ang) - 34 * angv
    angv += acc * DT; ang += angv * DT
    dacc = 520 * (td - drop) - 30 * dropv
    if abs(t - CATCH) < DT / 2:
        dropv += 150  # the catch knocks the hand down
        angv += -60
    dropv += dacc * DT; drop += dropv * DT
    flying = LET_GO <= t < CATCH
    if flying:
        u = (t - LET_GO) / FLIGHT
        fly_y = -V0 * (t - LET_GO) + G * (t - LET_GO) ** 2 / 2
        turn = -360 * u  # one full turn, against the clock
        # turned about its middle, not the grip: t = (m - g) - R(m - g)
        mx, my = (MID[0] - GRIP[0]) * SCALE, (MID[1] - GRIP[1]) * SCALE
        r = math.radians(turn)
        tx = mx - (mx * math.cos(r) - my * math.sin(r))
        phi_out, ty = turn, fly_y + (my - (mx * math.sin(r) + my * math.cos(r)))
        phi, phiv = 0.0, 0.0
    else:
        # the crowbar hangs in the fist on a soft spring: the wrist's turns swing it the other way, it lags and settles
        ha = (angv - prev_angv) / DT
        pacc = -150 * phi - 6 * phiv - 0.8 * ha
        if abs(t - CATCH) < DT / 2:
            phiv += -95  # the weight landing in the fist
        phiv += pacc * DT; phi += phiv * DT
        phi_out, ty, tx = phi, 0.0, 0.0
    prev_angv = angv
    if t < LET_GO:
        frame = "squeeze" if SWAY_END + 0.05 <= t < LET_GO else "fist"
    elif t < CATCH - 0.03:
        frame = "open"
    elif t < CATCH + 0.32:
        frame = "squeeze"
    else:
        frame = "fist"
    keys.append((t / T * 100, ang, drop, phi_out, ty, frame, tx))

# the loop must close: at the end everything is back at rest
assert abs(keys[-1][1]) < 0.5 and abs(keys[-1][2]) < 0.5 and abs(keys[-1][3]) < 1.0, keys[-1]
keys[-1] = (100.0, 0.0, 0.0, 0.0, 0.0, "fist", 0.0)

step = 2  # every other simulated frame (30 keys a second), linear between
hand_kf = " ".join(f"{p:.2f}% {{ transform: translate(0px, {d:.2f}px) rotate({a:.2f}deg); }}" for p, a, d, *_ in keys[::step] + [keys[-1]])
bar_kf = " ".join(f"{p:.2f}% {{ transform: translate({x:.2f}px, {y:.2f}px) rotate({f:.2f}deg); }}" for p, a, d, f, y, _, x in keys[::step] + [keys[-1]])


def frame_kf(name):
    out, cur = [], None
    for p, *_, fr, _x in keys:
        on = fr == name
        if on != cur:
            out.append(f"{p:.2f}% {{ opacity: {1 if on else 0}; }}")
            cur = on
    return " ".join(out)


css = f"""/* gloves-botsman:begin — generated by tools/rig/build-gloves.py, do not edit by hand.
   «Перчатки Боцмана»: the wrist rocks the crowbar, dips, flicks it up (a full turn in the air) and catches it; the crowbar
   lags on a spring at the grip (its weight); the glove's frames (fist / open / squeeze) switch as the fingers let go and clench */
.rig-gloves {{ transform-origin: {WRIST[0] * SCALE}px {WRIST[1] * SCALE}px; transform-box: view-box; animation: rig-gloves {T}s linear infinite; }}
.rig-crowbar {{ transform-origin: {GRIP[0] * SCALE}px {GRIP[1] * SCALE}px; transform-box: view-box; animation: rig-crowbar {T}s linear infinite; }}
.rig-gf {{ animation-duration: {T}s; animation-timing-function: steps(1, end); animation-iteration-count: infinite; }}
.rig-gf-fist {{ animation-name: rig-gf-fist; }} .rig-gf-open {{ animation-name: rig-gf-open; opacity: 0; }} .rig-gf-squeeze {{ animation-name: rig-gf-squeeze; opacity: 0; }}
@keyframes rig-gloves {{ {hand_kf} }}
@keyframes rig-crowbar {{ {bar_kf} }}
@keyframes rig-gf-fist {{ {frame_kf("fist")} }}
@keyframes rig-gf-open {{ {frame_kf("open")} }}
@keyframes rig-gf-squeeze {{ {frame_kf("squeeze")} }}
.rig.still .rig-gloves, .rig.still .rig-crowbar, .rig.still .rig-gf {{ animation: none; }} .rig.still .rig-gf:not(.rig-gf-fist) {{ opacity: 0; }}
@media (prefers-reduced-motion: reduce) {{ .rig-gloves, .rig-crowbar, .rig-gf {{ animation: none; }} .rig-gf:not(.rig-gf-fist) {{ opacity: 0; }} }}
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
