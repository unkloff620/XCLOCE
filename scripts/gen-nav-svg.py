"""Generates the vector bottom-menu buttons (public/assets/nav/<id>.svg).

Each button: octagonal neon frame, dark panel with halftone corners, burst rays, sparkles and a glowing comic icon.
Run: python3 scripts/gen-nav-svg.py
"""
import math
import os

W, H = 432, 312
CX, CY = 216, 168
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "nav")


def octagon(x0, y0, x1, y1, c):
    pts = [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)


OUTER = octagon(14, 34, 418, 300, 34)
INNER = octagon(30, 50, 402, 284, 26)


def rays(color, n=12, seed=0):
    out = []
    for i in range(n):
        a = (i / n) * math.tau + 0.2 + seed * 0.05
        length = 215 if i % 2 == 0 else 150
        w = 0.06 if i % 2 == 0 else 0.04
        p1 = (CX + math.cos(a - w) * length, CY + math.sin(a - w) * length)
        p2 = (CX + math.cos(a + w) * length, CY + math.sin(a + w) * length)
        out.append(f'<polygon points="{CX},{CY} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" fill="{color}" opacity="{0.95 if i % 2 == 0 else 0.7}"/>')
    return "".join(out)


def sparkles(color, seed):
    # deterministic pseudo-random dots
    out, s = [], seed * 9301 + 49297
    for _ in range(34):
        s = (s * 9301 + 49297) % 233280
        x = 40 + (s / 233280) * 352
        s = (s * 9301 + 49297) % 233280
        y = 58 + (s / 233280) * 218
        if abs(x - CX) < 95 and abs(y - CY) < 80:
            continue
        s = (s * 9301 + 49297) % 233280
        r = 1.4 + (s / 233280) * 3.2
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{color}" opacity=".85"/>')
    return "".join(out)


def streaks(color):
    out = []
    for i, (x, y, l) in enumerate([(60, 250, 70), (88, 270, 50), (330, 92, 60), (350, 120, 46), (300, 70, 40), (66, 96, 44)]):
        out.append(f'<line x1="{x}" y1="{y}" x2="{x + l * 0.7:.0f}" y2="{y - l * 0.7:.0f}" stroke="{color}" stroke-width="{3 if i % 2 else 5}" stroke-linecap="round" opacity=".35"/>')
    return "".join(out)


def frame(t, icon):
    """t: theme dict with main, light, panel, deep."""
    k = t["id"]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<style>
  .halo * {{ fill: {t["main"]} !important; stroke: {t["main"]} !important; stroke-width: 34px !important; opacity: 1 !important; }}
  .rim * {{ fill: {t["light"]} !important; stroke: {t["light"]} !important; stroke-width: 16px !important; opacity: 1 !important; stroke-linejoin: round !important; }}
</style>
<defs>
  <radialGradient id="{k}-bg" cx="50%" cy="50%" r="62%">
    <stop offset="0" stop-color="{t["panel"]}"/>
    <stop offset=".6" stop-color="{t["deep"]}"/>
    <stop offset="1" stop-color="#050505"/>
  </radialGradient>
  <radialGradient id="{k}-core" cx="50%" cy="52%" r="40%">
    <stop offset="0" stop-color="{t["light"]}" stop-opacity=".55"/>
    <stop offset="1" stop-color="{t["light"]}" stop-opacity="0"/>
  </radialGradient>
  <pattern id="{k}-dots" width="9" height="9" patternUnits="userSpaceOnUse">
    <circle cx="4.5" cy="4.5" r="2.1" fill="{t["main"]}"/>
  </pattern>
  <radialGradient id="{k}-dm" cx="50%" cy="50%" r="70%">
    <stop offset=".45" stop-color="#000"/>
    <stop offset="1" stop-color="#fff"/>
  </radialGradient>
  <mask id="{k}-mask"><rect width="{W}" height="{H}" fill="url(#{k}-dm)"/></mask>
  <clipPath id="{k}-clip"><polygon points="{INNER}"/></clipPath>
  <filter id="{k}-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="{k}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="11"/></filter>
  <linearGradient id="{k}-rim" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{t["light"]}"/>
    <stop offset=".5" stop-color="{t["main"]}"/>
    <stop offset="1" stop-color="{t["light"]}"/>
  </linearGradient>
</defs>
<polygon points="{OUTER}" fill="#000" stroke="#000" stroke-width="16" stroke-linejoin="round"/>
<polygon points="{INNER}" fill="url(#{k}-bg)"/>
<g clip-path="url(#{k}-clip)">
  <rect width="{W}" height="{H}" fill="url(#{k}-dots)" mask="url(#{k}-mask)" opacity=".75"/>
  {streaks(t["main"])}
  <g filter="url(#{k}-blur)" opacity=".7">{rays(t["main"], seed=len(k))}</g>
  {rays(t["light"], seed=len(k))}
  <ellipse cx="{CX}" cy="{CY}" rx="150" ry="110" fill="url(#{k}-core)"/>
  {sparkles(t["light"], len(k) + 3)}
</g>
<polygon points="{OUTER}" fill="none" stroke="url(#{k}-rim)" stroke-width="9" stroke-linejoin="round"/>
<polygon points="{octagon(23, 43, 409, 291, 30)}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
<polygon points="{octagon(27, 47, 405, 287, 28)}" fill="none" stroke="{t["main"]}" stroke-width="2" stroke-linejoin="round" opacity=".8"/>
<g fill="#000"><rect x="196" y="27" width="40" height="14"/><rect x="196" y="293" width="40" height="14"/></g>
<g fill="{t["light"]}" stroke="#000" stroke-width="3"><circle cx="190" cy="34" r="5"/><circle cx="242" cy="34" r="5"/><circle cx="190" cy="300" r="5"/><circle cx="242" cy="300" r="5"/><circle cx="14" cy="168" r="5.5"/><circle cx="418" cy="168" r="5.5"/></g>
<g transform="translate({CX} {CY + 4}) scale(1.16) translate({-CX} {-CY})">
  <g class="halo" opacity=".9" filter="url(#{k}-glow)">{icon(t, glow=True)}</g>
  <g class="rim">{icon(t, glow=None)}</g>
  {icon(t, glow=False)}
</g>
</svg>
'''


K = 'stroke="#000" stroke-linejoin="round" stroke-linecap="round"'


def g(glow, t, body):
    """glow=True: blurred halo pass; glow=None: plain silhouette (the caller paints it as a light rim); False: the icon."""
    return body


# ---------------- icons ----------------
def coin(cx, y, rx, ry, h, t, stripe=True):
    side = f'<path d="M{cx - rx},{y} v{h} a{rx},{ry} 0 0 0 {2 * rx},0 v{-h} z" fill="{t["mid"]}" {K} stroke-width="5"/>'
    dark = f'<path d="M{cx - rx * 0.35},{y + ry * 0.9} v{h} M{cx + rx * 0.55},{y + ry * 0.8} v{h}" stroke="#0a1a04" stroke-width="7" opacity=".55"/>' if stripe else ""
    top = f'<ellipse cx="{cx}" cy="{y}" rx="{rx}" ry="{ry}" fill="{t["main"]}" {K} stroke-width="5"/><ellipse cx="{cx}" cy="{y}" rx="{rx * 0.62}" ry="{ry * 0.55}" fill="none" stroke="#1c3a08" stroke-width="3" opacity=".7"/>'
    return side + dark + top


def stack(cx, base, n, rx, ry, h, t):
    return "".join(coin(cx, base - i * h, rx, ry, h, t) for i in range(n))


def icon_market(t, glow=False):
    candles = "".join(
        f'<rect x="{x}" y="{y}" width="22" height="{232 - y}" fill="{t["main"]}" {K} stroke-width="5"/><line x1="{x + 11}" y1="{y - 14}" x2="{x + 11}" y2="{y}" stroke="#000" stroke-width="5"/>'
        for x, y in [(112, 168), (146, 150), (238, 136), (276, 110), (310, 100)]
    )
    arrow = (f'<polyline points="104,176 150,140 190,154 236,112 268,124 318,80" fill="none" stroke="#000" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>'
             f'<polyline points="104,176 150,140 190,154 236,112 268,124 318,80" fill="none" stroke="{t["main"]}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>'
             f'<polygon points="296,70 342,60 332,104" fill="{t["main"]}" {K} stroke-width="6"/>')
    coins = stack(132, 236, 3, 40, 14, 18, t) + stack(214, 246, 6, 44, 15, 19, t) + stack(296, 240, 3, 38, 13, 18, t)
    lean = (f'<g transform="rotate(-18 300 226)"><ellipse cx="300" cy="226" rx="30" ry="40" fill="{t["mid"]}" {K} stroke-width="5"/>'
            f'<ellipse cx="292" cy="226" rx="26" ry="36" fill="{t["main"]}" {K} stroke-width="5"/>'
            f'<ellipse cx="292" cy="226" rx="15" ry="22" fill="none" stroke="#000" stroke-width="5"/><line x1="282" y1="240" x2="302" y2="212" stroke="#000" stroke-width="5"/></g>')
    return g(glow, t, candles + arrow + coins + lean)


def icon_boss(t, glow=False):
    horn = lambda s: (f'<path d="M{216 + s * 44},132 C{216 + s * 104},130 {216 + s * 134},100 {216 + s * 118},44 '
                      f'C{216 + s * 104},80 {216 + s * 80},98 {216 + s * 46},104 Z" fill="{t["main"]}" {K} stroke-width="6"/>'
                      f'<path d="M{216 + s * 60},118 C{216 + s * 90},112 {216 + s * 104},96 {216 + s * 106},74" fill="none" stroke="#3a0606" stroke-width="5" opacity=".6"/>')
    skull = (f'<polygon points="216,96 252,100 280,118 290,152 280,186 262,198 258,232 238,262 194,262 174,232 170,198 152,186 142,152 152,118 180,100" fill="{t["main"]}" {K} stroke-width="7"/>'
             f'<path d="M188,112 L232,108 L250,132 L222,150 L200,140 Z" fill="{t["deep"]}" opacity=".55"/>'
             f'<path d="M244,176 l18,6 l-6,14 z" fill="{t["deep"]}" opacity=".5"/>')
    eyes = (f'<polygon points="168,158 206,176 198,194 168,184" fill="#200303" {K} stroke-width="5"/>'
            f'<polygon points="264,158 226,176 234,194 264,184" fill="#200303" {K} stroke-width="5"/>'
            f'<polygon points="176,168 198,178 194,186 176,180" fill="{t["light"]}"/><polygon points="256,168 234,178 238,186 256,180" fill="{t["light"]}"/>')
    nose = f'<polygon points="204,202 228,202 216,222" fill="#200303" {K} stroke-width="5"/>'
    jaw = (f'<path d="M184,232 H248" stroke="#000" stroke-width="6"/>' +
           "".join(f'<line x1="{x}" y1="234" x2="{x}" y2="258" stroke="#000" stroke-width="5"/>' for x in (198, 210, 222, 234)))
    return g(glow, t, horn(-1) + horn(1) + skull + eyes + nose + jaw)


def icon_bag(t, glow=False):
    handle = f'<path d="M184,108 v-20 q0,-14 14,-14 h36 q14,0 14,14 v20" fill="none" stroke="#000" stroke-width="18"/><path d="M184,108 v-20 q0,-14 14,-14 h36 q14,0 14,14 v20" fill="none" stroke="{t["light"]}" stroke-width="7"/>'
    pockets = (f'<rect x="80" y="146" width="48" height="96" rx="12" fill="{t["deep"]}" {K} stroke-width="6"/><path d="M84,166 h40" stroke="{t["light"]}" stroke-width="4"/>'
               f'<polygon points="94,184 114,184 104,198" fill="{t["light"]}"/>'
               f'<rect x="304" y="146" width="48" height="96" rx="12" fill="{t["deep"]}" {K} stroke-width="6"/><path d="M308,166 h40" stroke="{t["light"]}" stroke-width="4"/>')
    body = f'<rect x="110" y="104" width="212" height="164" rx="26" fill="{t["deep"]}" {K} stroke-width="7"/>'
    flap = (f'<path d="M118,110 Q118,98 132,98 H300 Q314,98 314,110 V176 Q216,192 118,176 Z" fill="{t["mid"]}" {K} stroke-width="6"/>'
            f'<polyline points="190,156 190,126 204,140 216,118 228,140 242,126 242,156 190,156" fill="none" stroke="{t["light"]}" stroke-width="6" stroke-linejoin="round"/>')
    straps = "".join(
        f'<rect x="{x}" y="150" width="18" height="118" fill="{t["light"]}" {K} stroke-width="4"/><rect x="{x - 5}" y="176" width="28" height="18" rx="3" fill="{t["mid"]}" {K} stroke-width="4"/>'
        for x in (152, 262))
    front = (f'<rect x="186" y="198" width="60" height="56" rx="8" fill="{t["deep"]}" {K} stroke-width="5"/>'
             f'<path d="M200,212 l32,28 M232,212 l-32,28" stroke="{t["light"]}" stroke-width="7" stroke-linecap="round"/>' +
             "".join(f'<circle cx="{x}" cy="{y}" r="3.5" fill="{t["light"]}"/>' for x, y in ((193, 205), (239, 205), (193, 247), (239, 247))))
    return g(glow, t, handle + pockets + body + flap + straps + front)


def icon_home(t, glow=False):
    chimney = f'<rect x="270" y="88" width="30" height="58" fill="{t["mid"]}" {K} stroke-width="6"/><rect x="264" y="82" width="42" height="14" fill="{t["main"]}" {K} stroke-width="5"/>'
    walls = f'<polygon points="140,170 216,114 292,170 292,256 140,256" fill="{t["deep"]}" {K} stroke-width="7"/>'
    roof = (f'<polygon points="216,74 346,172 322,190 216,110 110,190 86,172" fill="{t["main"]}" {K} stroke-width="7"/>'
            f'<path d="M150,160 l26,-18 M254,138 l30,22" stroke="{t["deep"]}" stroke-width="5" opacity=".6"/>')
    window = (f'<rect x="194" y="138" width="44" height="40" fill="{t["main"]}" {K} stroke-width="6"/>'
              f'<path d="M216,138 v40 M194,158 h44" stroke="#000" stroke-width="5"/>')
    door = (f'<rect x="184" y="196" width="64" height="62" fill="{t["main"]}" {K} stroke-width="6"/>'
            f'<rect x="198" y="210" width="36" height="48" fill="#050500" stroke="#000" stroke-width="4"/>')
    base = (f'<rect x="108" y="252" width="60" height="16" fill="{t["main"]}" {K} stroke-width="5"/>'
            f'<rect x="264" y="252" width="60" height="16" fill="{t["main"]}" {K} stroke-width="5"/>')
    return g(glow, t, chimney + walls + roof + window + door + base)


def icon_social(t, glow=False):
    shield = (f'<path d="M120,100 L216,72 L312,100 L324,180 L216,256 L108,180 Z" fill="{t["mid"]}" {K} stroke-width="8"/>'
              f'<path d="M132,108 L216,84 L300,108 L310,176 L216,242 L122,176 Z" fill="none" stroke="{t["main"]}" stroke-width="6"/>'
              f'<polyline points="184,140 184,104 200,122 216,96 232,122 248,104 248,140 184,140" fill="none" stroke="{t["main"]}" stroke-width="8" stroke-linejoin="round"/>')

    def person(cx, head_y, r, w, bottom):
        top = head_y + r + 6
        gold, red = t["gold"], t["mid"]
        return (f'<path d="M{cx - w},{bottom} L{cx - w + 4},{top + 22} Q{cx - w + 10},{top} {cx},{top - 2} Q{cx + w - 10},{top} {cx + w - 4},{top + 22} L{cx + w},{bottom} Z" fill="{gold}" {K} stroke-width="7"/>'
                f'<path d="M{cx - w + 10},{bottom - 4} L{cx - w + 13},{top + 24} Q{cx - w + 18},{top + 8} {cx - 6},{top + 6} L{cx},{top + 30} Z" fill="{red}" opacity=".85"/>'
                f'<path d="M{cx - w * 0.5},{top + 4} L{cx},{top + 30} L{cx + w * 0.5},{top + 4}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>'
                f'<circle cx="{cx}" cy="{head_y}" r="{r}" fill="{gold}" {K} stroke-width="7"/>'
                f'<path d="M{cx - r + 5},{head_y + 4} A{r - 5},{r - 5} 0 0 1 {cx + 2},{head_y - r + 5} L{cx + 4},{head_y + 2} Z" fill="{red}" opacity=".8"/>')
    people = person(148, 180, 23, 44, 250) + person(284, 180, 23, 44, 250) + person(216, 166, 29, 56, 256)
    return g(glow, t, shield + people)


THEMES = [
    ({"id": "market", "main": "#b8ff3a", "light": "#e4ff8a", "mid": "#5f9e14", "panel": "#163d0c", "deep": "#08180a"}, icon_market),
    ({"id": "boss", "main": "#ff7d4d", "light": "#ffc08a", "mid": "#c2341f", "panel": "#3d0a0e", "deep": "#14040a"}, icon_boss),
    ({"id": "inventory", "main": "#5fd6ff", "light": "#bdf0ff", "mid": "#24497e", "panel": "#0c2440", "deep": "#08142a"}, icon_bag),
    ({"id": "home", "main": "#ffea3a", "light": "#fff6a0", "mid": "#a89a00", "panel": "#333306", "deep": "#121202"}, icon_home),
    ({"id": "social", "main": "#ffb83a", "light": "#ffe0a0", "mid": "#8e1424", "panel": "#5a0c18", "deep": "#1c0408", "gold": "#ffc23a"}, icon_social),
]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for t, icon in THEMES:
        path = os.path.join(OUT, f'{t["id"]}.svg')
        with open(path, "w") as f:
            f.write(frame(t, icon))
        print(path, os.path.getsize(path))
