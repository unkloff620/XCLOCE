"""
Interface sounds in the character of an old browser prison game:
  tap.mp3  — the key «тык» on every button: the player's own recording (tools/sound/source/tap.mp3), its silence cut off
             (from 70 ms, 70 ms long, normalized) — this script does not write it; the noise «тык» below is only kept as a sketch
  page.mp3 — a page turned («Личное дело», the yards of «Захват»): the player's own recording (tools/sound/source/page.mp3),
             trimmed to its sound; the noise page below is only kept as a sketch
Run from the repo root:  python3 tools/sound/build-ui-clicks.py   (writes public/assets/sound/tap.mp3, page.mp3)
"""
import subprocess, tempfile, os
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

SR = 44100
rng = np.random.default_rng(11)


def biq(x, typ, f, q):
    w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q); c = np.cos(w)
    b = {"lowpass": [(1 - c) / 2, 1 - c, (1 - c) / 2], "highpass": [(1 + c) / 2, -(1 + c), (1 + c) / 2], "bandpass": [al, 0, -al]}[typ]
    return lfilter(b, [1 + al, -2 * c, 1 - al], x)


def burst(dur, decay):
    n = max(2, int(SR * dur)); t = np.arange(n) / SR
    return (rng.random(n) * 2 - 1) * np.exp(-t / decay)


def put(out, x, at, vol):
    i = int(at * SR); j = min(len(out), i + len(x)); out[i:j] += x[: j - i] * vol


def save(x, name, peak):
    # dark like an old browser game's sounds: almost nothing above 7 kHz
    x = biq(biq(x, "lowpass", 6000, 0.7), "lowpass", 6500, 0.7)
    x = x / (np.max(np.abs(x)) or 1) * peak
    fade = int(SR * 0.004); x[-fade:] *= np.linspace(1, 0, fade)
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, "x.wav"); wavfile.write(w, SR, (x * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", w, "-ac", "1", "-b:a", "96k", f"public/assets/sound/{name}.mp3"], check=True)


# «тык»
tap = np.zeros(int(SR * 0.06))
put(tap, biq(burst(0.003, 0.0006), "highpass", 4500, 0.7), 0.0, 0.35)          # the key's edge
put(tap, biq(burst(0.012, 0.0018), "bandpass", 2400, 1.1), 0.0015, 1.0)       # the click
put(tap, biq(burst(0.012, 0.0016), "bandpass", 4800, 1.4), 0.0015, 0.45)
put(tap, biq(burst(0.02, 0.004), "bandpass", 900, 2.0), 0.002, 0.25)           # a little body under it
# save(tap, "tap", 0.7)  — the player's recording is used instead

# a page turned
page = np.zeros(int(SR * 0.4))
put(page, biq(burst(0.01, 0.002), "bandpass", 2600, 1.2), 0.0, 0.5)            # the corner caught
n = int(SR * 0.12); t = np.arange(n) / SR
crackle = (rng.random(n) * 2 - 1) * (rng.random(n) < 0.18) * 1.0 + (rng.random(n) * 2 - 1) * 0.25
shape = np.sin(np.pi * t / t[-1]) ** 0.7
put(page, biq(biq(crackle * shape, "bandpass", 2600, 0.9), "highpass", 1000, 0.7), 0.06, 0.55)  # the rustle across
put(page, biq(burst(0.008, 0.0015), "bandpass", 2900, 1.5), 0.19, 0.45)        # a tick at the fold
put(page, biq(burst(0.03, 0.006), "bandpass", 2100, 0.9), 0.275, 1.0)          # the page lies down
put(page, biq(burst(0.04, 0.01), "lowpass", 700, 0.7), 0.275, 0.35)
# save(page, "page", 0.65)  — the player's recording is used instead
print("ok")
