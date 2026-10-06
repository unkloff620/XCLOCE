"""
The «prison» sound set (in the spirit of the old VK game, all original): chanson background music (nylon guitar
«ум-ца» on Am – Dm – E – Am with an accordion tune) and effects: the cell door, keys, punches, coins, a match, the bars.

Run from an empty folder:  python3 tools/sound/build-prison-sounds.py
then encode into the game (mono mp3):
  ffmpeg -i music.wav -ac 1 -b:a 96k public/assets/sound/chanson.mp3
  for k in door keys punch crit coin match bars; do ffmpeg -i out/$k.wav -ac 1 -b:a 64k public/assets/sound/$k.mp3; done
loop.txt holds the loop start/end of the music; they must match MUSIC_LOOP in src/client/sound.ts.
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
SR = 44100
rng = np.random.default_rng(7)
def lp(x, f, o=2): b, a = butter(o, f/(SR/2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f/(SR/2), "high"); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo/(SR/2), hi/(SR/2)], "band"); return lfilter(b, a, x)
def hz(n): return 440 * 2 ** ((n - 69) / 12)   # MIDI note → Hz

def pluck(f, dur, bright=0.5, vol=1.0):
    """nylon guitar string: Karplus–Strong"""
    n = int(SR*dur); p = max(2, int(SR/f))
    buf = (rng.random(p)*2-1)
    buf = lp(buf, 1500 + 4000*bright, 1)
    out = np.zeros(n); damp = 0.996
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = damp * 0.5 * (buf[i % p] + buf[(i+1) % p])
    return out * vol

def reed(f, dur, vol=0.18):
    """accordion: two detuned reeds (musette), bellows swell and a little vibrato"""
    t = np.arange(int(SR*dur))/SR
    vib = 1 + 0.003*np.sin(2*np.pi*5.5*t)
    s = np.zeros_like(t)
    for det in (1.0, 2**(9/1200), 2**(-7/1200)):
        ph = np.cumsum(2*np.pi*f*det*vib/SR)
        s += np.sign(np.sin(ph))*0.6 + 0.4*(2*((ph/(2*np.pi)) % 1) - 1)
    env = np.minimum(1, t/0.06) * np.minimum(1, (dur - t)/0.08).clip(0)
    swell = 0.85 + 0.15*np.sin(2*np.pi*0.7*t)
    return lp(s, 2600, 2) * env * swell * vol

def put(mix, x, at):
    i = int(at*SR); j = min(len(mix), i + len(x)); mix[i:j] += x[:j-i]

# ---------- music: блатной шансон, 2/4 «ум-ца», Am – Dm – E – Am ----------
BPM = 104; beat = 60/BPM
CH = {"Am": (45, [57, 60, 64], 52), "Dm": (50, [57, 62, 65], 45), "E": (40, [56, 59, 64], 47), "G": (43, [55, 59, 62], 50), "C": (48, [55, 60, 64], 43)}
PROG = ["Am", "Am", "Dm", "Am", "E", "E", "Am", "Am", "Dm", "G", "C", "Am", "Dm", "E", "Am", "Am"]   # one chord per 2/4 bar
# melody (bar, beat offset in beats, MIDI, length in beats) — an original tune in A harmonic minor
MEL = [(0,0,76,1),(0,1,76,.5),(0,1.5,74,.5),(1,0,72,1.5),(1,1.5,71,.5),(2,0,74,1),(2,1,77,1),(3,0,76,2),
       (4,0,75,.5),(4,.5,76,.5),(4,1,75,.5),(4,1.5,71,.5),(5,0,68,2),(6,0,69,1),(6,1,71,.5),(6,1.5,72,.5),(7,0,69,2),
       (8,0,74,1),(8,1,77,1),(9,0,79,1),(9,1,77,.5),(9,1.5,76,.5),(10,0,76,1),(10,1,72,1),(11,0,72,.5),(11,.5,71,.5),(11,1,69,1),
       (12,0,74,1),(12,1,72,.5),(12,1.5,71,.5),(13,0,71,1),(13,1,68,1),(14,0,69,2),(15,0,69,1.5)]
bars = len(PROG); total = bars*2*beat
mix = np.zeros(int(SR*(total*2 + 3)))
for loop in range(2):
    off = loop*total
    for b, ch in enumerate(PROG):
        root, chord, fifth = CH[ch]; t0 = off + b*2*beat
        put(mix, pluck(hz(root), 1.2, .35, .55), t0)                    # «ум»: bass on 1
        for k, n in enumerate(chord): put(mix, pluck(hz(n), .5, .7, .22), t0 + beat*.5 + k*0.012)   # «ца»: strum
        put(mix, pluck(hz(fifth), 1.0, .35, .45), t0 + beat)            # bass on 2 (the fifth)
        for k, n in enumerate(chord): put(mix, pluck(hz(n), .45, .7, .2), t0 + beat*1.5 + k*0.012)
        if loop == 1 or b >= 8:                                         # the accordion joins
            for (mb, mo, n, ln) in MEL:
                if mb == b: put(mix, reed(hz(n), ln*beat*0.95), t0 + mo*beat)
        if loop == 1 and b % 2 == 0:                                     # soft held chord under the 2nd round
            for n in chord: put(mix, reed(hz(n-12), 2*beat, .045), t0)
# a little room
rev = np.zeros_like(mix)
for d, g in ((0.031,.25),(0.047,.2),(0.071,.15),(0.113,.1)):
    s = int(d*SR); rev[s:] += mix[:-s]*g
mix = lp(mix + rev, 6000)
L = int(round(SR*total*2))
period = mix[:L].copy(); period[:len(mix)-L] += mix[L:]
period = period/np.max(np.abs(period))*0.8
# file = last 0.5 s + period + first 1 s: the game loops [0.5 s, 0.5 s + L], so encoder padding does not matter
pre, post = int(SR*0.5), int(SR*1.0)
music_file = np.concatenate([period[-pre:], period, period[:post]])
wavfile.write("music.wav", SR, (music_file*32767).astype(np.int16))
open("loop.txt", "w").write(f"{pre/SR} {(pre+L)/SR}")

# ---------- sound effects ----------
def tone(f, dur, decay, vol=1.0, slide=1.0):
    t = np.arange(int(SR*dur))/SR
    fr = f*(slide**(t/dur)); ph = np.cumsum(2*np.pi*fr/SR)
    return np.sin(ph)*np.exp(-t/decay)*vol
def noise(dur, decay, vol=1.0):
    t = np.arange(int(SR*dur))/SR
    return (rng.random(len(t))*2-1)*np.exp(-t/decay)*vol
def metal(dur, partials, decay, vol):
    s = sum(tone(f, dur, decay*(1.2 - i*0.12), 1/(1+i*0.5)) for i, f in enumerate(partials))
    return s*vol
def mixa(*xs):
    n = max(len(x) for x in xs); out = np.zeros(n)
    for x in xs: out[:len(x)] += x
    return out
sfx = {}
# железная дверь камеры: скрип петли, потом тяжёлый лязг о раму и звон металла
creak = np.zeros(int(SR*0.7)); t = np.arange(len(creak))/SR
for h in (1, 2.02, 3.1):
    creak += np.sin(np.cumsum(2*np.pi*(150+90*t+12*np.sin(2*np.pi*23*t))*h/SR))/h
creak = bp(creak*(np.minimum(1, t/0.1))*np.minimum(1,(0.7-t)/0.1), 200, 2500)*0.25
slam = mixa(lp(noise(0.25, 0.05, 1.0), 900)*1.1, tone(70, 0.4, 0.12, 0.9, 0.6))
ring = metal(1.6, [212, 517, 893, 1340, 1985, 2770], 0.35, 0.35)
door = np.zeros(int(SR*2.6)); put(door, creak, 0); put(door, slam, 0.72); put(door, ring, 0.72)
sfx["door"] = door
# связка ключей: много коротких звонких «динь»
keys = np.zeros(int(SR*0.9))
for k in range(14):
    f = rng.uniform(2400, 6200); put(keys, metal(0.25, [f, f*1.47, f*2.09], 0.05, 0.12), rng.uniform(0, 0.55))
sfx["keys"] = hp(keys, 1500)
# удар кулаком: глухой «тумп» по телу
sfx["punch"] = mixa(lp(noise(0.18, 0.03, 0.9), 1400), tone(120, 0.3, 0.07, 1.0, 0.35))
# тяжёлый удар (крит): удар + хруст + эхо камеры
crit = mixa(lp(noise(0.3, 0.05, 1.0), 2500), tone(95, 0.45, 0.1, 1.1, 0.3), hp(noise(0.08, 0.015, 0.6), 3000))
sfx["crit"] = crit
# монеты / папиросы в карман: два звонких «дзынь»
coin = np.zeros(int(SR*0.5)); put(coin, metal(0.4, [2637, 3951, 5274], 0.09, 0.4), 0); put(coin, metal(0.4, [3136, 4698, 6272], 0.08, 0.35), 0.09)
sfx["coin"] = coin
# чирк спички (награда): шорох, вспышка
strike = mixa(hp(noise(0.12, 0.03, 0.8), 2500), bp(noise(0.5, 0.2, 0.25), 300, 1500))
sfx["match"] = strike
# решётка: металлический удар кружкой по прутьям, три раза
bars_ = np.zeros(int(SR*1.2))
for k in range(3): put(bars_, mixa(metal(0.5, [640, 1520, 2380, 3460], 0.12, 0.45), lp(noise(0.05,0.01,0.5), 3000)), k*0.22)
sfx["bars"] = bars_
import os
os.makedirs("out", exist_ok=True)
for k, x in sfx.items():
    x = x/np.max(np.abs(x))*0.9
    wavfile.write(f"out/{k}.wav", SR, (x*32767).astype(np.int16))
order = ["door", "keys", "punch", "punch", "crit", "coin", "match", "bars"]
seq = np.zeros(int(SR*12)); at = 0.2
for k in order:
    x = sfx[k]; put(seq, x, at); at += len(x)/SR + 0.45
seq = seq[:int(SR*(at+0.3))]; seq = seq/np.max(np.abs(seq))*0.85
wavfile.write("sfx.wav", SR, (seq*32767).astype(np.int16))
print("ok", round(total*2,1), "s music,", round(at,1), "s sfx")
