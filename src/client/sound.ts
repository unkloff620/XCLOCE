"use client";
/*
 * Game sounds. The «prison» set (chanson background music, the cell door, keys, punches, coins, a match, the bars)
 * is in public/assets/sound (made by tools/sound/build-prison-sounds.py) and loads after the first touch; until a
 * file is in — or if it fails — the synthesized Web Audio version plays instead. Boss fights have their own track:
 * a fast blatnoy gallop (public/assets/sound/battle.mp3, tools/sound/build-battle-music.py).
 * The audio context starts on the first touch (browsers and Telegram allow sound only after a gesture).
 * The mute switch is remembered on this device.
 */

export type Sfx = "tap" | "hit" | "crit" | "coin" | "buy" | "reward" | "chest" | "upgrade" | "levelup" | "error" | "win" | "step" | "door" | "locked";

const MUTE_KEY = "xc2_mute";
const MUSIC_KEY = "xc2_music";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let musicLp: BiquadFilterNode | null = null;
let muted = readFlag(MUTE_KEY, false);
// music is on by default; it starts with the first touch
let musicOn = !readFlag(MUSIC_KEY + "_off", false);

function readFlag(key: string, dflt: boolean): boolean {
  try {
    if (typeof localStorage === "undefined") return dflt;
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === "1";
  } catch {
    return dflt;
  }
}
function writeFlag(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* storage blocked: the switch lasts this session */
  }
}

/** sound switches changed → the HUD buttons re-render */
const listeners = new Set<() => void>();
export function onSoundChange(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
const changed = () => listeners.forEach((f) => f());

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  writeFlag(MUTE_KEY, v);
  changed();
}
export const isMusicOn = () => musicOn;
export function setMusic(v: boolean) {
  musicOn = v;
  writeFlag(MUSIC_KEY + "_off", !v);
  if (v) startMusic();
  else stopMusic();
  changed();
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    // music: its own quiet bus through a soft low-pass, so it stays in the background
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    musicLp = lp;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(lp).connect(ctx.destination);
    loadSamples(ctx);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Call once: unlocks audio on the first touch anywhere. */
export function unlockAudioOnGesture() {
  if (typeof window === "undefined") return;
  const go = () => {
    audio();
    if (musicOn) startMusic();
    window.removeEventListener("pointerdown", go);
    window.removeEventListener("keydown", go);
  };
  window.addEventListener("pointerdown", go, { passive: true });
  window.addEventListener("keydown", go);
  // the game in the background (Telegram minimised, another tab): silence
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.visibilityState === "hidden") void ctx.suspend().catch(() => undefined);
    else void ctx.resume().catch(() => undefined);
  });
}

/* ---------------- recorded sounds ---------------- */
const SAMPLE_URLS = {
  music: "/assets/sound/chanson.mp3",
  battle: "/assets/sound/battle.mp3",
  door: "/assets/sound/door.mp3",
  keys: "/assets/sound/keys.mp3",
  punch: "/assets/sound/punch.mp3",
  crit: "/assets/sound/crit.mp3",
  coin: "/assets/sound/coin.mp3",
  match: "/assets/sound/match.mp3",
  bars: "/assets/sound/bars.mp3",
} as Record<string, string>;
/** a hit sound per weapon (w-<weapon id>) and a pick-up sound per yard find (y-<drop id>): tools/sound/build-item-sounds.py */
const WEAPON_SOUNDS = ["fist", "mouse", "keyboard", "red-candle", "gpu", "rug-pull-gun"];
const YARD_SOUNDS = ["coins", "sticker-hodl", "bottle-cap", "spinner", "flyer-passive", "energy-drink", "lost-wallet", "red-candle", "keyboard"];
for (const id of WEAPON_SOUNDS) SAMPLE_URLS[`w-${id}`] = `/assets/sound/w-${id}.mp3`;
for (const id of YARD_SOUNDS) SAMPLE_URLS[`y-${id}`] = `/assets/sound/y-${id}.mp3`;
type SampleId = string;
/**
 * The music files: each is one period with a bit of its end before it and of its start after it, so the loop is
 * exactly that period whatever padding the decoder adds. `gain` brings each to the level of the rest of the sound.
 * calm — chanson (tools/sound/build-prison-sounds.py); battle — the blatnoy gallop of boss fights (build-battle-music.py).
 */
const MUSIC_FILES = {
  calm: { id: "music", start: 0.5, end: 37.42308390022676, gain: 0.17 },
  battle: { id: "battle", start: 0.5, end: 25.76315192743764, gain: 0.14 },
} as const;
const buffers: Partial<Record<SampleId, AudioBuffer>> = {};
let samplesLoading = false;

function decode(a: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  // old Safari only has the callback form
  return new Promise((ok, fail) => {
    const p = a.decodeAudioData(data, ok, fail);
    if (p && typeof p.then === "function") p.then(ok, fail);
  });
}
function loadSamples(a: AudioContext) {
  if (samplesLoading) return;
  samplesLoading = true;
  for (const [id, url] of Object.entries(SAMPLE_URLS) as [SampleId, string][]) {
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((d) => decode(a, d))
      .then((b) => { buffers[id] = b; })
      .catch(() => undefined); // the synthesized sound stays
  }
}
/** plays a recorded sound; false when it is not loaded (the caller falls back to the synthesized one) */
function sample(a: AudioContext, id: SampleId, at: number, vol = 0.5, rate = 1): boolean {
  const b = buffers[id];
  if (!b || !master) return false;
  const src = a.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start(at);
  return true;
}

/** one oscillator note with a quick attack and an exponential tail */
function tone(a: AudioContext, freq: number, at: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; out?: AudioNode; attack?: number } = {}) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, at);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), at + dur);
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(v, at + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(opts.out ?? master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** a burst of filtered noise: impacts and whooshes */
function noise(a: AudioContext, at: number, dur: number, opts: { freq?: number; q?: number; vol?: number; type?: BiquadFilterType; out?: AudioNode } = {}) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = opts.type ?? "lowpass";
  f.frequency.value = opts.freq ?? 1200;
  f.Q.value = opts.q ?? 0.8;
  const g = a.createGain();
  g.gain.value = opts.vol ?? 0.5;
  src.connect(f).connect(g).connect(opts.out ?? master!);
  src.start(at);
}

/** Plays a sound. `power` 0..1 makes hits heavier. */
export function sfx(name: Sfx, power = 0.5) {
  if (muted) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.005;
  switch (name) {
    case "tap":
      tone(a, 880, t, 0.05, { type: "triangle", vol: 0.12 });
      break;
    case "step":
      tone(a, 520, t, 0.07, { type: "triangle", vol: 0.16 });
      tone(a, 780, t + 0.05, 0.08, { type: "triangle", vol: 0.14 });
      break;
    case "hit": {
      const p = Math.max(0, Math.min(1, power));
      // a dull punch: heavier weapons are lower and louder
      if (sample(a, "punch", t, 0.45 + p * 0.35, 1.12 - p * 0.3)) break;
      noise(a, t, 0.12 + p * 0.12, { freq: 900 + p * 900, vol: 0.45 + p * 0.3 });
      tone(a, 150 - p * 60, t, 0.16 + p * 0.14, { type: "sine", vol: 0.5, slide: 0.45 });
      break;
    }
    case "crit":
      if (sample(a, "crit", t, 0.75)) break;
      noise(a, t, 0.25, { freq: 1800, vol: 0.7 });
      tone(a, 110, t, 0.3, { type: "sine", vol: 0.6, slide: 0.4 });
      tone(a, 1320, t + 0.03, 0.25, { type: "square", vol: 0.08 });
      tone(a, 1760, t + 0.09, 0.3, { type: "square", vol: 0.07 });
      break;
    case "coin":
      if (sample(a, "coin", t, 0.4)) break;
      tone(a, 1319, t, 0.07, { type: "square", vol: 0.09 });
      tone(a, 1976, t + 0.06, 0.18, { type: "square", vol: 0.09 });
      break;
    case "buy":
      noise(a, t, 0.05, { freq: 3000, type: "highpass", vol: 0.25 });
      tone(a, 1047, t + 0.03, 0.08, { type: "square", vol: 0.08 });
      tone(a, 1568, t + 0.1, 0.1, { type: "square", vol: 0.08 });
      tone(a, 2093, t + 0.17, 0.25, { type: "triangle", vol: 0.12 });
      break;
    case "reward":
      // a match struck — «закурил» — over a short chime
      sample(a, "match", t, 0.45);
      [784, 988, 1175, 1568].forEach((f, i) => tone(a, f, t + i * 0.07, 0.22, { type: "triangle", vol: 0.16 }));
      break;
    case "upgrade":
      tone(a, 330, t, 0.35, { type: "sawtooth", vol: 0.06, slide: 2.2 });
      [659, 880, 1319].forEach((f, i) => tone(a, f, t + 0.12 + i * 0.06, 0.25, { type: "triangle", vol: 0.14 }));
      break;
    case "chest":
      if (sample(a, "keys", t, 0.5)) {
        [1047, 1568, 2093].forEach((f, i) => tone(a, f, t + 0.25 + i * 0.07, 0.25, { type: "triangle", vol: 0.08 }));
        break;
      }
      noise(a, t, 0.35, { freq: 2400, type: "bandpass", q: 1.4, vol: 0.35 });
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(a, f, t + 0.18 + i * 0.06, 0.3, { type: "triangle", vol: 0.12 }));
      break;
    case "win":
      // the pass: a bunch of keys, then the fanfare
      sample(a, "keys", t, 0.45);
      [523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.12, 0.2, { type: "square", vol: 0.08 }));
      tone(a, 1047, t + 0.36, 0.6, { type: "square", vol: 0.1 });
      tone(a, 784, t + 0.36, 0.6, { type: "triangle", vol: 0.12 });
      break;
    case "levelup": {
      // a short fanfare: rising arpeggio, then a held major chord with a sparkle on top
      [392, 523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.09, 0.25, { type: "square", vol: 0.08 }));
      [523, 659, 784, 1047].forEach((f) => tone(a, f, t + 0.4, 1.1, { type: "triangle", vol: 0.13 }));
      tone(a, 131, t + 0.4, 0.9, { type: "sine", vol: 0.35 });
      noise(a, t + 0.38, 0.5, { freq: 6000, type: "highpass", vol: 0.15 });
      [2093, 2637, 3136].forEach((f, i) => tone(a, f, t + 0.55 + i * 0.08, 0.3, { type: "sine", vol: 0.06 }));
      break;
    }
    case "door":
      // the cell door: a creaking hinge and a heavy clank
      if (sample(a, "door", t, 0.6)) break;
      // a rusty creak sliding up, then the heavy door hits the stop
      tone(a, 140, t, 0.75, { type: "sawtooth", vol: 0.05, slide: 1.9, attack: 0.08 });
      tone(a, 210, t + 0.1, 0.6, { type: "sawtooth", vol: 0.03, slide: 1.6, attack: 0.1 });
      noise(a, t, 0.7, { freq: 900, type: "bandpass", q: 6, vol: 0.12 });
      noise(a, t + 0.78, 0.2, { freq: 500, vol: 0.5 });
      tone(a, 75, t + 0.78, 0.3, { type: "sine", vol: 0.45, slide: 0.6 });
      break;
    case "locked":
      // a mug along the bars
      if (sample(a, "bars", t, 0.45)) break;
      [0, 0.09, 0.18].forEach((d) => noise(a, t + d, 0.06, { freq: 2600, type: "bandpass", q: 3, vol: 0.4 }));
      tone(a, 180, t + 0.02, 0.18, { type: "square", vol: 0.05 });
      break;
    case "error":
      if (sample(a, "bars", t, 0.25, 1.15)) break;
      tone(a, 220, t, 0.12, { type: "square", vol: 0.07 });
      tone(a, 165, t + 0.11, 0.18, { type: "square", vol: 0.07 });
      break;
  }
}

/** The hit of this weapon (its own sound: a movie punch, plastic, fire, metal, a gunshot); `power` 0..1 for the fallback. */
export function weaponSfx(weaponId: string, power = 0.5) {
  if (muted) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  if (!sample(a, `w-${weaponId}`, a.currentTime + 0.005, weaponId === "rug-pull-gun" ? 0.6 : 0.55)) sfx("hit", power);
}

/** Picking a thing up in the yard: coins jingle, a sticker peels, a spinner whirs, a can hisses… */
export function yardSfx(dropId: string) {
  if (muted) return;
  const a = audio();
  if (!a || a.state !== "running") return;
  if (!sample(a, `y-${dropId}`, a.currentTime + 0.005, 0.5)) sfx("coin");
}

/** What a successful action sounds like (attacks and slots play their own). */
export const ACTION_SFX: Partial<Record<string, Sfx>> = {
  buy: "buy", exchange: "buy", room_buy: "upgrade", equipment_upgrade: "upgrade", talent_up: "upgrade", talent_reset: "chest",
  daily_claim: "reward", quest_claim: "reward", location_claim: "reward", fight_claim: "win", quest_chest: "chest",
  yard_pick: "coin", task: "step", sell: "coin", use: "coin",
  fight_start: "tap", equip: "tap", unequip: "tap", room_set: "tap", decor_set: "tap", look_set: "tap", notify_set: "tap",
};

/* ---------------- background music ----------------
 * A calm lo-fi loop played by a tiny sequencer: 8 bars of Am – F – C – G (twice, the second time with a melody),
 * soft pad chords, a plucked arpeggio, a round bass and a light beat. Scheduled a little ahead with the audio clock.
 */
const BPM = 84;
const STEP = 60 / BPM / 4; // a 16th note
const N = (semi: number) => 220 * 2 ** (semi / 12); // semitones from A3
// chord tones (semitones from A3) for each bar of 4
const CHORDS = [
  [0, 3, 7, 12], // Am
  [-4, 0, 3, 8], // F
  [3, 7, 10, 15], // C
  [-2, 2, 5, 10], // G
];
const BASS = [-12, -16, -9, -14];
// melody for the second half (bar, step, semitone, length in steps); rests elsewhere
const MELODY: [number, number, number, number][] = [
  [0, 0, 12, 3], [0, 4, 15, 2], [0, 6, 14, 2], [0, 8, 12, 6],
  [1, 0, 8, 3], [1, 4, 12, 2], [1, 6, 10, 2], [1, 8, 8, 6],
  [2, 0, 7, 3], [2, 4, 10, 2], [2, 6, 12, 2], [2, 8, 15, 6],
  [3, 0, 14, 4], [3, 6, 12, 2], [3, 8, 10, 4], [3, 12, 7, 4],
];
/* ---------------- battle music ----------------
 * In the boss room while a fight is on: 140 BPM, D minor, 8 bars of Dm – B♭ – C – A. A driving 8th-note saw bass
 * through a low-pass, four-on-the-floor kick, snare on 2 and 4, 16th hats, power-chord stabs on the off-beats and a
 * menacing lead in bars 5–8; bar 8 ends with a drum fill back into the loop.
 */
const B_BPM = 140;
const B_STEP = 60 / B_BPM / 4;
const D = (semi: number) => 146.83 * 2 ** (semi / 12); // semitones from D3
const B_ROOTS = [0, -4, -2, -5]; // Dm, B♭, C, A
const B_THIRD = [3, 4, 4, 4]; // minor third on Dm, major on the rest (A major pulls back to Dm)
const B_LEAD: [number, number, number, number][] = [
  [0, 0, 12, 2], [0, 2, 15, 2], [0, 4, 17, 4], [0, 10, 15, 2], [0, 12, 12, 4],
  [1, 0, 10, 2], [1, 2, 12, 2], [1, 4, 14, 4], [1, 10, 12, 2], [1, 12, 10, 4],
  [2, 0, 12, 2], [2, 2, 14, 2], [2, 4, 16, 4], [2, 10, 19, 2], [2, 12, 17, 4],
  [3, 0, 16, 4], [3, 4, 13, 4], [3, 8, 16, 2], [3, 10, 19, 2], [3, 12, 21, 4],
];

/** a saw note through its own low-pass (the battle bass), the filter opening on the attack */
function sawBass(a: AudioContext, freq: number, at: number, dur: number, out: AudioNode) {
  const o = a.createOscillator();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(freq, at);
  f.type = "lowpass";
  f.Q.value = 6;
  f.frequency.setValueAtTime(1400, at);
  f.frequency.exponentialRampToValueAtTime(220, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.16, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(f).connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function battleStep(a: AudioContext, s: number, at: number) {
  const out = musicBus!;
  const bar = Math.floor(s / 16) % 8;
  const inBar = s % 16;
  const root = B_ROOTS[bar % 4];
  const fill = bar === 7 && inBar >= 12;
  // bass: 8th notes, the octave jumping up on the off-beats
  if (inBar % 2 === 0) sawBass(a, D(root - 12 + (inBar % 4 === 2 ? 12 : 0)), at, B_STEP * 1.8, out);
  // kick on every beat
  if (inBar % 4 === 0 && !fill) tone(a, 120, at, 0.2, { type: "sine", vol: 0.42, slide: 0.35, out });
  // snare on 2 and 4 (and a roll in the fill)
  if ((inBar === 4 || inBar === 12) && !fill) {
    noise(a, at, 0.14, { freq: 2200, type: "bandpass", q: 0.9, vol: 0.32, out });
    tone(a, 190, at, 0.08, { type: "triangle", vol: 0.12, out });
  }
  if (fill) noise(a, at, 0.07, { freq: 1600 + (inBar - 12) * 500, type: "bandpass", q: 1, vol: 0.18 + (inBar - 12) * 0.06, out });
  // hats: 16ths, the off-beat ones louder
  noise(a, at, 0.03, { freq: 8000, type: "highpass", vol: inBar % 4 === 2 ? 0.08 : 0.035, out });
  // power-chord stabs (root + fifth + octave) on the "and" of 1 and 3
  if (inBar === 2 || inBar === 10) for (const n of [root, root + 7, root + 12]) tone(a, D(n), at, B_STEP * 1.5, { type: "square", vol: 0.028, out });
  // a held chord under it all, once per bar
  if (inBar === 0) for (const n of [root, root + B_THIRD[bar % 4], root + 7]) tone(a, D(n + 12), at, B_STEP * 16, { type: "sawtooth", vol: 0.012, attack: 0.2, out });
  // lead in bars 5–8
  if (bar >= 4) for (const [b, st, n, len] of B_LEAD) if (b === bar - 4 && st === inBar) tone(a, D(n), at, B_STEP * len, { type: "square", vol: 0.034, attack: 0.01, out });
  // crash at the top of the loop
  if (s === 0) noise(a, at, 1.2, { freq: 5000, type: "highpass", vol: 0.12, out });
}

export type MusicTrack = "calm" | "battle";
const TRACKS: Record<MusicTrack, { step: number; bars: number; play: (a: AudioContext, s: number, at: number) => void }> = {
  calm: { step: STEP, bars: 8, play: calmStep },
  battle: { step: B_STEP, bars: 8, play: battleStep },
};
let track: MusicTrack = "calm";

let seqTimer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;
let step = 0;

function calmStep(a: AudioContext, s: number, at: number) {
  const out = musicBus!;
  const bar = Math.floor(s / 16) % 8;
  const inBar = s % 16;
  const ch = CHORDS[bar % 4];
  // pad: the whole chord, slow attack, once per bar
  if (inBar === 0) for (const n of ch.slice(0, 3)) tone(a, N(n), at, STEP * 16, { type: "triangle", vol: 0.05, attack: 0.25, out });
  // bass on 1 and the "and" of 2
  if (inBar === 0 || inBar === 6 || inBar === 10) tone(a, N(BASS[bar % 4]), at, STEP * (inBar === 0 ? 5 : 3), { type: "sine", vol: 0.22, out });
  // plucked arpeggio, every other 16th
  if (inBar % 2 === 0) tone(a, N(ch[(inBar / 2) % 4] + 12), at, STEP * 1.6, { type: "triangle", vol: 0.045, out });
  // beat: soft kick on 1 and 3, brushed hat on the off-beats, a snap on 2 and 4
  if (inBar === 0 || inBar === 8) tone(a, 95, at, 0.22, { type: "sine", vol: 0.3, slide: 0.5, out });
  if (inBar % 4 === 2) noise(a, at, 0.04, { freq: 7000, type: "highpass", vol: 0.06, out });
  if (inBar === 4 || inBar === 12) noise(a, at, 0.09, { freq: 1800, type: "bandpass", q: 1.2, vol: 0.12, out });
  // melody in bars 5–8
  if (bar >= 4) for (const [b, st, n, len] of MELODY) if (b === bar - 4 && st === inBar) tone(a, N(n + 12), at, STEP * len, { type: "square", vol: 0.025, attack: 0.02, out });
}

let fileSrc: AudioBufferSourceNode | null = null;
let fileTrack: MusicTrack | null = null;
/** the music file of this track, looped; the low-pass of the music bus is opened for it. false: not loaded (yet) */
function startFile(a: AudioContext, t: MusicTrack): boolean {
  if (fileSrc && fileTrack === t) return true;
  const f = MUSIC_FILES[t];
  const b = buffers[f.id];
  if (!b || !musicBus) return false;
  stopFile();
  const src = a.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.loopStart = f.start;
  src.loopEnd = Math.min(f.end, b.duration);
  const g = a.createGain();
  g.gain.value = f.gain;
  src.connect(g).connect(musicBus);
  musicLp?.frequency.setValueAtTime(14000, a.currentTime);
  src.start(a.currentTime + 0.05, f.start);
  fileSrc = src;
  fileTrack = t;
  return true;
}
function stopFile(at = 0) {
  if (!fileSrc) return;
  try { fileSrc.stop(at); } catch { /* already stopped */ }
  fileSrc = null;
  fileTrack = null;
  if (ctx) musicLp?.frequency.setValueAtTime(2600, Math.max(at, ctx.currentTime));
}

export function startMusic() {
  const a = audio();
  if (!a || !musicBus || seqTimer) return;
  musicBus.gain.cancelScheduledValues(a.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, a.currentTime);
  musicBus.gain.linearRampToValueAtTime(track === "battle" ? 0.45 : 0.5, a.currentTime + 2.5); // fade in
  nextAt = a.currentTime + 0.1;
  seqTimer = setInterval(() => {
    if (a.state !== "running" || switchTimer) return;
    // each track plays its music file once it has loaded; the synthesized loop plays until then
    if (startFile(a, track)) {
      nextAt = a.currentTime + 0.05;
      return;
    }
    if (fileTrack !== track) stopFile();
    // schedule everything due in the next 0.3 s
    while (nextAt < a.currentTime + 0.3) {
      const t = TRACKS[track];
      t.play(a, step, nextAt);
      step = (step + 1) % (16 * t.bars);
      nextAt += t.step;
    }
    // after a pause (suspended context) do not try to catch up
    if (nextAt < a.currentTime) nextAt = a.currentTime + 0.05;
  }, 100);
}

/**
 * Switches the background music (the boss room asks for "battle" while a fight is on, and back to "calm" when it
 * leaves). A quick fade out, the new track from its first bar, a fade in.
 */
let switchTimer: ReturnType<typeof setTimeout> | null = null;
export function setMusicTrack(t: MusicTrack) {
  if (t === track && !switchTimer) return;
  if (switchTimer) clearTimeout(switchTimer);
  switchTimer = null;
  const a = ctx;
  if (!a || !musicBus || !seqTimer) {
    // not playing yet: the next start uses it
    track = t;
    step = 0;
    return;
  }
  musicBus.gain.cancelScheduledValues(a.currentTime);
  musicBus.gain.setValueAtTime(musicBus.gain.value, a.currentTime);
  musicBus.gain.linearRampToValueAtTime(0, a.currentTime + 0.35);
  switchTimer = setTimeout(() => {
    switchTimer = null;
    stopFile();
    track = t;
    step = 0;
    if (!musicBus || !ctx) return;
    nextAt = ctx.currentTime + 0.05;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(t === "battle" ? 0.45 : 0.5, ctx.currentTime + (t === "battle" ? 0.6 : 2));
  }, 380);
}

export function stopMusic() {
  if (seqTimer) clearInterval(seqTimer);
  seqTimer = null;
  if (ctx) stopFile(ctx.currentTime + 0.45);
  if (ctx && musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
  }
}
