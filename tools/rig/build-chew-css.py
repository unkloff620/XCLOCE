"""
Writes the chewing keyframes (rig.tsx Mouth) into src/app/screens.css between the CHEW markers.
8 s, two halves: the jaw opens and at once the thing in the mouth is turned through the front of the teeth into the
other corner; the jaw closes; then a few bites — the jaw drops a little and clenches, the thing dips and lifts with it.
The jaw is a sprite (JAW.frames frames, step-end); the thing turns around its end in the mouth; the smoke follows the tip.
"""
import math, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
CSS = os.path.join(ROOT, "src", "app", "screens.css")
T, FRAMES, LEN = 8, 8, 50
R = (525, 261, 24, 1)       # the right corner: x, y of the end in the mouth, angle, length factor
M = (499, 255, 92, 0.64)    # in front of the teeth, pointing at us
L = (478, 261, 156, 1)      # the left corner
def tilt(s, da, dy):        # turn the tip up (da < 0 on the right) / down; the left side mirrored
    x, y, a, k = s
    return (x, y + dy, a + (da if s[2] < 90 else -da), k)

jaw, chew = [(0, 0)], []
def half(b, src, dst):
    for i in range(1, FRAMES): jaw.append((b + 0.5 * i, i))                  # opens: b+0.5 … b+3.5
    for i, f in enumerate(range(FRAMES - 2, -1, -1)): jaw.append((b + 7 + 0.5 * i, f))  # closes: b+7 … b+10
    chew.extend([(b, src, "ease-in"), (b + 0.5, src, "ease-in"), (b + 3.6, M, "ease-out"), (b + 6.8, dst, "ease-in-out")])
    for s in (b + 15, b + 25, b + 35):                                       # three bites
        jaw.extend([(s, 1), (s + 0.6, 2), (s + 1.2, 3), (s + 2.4, 2), (s + 3.0, 1), (s + 3.6, 0)])
        chew.extend([(s, dst, "ease-in-out"), (s + 1.6, tilt(dst, 5, 1.2), "ease-in-out"), (s + 3.4, tilt(dst, -9, -0.6), "ease-in-out"), (s + 5.4, dst, "ease-in-out")])
half(0, R, L)
half(50, L, R)
chew.append((100, R, "ease-in-out"))

def pct(p): return f"{round(p, 2):g}%"
def tf(s): x, y, a, k = s; return f"translate({x}px, {round(y, 2):g}px) rotate({round(a, 1):g}deg) scaleX({k})"
def tip(s): x, y, a, k = s; return f"translate({round(x + LEN * k * math.cos(math.radians(a)), 1):g}px, {round(y + LEN * k * math.sin(math.radians(a)), 1):g}px)"
frames = {}
for p, f in jaw: frames.setdefault(f, []).append(p)
frames.setdefault(0, []).append(100)
out = ["/* CHEW — written by tools/rig/build-chew-css.py, do not edit by hand */",
       f".rig-jaw-f {{ animation: rig-jaw {T}s step-end infinite; }}", "@keyframes rig-jaw {"]
for f, ps in sorted(frames.items()):
    out.append(f"  {', '.join(pct(p) for p in sorted(set(ps)))} {{ transform: translateY(calc(var(--fh) * -{f})); }}")
out.append("}")
for name, fn in (("rig-chew", tf), ("rig-smoke-at", tip)):
    out.append(f".{name} {{ transform-box: view-box; transform-origin: 0 0; transform: {fn(R)}; animation: {name} {T}s linear infinite; }}")
    out.append(f"@keyframes {name} {{")
    seen = set()
    for p, s, ease in chew:
        if p in seen: continue
        seen.add(p)
        out.append(f"  {pct(p)} {{ transform: {fn(s)}; animation-timing-function: {ease}; }}")
    out.append("}")
out.append(".rig.still .rig-jaw-f, .rig.still .rig-chew, .rig.still .rig-smoke-at { animation: none; }")
out.append("@media (prefers-reduced-motion: reduce) { .rig-jaw-f, .rig-chew, .rig-smoke-at { animation: none; } }")
out.append("/* /CHEW */")
css = open(CSS).read()
block = "\n".join(out)
if "/* CHEW —" in css:
    css = re.sub(r"/\* CHEW —.*?/\* /CHEW \*/", lambda _: block, css, flags=re.S)
else:  # first run: replace the hand-written block
    i = css.index("/* the jaw with a thing in the mouth (rig.tsx Mouth)")
    end = "@media (prefers-reduced-motion: reduce) { .rig-jaw-f, .rig-chew, .rig-smoke-at { animation: none; } }"
    j = css.index(end, i) + len(end)
    css = css[:i] + block + css[j:]
open(CSS, "w").write(css)
print(block)
