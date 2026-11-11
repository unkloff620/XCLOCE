"use client";
/*
 * The pose engine of a boss rig — what makes him alive instead of wooden (screens.css keyframes only move him from
 * pose A to pose B). Every joint is a spring that pulls to its target angle: a heavy shoulder is slow, the elbow
 * quicker, the fist the lightest — it lags behind and overshoots by itself, so a blow goes through the arm as a wave.
 * A child joint is also dragged back by its parent's speed (the follow-through). The body answers the arms (it leans
 * into a blow, the head goes the other way), he never stands still (breath, weight, a nod), every blow has a wind-up
 * and a settle, and the blows come in a random order. A hit on him («hit» on the arena) is a push: the joints get a
 * kick of speed and swing back on their springs.
 *
 * Only the bosses with a spec in POSES (by the rig's base id); the others keep their CSS. The joints are the rig's own
 * groups (boss-rig.tsx) — the puppet (boss-puppet.ts) reads their transforms, so the soft meshes follow.
 */
import { useEffect, type RefObject } from "react";
import { frameGate } from "../eco.ts";

type J = "up" | "head" | "armL" | "lowL" | "handL" | "armR" | "lowR" | "handR";
/** a pose: the angle of each joint (deg, clockwise), and x — the upper body's shift (px of the rig) */
type Pose = Partial<Record<J | "x", number>>;
interface Key { at: number; pose: Pose; /** how hard the springs pull until the next key (a blow ×3–4) */ stiff?: number }
interface Action { keys: Key[]; dur: number }
interface Spec {
  /** the rig's joint groups (all the matches turn alike — Вадим's key arm is drawn twice), default: SEL */
  sel?: Partial<Record<J, string>>;
  /** stiffness and damping of each joint's spring (ζ = c / 2√k: < 1 overshoots) */
  springs: Record<J | "x", { k: number; c: number }>;
  /** the follow-through: the child is pulled back by its parent's speed × this (s) */
  drag: Partial<Record<J, [J, number]>>;
  /** never still: a slow pose drifting with the time (s) */
  idle: (t: number) => Pose;
  actions: { a: Action; w: number }[];
  /** the rest between the actions (s) */
  rest: [number, number];
  /** a hit on him: the kick of speed to each joint (deg/s) */
  hit: Pose;
  /** he strikes the player («strike» on the arena): this action at once */
  strike?: Action;
  /** below half HP: this pose under the idle; act: false — no blows at all (he only sways) */
  dazed?: { pose: Pose; act: boolean };
  /** his breath, drawn with the upper body (it owns that group): at time t → [scale x, scale y, shift y px] */
  breath?: (t: number, dazed: boolean) => [number, number, number];
  /** what else follows the breath (the jaw): el → transform */
  breathFollow?: { sel: string; f: (t: number) => string };
  /** a joint drawn as a strip of bent frames (Князь's elbows: a window one frame wide over the strip, perFrame° apart):
   *  its angle picks the frame; turn — a group that turns by the frame's bend (the hand riding on that forearm) */
  bend?: Partial<Record<J, { strip: string; perFrame: number; turn?: string }>>;
  /** a thing hanging free off the end of a chain (Восток's bag off his fist): it wants to keep hanging straight down
   *  (minus the chain's turn), so it lags and swings on a soft spring of its own */
  hang?: { sel: string; chain: J[]; k: number; c: number };
}

const SEL: Record<J, string> = {
  up: ".br-up", head: ".br-head", armL: ".br-arm-l", lowL: ".br-low-l", handL: ".br-hand-l", armR: ".br-arm-r", lowR: ".br-low-r", handR: ".br-hand-r",
};
const JOINTS = Object.keys(SEL) as J[];

/* Гопник: L — his right arm (hanging out on the left of the picture): the big blows; R — his left (the forearm across
   the belly): short jabs */
const blowL: Action = {
  dur: 0.78,
  keys: [
    { at: 0, pose: { armL: 8, lowL: -16, handL: 8, up: 2.5, x: 3, head: 2 } }, // the wind-up: the arm and the body back
    { at: 0.17, pose: { armL: -11, lowL: 76, handL: -26, up: -5.5, x: -8, head: -3, lowR: 10, armR: 3 }, stiff: 4 }, // the blow
    { at: 0.3, pose: { armL: -8, lowL: 64, handL: -14, up: -4, x: -5, head: -2 }, stiff: 1.4 },
    { at: 0.44, pose: {} }, // back to the stance (the springs settle him)
  ],
};
const jabR: Action = {
  dur: 0.56,
  keys: [
    { at: 0, pose: { lowR: -10, handR: 8, armR: 2, up: 1 } },
    { at: 0.1, pose: { armR: -5, lowR: 34, handR: -22, up: 2.5, x: 4, head: 1.5 }, stiff: 4 },
    { at: 0.24, pose: { lowR: 14, handR: -6 }, stiff: 1.4 },
    { at: 0.34, pose: {} },
  ],
};
const join = (...as: Action[]): Action => {
  let t = 0;
  const keys: Key[] = [];
  for (const a of as) { for (const k of a.keys) keys.push({ ...k, at: t + k.at }); t += a.dur; }
  return { keys, dur: t };
};
const shift = (a: Action, by: number): Action => ({ dur: a.dur - by, keys: a.keys.map((k) => ({ ...k, at: Math.max(0, k.at - by) })) });
const taunt: Action = {
  dur: 1.3,
  keys: [
    { at: 0, pose: { head: 6, up: 1.5, armL: 3, lowL: 8, lowR: -6 } }, // «ну чё?» — the chin up, the shoulders loose
    { at: 0.7, pose: { head: -2, up: -1 } },
    { at: 1.0, pose: {} },
  ],
};

/* Вадим: L — the car keys (blows down from a cocked elbow), R — the knife (stabs with the blade turned in) */
const vdKeys: Action = {
  dur: 0.62,
  keys: [
    { at: 0, pose: { armL: 10, lowL: 38, handL: 20, up: 1.5, head: 1.5 } }, // the elbow cocked, the keys up
    { at: 0.15, pose: { armL: -9, lowL: -28, handL: -26, up: -2.5, x: -4, head: -1.5 }, stiff: 4 }, // down on the head
    { at: 0.27, pose: { armL: -4, lowL: -10, handL: -8 }, stiff: 1.4 },
    { at: 0.36, pose: {} },
  ],
};
const vdStab: Action = {
  dur: 0.5,
  keys: [
    { at: 0, pose: { armR: -8, lowR: -24, handR: -18, up: -1, head: -1 } }, // the blade drawn back
    { at: 0.11, pose: { armR: 10, lowR: 22, handR: 28, up: 2, x: 4, head: 1.2 }, stiff: 4.5 }, // the stab
    { at: 0.22, pose: { armR: 5, lowR: 12, handR: 16 }, stiff: 1.4 },
    { at: 0.3, pose: {} },
  ],
};
const vdSmug: Action = {
  dur: 1.4,
  keys: [
    { at: 0, pose: { head: 4, up: -1.5, armR: 3, lowR: -8, handR: 10 } }, // leans back, the knife turned in the fingers
    { at: 0.6, pose: { head: -2, handR: -12 } },
    { at: 1.0, pose: {} },
  ],
};

/* Князь: L — the hardware wallet held like a knife (cuts down across, a stab with the wrist; the elbow is a strip of
   bent frames), R — the fist in the guard (short jabs, the elbow snaps in) */
const kzCut: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armL: 11, lowL: 0, handL: 18, up: -1.5, x: -3, head: 1.2 } }, // the wind-up: the wallet up and out
    { at: 0.12, pose: { armL: -22, lowL: 24, handL: -28, up: 2.5, x: 5, head: -1.5, armR: 2 }, stiff: 4 }, // down across
    { at: 0.25, pose: { armL: -17, lowL: 16, handL: -20, up: 1.5, x: 3 }, stiff: 1.4 },
    { at: 0.36, pose: {} },
  ],
};
const kzStab: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armL: 5, handL: -16, up: -1, head: 1 } }, // the wrist cocked
    { at: 0.13, pose: { armL: -10, lowL: 14, handL: 34, up: 2, x: 4, head: -1 }, stiff: 4.5 }, // the stab
    { at: 0.27, pose: { armL: -7, lowL: 8, handL: 26 }, stiff: 1.4 },
    { at: 0.38, pose: {} },
  ],
};
const kzJab: Action = {
  dur: 0.48,
  keys: [
    { at: 0, pose: { armR: 2.5, lowR: 0, up: -0.6 } },
    { at: 0.09, pose: { armR: -11, lowR: 16, up: 1.6, x: 3, head: 1 }, stiff: 4.5 }, // the fist out, the elbow snaps
    { at: 0.21, pose: { armR: -4, lowR: 6 }, stiff: 1.4 },
    { at: 0.3, pose: {} },
  ],
};
const kzSmug: Action = {
  dur: 1.5,
  keys: [
    { at: 0, pose: { head: 4.5, up: -1.2, armL: 4, handL: 14, armR: 1.5 } }, // the chin up, the wallet turned in the hand
    { at: 0.65, pose: { head: -1.5, handL: -10 } },
    { at: 1.05, pose: {} },
  ],
};

/* Бабафей: L — the balalaika in the raised hand (a smash down with it, a fast strum-shake), R — the open palm (beckons
   «иди сюда», shoves off); the right elbow rests bent (−30°) */
const bfSmash: Action = {
  dur: 0.76,
  keys: [
    { at: 0, pose: { armL: 7, lowL: -24, handL: -20, up: -2.5, x: -4, head: 2, lowR: 6 } }, // the balalaika back over the shoulder
    { at: 0.2, pose: { armL: -7, lowL: 24, handL: 16, up: 3.5, x: 6, head: -2.5, armR: 4, lowR: -10 }, stiff: 4 }, // down on the head
    { at: 0.32, pose: { armL: -4, lowL: 14, handL: 8, up: 2, x: 3, head: -1.5 }, stiff: 1.4 },
    { at: 0.44, pose: {} },
  ],
};
const bfStrum: Action = {
  dur: 0.95,
  keys: [
    { at: 0, pose: { lowL: 6, handL: 9, head: 2.5, up: 0.8 } },
    { at: 0.08, pose: { lowL: -4, handL: -10, head: 2.5, up: 0.8 }, stiff: 3 },
    { at: 0.16, pose: { lowL: 6, handL: 10, head: 2.5, up: 0.8 }, stiff: 3 },
    { at: 0.24, pose: { lowL: -4, handL: -10, head: 2.5, up: 0.8 }, stiff: 3 },
    { at: 0.32, pose: { lowL: 6, handL: 10, head: 2.5, up: 0.8 }, stiff: 3 },
    { at: 0.4, pose: { lowL: -3, handL: -8, head: 2, up: 0.5 }, stiff: 3 },
    { at: 0.48, pose: { lowL: 4, handL: 6, head: 1 }, stiff: 2 },
    { at: 0.6, pose: {} },
  ],
};
const bfBeckon: Action = {
  dur: 1.2,
  keys: [
    { at: 0, pose: { armR: 3, lowR: -12, handR: 4, head: -2, up: -1 } }, // the palm up to him
    { at: 0.22, pose: { armR: 3, lowR: -16, handR: -18, head: -2.5, up: -1 }, stiff: 2 }, // «иди сюда»
    { at: 0.4, pose: { armR: 3, lowR: -10, handR: 2, head: -2 }, stiff: 2 },
    { at: 0.58, pose: { armR: 3, lowR: -16, handR: -16, head: -2.5 }, stiff: 2 },
    { at: 0.78, pose: {} },
  ],
};
const bfShove: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armR: -4, lowR: -24, handR: -6, up: -1 } }, // the palm drawn in
    { at: 0.12, pose: { armR: 11, lowR: 20, handR: 14, up: 2.5, x: 5, head: 1.5 }, stiff: 4.5 }, // shoves out
    { at: 0.26, pose: { armR: 7, lowR: 12, handR: 8 }, stiff: 1.4 },
    { at: 0.38, pose: {} },
  ],
};

/* Восток: R — the fist (a jab from the guard, a pump: the upper arm out level, the forearm straight up), L — the courier
   bag (swung out and up and shaken, slammed down at the screen); the bag hangs off the fist and swings by itself */
const vkJab: Action = {
  dur: 0.55,
  keys: [
    { at: 0, pose: { armR: 3, lowR: 8, handR: 4, up: -1.5, x: 4 } }, // the fist drawn back
    { at: 0.09, pose: { armR: -15, lowR: -26, handR: -10, up: 2.5, x: -8, head: -2 }, stiff: 4.5 }, // the jab
    { at: 0.22, pose: { armR: -8, lowR: -12, handR: -4, up: 1 }, stiff: 1.4 },
    { at: 0.32, pose: {} },
  ],
};
const vkPump: Action = {
  dur: 1.45,
  keys: [
    { at: 0, pose: { armR: 4, lowR: 10, up: -1 } },
    { at: 0.12, pose: { armR: -40, lowR: 68, handR: -12, up: -2, head: 4 }, stiff: 2.4 }, // the fist up
    { at: 0.36, pose: { armR: -33, lowR: 60, handR: -4, up: -1, head: 2 }, stiff: 2.4 },
    { at: 0.56, pose: { armR: -42, lowR: 70, handR: -12, up: -2, head: 5 }, stiff: 2.4 },
    { at: 0.8, pose: { armR: -34, lowR: 62, handR: -4, head: 2 }, stiff: 2.4 },
    { at: 1.0, pose: {} },
  ],
};
const vkShake: Action = {
  dur: 1.5,
  keys: [
    { at: 0, pose: { armL: -5, lowL: -4, up: 1 } },
    { at: 0.12, pose: { armL: 32, lowL: -18, up: 2, x: 6, head: -2 }, stiff: 2.2 }, // the bag out and up
    { at: 0.36, pose: { armL: 25, lowL: -11, up: 1.5, x: 4 }, stiff: 2.4 },
    { at: 0.54, pose: { armL: 34, lowL: -20, up: 2, x: 6, head: -3 }, stiff: 2.4 },
    { at: 0.74, pose: { armL: 26, lowL: -12, up: 1.5 }, stiff: 2.4 },
    { at: 0.92, pose: {} },
  ],
};
const vkSlam: Action = {
  dur: 0.95,
  keys: [
    { at: 0, pose: { armL: 35, lowL: -25, up: 4, x: 16, head: 5 } }, // the bag up over his head
    { at: 0.3, pose: { armL: -12, lowL: -8, up: -6, x: -28, head: -8 }, stiff: 4 }, // down at the screen
    { at: 0.46, pose: { armL: -9, lowL: -6, up: -4, x: -20, head: -6 }, stiff: 1.4 },
    { at: 0.66, pose: {} },
  ],
};

const POSES: Record<string, Spec> = {
  vodovoz: {
    sel: { up: ".vk-up", head: ".vk-head", armL: ".vk-arm-l", lowL: ".vk-low-l", handL: ".vk-hand-l", armR: ".vk-arm-r", lowR: ".vk-low-r", handR: ".vk-hand-r" },
    springs: {
      up: { k: 70, c: 11 }, x: { k: 55, c: 10 }, head: { k: 100, c: 10 },
      armL: { k: 85, c: 15 }, lowL: { k: 170, c: 17 }, handL: { k: 300, c: 15 },
      armR: { k: 100, c: 15 }, lowR: { k: 190, c: 17 }, handR: { k: 330, c: 15 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.05], lowR: ["armR", -0.05], handR: ["lowR", -0.05], head: ["up", -0.08] },
    // a boxer on his toes: the hips sway with the bounce (the bounce itself is the breath), the guard bobs
    idle: (t) => ({
      up: 1.3 * Math.sin((t / 0.8) * Math.PI * 2) + 0.6 * Math.sin(t * 0.7),
      x: 4 * Math.sin(t * 0.6),
      head: 2.6 * Math.sin(t * 1.9 + 1) + 1.4 * Math.sin(t * 0.8),
      armL: 2 * Math.sin(t * 1.3), lowL: 3 * Math.sin(t * 1.6 + 0.5), handL: 2 * Math.sin(t * 2.1),
      armR: -3 + 2.5 * Math.sin((t / 0.8) * Math.PI * 2 + 0.6), lowR: -3 + 3 * Math.sin((t / 0.8) * Math.PI * 2 + 1), handR: 2.5 * Math.sin(t * 2.2),
    }),
    actions: [
      { a: vkJab, w: 22 },
      { a: join(vkJab, vkJab), w: 18 },
      { a: vkPump, w: 14 },
      { a: vkShake, w: 16 },
      { a: join(vkJab, shift(vkSlam, 0.05)), w: 12 },
      { a: vkSlam, w: 10 },
    ],
    rest: [0.3, 1.4],
    hit: { up: 120, x: 90, head: 200, armL: -120, lowL: 140, armR: 120, lowR: -150, handL: 160, handR: -200 },
    strike: vkSlam,
    // beaten: bent over and gasping, both fists up in a tired guard by his shoulders (the bag is dropped)
    dazed: { pose: { up: -2, head: 9, armR: -37, lowR: 64, handR: -6, armL: -2, lowL: 4 }, act: false },
    // the bounce on his toes (it was screens.css vk-bob, twice in 0.8 s); beaten — slow heavy gasps, bent low
    breath: (t, dazed) => {
      if (dazed) { const b = 0.5 - 0.5 * Math.cos((t / 1.2) * Math.PI * 2); return [1 + 0.018 * b, 0.985 + 0.035 * b, 18 - 10 * b]; }
      const b = 0.5 - 0.5 * Math.cos((t / 0.4) * Math.PI * 2);
      return [1 + 0.008 * b, 1 - 0.01 * b, 10 * b];
    },
    hang: { sel: ".vk-bag", chain: ["up", "armL", "lowL", "handL"], k: 38, c: 2.6 },
  },
  babafey: {
    springs: {
      up: { k: 65, c: 11.5 }, x: { k: 60, c: 11 }, head: { k: 110, c: 11 },
      armL: { k: 85, c: 15 }, lowL: { k: 150, c: 16 }, handL: { k: 260, c: 14 },
      armR: { k: 95, c: 15 }, lowR: { k: 180, c: 17 }, handR: { k: 320, c: 15 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.06], lowR: ["armR", -0.05], handR: ["lowR", -0.05], head: ["up", -0.08] },
    idle: (t) => ({
      up: 0.9 * Math.sin(t * 0.85) + 0.35 * Math.sin(t * 2 + 1),
      x: 2.5 * Math.sin(t * 0.5),
      head: 1.8 * Math.sin(t * 1.05 + 1) + 0.8 * Math.sin(t * 0.45),
      armL: 2 * Math.sin(t * 1.1), lowL: 3 * Math.sin(t * 1.4 + 0.5), handL: 3.5 * Math.sin(t * 2.1 + 1),
      armR: 1.6 * Math.sin(t * 1.2 + 2), lowR: -30 + 3.5 * Math.sin(t * 1.5 + 1), handR: 4 * Math.sin(t * 1.8),
    }),
    actions: [
      { a: bfSmash, w: 26 },
      { a: join(bfSmash, shift(bfSmash, 0.05)), w: 12 },
      { a: bfStrum, w: 18 },
      { a: bfShove, w: 16 },
      { a: join(bfShove, shift(bfSmash, 0.05)), w: 14 },
      { a: bfBeckon, w: 14 },
    ],
    rest: [0.35, 1.6],
    hit: { head: 280, up: -80, x: -60, armL: 110, lowL: -160, handL: -240, armR: -110, lowR: 160, handR: 220 },
    strike: join(bfSmash, shift(bfSmash, 0.08)),
    // scared: the balalaika sinks, the palm up in front of him — and he keeps fending them off, slower
    dazed: { pose: { armL: 6, lowL: -14, handL: -8, lowR: -14, handR: -10, head: 3, up: -1.5 }, act: true },
  },
  knyaz: {
    sel: { up: ".kz-up", head: ".kz-head", armL: ".kz-arm-l", lowL: ".kz-none", handL: ".kz-hand-l", armR: ".kz-arm-r", lowR: ".kz-none", handR: ".kz-none" },
    bend: { lowL: { strip: ".kz-elbow-l", perFrame: 2, turn: ".kz-turn-l" }, lowR: { strip: ".kz-elbow-r", perFrame: 2 } },
    springs: {
      up: { k: 70, c: 12 }, x: { k: 60, c: 11 }, head: { k: 110, c: 11 },
      armL: { k: 95, c: 15 }, lowL: { k: 200, c: 18 }, handL: { k: 330, c: 15 },
      armR: { k: 100, c: 15 }, lowR: { k: 200, c: 18 }, handR: { k: 330, c: 15 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["armL", -0.05], lowR: ["armR", -0.05], head: ["up", -0.08] },
    idle: (t) => ({
      up: 0.9 * Math.sin(t * 0.9) + 0.3 * Math.sin(t * 2.1 + 1),
      x: 3 * Math.sin(t * 0.5),
      head: 1.8 * Math.sin(t * 1.1 + 1) + 0.8 * Math.sin(t * 0.5),
      armL: 2 * Math.sin(t * 1.2), lowL: 2 + 2.5 * Math.sin(t * 1.5 + 0.5), handL: 4 * Math.sin(t * 1.9 + 1),
      armR: 1.6 * Math.sin(t * 1.6 + 2), lowR: 2 + 2.5 * Math.sin(t * 1.6 + 2.3),
    }),
    actions: [
      { a: kzCut, w: 20 },
      { a: join(kzCut, shift(kzCut, 0.03)), w: 20 },
      { a: join(kzCut, kzCut, kzStab), w: 14 },
      { a: kzJab, w: 16 },
      { a: join(kzJab, kzJab), w: 14 },
      { a: join(kzJab, shift(kzCut, 0.04)), w: 12 },
      { a: kzSmug, w: 8 },
    ],
    rest: [0.3, 1.5],
    hit: { head: 300, up: 80, x: 60, armL: 120, lowL: -100, handL: 220, armR: -110, lowR: -100 },
    strike: join(kzCut, kzCut, kzCut),
    dazed: { pose: { armL: -8, handL: -2, lowL: -2, lowR: -2, head: 3 }, act: false },
    // his breath (it was screens.css kz-breath, 2.4 s): the chest up and a little wider
    breath: (t) => { const b = 0.5 - 0.5 * Math.cos((t / 2.4) * Math.PI * 2); return [1 + 0.017 * b, 1 + 0.032 * b, -6.5 * b]; },
  },
  vadim: {
    sel: { up: ".vd-up", head: ".vd-head", armL: ".vd-arm-l", lowL: ".vd-low-l", handL: ".vd-hand-l", armR: ".vd-arm-r", lowR: ".vd-low-r", handR: ".vd-hand-r" },
    springs: {
      up: { k: 75, c: 12 }, x: { k: 60, c: 11 }, head: { k: 110, c: 11 },
      armL: { k: 95, c: 15 }, lowL: { k: 190, c: 17 }, handL: { k: 340, c: 15 },
      armR: { k: 95, c: 15 }, lowR: { k: 190, c: 17 }, handR: { k: 340, c: 15 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.05], lowR: ["armR", -0.05], handR: ["lowR", -0.05], head: ["up", -0.08] },
    idle: (t) => ({
      up: 0.9 * Math.sin(t * 0.95) + 0.35 * Math.sin(t * 2.2 + 1),
      x: -3 + 3 * Math.sin(t * 0.98),
      head: 1.6 * Math.sin(t * 1.2 + 1) + 0.8 * Math.sin(t * 0.55),
      armL: 1.8 * Math.sin(t * 1.3), lowL: 3 * Math.sin(t * 1.7 + 0.5), handL: 3 * Math.sin(t * 2.3 + 1),
      armR: 1.5 * Math.sin(t * 1.1 + 2), lowR: 3 * Math.sin(t * 1.5 + 1), handR: 4 * Math.sin(t * 1.9),
    }),
    actions: [
      { a: vdKeys, w: 24 },
      { a: join(vdKeys, vdKeys), w: 18 },
      { a: vdStab, w: 20 },
      { a: join(vdStab, vdStab, vdStab), w: 14 },
      { a: join(vdStab, shift(vdKeys, 0.04)), w: 14 },
      { a: vdSmug, w: 10 },
    ],
    rest: [0.3, 1.4],
    hit: { head: -300, up: -80, x: -60, armL: 120, lowL: -140, armR: -110, lowR: 150, handL: -220, handR: 220 },
    strike: join(vdKeys, vdKeys),
    dazed: { pose: { armL: -9, armR: 9, lowL: -4, lowR: 4, head: 3 }, act: false },
    // his fast heavy breath (it was screens.css vd-breath): the chest up and wider, the jaw drops with it
    breath: (t) => { const b = 0.5 - 0.5 * Math.cos((t / 1.05) * Math.PI * 2); return [1 + 0.016 * b, 1 + 0.03 * b, -4 * b]; },
    breathFollow: { sel: ".vd-jaw", f: (t) => `translateY(${(4 * (0.5 - 0.5 * Math.cos((t / 1.05) * Math.PI * 2))).toFixed(2)}px)` },
  },
  gopnik: {
    springs: {
      up: { k: 70, c: 12 }, x: { k: 70, c: 12 }, head: { k: 120, c: 12 },
      armL: { k: 90, c: 15 }, lowL: { k: 180, c: 17 }, handL: { k: 330, c: 16 },
      armR: { k: 90, c: 15 }, lowR: { k: 180, c: 17 }, handR: { k: 330, c: 16 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.045], lowR: ["armR", -0.05], handR: ["lowR", -0.045], head: ["up", -0.08] },
    idle: (t) => ({
      up: 1.1 * Math.sin(t * 1.05) + 0.4 * Math.sin(t * 2.3 + 1),
      x: 2 * Math.sin(t * 0.55),
      head: 1.4 * Math.sin(t * 0.85 + 1) + 0.7 * Math.sin(t * 2.1),
      armL: 2.2 * Math.sin(t * 1.25), lowL: 3.5 * Math.sin(t * 1.6 + 0.5), handL: 2 * Math.sin(t * 2.2 + 1),
      armR: 1.6 * Math.sin(t * 1.15 + 2), lowR: 4 * Math.sin(t * 1.5 + 1), handR: 2.5 * Math.sin(t * 2.4),
    }),
    actions: [
      { a: blowL, w: 30 },
      { a: jabR, w: 22 },
      { a: join(jabR, shift(blowL, 0.05)), w: 20 }, // a jab and the big one after it
      { a: join(blowL, blowL), w: 12 },
      { a: join(jabR, jabR), w: 8 },
      { a: taunt, w: 8 },
    ],
    rest: [0.35, 1.6],
    hit: { head: 260, up: 90, x: 70, armL: -120, lowL: 160, armR: 100, lowR: -160, handL: 200, handR: -200 },
  },
};

export const hasPoses = (baseId: string) => baseId in POSES;

/** runs the pose engine on the rig's SVG (only for the bosses in POSES; off with reduced motion) */
export function usePoses(svgRef: RefObject<SVGSVGElement | null>, baseId: string, rigKey: string) {
  useEffect(() => {
    const spec = POSES[baseId];
    const svg = svgRef.current;
    if (!spec || !svg) return;
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = {} as Record<J, SVGGElement[]>;
    for (const j of JOINTS) els[j] = [...svg.querySelectorAll<SVGGElement>(spec.sel?.[j] ?? SEL[j])];
    // the strip joints: the frame width is the window's (the strip's parent <svg>), the count — strip ÷ window
    const bends = Object.entries(spec.bend ?? {}).map(([j, b]) => ({
      j: j as J, perFrame: b!.perFrame,
      strips: [...svg.querySelectorAll<SVGImageElement>(b!.strip)].map((el) => {
        const w = Number(el.parentElement?.getAttribute("width")) || 1;
        return { el, w, n: Math.max(1, Math.round(Number(el.getAttribute("width")) / w)) };
      }),
      turns: b!.turn ? [...svg.querySelectorAll<SVGGElement>(b!.turn)] : [],
    }));
    const hangs = spec.hang ? [...svg.querySelectorAll<SVGGElement>(spec.hang.sel)] : [];
    let hangA = 0, hangV = 0;
    const follow = spec.breathFollow ? [...svg.querySelectorAll<SVGGElement>(spec.breathFollow.sel)] : [];
    svg.classList.add("posed");
    const keys = [...JOINTS, "x"] as (J | "x")[];
    const ang: Record<string, number> = {};
    const vel: Record<string, number> = {};
    for (const k of keys) { ang[k] = 0; vel[k] = 0; }
    let act: Action | null = null;
    let actT = 0;
    let wait = 0.6 + Math.random();
    let t = Math.random() * 10;
    let last = performance.now();
    let wasHit = false;
    let wasStrike = false;
    const gate = frameGate();
    const pick = (): Action => {
      const all = spec.actions.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * all;
      for (const x of spec.actions) { r -= x.w; if (r < 0) return x.a; }
      return spec.actions[0].a;
    };
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // a hit on him: a push to every joint
      const arena = svg.closest(".arena-photo");
      const hit = !!arena?.classList.contains("hit");
      if (hit && !wasHit) for (const k of keys) vel[k] += (spec.hit[k] ?? 0) * (0.8 + Math.random() * 0.4);
      wasHit = hit;
      // he strikes the player: that blow now, whatever he was doing
      const strike = !!arena?.classList.contains("strike");
      if (strike && !wasStrike && spec.strike) { act = spec.strike; actT = 0; }
      wasStrike = strike;
      // the action: its key now (a dazed boss — half as often, slower)
      const dazed = svg.classList.contains("dazed");
      let pose: Pose = {};
      let stiff = 1;
      if (act) {
        actT += dt * (dazed ? 0.75 : 1);
        let cur: Key | null = null;
        for (const k of act.keys) if (k.at <= actT) cur = k;
        if (cur) { pose = cur.pose; stiff = cur.stiff ?? 1; }
        if (actT >= act.dur) { act = null; wait = spec.rest[0] + Math.random() * (spec.rest[1] - spec.rest[0]) * (dazed ? 2 : 1); }
      } else if ((wait -= dt) <= 0) {
        if (dazed && spec.dazed && !spec.dazed.act) wait = 1;
        else { act = pick(); actT = 0; }
      }
      const idle = spec.idle(t);
      if (dazed && spec.dazed) for (const [k, v] of Object.entries(spec.dazed.pose)) idle[k as J] = (idle[k as J] ?? 0) + v;
      for (const k of keys) {
        const s = spec.springs[k];
        let target = (idle[k] ?? 0) + (pose[k] ?? 0);
        const d = k !== "x" ? spec.drag[k] : undefined;
        if (d) target += vel[d[0]] * d[1];
        const kk = s.k * stiff, cc = s.c * Math.sqrt(stiff);
        // semi-implicit Euler in small steps (stiff springs stay stable at 15–30 fps)
        const n = Math.ceil(dt / 0.008);
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          vel[k] += (kk * (target - ang[k]) - cc * vel[k]) * h;
          ang[k] += vel[k] * h;
        }
      }
      const br = spec.breath?.(t, dazed);
      if (spec.hang) {
        const target = -spec.hang.chain.reduce((a, j) => a + ang[j], 0);
        const n = Math.ceil(dt / 0.008), h = dt / n;
        for (let i = 0; i < n; i++) { hangV += (spec.hang.k * (target - hangA) - spec.hang.c * hangV) * h; hangA += hangV * h; }
        const tr = `rotate(${hangA.toFixed(2)}deg)`;
        for (const el of hangs) el.style.transform = tr;
      }
      for (const j of JOINTS) {
        const tr = j === "up"
          ? `translateX(${ang.x.toFixed(2)}px) rotate(${ang.up.toFixed(2)}deg)${br ? ` translateY(${br[2].toFixed(2)}px) scale(${br[0].toFixed(4)}, ${br[1].toFixed(4)})` : ""}`
          : `rotate(${ang[j].toFixed(2)}deg)`;
        for (const el of els[j]) el.style.transform = tr;
      }
      if (spec.breathFollow) { const tr = spec.breathFollow.f(t); for (const el of follow) el.style.transform = tr; }
      for (const b of bends) {
        let deg = 0;
        for (const s of b.strips) {
          const f = Math.max(0, Math.min(s.n - 1, Math.round(ang[b.j] / b.perFrame)));
          s.el.style.transform = `translateX(${-f * s.w}px)`;
          deg = f * b.perFrame;
        }
        for (const el of b.turns) el.style.transform = `rotate(${deg}deg)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      svg.classList.remove("posed");
      for (const j of JOINTS) for (const el of els[j]) el.style.transform = "";
      for (const el of follow) el.style.transform = "";
      for (const el of hangs) el.style.transform = "";
      for (const b of bends) { for (const s of b.strips) s.el.style.transform = ""; for (const el of b.turns) el.style.transform = ""; }
    };
  }, [svgRef, baseId, rigKey]);
}
