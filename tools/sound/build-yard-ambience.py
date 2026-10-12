"""
The yard's background: a few birds now and then, quiet and unhurried (the leaves and the wind were taken out).
Everything is synthesized and periodic over PERIOD seconds (noise is shaped in the frequency domain of one whole
period, so it wraps without a seam; bird calls near the end wrap around to the start).
Output: public/assets/sound/yard.mp3 — the period with PAD seconds of its end before it and of its start after it
(src/client/sound.ts MUSIC_FILES.yard: start = PAD, end = PAD + PERIOD).
"""
import os, subprocess, tempfile
import numpy as np
from scipy.io import wavfile

SR = 44100
PERIOD = 48.0
PAD = 0.5
N = int(SR * PERIOD)
rng = np.random.default_rng(20261013)
t = np.arange(N) / SR
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def shaped_noise(lo, hi, tilt=0.0):
    """periodic noise with energy between lo and hi Hz (soft edges), spectrum tilted by f^tilt"""
    spec = np.fft.rfft(rng.standard_normal(N))
    f = np.fft.rfftfreq(N, 1 / SR)
    band = 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    spec *= band * np.maximum(f, 20) ** tilt
    x = np.fft.irfft(spec, N)
    return x / np.abs(x).max()


def slow(periods, phases=None):
    """a slow, periodic swell from sines whose periods divide PERIOD"""
    out = np.zeros(N)
    for k, p in enumerate(periods):
        ph = phases[k] if phases else rng.uniform(0, 2 * np.pi)
        out += np.sin(2 * np.pi * t / p + ph)
    return out / len(periods)


# --- leaves: a bright rustle that swells with the gusts, a little different in each ear
gust = 0.5 + 0.5 * slow([PERIOD, PERIOD / 2, PERIOD / 3, PERIOD / 5])
gust = np.clip(gust, 0, 1) ** 1.6
flutter = 0.75 + 0.25 * slow([PERIOD / 40, PERIOD / 57, PERIOD / 73])  # the leaves' own quick shimmer
leavesL = shaped_noise(400, 2800, -0.9) * (0.15 + 0.85 * gust) * flutter
leavesR = shaped_noise(400, 2800, -0.9) * (0.15 + 0.85 * np.roll(gust, int(0.35 * SR))) * flutter
# --- the wind itself: low and soft
wind = shaped_noise(120, 600, -0.8) * (0.3 + 0.7 * gust)

# no rustle and no wind any more (too much in the ears): only the birds, the quiet tail of the reverb around them
L = np.zeros(N)
R = np.zeros(N)


# --- birds: a few short phrases spread over the period, each from its own spot
def add(sig, start, pan):
    n = len(sig)
    idx = (np.arange(n) + int(start * SR)) % N  # wraps around the loop
    np.add.at(L, idx, sig * np.cos(pan * np.pi / 2))
    np.add.at(R, idx, sig * np.sin(pan * np.pi / 2))


def chirp(f0, f1, dur, vol=1.0, curve=1.0, vib=0.0):
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    f = f0 + (f1 - f0) * x ** curve + vib * np.sin(2 * np.pi * 38 * x * dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.sin(np.pi * x) ** 1.5
    return vol * env * (np.sin(ph) + 0.18 * np.sin(2 * ph))


def gap(d):
    return np.zeros(int(d * SR))


def tit():  # «ти-ти-тии»: two quick notes and a longer one
    return np.concatenate([chirp(5200, 4600, 0.07), gap(0.07), chirp(5200, 4600, 0.07), gap(0.08), chirp(4300, 3900, 0.18, curve=0.6)])


def robin():  # a soft warble of falling and rising notes
    parts = []
    for _ in range(rng.integers(4, 7)):
        a, b = rng.uniform(2400, 4800), rng.uniform(2400, 4800)
        parts += [chirp(a, b, rng.uniform(0.06, 0.14), vol=rng.uniform(0.6, 1.0), vib=rng.uniform(0, 150)), gap(rng.uniform(0.03, 0.09))]
    return np.concatenate(parts)


def trill():  # a fast trill of tiny down-chirps
    parts = []
    f = rng.uniform(3800, 5200)
    for _ in range(rng.integers(6, 11)):
        parts += [chirp(f, f - 700, 0.035, vol=0.8), gap(0.025)]
    return np.concatenate(parts)


def whistle():  # a calm two-tone whistle
    a = rng.uniform(2200, 2800)
    return np.concatenate([chirp(a, a * 1.02, 0.28, vib=40), gap(0.12), chirp(a * 0.84, a * 0.82, 0.32, vib=40)])


calls = [tit, robin, trill, whistle]
at = 1.5
while at < PERIOD - 0.5:
    call = calls[rng.integers(len(calls))]
    s = call()
    vol = rng.uniform(0.035, 0.07)
    pan = rng.uniform(0.15, 0.85)
    add(vol * s, at, pan)
    # sometimes the same bird answers itself a moment later, a little quieter
    if rng.random() < 0.45:
        add(0.7 * vol * call(), at + len(s) / SR + rng.uniform(0.6, 1.4), pan)
    at += rng.uniform(3.0, 6.5)

# --- a touch of space: a short, soft, circular reverb
ir_n = int(0.9 * SR)
ir = rng.standard_normal(ir_n) * np.exp(-np.linspace(0, 7, ir_n))
ir[0] = 1.0
irf = np.fft.rfft(np.concatenate([ir, np.zeros(N - ir_n)]))
L = np.fft.irfft(np.fft.rfft(L) * irf, N) * 0.5 + L * 0.5
R = np.fft.irfft(np.fft.rfft(R) * irf, N) * 0.5 + R * 0.5

st = np.stack([L, R], 1)
st /= np.abs(st).max() / 0.7
p = int(PAD * SR)
full = np.concatenate([st[-p:], st, st[:p]])
with tempfile.TemporaryDirectory() as d:
    wav = os.path.join(d, "yard.wav")
    wavfile.write(wav, SR, (full * 32767).astype(np.int16))
    out = os.path.join(ROOT, "public", "assets", "sound", "yard.mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "112k", out], check=True)
print("yard.mp3", PAD, PAD + PERIOD)
