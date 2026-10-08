"""
Музыка финального боя с Солнцем (черновик для прослушивания): тяжёлая, устрашающая.
96 BPM, 4/4, D фригийский (D – Eb – Bb – C – A): низкий гул, военные барабаны (тайко), медные «удары»,
мрачный хор, похоронный колокол, тиканье часов и пульсирующее струнное остинато.
16 тактов ≈ 40 с: 4 такта вступления (гул, колокол, часы) → 8 тактов полного боя → 4 такта кульминации с хором.
Пишет WAV в путь из аргумента (по умолчанию sun.wav).
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, fftconvolve

SR = 44100
rng = np.random.default_rng(7)


def lp(x, f, o=2): b, a = butter(o, f / (SR / 2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f / (SR / 2), "high"); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo / (SR / 2), hi / (SR / 2)], "band"); return lfilter(b, a, x)
def hz(n): return 440 * 2 ** ((n - 69) / 12)


BPM = 96
beat = 60 / BPM
bar = beat * 4
BARS = 16
N = int(SR * (bar * BARS + 3))
L = np.zeros(N)   # left / right buses
R = np.zeros(N)


def put(x, at, pan=0.0, rev=0.0):
    i = int(at * SR); j = min(N, i + len(x))
    x = x[: j - i]
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    L[i:j] += x * l; R[i:j] += x * r
    if rev:
        WL[i:j] += x * rev * l; WR[i:j] += x * rev * r


WL = np.zeros(N); WR = np.zeros(N)   # reverb send


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)


def saw(f, dur, det=(1.0,)):
    t = np.arange(int(SR * dur)) / SR
    s = np.zeros_like(t)
    for k in det:
        ph = (f * k * t + rng.random()) % 1
        s += 2 * ph - 1
    return s / len(det)


# ---------- drone: D1 + A1, slowly breathing, a little growl ----------
def drone(dur):
    t = np.arange(int(SR * dur)) / SR
    s = np.sin(2 * np.pi * hz(26) * t) + 0.6 * np.sin(2 * np.pi * hz(33) * t) + 0.35 * saw(hz(38), dur, (1, 1.004, 0.996))
    s = np.tanh(1.8 * s) * (0.7 + 0.3 * np.sin(2 * np.pi * t / (bar * 2)))
    fade = np.minimum(1, t / 3.0) * np.minimum(1, (dur - t) / 0.5).clip(0)
    return lp(s, 260, 2) * fade * 0.32


# ---------- war drum (taiko-ish): pitch drop + skin noise ----------
def taiko(vol=1.0, f0=95):
    n = int(SR * 1.1); t = np.arange(n) / SR
    ph = np.cumsum(2 * np.pi * (f0 * (0.55 + 0.45 * np.exp(-t / 0.05))) / SR)
    body = np.sin(ph) * np.exp(-t / 0.32)
    skin = lp((rng.random(n) * 2 - 1), 900, 2) * np.exp(-t / 0.03) * 0.6
    return np.tanh(2.2 * (body + skin)) * vol * 0.55


def tick(vol=0.08):
    n = int(SR * 0.03); t = np.arange(n) / SR
    return hp(rng.random(n) * 2 - 1, 5000, 2) * np.exp(-t / 0.006) * vol


# ---------- brass hit: stacked saws through a closing filter ----------
def brass(notes, dur, vol=0.22):
    n = int(SR * dur); t = np.arange(n) / SR
    s = sum(saw(hz(m), dur, (1, 1.006, 0.994)) for m in notes) / len(notes)
    cut = 300 + 2600 * np.exp(-t / 0.25)
    out = np.zeros(n); y = 0.0
    a = np.exp(-2 * np.pi * cut / SR)
    for i in range(n):  # one-pole sweep
        y = (1 - a[i]) * s[i] + a[i] * y
        out[i] = y
    out = lp(out, 2500, 2)
    return np.tanh(2 * out) * env(n, 0.02, dur * 0.55) * vol


# ---------- choir «aah»: detuned saws through vowel formants ----------
def choir(notes, dur, vol=0.12):
    n = int(SR * dur); t = np.arange(n) / SR
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5 * t)
    s = np.zeros(n)
    for m in notes:
        for k in (1, 1.004, 0.997, 1.008):
            ph = np.cumsum(hz(m) * k * vib / SR)
            s += 2 * (ph % 1) - 1
    s = bp(s, 600, 820, 2) * 1.0 + bp(s, 1000, 1250, 2) * 0.6 + bp(s, 2400, 2800, 2) * 0.25
    e = np.minimum(1, t / 1.2) * np.minimum(1, (dur - t) / 0.8).clip(0)
    return s * e * vol / len(notes)


# ---------- funeral bell: inharmonic partials ----------
def bell(m, vol=0.25):
    n = int(SR * 5); t = np.arange(n) / SR
    f = hz(m)
    parts = [(0.5, 1.0, 3.5), (1.0, 0.8, 2.6), (1.19, 0.5, 2.0), (1.56, 0.35, 1.5), (2.0, 0.3, 1.2), (2.74, 0.2, 0.8), (3.76, 0.12, 0.5)]
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in parts)
    return s * np.minimum(1, t / 0.003) * vol


# ---------- string ostinato: short low bowed notes ----------
def stab(m, dur, vol=0.1):
    n = int(SR * dur)
    s = saw(hz(m), dur, (1, 1.005, 0.995))
    return lp(s, 1400, 2) * env(n, 0.008, dur * 0.4) * vol


# ================= arrangement =================
put(drone(bar * BARS + 1.5), 0, 0, rev=0.2)

# the bell tolls on bar 1, 3, 5 … (lower each time in the climax)
for b in range(0, BARS, 2):
    put(bell(62 if b < 12 else 57, 0.22 if b < 12 else 0.3), b * bar, -0.2, rev=0.6)

# clock ticks: 8ths through the whole piece, a little louder in the intro
for b in range(BARS):
    for k in range(8):
        put(tick(0.07 if b < 4 else 0.045), b * bar + k * beat / 2, 0.5 if k % 2 else -0.5, rev=0.1)

# war drums from bar 5: «BOOM . boom-boom . BOOM . . boom» + a roll into every 4th bar
PAT = [(0, 1.0, 92), (1.5, 0.6, 110), (2, 0.75, 92), (3, 1.0, 80), (3.5, 0.5, 120)]
for b in range(4, BARS):
    for pos, v, f0 in PAT:
        put(taiko(v, f0), b * bar + pos * beat, 0.15 * (1 if pos % 2 else -1), rev=0.35)
    if b % 4 == 3:
        for k in range(8):
            put(taiko(0.25 + 0.08 * k, 140), b * bar + 2 * beat + k * beat / 4, 0.3, rev=0.3)

# brass hits on the downbeats: D – Eb (phrygian dread) – Bb – A
CH = [[38, 45, 50], [39, 46, 51], [34, 41, 46], [33, 40, 45]]
for b in range(4, BARS):
    c = CH[(b - 4) % 4]
    put(brass(c, beat * 1.6, 0.26), b * bar, 0, rev=0.45)
    if b >= 8:
        put(brass([m + 12 for m in c], beat * 0.9, 0.12), b * bar + 2.5 * beat, 0.2, rev=0.4)

# pulsing string ostinato (16ths) from bar 9
OST = [50, 50, 51, 50, 50, 50, 46, 50, 50, 50, 51, 50, 53, 51, 50, 45]
for b in range(8, BARS):
    shift = [0, 1, -4, -5][(b - 4) % 4]
    for k, m in enumerate(OST):
        put(stab(m + shift - 12, beat / 4 * 0.9, 0.09 if k % 4 else 0.13), b * bar + k * beat / 4, -0.35 if k % 2 else 0.35, rev=0.2)

# choir: low and quiet under the fight, full in the last 4 bars
CHOIR = [[62, 69, 74], [63, 70, 75], [58, 65, 70], [57, 64, 69]]
for b in range(4, BARS, 2):
    c = CHOIR[((b - 4) // 2) % 4]
    loud = b >= 12
    put(choir(c if not loud else c + [c[0] + 12], bar * 2, 0.16 if loud else 0.07), b * bar, 0, rev=0.7)

# the end: a rising noise sweep into the loop point
n = int(SR * bar); t = np.arange(n) / SR
sweep = bp(rng.random(n) * 2 - 1, 400, 6000, 1) * (t / bar) ** 2 * 0.12
put(sweep, (BARS - 1) * bar, 0, rev=0.5)

# ---------- reverb (a dark hall) and master ----------
ir_n = int(SR * 3.2); ti = np.arange(ir_n) / SR
ir = lp((rng.random(ir_n) * 2 - 1), 3500, 1) * np.exp(-ti / 0.9)
ir /= np.sqrt(np.sum(ir ** 2))
L += fftconvolve(WL, ir)[:N] * 0.6
R += fftconvolve(WR, ir[::-1][::-1] * (1 + 0.02 * rng.standard_normal(ir_n)))[:N] * 0.6
mix = np.stack([L, R], 1)
mix = hp(mix.T, 28, 2).T
peak = np.max(np.abs(mix))
mix = np.tanh(1.4 * mix / peak) / np.tanh(1.4) * 0.92
# fade out the tail
cut = int(SR * (bar * BARS + 2.5))
mix = mix[:cut]
mix[-int(SR * 2.5):] *= np.linspace(1, 0, int(SR * 2.5))[:, None]
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else "sun.wav", SR, (mix * 32767).astype(np.int16))
print("ok", round(cut / SR, 1), "s")
