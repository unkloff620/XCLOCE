"""
Item sounds: a hit sound per weapon (w-*) and a pick-up sound per yard find (y-*), all synthesized.
  fist — a movie punch: whoosh, slap and a deep body thud
  mouse — a plastic mouse: whoosh, a hollow plastic knock and a click
  keyboard — plastic: whoosh, a clatter of keys and the case knocking
  red-candle — fire: a «fwoom» of flame with crackles
  gpu — metal: a heavy clang of the cooler shroud, a ring, the fans whining down
  rug-pull-gun — a gunshot: the hammer click, the crack, the boom and its echo
Run from an empty folder: python3 tools/sound/build-item-sounds.py → out/*.wav; encode with
  for f in out/*.wav; do ffmpeg -i $f -ac 1 -b:a 64k public/assets/sound/$(basename ${f%.wav}).mp3; done
"""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter
SR = 44100
rng = np.random.default_rng(23)
def lp(x, f, o=2): b, a = butter(o, min(f, SR/2-100)/(SR/2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f/(SR/2), "high"); return lfilter(b, a, x)
def bp(x, lo, hi, o=2): b, a = butter(o, [lo/(SR/2), min(hi, SR/2-100)/(SR/2)], "band"); return lfilter(b, a, x)
def T(d): return np.arange(int(SR*d))/SR
def tone(f, d, decay, vol=1.0, slide=1.0):
    t = T(d); ph = np.cumsum(2*np.pi*f*(slide**(t/d))/SR)
    return np.sin(ph)*np.exp(-t/decay)*vol
def noise(d, decay, vol=1.0):
    t = T(d); return (rng.random(len(t))*2-1)*np.exp(-t/decay)*vol
def metal(d, partials, decay, vol):
    out = np.zeros(int(SR*d))
    for i, f in enumerate(partials): out += tone(f, d, decay*(1.2-i*0.1), 1/(1+i*0.45))
    return out*vol
def mix(n, *parts):
    """parts: (signal, start seconds)"""
    out = np.zeros(int(SR*n))
    for x, at in parts:
        i = int(at*SR); j = min(len(out), i+len(x)); out[i:j] += x[:j-i]
    return out
def whoosh(d=0.14, lo=300, hi=2200, vol=0.35):
    """air: band noise sweeping up, swelling in and out"""
    t = T(d); n = rng.random(len(t))*2-1
    out = np.zeros_like(n); seg = 256
    for k in range(0, len(n), seg):
        f = lo*(hi/lo)**(k/len(n)); out[k:k+seg] = bp(n[max(0,k-512):k+seg], f*0.7, f*1.4)[-len(n[k:k+seg]):]
    return out*np.sin(np.pi*t/d)**2*vol
def room(x, amt=0.25, ms=(17, 29, 43, 61)):
    y = x.copy()
    for k, m in enumerate(ms):
        s = int(SR*m/1000); y[s:] += x[:-s]*amt*(0.8**k)
    return y
S = {}
# ---------- weapons ----------
S["w-fist"] = room(mix(0.55,
    (whoosh(0.13, 250, 1600, 0.4), 0.0),
    (hp(noise(0.03, 0.006, 1.0), 1800), 0.12),                       # the slap
    (tone(95, 0.35, 0.09, 1.3, 0.4), 0.12),                          # the body thud
    (lp(noise(0.12, 0.03, 0.8), 700), 0.12)), 0.18)
S["w-mouse"] = room(mix(0.4,
    (whoosh(0.12, 400, 2500, 0.3), 0.0),
    (bp(noise(0.06, 0.015, 0.9), 1200, 4500), 0.11),                  # plastic knock
    (tone(820, 0.12, 0.03, 0.5), 0.11), (tone(1340, 0.08, 0.02, 0.3), 0.11),
    (hp(noise(0.012, 0.002, 0.7), 4000), 0.16)), 0.15)                # the button clicks
kb = [(whoosh(0.13, 350, 2400, 0.35), 0.0), (tone(420, 0.2, 0.05, 0.6), 0.12), (bp(noise(0.08, 0.02, 0.8), 800, 3500), 0.12)]
for k in range(14):                                                   # keys clattering off
    at = 0.13 + rng.uniform(0, 0.22); f = rng.uniform(2500, 5500)
    kb += [(bp(noise(0.02, 0.004, rng.uniform(0.3, 0.7)), f*0.7, f*1.3), at), (tone(rng.uniform(1100, 2200), 0.03, 0.008, 0.2), at)]
S["w-keyboard"] = room(mix(0.55, *kb), 0.15)
t = T(0.9); fl = rng.random(len(t))*2-1
fire = lp(fl, 1800)*np.minimum(1, t/0.06)*np.exp(-t/0.35)*1.1                # the flame «fwoom»
fire += tone(70, 0.9, 0.3, 0.5, 0.7)
crack = np.zeros_like(t)
for k in range(22):                                                   # crackles
    i = int(rng.uniform(0.05, 0.75)*SR); crack[i:i+60] += (rng.random(60)*2-1)*rng.uniform(0.3, 0.9)*np.exp(-np.arange(60)/12)
S["w-red-candle"] = room(mix(1.0, (whoosh(0.15, 300, 1800, 0.3), 0.0), (fire + hp(crack, 2000), 0.1)), 0.12)
fan_t = T(0.9); fan = np.sin(np.cumsum(2*np.pi*(260*np.exp(-fan_t*2.2)+40)/SR))*(1+0.6*np.sin(2*np.pi*(60*np.exp(-fan_t*2))*fan_t))*np.exp(-fan_t/0.5)*0.12
S["w-gpu"] = room(mix(1.2,
    (whoosh(0.15, 250, 1500, 0.4), 0.0),
    (tone(80, 0.4, 0.1, 1.2, 0.5), 0.14),                             # heavy thud
    (metal(1.0, [347, 811, 1290, 1893, 2711, 3460], 0.22, 0.55), 0.14),   # the shroud rings
    (hp(noise(0.04, 0.008, 0.8), 2500), 0.14),
    (lp(fan, 3000), 0.2)), 0.22)
shot = mix(1.6,
    (hp(noise(0.015, 0.003, 0.5), 3000), 0.0), (tone(2600, 0.02, 0.004, 0.3), 0.0),   # the hammer click
    (hp(noise(0.02, 0.003, 1.6), 1500), 0.12),                                          # the crack
    (lp(noise(0.25, 0.05, 1.4), 2500), 0.12),                                          # the blast
    (tone(62, 0.6, 0.16, 1.6, 0.6), 0.12),                                             # the boom
    (lp(noise(1.2, 0.35, 0.35), 900), 0.2))                                            # the echo
S["w-rug-pull-gun"] = room(np.tanh(shot*1.4), 0.3, (37, 71, 113, 167))
# ---------- yard finds ----------
def ping(f, d=0.3, dec=0.07, vol=0.4): return metal(d, [f, f*1.5, f*2.03], dec, vol)
S["y-coins"] = room(mix(0.6, *[(ping(rng.uniform(2600, 4200), 0.3, 0.06, 0.45), 0.05+k*rng.uniform(0.05, 0.09)) for k in range(4)]), 0.12)
t = T(0.3); rip = hp(rng.random(len(t))*2-1, 1500)*(0.5+0.5*np.sign(np.sin(2*np.pi*90*t*(1+t*3))))*np.minimum(1, t/0.02)*np.exp(-t/0.12)*0.6
S["y-sticker-hodl"] = mix(0.35, (rip, 0.0))
S["y-bottle-cap"] = room(mix(0.6, (ping(4300, 0.25, 0.05, 0.5), 0.0), (ping(4500, 0.2, 0.04, 0.3), 0.12), (ping(4700, 0.15, 0.03, 0.18), 0.2), (ping(4800, 0.1, 0.02, 0.1), 0.25)), 0.1)
t = T(1.0); spin_f = 30*np.exp(-t*1.4)+4
spin = np.sin(np.cumsum(2*np.pi*(900+300*np.exp(-t*2))/SR))*(0.5+0.5*np.sin(np.cumsum(2*np.pi*spin_f/SR)))*np.minimum(1, t/0.05)*np.exp(-t/0.5)*0.25
spin += bp(rng.random(len(t))*2-1, 2000, 6000)*0.06*np.exp(-t/0.5)
S["y-spinner"] = spin
t = T(0.45); rustle = bp(rng.random(len(t))*2-1, 1500, 7000)*(0.4+0.6*(rng.random(len(t)) > 0.97).astype(float))
S["y-flyer-passive"] = lp(rustle, 8000)*np.sin(np.pi*t/0.45)*0.5
t = T(0.7); fizz = hp(rng.random(len(t))*2-1, 3500)*np.exp(-t/0.18)*0.55          # «пшш»
S["y-energy-drink"] = room(mix(0.8, (ping(1900, 0.12, 0.02, 0.35), 0.0), (hp(noise(0.02, 0.004, 0.8), 2500), 0.12), (fizz, 0.13)), 0.1)
t = T(0.15); flap = lp(rng.random(len(t))*2-1, 1200)*np.exp(-t/0.03)*0.8
S["y-lost-wallet"] = room(mix(0.6, (flap, 0.0), *[(ping(rng.uniform(2800, 3800), 0.25, 0.05, 0.3), 0.09+k*0.06) for k in range(3)]), 0.12)
S["y-red-candle"] = S["w-red-candle"][int(0.1*SR):int(0.75*SR)]*0.7
S["y-keyboard"] = mix(0.35, *[(bp(noise(0.02, 0.004, 0.6), 2500, 6000), k*0.05) for k in range(4)], (tone(500, 0.12, 0.03, 0.4), 0.0))
os.makedirs("out", exist_ok=True)
for k, x in S.items():
    x = x/np.max(np.abs(x))*0.9
    fade = min(len(x), int(0.02*SR)); x[-fade:] *= np.linspace(1, 0, fade)
    wavfile.write(f"out/{k}.wav", SR, (x*32767).astype(np.int16))
# a listening demo: all of them in a row
demo = np.concatenate([np.concatenate([S[k]/np.max(np.abs(S[k]))*0.85, np.zeros(int(SR*0.45))]) for k in S])
wavfile.write("demo.wav", SR, (demo*32767).astype(np.int16))
print(len(S), "sounds:", ", ".join(S))
