"""
Boss-fight music in the «prison» style: a fast blatnoy gallop. 152 BPM in 2/4, E minor:
Em – Am – B7 with a chromatic push, guitar «ум-ца-ца» strumming, a plucked bass, kick on every beat, a snare/clap
on the off-beats, a tambourine, and an accordion: a driving riff in the first round, the lead tune in the second.
Writes battle.wav (2 rounds + wrap-around tails) and loop.txt (loop start/end in seconds).
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
SR = 44100
rng = np.random.default_rng(11)
def lp(x, f, o=2): b, a = butter(o, f/(SR/2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f/(SR/2), "high"); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo/(SR/2), hi/(SR/2)], "band"); return lfilter(b, a, x)
def hz(n): return 440 * 2 ** ((n - 69) / 12)
def put(mix, x, at):
    i = int(at*SR); j = min(len(mix), i + len(x)); mix[i:j] += x[:j-i]
def pluck(f, dur, bright=0.5, vol=1.0, damp=0.994):
    n = int(SR*dur); p = max(2, int(SR/f))
    buf = lp(rng.random(p)*2-1, 1500 + 5000*bright, 1)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = damp*0.5*(buf[i % p] + buf[(i+1) % p])
    return out*vol
def reed(f, dur, vol=0.18):
    t = np.arange(int(SR*dur))/SR
    vib = 1 + 0.004*np.sin(2*np.pi*6.2*t)
    s = np.zeros_like(t)
    for det in (1.0, 2**(10/1200), 2**(-8/1200)):
        ph = np.cumsum(2*np.pi*f*det*vib/SR)
        s += np.sign(np.sin(ph))*0.6 + 0.4*(2*((ph/(2*np.pi)) % 1) - 1)
    env = np.minimum(1, t/0.015) * np.minimum(1, (dur - t)/0.03).clip(0)
    return lp(s, 3200, 2)*env*vol
def tone(f, dur, decay, vol=1.0, slide=1.0):
    t = np.arange(int(SR*dur))/SR
    ph = np.cumsum(2*np.pi*f*(slide**(t/dur))/SR)
    return np.sin(ph)*np.exp(-t/decay)*vol
def noise(dur, decay, vol=1.0):
    t = np.arange(int(SR*dur))/SR
    return (rng.random(len(t))*2-1)*np.exp(-t/decay)*vol
def mixa(*xs):
    n = max(len(x) for x in xs); out = np.zeros(n)
    for x in xs: out[:len(x)] += x
    return out

BPM = 152; beat = 60/BPM; q = beat/4                     # q = a 16th
CH = {  # bass root, bass fifth, strum notes (guitar voicing)
    "Em": (40, 47, [52, 55, 59, 64]), "Am": (45, 40, [57, 60, 64, 69]), "B7": (47, 42, [51, 54, 57, 59]),
    "C": (48, 43, [55, 60, 64, 67]), "D": (50, 45, [54, 57, 62, 66]),
}
PROG = ["Em", "Em", "Am", "Em", "B7", "B7", "Em", "Em", "Am", "D", "C", "Em", "Am", "B7", "Em", "B7"]  # 1 bar of 2/4 each
# accordion riff (round 1): 16ths over each chord, (bar -> notes per 16th, None = rest)
RIFF = {
    "Em": [76, None, 71, 74, 76, None, 79, 76],
    "Am": [76, None, 72, 76, 81, None, 79, 76],
    "B7": [75, None, 71, 75, 78, None, 75, 71],
    "C":  [76, None, 72, 76, 79, None, 76, 72],
    "D":  [78, None, 74, 78, 81, None, 78, 74],
}
# lead tune (round 2): (bar, 16th, note, length in 16ths) — original, E harmonic minor
LEAD = [(0,0,71,2),(0,2,76,2),(0,4,79,2),(0,6,78,2),(1,0,76,6),(1,6,75,2),
        (2,0,76,2),(2,2,81,2),(2,4,79,2),(2,6,77,2),(3,0,76,6),(3,6,71,2),
        (4,0,75,2),(4,2,78,2),(4,4,81,2),(4,6,78,2),(5,0,75,4),(5,4,71,4),
        (6,0,76,2),(6,2,75,1),(6,3,76,1),(6,4,79,2),(6,6,76,2),(7,0,71,8),
        (8,0,81,2),(8,2,79,2),(8,4,77,2),(8,6,76,2),(9,0,78,4),(9,4,81,4),
        (10,0,79,2),(10,2,76,2),(10,4,72,2),(10,6,76,2),(11,0,71,6),(11,6,71,2),
        (12,0,72,2),(12,2,76,2),(12,4,81,2),(12,6,76,2),(13,0,75,2),(13,2,78,2),(13,4,81,2),(13,6,83,2),
        (14,0,88,4),(14,4,83,2),(14,6,79,2),(15,0,78,2),(15,2,75,2),(15,4,71,4)]
bars = len(PROG); rnd = bars*2*beat; total = 2*rnd
mix = np.zeros(int(SR*(total + 3)))
kick = mixa(tone(115, 0.25, 0.07, 1.0, 0.35), lp(noise(0.03, 0.006, 0.4), 2000))
snare = mixa(bp(noise(0.18, 0.045, 0.9), 900, 5000), tone(210, 0.1, 0.03, 0.4))
tamb = hp(mixa(*[tone(f, 0.12, 0.03, 0.15) for f in (5200, 6900, 8300, 9800)], noise(0.08, 0.02, 0.25)), 4000)
for r in range(2):
    off = r*rnd
    for b, ch in enumerate(PROG):
        root, fifth, strum = CH[ch]; t0 = off + b*2*beat
        # guitar gallop: bass on 1, strum on «and», short strums on the 16ths before 2 and after it
        put(mix, pluck(hz(root), 0.5, .4, .6), t0)
        put(mix, pluck(hz(fifth), 0.5, .4, .5), t0 + beat)
        for at, v in ((2*q, .2), (3*q, .13), (6*q, .2), (7*q, .13)):
            for k, n in enumerate(strum): put(mix, pluck(hz(n), .22, .85, v, .985), t0 + at + k*0.007)
        # drums: kick on each beat, snare on the off-beats, tambourine on 8ths
        put(mix, kick, t0); put(mix, kick, t0 + beat)
        put(mix, snare*0.8, t0 + 2*q); put(mix, snare, t0 + 6*q)
        for e in range(4): put(mix, tamb*(1.0 if e % 2 else 0.6), t0 + e*2*q)
        if b == 15:                                              # a fill into the next round
            for k in range(4): put(mix, snare*(0.5 + k*0.15), t0 + beat + k*q)
        # accordion: riff in round 1 (from bar 2), lead + soft chord stabs in round 2
        if r == 0 and b >= 2:
            for k, n in enumerate(RIFF[ch]):
                if n is not None: put(mix, reed(hz(n), q*0.9, .12), t0 + k*q)
        if r == 1:
            for (lb, st, n, ln) in LEAD:
                if lb == b: put(mix, reed(hz(n), ln*q*0.95, .2), t0 + st*q)
            for at in (2*q, 6*q):
                for n in strum[:3]: put(mix, reed(hz(n), q*1.2, .04), t0 + at)
# room + glue
rev = np.zeros_like(mix)
for d, g in ((0.023, .18), (0.041, .14), (0.067, .1)):
    s = int(d*SR); rev[s:] += mix[:-s]*g
mix = lp(mix + rev, 9000)
mix = np.tanh(mix/np.max(np.abs(mix))*1.6)/np.tanh(1.6)        # a bit of drive
L = int(round(SR*total))
period = mix[:L].copy(); period[:len(mix)-L] += mix[L:]
period = period/np.max(np.abs(period))*0.85
pre, post = int(SR*0.5), int(SR*1.0)
out = np.concatenate([period[-pre:], period, period[:post]])
wavfile.write("battle.wav", SR, (out*32767).astype(np.int16))
demo = np.concatenate([period, period])                           # two loops for listening
wavfile.write("demo.wav", SR, (demo*32767).astype(np.int16))
open("loop.txt", "w").write(f"{pre/SR} {(pre+L)/SR}")
print("loop", round(total, 2), "s")
