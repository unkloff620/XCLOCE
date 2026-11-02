#!/usr/bin/env python3
"""
The new level: a sheet of an old district newspaper («Районный вестник») and the authority hand drawn on it in ballpoint pen.

  public/assets/ui/levelup-paper.webp   — the sheet (900×1260, see-through torn edges): a masthead, a headline, columns of
                                          small print round a big empty box in the middle where the player's level is written
  public/assets/ui/levelup-sketch.webp  — the authority icon (public/assets/ui/authority.webp) traced as a pen sketch

Run: python3 tools/ui/build-levelup-paper.py   (needs Pillow, numpy, opencv-python-headless)
"""
import math
import os
import random

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public/assets/ui")
W, H = 900, 1260
rnd = random.Random(1996)

SERIF_B = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_C = "/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed.ttf"
SERIF_CB = "/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed-Bold.ttf"
INK = (34, 28, 22)

WORDS = ("район курс биток памп дамп пацаны авторитет общак смотрящий холд кошелёк биржа рынок токен мем "
         "двор подъезд гараж лавка бабки рубли доллары майнинг ферма видюха свечи график шорт лонг сделка "
         "сходка пахан братва барыга налоговая офис планёрка дедлайн премия кофе принтер бухгалтерия отчёт "
         "квартал корпоратив оливье тост ёлка яхта офшор луна ракета сигнал кит медведь бык ликвидация "
         "по слухам вчера вечером на районе стало известно что в ходе как сообщает источник однако").split()


def font(path, size):
    return ImageFont.truetype(path, size)


def sentence(n):
    w = [rnd.choice(WORDS) for _ in range(n)]
    s = " ".join(w)
    return s[0].upper() + s[1:]


def column(d, x, y, w, h, size=13, lead=16, para=5):
    """Fills a box with justified-looking small print; returns nothing."""
    f = font(SERIF_C, size)
    cy = y
    while cy + lead <= y + h:
        line = ""
        while True:
            nxt = (line + " " + rnd.choice(WORDS)).strip()
            if d.textlength(nxt, font=f) > w:
                break
            line = nxt
        last = rnd.random() < 0.07 and cy > y  # the end of a paragraph: a short line, a little gap after it
        # stretch words over the width (justified)
        words = line.split(" ")
        if last:
            words = words[: max(2, len(words) // 2)]
            d.text((x, cy), " ".join(words), font=f, fill=INK + (225,))
            cy += lead + para
            continue
        if len(words) > 1:
            tw = sum(d.textlength(t, font=f) for t in words)
            gap = (w - tw) / (len(words) - 1)
            cx = x
            for t in words:
                d.text((cx, cy), t, font=f, fill=INK + (225,))
                cx += d.textlength(t, font=f) + gap
        else:
            d.text((x, cy), line, font=f, fill=INK + (225,))
        cy += lead


def headline(d, x, y, w, text, size, path=SERIF_CB):
    f = font(path, size)
    lines, line = [], ""
    for t in text.split():
        nxt = (line + " " + t).strip()
        if d.textlength(nxt, font=f) > w and line:
            lines.append(line)
            line = t
        else:
            line = nxt
    lines.append(line)
    for i, l in enumerate(lines):
        d.text((x, y + i * (size + 4)), l, font=f, fill=INK + (240,))
    return y + len(lines) * (size + 4)


def photo(img, x, y, w, h):
    """A grainy halftone «photo»: a blurry blob scene, dotted like cheap newsprint."""
    p = Image.new("L", (w, h), 170)
    pd = ImageDraw.Draw(p)
    for _ in range(9):
        cx, cy, r = rnd.randint(0, w), rnd.randint(0, h), rnd.randint(w // 8, w // 3)
        pd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rnd.randint(40, 220))
    p = p.filter(ImageFilter.GaussianBlur(w / 14))
    a = np.array(p, dtype=np.float32) / 255
    yy, xx = np.mgrid[0:h, 0:w]
    cell = 5
    cxg, cyg = (xx % cell) - cell / 2, (yy % cell) - cell / 2
    dot = np.sqrt(cxg ** 2 + cyg ** 2) < (1 - a) * cell * 0.75
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = INK
    rgba[..., 3] = dot * 215
    dots = Image.fromarray(rgba, "RGBA")
    img.paste(dots, (x, y), dots)
    ImageDraw.Draw(img, "RGBA").rectangle((x, y, x + w - 1, y + h - 1), outline=INK + (220,), width=2)


def paper():
    # yellowed newsprint: a warm base, fibre noise, uneven light, a few stains
    base = np.zeros((H, W, 3), np.float32)
    base[:] = (226, 214, 184)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # darker towards the edges (old paper)
    edge = np.minimum.reduce([xx, W - xx, yy, H - yy]) / 140
    base *= (0.86 + 0.14 * np.clip(edge, 0, 1))[..., None]
    lo = cv2.resize(np.random.RandomState(3).rand(14, 10).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    base *= (0.94 + 0.08 * lo)[..., None]
    grain = np.random.RandomState(5).normal(0, 7, (H, W)).astype(np.float32)
    base += grain[..., None]
    # fibres
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    fd = ImageDraw.Draw(img, "RGBA")
    for _ in range(500):
        x, y = rnd.randint(0, W), rnd.randint(0, H)
        a = rnd.random() * math.pi
        l = rnd.randint(4, 14)
        fd.line((x, y, x + math.cos(a) * l, y + math.sin(a) * l), fill=(150, 130, 100, rnd.randint(12, 34)), width=1)
    return img


def stain(img, cx, cy, r, alpha=60):
    """A coffee-cup ring with a lighter middle."""
    s = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(s)
    pts = []
    for k in range(80):
        a = k / 80 * math.tau
        rr = r * (1 + 0.04 * math.sin(a * 5 + 1) + rnd.uniform(-0.015, 0.015))
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    sd.polygon(pts, fill=alpha // 3)
    sd.line(pts + [pts[0]], fill=alpha, width=7)
    s = s.filter(ImageFilter.GaussianBlur(3))
    layer = Image.new("RGBA", (W, H), (140, 95, 45, 0))
    layer.putalpha(s)
    img.paste(layer, (0, 0), layer)


def folds(img):
    """The sheet was folded in four: a soft shadow and a light ridge along each crease."""
    a = np.array(img).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    for pos, axis in ((H * 0.5, "y"), (W * 0.5, "x")):
        d = (yy if axis == "y" else xx) - pos
        a[..., :3] *= (1 - 0.13 * np.exp(-(d / 6) ** 2))[..., None]
        a[..., :3] += (16 * np.exp(-((d - 4) / 3) ** 2))[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def torn_alpha(img):
    """Ragged edges and two bitten corners."""
    m = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(m)
    pts = []
    def edge(p0, p1, n, amp):
        for k in range(n):
            t = k / n
            x = p0[0] + (p1[0] - p0[0]) * t
            y = p0[1] + (p1[1] - p0[1]) * t
            nx, ny = -(p1[1] - p0[1]), (p1[0] - p0[0])
            ln = math.hypot(nx, ny)
            j = rnd.uniform(0, amp) + (amp * 2.2 if rnd.random() < 0.05 else 0)
            pts.append((x + nx / ln * j, y + ny / ln * j))
    m0 = 10
    edge((m0, m0 + 30), (W - m0 - 6, m0), 160, 7)
    edge((W - m0 - 6, m0), (W - m0, H - m0 - 40), 220, 6)
    edge((W - m0, H - m0 - 40), (m0 + 50, H - m0), 160, 9)
    edge((m0 + 50, H - m0), (m0, m0 + 30), 220, 6)
    md.polygon(pts, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(0.8))
    img.putalpha(ImageChops.multiply(img.getchannel("A"), m))
    # a darker rim right at the tear
    rim = m.filter(ImageFilter.MaxFilter(3)).point(lambda v: 255 if 20 < v < 250 else 0).filter(ImageFilter.GaussianBlur(2))
    shade = Image.new("RGBA", (W, H), (120, 92, 55, 0))
    shade.putalpha(rim.point(lambda v: v // 3))
    img.alpha_composite(shade)
    return img


def build_paper():
    img = paper()
    d = ImageDraw.Draw(img, "RGBA")
    L, R = 54, W - 54
    # masthead
    f = font(SERIF_B, 54)
    title = "РАЙОННЫЙ ВЕСТНИК"
    tw = d.textlength(title, font=f)
    d.text(((W - tw) / 2, 44), title, font=f, fill=INK + (245,))
    d.line((L, 126, R, 126), fill=INK + (230,), width=4)
    d.line((L, 133, R, 133), fill=INK + (230,), width=1)
    small = font(SERIF_C, 15)
    d.text((L, 139), "№ 96 (1337)", font=small, fill=INK + (230,))
    mid = "ГАЗЕТА ДЛЯ ВСЕХ, КТО В ТЕМЕ · ВЫХОДИТ КОГДА НАДО"
    d.text(((W - d.textlength(mid, font=small)) / 2, 139), mid, font=small, fill=INK + (230,))
    price = "Цена: 2 ₽"
    d.text((R - d.textlength(price, font=small), 139), price, font=small, fill=INK + (230,))
    d.line((L, 162, R, 162), fill=INK + (230,), width=1)
    # the main headline
    f = font(SERIF_CB, 40)
    hl = "НА РАЙОНЕ — НОВЫЙ АВТОРИТЕТ"
    d.text(((W - d.textlength(hl, font=f)) / 2, 176), hl, font=f, fill=INK + (245,))
    sub = "Братва в шоке: он поднялся быстрее, чем курс после халвинга"
    fs = font(SERIF, 18)
    d.text(((W - d.textlength(sub, font=fs)) / 2, 232), sub, font=fs, fill=INK + (225,))
    d.line((L, 266, R, 266), fill=INK + (200,), width=1)
    # the big box over the whole width, where the level is written by hand
    bx0, by0, bx1, by1 = L, 286, R, 896
    d.rectangle((bx0, by0, bx1, by1), outline=INK + (235,), width=3)
    d.rectangle((bx0 + 7, by0 + 7, bx1 - 7, by1 - 7), outline=INK + (200,), width=1)
    lab = font(SERIF_CB, 17)
    t = "ПОЗДРАВЛЕНИЕ · ОБЪЯВЛЕНИЕ"
    tw = d.textlength(t, font=lab)
    d.rectangle(((W - tw) / 2 - 10, by0 - 11, (W + tw) / 2 + 10, by0 + 11), fill=(222, 210, 180, 255))
    d.text(((W - tw) / 2, by0 - 11), t, font=lab, fill=INK + (240,))
    # the bottom: three columns, a «photo» in the middle one
    d.line((L, 912, R, 912), fill=INK + (220,), width=2)
    cw3 = int((R - L - 36) / 3)
    for k, h in enumerate(("ОБЩАК ПОПОЛНИЛСЯ", "СХОДКА В СУББОТУ", "ПРОДАМ ВИДЮХУ Б/У")):
        x = L + k * (cw3 + 18)
        y = headline(d, x, 922, cw3, h, 17)
        if k == 1:
            photo(img, x, y + 6, cw3, 112)
            y += 122
        column(d, x, y + 6, cw3, 1196 - y - 6, size=12, lead=15)
        if k:
            d.line((x - 9, 922, x - 9, 1196), fill=INK + (170,), width=1)
    # the print is a bit uneven: some ink missing here and there
    a = np.array(img.convert("RGBA")).astype(np.float32)
    worn = cv2.resize(np.random.RandomState(9).rand(60, 44).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    ink = a[..., :3].mean(axis=2) < 120
    a[..., :3][ink] += (np.clip(worn - 0.65, 0, 1)[ink] * 220)[..., None]
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA").convert("RGB")
    stain(img, 760, 1130, 74, 55)
    stain(img, 120, 210, 38, 30)
    img = folds(img.convert("RGBA"))
    img = torn_alpha(img)
    img.save(os.path.join(OUT, "levelup-paper.webp"), quality=86, method=6)
    return img


def build_sketch():
    """The authority hand redrawn as a ballpoint sketch: wobbly outlines drawn twice and hatching in the shadows."""
    src = Image.open(os.path.join(OUT, "authority.webp")).convert("RGBA").resize((512, 512), Image.LANCZOS)
    a = np.array(src)
    alpha = a[..., 3]
    gray = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2GRAY)
    gray[alpha < 40] = 255
    blur = cv2.bilateralFilter(cv2.GaussianBlur(gray, (7, 7), 0), 9, 60, 9)
    edges = cv2.Canny(blur, 90, 190)
    # only the longer strokes stay: a sketch, not a scan
    n, lab, st, _ = cv2.connectedComponentsWithStats(edges, 8)
    keep = np.zeros_like(edges)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= 40:
            keep[lab == i] = 255
    inner = cv2.erode((alpha > 100).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    keep[~inner] = 0
    sil = cv2.Canny((alpha > 100).astype(np.uint8) * 255, 50, 150)
    lines = cv2.bitwise_or(keep, cv2.dilate(sil, np.ones((4, 4), np.uint8)))
    # a pen line is never exactly in place: two passes, each a little warped
    H2, W2 = lines.shape
    out = np.zeros((H2, W2), np.float32)
    rs = np.random.RandomState(4)
    for k, (amp, s) in enumerate(((2.2, 0.9), (1.6, 0.55))):
        fx = cv2.resize(rs.randn(9, 9).astype(np.float32), (W2, H2), interpolation=cv2.INTER_CUBIC) * amp
        fy = cv2.resize(rs.randn(9, 9).astype(np.float32), (W2, H2), interpolation=cv2.INTER_CUBIC) * amp
        mx, my = np.meshgrid(np.arange(W2, dtype=np.float32), np.arange(H2, dtype=np.float32))
        warped = cv2.remap(lines, mx + fx, my + fy, cv2.INTER_LINEAR)
        out = np.maximum(out, warped.astype(np.float32) / 255 * s)
    # hatching in the dark parts, diagonal
    shade = cv2.GaussianBlur(gray, (21, 21), 0)
    dark = (shade < 105) & inner
    yy, xx = np.mgrid[0:H2, 0:W2]
    hatch = ((xx + yy) % 10 < 1.5) & dark
    out = np.maximum(out, hatch * 0.5)
    out = cv2.GaussianBlur(out, (3, 3), 0.6)
    pen = np.zeros((H2, W2, 4), np.uint8)
    pen[..., 0], pen[..., 1], pen[..., 2] = 28, 44, 120  # blue ballpoint
    pen[..., 3] = np.clip(out * 255 * 1.15, 0, 255).astype(np.uint8)
    Image.fromarray(pen, "RGBA").resize((384, 384), Image.LANCZOS).save(os.path.join(OUT, "levelup-sketch.webp"), quality=90, method=6)


if __name__ == "__main__":
    build_paper()
    build_sketch()
    print("ok")
