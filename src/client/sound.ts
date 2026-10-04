"use client";
/*
 * Game sounds, synthesized with Web Audio — no files to download, nothing to preload.
 * The audio context starts on the first touch (browsers and Telegram allow sound only after a gesture).
 * The mute switch is remembered on this device.
 */

export type Sfx = "tap" | "hit" | "crit" | "coin" | "buy" | "reward" | "chest" | "upgrade" | "levelup" | "error" | "win" | "step";

const MUTE_KEY = "xc2_mute";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMute();

function readMute(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* storage blocked: the switch lasts this session */
  }
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
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Call once: unlocks audio on the first touch anywhere. */
export function unlockAudioOnGesture() {
  if (typeof window === "undefined") return;
  const go = () => {
    audio();
    window.removeEventListener("pointerdown", go);
    window.removeEventListener("keydown", go);
  };
  window.addEventListener("pointerdown", go, { passive: true });
  window.addEventListener("keydown", go);
}

/** one oscillator note with a quick attack and an exponential tail */
function tone(a: AudioContext, freq: number, at: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number } = {}) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, at);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), at + dur);
  const v = opts.vol ?? 0.3;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(v, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** a burst of filtered noise: impacts and whooshes */
function noise(a: AudioContext, at: number, dur: number, opts: { freq?: number; q?: number; vol?: number; type?: BiquadFilterType } = {}) {
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
  src.connect(f).connect(g).connect(master!);
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
      noise(a, t, 0.12 + p * 0.12, { freq: 900 + p * 900, vol: 0.45 + p * 0.3 });
      tone(a, 150 - p * 60, t, 0.16 + p * 0.14, { type: "sine", vol: 0.5, slide: 0.45 });
      break;
    }
    case "crit":
      noise(a, t, 0.25, { freq: 1800, vol: 0.7 });
      tone(a, 110, t, 0.3, { type: "sine", vol: 0.6, slide: 0.4 });
      tone(a, 1320, t + 0.03, 0.25, { type: "square", vol: 0.08 });
      tone(a, 1760, t + 0.09, 0.3, { type: "square", vol: 0.07 });
      break;
    case "coin":
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
      [784, 988, 1175, 1568].forEach((f, i) => tone(a, f, t + i * 0.07, 0.22, { type: "triangle", vol: 0.16 }));
      break;
    case "upgrade":
      tone(a, 330, t, 0.35, { type: "sawtooth", vol: 0.06, slide: 2.2 });
      [659, 880, 1319].forEach((f, i) => tone(a, f, t + 0.12 + i * 0.06, 0.25, { type: "triangle", vol: 0.14 }));
      break;
    case "chest":
      noise(a, t, 0.35, { freq: 2400, type: "bandpass", q: 1.4, vol: 0.35 });
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(a, f, t + 0.18 + i * 0.06, 0.3, { type: "triangle", vol: 0.12 }));
      break;
    case "win":
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
    case "error":
      tone(a, 220, t, 0.12, { type: "square", vol: 0.07 });
      tone(a, 165, t + 0.11, 0.18, { type: "square", vol: 0.07 });
      break;
  }
}

/** What a successful action sounds like (attacks and slots play their own). */
export const ACTION_SFX: Partial<Record<string, Sfx>> = {
  buy: "buy", exchange: "buy", room_buy: "upgrade", equipment_upgrade: "upgrade", pc_upgrade: "upgrade",
  daily_claim: "reward", quest_claim: "reward", location_claim: "reward", fight_claim: "win", quest_chest: "chest",
  yard_pick: "coin", task: "step", sell: "coin", use: "coin",
  fight_start: "tap", equip: "tap", unequip: "tap", room_set: "tap", decor_set: "tap", look_set: "tap", notify_set: "tap",
};
