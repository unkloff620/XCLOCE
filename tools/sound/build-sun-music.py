"""
Музыка финального боя с Солнцем — в стиле остальной музыки игры (блатной галоп: гитара «ум-ца-ца», щипковый бас,
бочка на каждую долю, малый на слабые, бубен, аккордеон; см. build-battle-music.py), но мрачнее и «финальнее».
160 BPM, 2/4, ре гармонический минор с фригийским ми-бемоль (Eb мажор как «неаполитанский» аккорд — тревога).
Сверху: тяжёлые удары (большой барабан) на сильные доли, колокол на начало фраз, низкий мужской хор под аккордеоном,
дроби малого перед новой фразой.
Форма: вступление 8 тактов (медленно: тремоло аккордеона, колокол, удары) → раунд A (галоп + рифф) →
раунд B (тема аккордеона, удвоена октавой ниже) → раунд C (кульминация: тема + хор + колокола).
Пишет WAV в путь из аргумента (по умолчанию sun.wav).
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
rng = np.random.default_rng(13)
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
def reed(f, dur, vol=0.18, trem=0.0):
    t = np.arange(int(SR*dur))/SR
    vib = 1 + 0.004*np.sin(2*np.pi*6.2*t)
    s = np.zeros_like(t)
    for det in (1.0, 2**(10/1200), 2**(-8/1200)):
        ph = np.cumsum(2*np.pi*f*det*vib/SR)
        s += np.sign(np.sin(ph))*0.6 + 0.4*(2*((ph/(2*np.pi)) % 1) - 1)
    env = np.minimum(1, t/0.015) * np.minimum(1, (dur - t)/0.03).clip(0)
    if trem: env = env * (1 - trem*0.5*(1 + np.sin(2*np.pi*9*t)))   # bellows shake
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
def boom(vol=1.0):            # the big drum: a low pitch drop with a skin slap
    n = int(SR*1.2); t = np.arange(n)/SR
    ph = np.cumsum(2*np.pi*(62*(0.6 + 0.4*np.exp(-t/0.06)))/SR)
    body = np.sin(ph)*np.exp(-t/0.45)
    skin = lp(rng.random(n)*2-1, 700, 2)*np.exp(-t/0.025)*0.5
    return np.tanh(2.0*(body + skin))*vol
def bell(m, vol=0.2):         # a church bell: inharmonic partials
    n = int(SR*4); t = np.arange(n)/SR; f = hz(m)
    parts = [(0.5, 1.0, 3.0), (1.0, 0.8, 2.2), (1.19, 0.5, 1.7), (1.56, 0.35, 1.3), (2.0, 0.3, 1.0), (2.74, 0.2, 0.7)]
    return sum(a*np.sin(2*np.pi*f*r*t)*np.exp(-t/d) for r, a, d in parts)*np.minimum(1, t/0.003)*vol
def choir(notes, dur, vol=0.1):   # low men's choir «ooh/aah»: saws through vowel formants
    n = int(SR*dur); t = np.arange(n)/SR
    vib = 1 + 0.0035*np.sin(2*np.pi*5*t)
    s = np.zeros(n)
    for m in notes:
        for k in (1, 1.004, 0.996, 1.007):
            ph = np.cumsum(hz(m)*k*vib/SR); s += 2*(ph % 1) - 1
    s = bp(s, 450, 700, 2) + 0.6*bp(s, 900, 1150, 2) + 0.2*bp(s, 2300, 2700, 2)
    e = np.minimum(1, t/0.6)*np.minimum(1, (dur - t)/0.5).clip(0)
    return s*e*vol/len(notes)

BPM = 160; beat = 60/BPM; q = beat/4                      # q = a 16th; a bar = 2 beats
CH = {  # bass root, bass fifth, strum notes (guitar voicing)
    "Dm": (38, 45, [50, 53, 57, 62]), "Gm": (43, 38, [55, 58, 62, 67]), "A7": (45, 40, [49, 52, 55, 57]),
    "Bb": (46, 41, [50, 53, 58, 62]), "Eb": (39, 46, [51, 55, 58, 63]),
}
PROG = ["Dm", "Dm", "Eb", "Dm", "Gm", "Gm", "Dm", "Dm", "Bb", "Eb", "Dm", "A7", "Gm", "A7", "Dm", "A7"]
RIFF = {   # accordion, low and creeping: 16ths over each chord
    "Dm": [62, None, 61, 62, 65, None, 62, 57],
    "Eb": [63, None, 62, 63, 67, None, 63, 58],
    "Gm": [67, None, 66, 67, 70, None, 67, 62],
    "Bb": [65, None, 62, 65, 70, None, 65, 62],
    "A7": [61, None, 57, 61, 64, None, 67, 61],
}
# the boss theme: (bar, 16th, note, length in 16ths) — original, D harmonic minor with Eb
LEAD = [(0,0,74,4),(0,4,73,2),(0,6,74,2),(1,0,69,8),
        (2,0,75,2),(2,2,74,2),(2,4,75,2),(2,6,79,2),(3,0,74,8),
        (4,0,79,2),(4,2,77,2),(4,4,75,2),(4,6,74,2),(5,0,70,6),(5,6,69,2),
        (6,0,74,2),(6,2,73,2),(6,4,74,2),(6,6,77,2),(7,0,74,8),
        (8,0,77,2),(8,2,74,2),(8,4,70,2),(8,6,74,2),(9,0,75,4),(9,4,79,4),
        (10,0,77,2),(10,2,74,2),(10,4,73,2),(10,6,74,2),(11,0,73,6),(11,6,69,2),
        (12,0,70,2),(12,2,74,2),(12,4,79,2),(12,6,74,2),(13,0,73,2),(13,2,76,2),(13,4,79,2),(13,6,81,2),
        (14,0,86,4),(14,4,81,2),(14,6,77,2),(15,0,76,2),(15,2,73,2),(15,4,69,4)]
CHOIR = {"Dm": [50, 57, 62], "Eb": [51, 58, 63], "Gm": [50, 55, 62], "Bb": [50, 53, 58], "A7": [49, 52, 57]}

bars = len(PROG); BAR = 2*beat; rnd = bars*BAR
INTRO = 8; intro = INTRO*BAR
total = intro + 3*rnd
mix = np.zeros(int(SR*(total + 4)))
kick = mixa(tone(110, 0.25, 0.07, 1.0, 0.35), lp(noise(0.03, 0.006, 0.4), 2000))
snare = mixa(bp(noise(0.18, 0.045, 0.9), 900, 5000), tone(200, 0.1, 0.03, 0.4))
tamb = hp(mixa(*[tone(f, 0.12, 0.03, 0.15) for f in (5200, 6900, 8300, 9800)], noise(0.08, 0.02, 0.25)), 4000)

# ---------- intro: slow and heavy — shaking accordion chords, bell, big drum on every bar, a snare roll in ----------
for i, ch in enumerate(["Dm", "Dm", "Eb", "Eb", "Dm", "Dm", "A7", "A7"]):
    t0 = i*BAR
    if i % 2 == 0:
        for n in CH[ch][2][:3]: put(mix, reed(hz(n - 12), BAR*2*0.97, .06, trem=0.8), t0)
        put(mix, pluck(hz(CH[ch][0]), 1.2, .3, .8), t0)
    put(mix, boom(0.35 + 0.05*i if i % 2 else 0.5 + 0.05*i), t0)
    if i in (0, 4): put(mix, bell(62, 0.22), t0)
for k in range(8):                                             # the roll into the gallop
    put(mix, snare*(0.25 + k*0.1), intro - BAR + k*q)

# ---------- three rounds of the gallop ----------
for r in range(3):
    off = intro + r*rnd
    for b, ch in enumerate(PROG):
        root, fifth, strum = CH[ch]; t0 = off + b*BAR
        # guitar gallop: bass on 1, its fifth on 2, short strums on the 16ths around the off-beats
        put(mix, pluck(hz(root), 0.5, .4, .65), t0)
        put(mix, pluck(hz(fifth), 0.5, .4, .5), t0 + beat)
        for at, v in ((2*q, .2), (3*q, .13), (6*q, .2), (7*q, .13)):
            for k, n in enumerate(strum): put(mix, pluck(hz(n), .22, .85, v, .985), t0 + at + k*0.007)
        put(mix, kick, t0); put(mix, kick, t0 + beat)
        put(mix, snare*0.8, t0 + 2*q); put(mix, snare, t0 + 6*q)
        for e in range(4): put(mix, tamb*(1.0 if e % 2 else 0.6), t0 + e*2*q)
        # the big drum on every other bar, every bar in the climax
        if b % 2 == 0 or r == 2: put(mix, boom(0.6 if r < 2 else 0.75), t0)
        if b % 4 == 3:                                         # a roll into each phrase
            for k in range(4): put(mix, snare*(0.45 + k*0.15), t0 + beat + k*q)
        if r == 0:
            for k, n in enumerate(RIFF[ch]):
                if n is not None: put(mix, reed(hz(n), q*0.9, .12), t0 + k*q)
        else:
            for (lb, st, n, ln) in LEAD:
                if lb != b: continue
                long = ln >= 6
                put(mix, reed(hz(n), ln*q*0.95, .19, trem=0.5 if long else 0), t0 + st*q)
                put(mix, reed(hz(n - 12), ln*q*0.95, .1), t0 + st*q)          # an octave below: heavier
                if r == 2: put(mix, reed(hz(n + 12), ln*q*0.95, .05), t0 + st*q)
            for at in (2*q, 6*q):
                for n in strum[:3]: put(mix, reed(hz(n), q*1.2, .035), t0 + at)
        # choir: under round B quietly, full in the climax; a bell on every phrase of the climax
        if r >= 1 and b % 2 == 0:
            put(mix, choir(CHOIR[ch], BAR*2, 0.06 if r == 1 else 0.13), t0)
        if r == 2 and b % 4 == 0:
            put(mix, bell(62 if b < 12 else 57, 0.18), t0)

# ---------- room + glue, as in the battle music ----------
rev = np.zeros_like(mix)
for d, g in ((0.023, .18), (0.041, .14), (0.067, .1), (0.11, .07)):
    s = int(d*SR); rev[s:] += mix[:-s]*g
mix = lp(mix + rev, 9000)
mix = np.tanh(mix/np.max(np.abs(mix))*1.7)/np.tanh(1.7)
end = int(SR*(total + 1.5))
mix = mix[:end]
mix[-int(SR*1.5):] *= np.linspace(1, 0, int(SR*1.5))
mix = mix/np.max(np.abs(mix))*0.88
wavfile.write(sys.argv[1] if len(sys.argv) > 1 else "sun.wav", SR, (mix*32767).astype(np.int16))
print("ok", round(end/SR, 1), "s")
