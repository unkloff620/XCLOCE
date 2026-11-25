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
/** a pose: the angle of each joint (deg, clockwise), x — the upper body's shift (px of the rig), and the rig's own
 *  channels: a shape's weight (Spec.shapes, 0…1) or a fist's growth towards the screen (Spec.scale, %) */
type Pose = Partial<Record<string, number>>;
interface Key { at: number; pose: Pose; /** how hard the springs pull until the next key (a blow ×3–4) */ stiff?: number }
/** face: classes put on the rig for a while once the action reaches `at` (s) — the CSS face plays its own keyframes then
 *  (Боцман: the jaw drops on the crowbar's swing and grinds after it) */
interface Face { cls: string; at: number; dur: number }
interface Action { keys: Key[]; dur: number; face?: Face[] }
interface Spec {
  /** the rig's joint groups (all the matches turn alike — Вадим's key arm is drawn twice), default: SEL */
  sel?: Partial<Record<J, string>>;
  /** stiffness and damping of each joint's spring (ζ = c / 2√k: < 1 overshoots) */
  springs: Partial<Record<string, { k: number; c: number }>>;
  /** the follow-through: the child is pulled back by its parent's speed × this (s) */
  drag: Partial<Record<J, [J, number]>>;
  /** never still: a slow pose drifting with the time (s) */
  idle: (t: number, lvl?: number) => Pose;
  actions: { a: Action; w: number }[];
  /** the rest between the actions (s) */
  rest: [number, number];
  /** a hit on him: the kick of speed to each joint (deg/s) */
  hit: Pose;
  /** he strikes the player («strike» on the arena): this action at once */
  strike?: Action;
  /** below half HP: this pose under the idle; act: false — no blows at all (he only sways) */
  dazed?: Phase;
  /** below a quarter HP (the rig's class «dying»): the same as dazed, in place of it */
  dying?: Phase;
  /** his breath, drawn with the upper body (it owns that group): at time t → [scale x, scale y, shift y px] */
  breath?: (t: number, dazed: boolean) => [number, number, number];
  /** what else follows the breath (the jaw): el → transform */
  breathFollow?: { sel: string; f: (t: number, ang: Record<string, number>) => string };
  /** CSS variables put on the rig every frame from the channels (Утилизатор's jaw: --close, the CSS shapes the mouth) */
  vars?: (ang: Record<string, number>) => Record<string, string>;
  /** a joint drawn as a strip of bent frames (Князь's elbows: a window one frame wide over the strip, perFrame° apart):
   *  its angle picks the frame; turn — a group that turns by the frame's bend (the hand riding on that forearm) */
  bend?: Partial<Record<J, { strip: string; perFrame: number; turn?: string }>>;
  /** a thing hanging free off the end of a chain (Восток's bag off his fist): it wants to keep hanging straight down
   *  (minus the chain's turn), so it lags and swings on a soft spring of its own */
  hang?: { sel: string; chain: J[]; k: number; c: number };
  /** a coat's tails (Боцман, the empty group bs-hem the puppet follows below the belt): they lag behind the body's
   *  lean and shift on a soft spring of their own and flutter a little — skewed from the belt */
  hem?: { sel: string; k: number; c: number; up: number; x: number; flutter: (t: number) => number };
  /** the artist's poses as offsets of the joints ([translate x, y px, turn deg] each), mixed in by their channel's weight
   *  (Мугонатор's wind-up and jab: the pieces also slide, not only turn) */
  shapes?: Record<string, Partial<Record<J, [number, number, number]>>>;
  /** a joint that also grows from its pivot by its channel (%) — a one-piece forearm can only come at the screen so */
  scale?: Partial<Record<J, string>>;
  /** the blow at the player stays the screens.css one (strike-l/r: the fist on that side flies at the screen) */
  cssStrike?: boolean;
  /** hair on the head (Фокус): a soft spring of its own that lags behind the head's turns and the body's jerks and
   *  flops back — turned round its root and skewed (the ends go further than the roots), it also flutters a little */
  hair?: { sel: string; k: number; c: number; turn: number; jerk: number; flutter: (t: number) => number };
  /** a key's stiffness pulls only the channels in its pose — the rest (his sway, his breath) keep their own pace */
  stiffOwn?: boolean;
}
interface Phase {
  pose: Pose; act: boolean;
  /** a motion of its own on top (Утилизатор sways like a drunk) */
  sway?: (t: number) => Pose;
  /** its own actions, rest, strike and the actions' speed (default: the spec's, the rest twice as long, ×0.75) */
  actions?: { a: Action; w: number }[]; rest?: [number, number]; strike?: Action; speed?: number;
  /** no blow at the player in this phase: he only keeps rocking */
  noStrike?: boolean;
}
const SPRING0 = { k: 160, c: 16 };

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
    { at: 0.17, pose: { armL: -11, lowL: 76, handL: -26, up: -5.5, x: -8, head: -3, lowR: 10, armR: 3 }, stiff: 5.5 }, // the blow
    { at: 0.3, pose: { armL: -8, lowL: 64, handL: -14, up: -4, x: -5, head: -2 }, stiff: 1.4 },
    { at: 0.44, pose: {} }, // back to the stance (the springs settle him)
  ],
};
const jabR: Action = {
  dur: 0.56,
  keys: [
    { at: 0, pose: { lowR: -10, handR: 8, armR: 2, up: 1 } },
    { at: 0.1, pose: { armR: -5, lowR: 34, handR: -22, up: 2.5, x: 4, head: 1.5 }, stiff: 5.5 },
    { at: 0.24, pose: { lowR: 14, handR: -6 }, stiff: 1.4 },
    { at: 0.34, pose: {} },
  ],
};
/* Ларёчник: L — the brass knuckles held out in front (the rest pose in his idle): the elbow goes up, then comes down
   hard and the fist drives forward; R — the raised fist turns down at the elbow, counter-clockwise, across onto the head */
const LR_HOLD = { armL: 9, lowL: -50, handL: 16 };
const lrElbow: Action = {
  dur: 0.74,
  keys: [
    { at: 0, pose: { armL: 30, lowL: 14, handL: 10, up: 2, x: 2, head: 1.5 } }, // the elbow up, the fist drawn back
    { at: 0.18, pose: { armL: -14, lowL: -22, handL: -12, up: -5, x: -6, head: -2.5, lowR: 6 }, stiff: 5.5 }, // the elbow down — the blow
    { at: 0.32, pose: { armL: -10, lowL: -16, handL: -6, up: -3.5, x: -4 }, stiff: 1.4 },
    { at: 0.46, pose: {} },
  ],
};
const lrHammer: Action = {
  dur: 0.72,
  keys: [
    { at: 0, pose: { armR: 6, lowR: 22, handR: 12, up: 2, x: -2, head: 1.5 } }, // the fist goes back
    { at: 0.18, pose: { armR: -7, lowR: -52, handR: -18, up: -5, x: -7, head: -2.5, armL: 3 }, stiff: 5.5 }, // counter-clockwise, down
    { at: 0.32, pose: { armR: -5, lowR: -40, handR: -10, up: -3.5, x: -4 }, stiff: 1.4 },
    { at: 0.46, pose: {} },
  ],
};
const join = (...as: Action[]): Action => {
  let t = 0;
  const keys: Key[] = [];
  const face: Face[] = [];
  for (const a of as) { for (const k of a.keys) keys.push({ ...k, at: t + k.at }); for (const f of a.face ?? []) face.push({ ...f, at: t + f.at }); t += a.dur; }
  return { keys, dur: t, face: face.length ? face : undefined };
};
const shift = (a: Action, by: number): Action => ({ dur: a.dur - by, keys: a.keys.map((k) => ({ ...k, at: Math.max(0, k.at - by) })),
  face: a.face?.map((f) => ({ ...f, at: Math.max(0, f.at - by) })) });
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
    { at: 0.15, pose: { armL: -9, lowL: -28, handL: -26, up: -2.5, x: -4, head: -1.5 }, stiff: 5.5 }, // down on the head
    { at: 0.27, pose: { armL: -4, lowL: -10, handL: -8 }, stiff: 1.4 },
    { at: 0.36, pose: {} },
  ],
};
const vdStab: Action = {
  dur: 0.5,
  keys: [
    { at: 0, pose: { armR: -8, lowR: -24, handR: -18, up: -1, head: -1 } }, // the blade drawn back
    { at: 0.11, pose: { armR: 10, lowR: 22, handR: 28, up: 2, x: 4, head: 1.2 }, stiff: 6 }, // the stab
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
    { at: 0.12, pose: { armL: -22, lowL: 24, handL: -28, up: 2.5, x: 5, head: -1.5, armR: 2 }, stiff: 5.5 }, // down across
    { at: 0.25, pose: { armL: -17, lowL: 16, handL: -20, up: 1.5, x: 3 }, stiff: 1.4 },
    { at: 0.36, pose: {} },
  ],
};
const kzStab: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armL: 5, handL: -16, up: -1, head: 1 } }, // the wrist cocked
    { at: 0.13, pose: { armL: -10, lowL: 14, handL: 34, up: 2, x: 4, head: -1 }, stiff: 6 }, // the stab
    { at: 0.27, pose: { armL: -7, lowL: 8, handL: 26 }, stiff: 1.4 },
    { at: 0.38, pose: {} },
  ],
};
const kzJab: Action = {
  dur: 0.48,
  keys: [
    { at: 0, pose: { armR: 2.5, lowR: 0, up: -0.6 } },
    { at: 0.09, pose: { armR: -11, lowR: 16, up: 1.6, x: 3, head: 1 }, stiff: 6 }, // the fist out, the elbow snaps
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
    { at: 0.2, pose: { armL: -7, lowL: 24, handL: 16, up: 3.5, x: 6, head: -2.5, armR: 4, lowR: -10 }, stiff: 5.5 }, // down on the head
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
    { at: 0.12, pose: { armR: 11, lowR: 20, handR: 14, up: 2.5, x: 5, head: 1.5 }, stiff: 6 }, // shoves out
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
    { at: 0.09, pose: { armR: -15, lowR: -26, handR: -10, up: 2.5, x: -8, head: -2 }, stiff: 6 }, // the jab
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
    { at: 0.3, pose: { armL: -12, lowL: -8, up: -6, x: -28, head: -8 }, stiff: 5.5 }, // down at the screen
    { at: 0.46, pose: { armL: -9, lowL: -6, up: -4, x: -20, head: -6 }, stiff: 1.4 },
    { at: 0.66, pose: {} },
  ],
};

/* the bosses with one-piece forearms (Дацик, Командате, Кедр): the fist turns at the elbow and grows at the screen as it
   comes (sL/sR, %); L is the fist on the left of the picture */
const fistSprings = {
  up: { k: 70, c: 12 }, x: { k: 60, c: 11 }, head: { k: 110, c: 11 },
  armL: { k: 260, c: 21 }, armR: { k: 260, c: 21 }, sL: { k: 300, c: 21 }, sR: { k: 300, c: 21 },
};
const fistSel = { armL: ".br-fist-l", armR: ".br-fist-r", lowL: ".br-none", lowR: ".br-none", handL: ".br-none", handR: ".br-none" };
/** a blow with one fist: [joint, its scale channel, the turn towards the middle (deg, signed), the lean (deg)] */
const fistBlow = (arm: "armL" | "armR", s: "sL" | "sR", toMid: number, lean: number, grow = 15): Action => ({
  dur: 0.5,
  keys: [
    { at: 0, pose: { [arm]: -0.42 * toMid, [s]: -4, up: -0.5 * lean, x: -1.6 * lean, head: 0.4 * lean } }, // the wind-up
    { at: 0.08, pose: { [arm]: toMid, [s]: grow, up: lean, x: 3 * lean, head: -0.7 * lean }, stiff: 6 }, // the blow
    { at: 0.19, pose: { [arm]: 0.55 * toMid, [s]: 0.45 * grow, up: 0.5 * lean, x: 1.5 * lean }, stiff: 1.4 },
    { at: 0.29, pose: {} },
  ],
});
const fistIdle = (t: number): Pose => ({
  up: 0.8 * Math.sin(t * 0.9) + 0.3 * Math.sin(t * 2.2 + 1),
  x: 3 * Math.sin(t * 0.55),
  head: 1.6 * Math.sin(t * 1.05 + 1) + 0.7 * Math.sin(t * 0.5),
  armL: 2 * Math.sin(t * 2.4), armR: 2 * Math.sin(t * 2.4 + 1.7), sL: 1.2 * Math.sin(t * 2.4 + 0.4), sR: 1.2 * Math.sin(t * 2.4 + 2.1),
});
// Дацик: a boxer, the left fist up, the right across the belly (it rises at the screen — an uppercut)
const dsL = fistBlow("armL", "sL", 20, 3), dsR = fistBlow("armR", "sR", 22, -3, 17);
// Командате: the torch in the left hand (a smash), the right fist (a jab)
const bbTorch: Action = {
  dur: 0.62,
  keys: [
    { at: 0, pose: { armL: -14, sL: -3, up: -2, x: -5, head: 1.5 } }, // the torch back
    { at: 0.12, pose: { armL: 26, sL: 10, up: 3, x: 8, head: -2 }, stiff: 5.5 }, // down at the screen
    { at: 0.26, pose: { armL: 16, sL: 5, up: 2, x: 5 }, stiff: 1.4 },
    { at: 0.38, pose: {} },
  ],
};
const bbJab = fistBlow("armR", "sR", -18, -2.5);
const bbWave: Action = {
  dur: 1.1,
  keys: [
    { at: 0, pose: { armL: -7, sL: 4, head: -3, up: -1 } }, // the torch up, waved
    { at: 0.14, pose: { armL: 6, sL: 4, head: -3, up: -1 }, stiff: 2.5 },
    { at: 0.28, pose: { armL: -7, sL: 4, head: -3 }, stiff: 2.5 },
    { at: 0.42, pose: { armL: 5, sL: 3, head: -2 }, stiff: 2.5 },
    { at: 0.6, pose: {} },
  ],
};
// Кедр: claws up — swipes at the screen, both claws reaching to grab
const kdL = fistBlow("armL", "sL", 13, 2.5, 16), kdR = fistBlow("armR", "sR", -13, -2.5, 16);
const kdGrab: Action = {
  dur: 0.95,
  keys: [
    { at: 0, pose: { sL: -4, sR: -4, armL: -4, armR: 4, up: -1.5, head: 1 } },
    { at: 0.14, pose: { sL: 20, sR: 20, armL: 4, armR: -4, up: 2, head: -2 }, stiff: 4 }, // both claws at the player
    { at: 0.42, pose: { sL: 16, sR: 16, armL: 3, armR: -3, up: 1.5 }, stiff: 2 },
    { at: 0.64, pose: {} },
  ],
};
/* Гаркуша: a bundle of cash in each hand — slaps with it (the shoulder swings in, the wrist whips the money), counts it */
const gkSlapR: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armR: -12, handR: 20, up: 1.5, x: 4, head: -1 } }, // the cash raised back
    { at: 0.11, pose: { armR: 16, handR: -32, up: -2.5, x: -8, head: 1.5 }, stiff: 5.5 }, // the slap
    { at: 0.24, pose: { armR: 9, handR: -16, up: -1.2, x: -4 }, stiff: 1.4 },
    { at: 0.36, pose: {} },
  ],
};
const gkSlapL: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armL: 12, handL: 16, up: -1.5, x: -4, head: 1 } },
    { at: 0.11, pose: { armL: -16, handL: -26, up: 2.5, x: 8, head: -1.5 }, stiff: 5.5 },
    { at: 0.24, pose: { armL: -9, handL: -13, up: 1.2, x: 4 }, stiff: 1.4 },
    { at: 0.36, pose: {} },
  ],
};
const gkCount: Action = {
  dur: 1.2,
  keys: [
    { at: 0, pose: { handL: 12, handR: -12, head: 3 } }, // he fans the cash at you
    { at: 0.12, pose: { handL: -8, handR: 10, head: 3 }, stiff: 2.5 },
    { at: 0.24, pose: { handL: 12, handR: -12, head: 3 }, stiff: 2.5 },
    { at: 0.36, pose: { handL: -8, handR: 10, head: 2 }, stiff: 2.5 },
    { at: 0.5, pose: { handL: 8, handR: -8, head: 1 }, stiff: 2.5 },
    { at: 0.66, pose: {} },
  ],
};
/* Мугонатор (the shark boxer): the artist's two poses of the near arm (tools/boss/source/mugo/raw/poses.json — it was
   screens.css mg-sh/el/fi-l): the wind-up and the jab across the body; the far fist stays up in the guard */
const mgJab: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { wind: 1, head: -1.2, up: -1, x: 3 } }, // the arm pulled back
    { at: 0.17, pose: { punch: 1, head: 1.6, up: 1.8, x: -6, armR: -1.5 }, stiff: 5.5 }, // the jab
    { at: 0.29, pose: { punch: 0.8, head: 1, up: 1 }, stiff: 1.5 },
    { at: 0.42, pose: {} },
  ],
};
/* the reference video (2026-11-22): the far fist (R) throws a straight right across — the one-two with the jab */
const mgCross: Action = {
  dur: 0.6,
  keys: [
    { at: 0, pose: { armR: 8, lowR: -6, up: -1, x: 3 } }, // the far fist cocked back
    { at: 0.15, pose: { armR: -55, lowR: 40, handR: 10, up: 2.4, x: -8, head: 2.5, armL: 3 }, stiff: 5.5 }, // the straight right
    { at: 0.3, pose: { armR: -40, lowR: 28, handR: 6, up: 1.4, head: 1.5 }, stiff: 1.5 },
    { at: 0.45, pose: {} },
  ],
};
/* …and the near fist goes up over his head and pumps twice — «ну давай!» — the chin up, the chest out */
const mgRaise: Action = {
  dur: 1.8,
  keys: [
    { at: 0, pose: { armL: -40, lowL: -40, handL: -10, head: -2, up: -1 } },
    { at: 0.25, pose: { armL: -80, lowL: -56, handL: -24, head: -5, up: -2.5, x: -4, armR: 3 }, stiff: 3 },
    { at: 0.55, pose: { armL: -88, lowL: -64, handL: -32, head: -6, up: -3, x: -5 }, stiff: 4 },
    { at: 0.8, pose: { armL: -80, lowL: -56, handL: -24, head: -5, up: -2.5, x: -4 }, stiff: 4 },
    { at: 1.05, pose: { armL: -88, lowL: -64, handL: -32, head: -6, up: -3, x: -5 }, stiff: 4 },
    { at: 1.3, pose: { armL: -80, lowL: -56, handL: -24, head: -5, up: -2.5 }, stiff: 4 },
    { at: 1.65, pose: {} },
  ],
};
const mgTaunt: Action = {
  dur: 1.3,
  keys: [
    { at: 0, pose: { head: -4, up: -1.5, armR: 3 } }, // the chin up, the chest out
    { at: 0.6, pose: { head: 2, up: 0.5 } },
    { at: 0.9, pose: {} },
  ],
};

/* Боцман: a fighter in a long coat with a crowbar in the fist before his belly (L) and the other fist up in the guard (R);
   the player stands below him in the middle of the screen — the crowbar comes down from over his shoulder at him, the
   guard fist hammers down there; the body leans into each blow at the belt and the coat's tails swing after it */
const btBar: Action = {
  dur: 0.72,
  keys: [
    { at: 0, pose: { armL: -14, lowL: -92, handL: -34, up: -2.5, x: -8, head: 2, lowR: 6 } }, // the crowbar up over the shoulder
    { at: 0.18, pose: { armL: -2, lowL: -6, handL: 52, up: 4, x: 12, head: -3, armR: 3 }, stiff: 6 }, // the hook down into the player
    { at: 0.32, pose: { armL: -1, lowL: -4, handL: 34, up: 2.5, x: 7, head: -2 }, stiff: 1.4 },
    { at: 0.46, pose: {} },
  ],
  // the jaw drops on the swing, snaps shut on the blow, then the teeth grind (screens.css «bt-chomp»)
  face: [{ cls: "bt-chomp", at: 0, dur: 1.7 }],
};
const btHammer: Action = {
  dur: 0.66,
  keys: [
    { at: 0, pose: { armR: -8, lowR: 14, handR: -10, up: 1.5, x: 6, head: 1.5 } }, // the guard fist cocked up and back
    { at: 0.06, pose: { armR: 4, lowR: -110, handR: -6, up: -1, x: -4 }, stiff: 6 }, // the forearm turns counter-clockwise, over the chest
    { at: 0.13, pose: { armR: 10, lowR: -182, handR: -12, up: -3.5, x: -12, head: 2.5, armL: -3, lowL: -8 }, stiff: 6 }, // the fist down into the player
    { at: 0.26, pose: { armR: 8, lowR: -150, handR: -8, up: -2, x: -6 }, stiff: 1.4 },
    { at: 0.38, pose: {} },
  ],
};
const btTaunt: Action = {
  dur: 1.3,
  keys: [
    { at: 0, pose: { head: -4, up: -1.5, lowL: -30, handL: -18 } }, // the chin up, the crowbar lifted and tapped in the palm — «ну давай»
    { at: 0.22, pose: { head: -3, lowL: -18, handL: 6 }, stiff: 2.5 },
    { at: 0.42, pose: { head: -3, lowL: -30, handL: -16 }, stiff: 2.5 },
    { at: 0.62, pose: { head: -2, lowL: -18, handL: 6 }, stiff: 2.5 },
    { at: 0.85, pose: {} },
  ],
};

/* Утилизатор (the artist's reference video): a real breath — a long full breath in (the chest fills, the shoulders go up
   and out, the arms open with them), a short hold, a long breath out (he sinks back a little), a pause. His blows are
   quick: the upper body (the T-shirt and the apron, the legs stand) rises and stretches up and leans INTO the blow — to
   the side of the striking arm. R — the raised gloved fist (right of the picture) comes down from the elbow (a hammer
   blow); L — the fist before the belly (left) drives up (an uppercut). The jaw drops with the breath and on the blow */
const utHammer: Action = {
  dur: 0.82,
  keys: [
    { at: 0, pose: { y: -16, z: 2, up: -2, x: -3, armR: -18, lowR: -36, jaw: 0.6 } }, // rises, the fist up and back
    { at: 0.17, pose: { y: -10, z: 4, up: 6, x: 14, armR: 10, lowR: 46, head: 2, jaw: 1, lowL: 6 }, stiff: 4.5 }, // leans right into the blow
    { at: 0.32, pose: { y: -6, z: 3, up: 4, x: 9, armR: 6, lowR: 30, jaw: 0.6 }, stiff: 1.5 },
    { at: 0.5, pose: {} },
  ],
};
const utUpper: Action = {
  dur: 0.82,
  keys: [
    { at: 0, pose: { y: 4, up: 1.5, x: 2, armL: 6, lowL: 14, jaw: 0.3 } }, // dips, the fist down
    { at: 0.14, pose: { y: -18, z: 4, up: -6, x: -14, armL: -14, lowL: -50, head: -2, lowR: -6, jaw: 1 }, stiff: 4.5 }, // rises, leans left with the uppercut
    { at: 0.3, pose: { y: -12, z: 3, up: -4, x: -9, armL: -10, lowL: -36, jaw: 0.6 }, stiff: 1.5 },
    { at: 0.5, pose: {} },
  ],
};
/** his breath (s → 0…1), as in the artist's reference: a heavy heaving chest — breath in 1.25 s (the whole upper body
 *  rises and straightens, the chest fills), a moment at the top, breath out 1.35 s (he slumps, the shoulders sag), a
 *  moment at the bottom; eased at both ends so it flows */
/** his jaw clench (s → 0…1): every 4.2 s the jaws close for 0.9 s with a squeeze in the middle */
const utClench = (t: number) => {
  const p = (t % 4.2) - 3.0;
  if (p < 0 || p > 0.9) return 0;
  const env = Math.sin((p / 0.9) * Math.PI);
  return Math.min(1, env * 1.4) * (0.9 + 0.1 * Math.sin(p * 40));
};
const UT_IN = 1.25, UT_HOLD = 0.15, UT_OUT = 1.35, UT_PAUSE = 0.2, UT_CYCLE = UT_IN + UT_HOLD + UT_OUT + UT_PAUSE;
const utBreath = (t: number) => {
  const p = t % UT_CYCLE;
  if (p < UT_IN) return 0.5 - 0.5 * Math.cos((p / UT_IN) * Math.PI);
  if (p < UT_IN + UT_HOLD) return 1;
  if (p < UT_IN + UT_HOLD + UT_OUT) return 0.5 + 0.5 * Math.cos(((p - UT_IN - UT_HOLD) / UT_OUT) * Math.PI);
  return 0;
};


/* Фокус: R — his right arm (the fist on the hip, the left of the picture): uppercut-jabs from the hip, the fist grows
   at the screen; L — the knife (on the right): raised high, then stabbed down at the screen — blood splashes at the
   end of each stab (the class fk-stab, boss-fokus.tsx). The combo goes like a berserk: slow, then faster and faster;
   the glasses slide down his nose with every blow (gl), he frowns (brw), squints (sq) and grits his teeth; after the
   last blow the mouth falls open (jaw), he pants, puts the fist away, takes the hand with the pointing finger (fing) and
   pushes the glasses back up the nose, and stands in his stance again. */
const FK_R_BACK = { armR: 24, lowR: -20, handR: 4 };
const FK_R_HIT = { armR: -79, lowR: -16, handR: -8, zR: 8 };
const FK_L_BACK = { armL: -25, lowL: -44, handL: -10 };
const FK_L_HIT = { armL: 41, lowL: -98, handL: 8, zL: 8 };
/** the finger at the glasses' bridge, below it (the glasses down) and up (pushed): the whole arm turns counter-clockwise
 *  at the shoulder, the elbow comes in to the chest, the forearm stands up in front of it, the hand stays in line with
 *  it (the user's pose) — solved for the rig's joints (shoulder, elbow, wrist, the fingertip of fingerR); the hands are
 *  never bent hard at the wrist and grow only a little on a blow */
const FK_PUSH_LOW = { armR: -124.3, lowR: 0.8, handR: 0.6 };
const FK_PUSH_UP = { armR: -127.2, lowR: 0, handR: 8 };
/** a pose's turns × a (the arms swing less when he is beaten) */
const fkAmp = (p: Pose, a: number): Pose => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, (v ?? 0) * a]));
/** the combo of n blows; beaten (below half HP): amp — how far the arms swing, slow — how much longer each blow takes */
const fkCombo = (n: number, amp = 1, slow = 1): Action => {
  const keys: Key[] = [];
  const face: Face[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    // the berserk: each blow quicker than the one before (0.95 s → 0.2 s)
    const d = Math.max(0.2, 0.95 * Math.pow(0.8, i)) * slow;
    const right = i % 2 === 0;
    const k = i / (n - 1);
    // the glasses creep down, the frown deepens, the mouth grits a little more with every blow
    const f = { gl: Math.min(1, (i + 1) / (n - 2)), brw: 0.5 + 0.5 * k, sq: 0.25 + 0.45 * k, jaw: -1.1, px: right ? -0.5 : 0.5, py: 0.6 };
    const back = fkAmp(right ? { ...FK_R_BACK, up: 2.5, x: 4, head: 2.5 } : { ...FK_L_BACK, up: -2.5, x: -4, head: -2.5 }, amp);
    const hit = fkAmp(right ? { ...FK_R_HIT, up: -4, x: -12, head: -3.5, armL: 6, lowL: -8 } : { ...FK_L_HIT, up: 4.5, x: 12, head: 3.5, armR: 4, lowR: 6 }, amp);
    const after = fkAmp(right ? { armR: -75, lowR: -25, handR: -5, zR: 4 } : { armL: 28, lowL: -80, handL: 5, zL: 4 }, amp);
    const st = amp < 1 ? 0.55 : 1;
    keys.push({ at: t, pose: { ...back, ...f }, stiff: (1 + 2.5 * k) * st });
    keys.push({ at: t + d * 0.32, pose: { ...hit, ...f }, stiff: (5 + 3 * k) * st });
    face.push({ cls: right ? "fk-punch" : "fk-stab", at: t + d * 0.32 + 0.06, dur: 0.1 });
    keys.push({ at: t + d * 0.62, pose: { ...hit, ...f, ...after }, stiff: (2 + 2 * k) * st });
    t += d;
  }
  // done: the mouth falls open, he pants, the arms drop back into the stance
  const done = { gl: 1, brw: 0.2, sq: 0.1, jaw: 0.35, px: 0, py: 0.3 };
  keys.push({ at: t, pose: { ...done, up: -1.5, head: 3 }, stiff: 1.2 });
  // the fist off the hip → the hand with the finger, up under the glasses' bridge (the head still, to meet it)
  keys.push({ at: t + 0.7, pose: { ...done, ...FK_PUSH_LOW, fing: 1, px: 0, py: -0.4, brw: -0.3 }, stiff: 1.6 });
  // the push: the glasses go back up the nose
  keys.push({ at: t + 1.25, pose: { ...done, ...FK_PUSH_UP, fing: 1, gl: 0, jaw: 0.15, py: -0.2, brw: -0.5 }, stiff: 1.8 });
  keys.push({ at: t + 1.65, pose: { ...FK_PUSH_UP, fing: 1, jaw: 0.15, brw: -0.3 }, stiff: 1.2 });
  // the hand down, the fist back on the hip; the mouth closes slowly with the breath
  keys.push({ at: t + 1.95, pose: { armR: -35, lowR: -15, handR: 0, fing: 1, jaw: 0.15 }, stiff: 1.3 });
  keys.push({ at: t + 2.35, pose: { jaw: 0 }, stiff: 1 });
  return { keys, dur: t + 2.8, face };
};
const fkCombo12 = fkCombo(12);
/** the glasses' arm: from the hinge (it moves with the glasses: screens.css .fk-glasses — rotate(−2.5°·gl) round C, then
 *  down 11 px·gl) to the top of the ear (stays): turned and stretched / squeezed along its length round the ear */
const FK_HINGE = [436, 124.5], FK_EAR = [444, 149], FK_GL_C = [374.5, 132.9];
function fkTemple(gl: number) {
  const r = (-2.5 * gl * Math.PI) / 180;
  const dx = FK_HINGE[0] - FK_GL_C[0], dy = FK_HINGE[1] - FK_GL_C[1];
  const hx = FK_GL_C[0] + dx * Math.cos(r) - dy * Math.sin(r), hy = FK_GL_C[1] + dx * Math.sin(r) + dy * Math.cos(r) + 11 * gl;
  const a0 = Math.atan2(FK_HINGE[1] - FK_EAR[1], FK_HINGE[0] - FK_EAR[0]), a1 = Math.atan2(hy - FK_EAR[1], hx - FK_EAR[0]);
  const s = Math.hypot(hx - FK_EAR[0], hy - FK_EAR[1]) / Math.hypot(FK_HINGE[0] - FK_EAR[0], FK_HINGE[1] - FK_EAR[1]);
  return { "--ta0": `${(-a0 * 180 / Math.PI).toFixed(2)}deg`, "--ta1": `${(a1 * 180 / Math.PI).toFixed(2)}deg`, "--ts": Math.max(0.15, s).toFixed(3) };
}
const fkCombo10 = fkCombo(10);
/** below a quarter HP: no blows — the glasses slide down his nose slowly, he slowly lifts the hand with the finger and
 *  pushes them back up, and the hand sinks back to the hip */
const fkGlasses: Action = {
  keys: [
    { at: 0, pose: { gl: 1, jaw: 0.15, brw: 0.15, sq: 0.2, head: 3, py: 0.4 }, stiff: 0.14 },
    { at: 2.6, pose: { gl: 1, ...FK_PUSH_LOW, fing: 1, jaw: 0.15, py: -0.4, brw: -0.2 }, stiff: 0.35 },
    { at: 4.8, pose: { gl: 0, ...FK_PUSH_UP, fing: 1, jaw: 0.15, py: -0.2, brw: -0.4 }, stiff: 0.55 },
    { at: 5.8, pose: { ...FK_PUSH_UP, fing: 1, jaw: 0.15 }, stiff: 0.45 },
    { at: 6.3, pose: { armR: -35, lowR: -15, handR: 0, fing: 1, jaw: 0.15 }, stiff: 0.32 },
    { at: 7.6, pose: { jaw: 0.15 }, stiff: 0.35 },
  ],
  dur: 8.8,
};
/** beaten: the weight goes from one foot to the other (the legs are fixed at the feet only then — boss-fokus.tsx), the
 *  body leans with it, the head the other way, up a little on each foot */
const fkShift = (rate: number, a: number) => (t: number): Pose => {
  const s = Math.sin(t * rate);
  return { x: 10 * a * s, up: 1.6 * a * s, head: -1.2 * a * s, y: -2.2 * a * Math.abs(s) };
};


/* Нитка (boss-nitka.tsx): quick and nervy. Both fists hold a needle up by the face, its point out under the fist. A stab:
   the fist goes up and back (the wind-up), then comes down at the screen hard and grows (zR / zL) — he drops into a
   small crouch (y: the knees bend, the puppet bends the body over them) and leans in; the mouth snaps open (jaw), the
   brows frown (brw); blood flies off the needle (nt-stab-r / nt-stab-l). A twist: the stab stays in and the fist turns
   left and right a few times — he picks at the wound. Both fists at once too. The glasses jump on every quick move
   (gb: a loose spring, it overshoots) and wobble (.nt-glasses-j, the hair spring). */
const NT_R_BACK = { armR: 16, lowR: -30, handR: -10 };
const NT_R_HIT = { armR: -22, lowR: 82, handR: 18, zR: 26 };
const NT_L_BACK = { armL: -16, lowL: 30, handL: 10 };
const NT_L_HIT = { armL: 22, lowL: -82, handL: -18, zL: 26 };
const ntAmp = (p: Pose, a: number): Pose => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, (v ?? 0) * (k === "jaw" || k === "brw" || k === "gb" ? 1 : a)]));
/** one stab at t: side r / l / both; twist — the fist picks in the wound; amp / slow — beaten */
const ntStab = (t: number, side: "r" | "l" | "b", keys: Key[], face: Face[], twist = false, amp = 1, slow = 1) => {
  const r = side !== "l", l = side !== "r";
  const lean = side === "r" ? -1 : side === "l" ? 1 : 0;
  const back = ntAmp({ ...(r ? NT_R_BACK : {}), ...(l ? NT_L_BACK : {}), up: -2.5 * lean, x: 5 * lean, y: -4, head: -2 * lean, brw: 0.4, jaw: 0.1, gb: -0.4 }, amp);
  const hit = ntAmp({ ...(r ? NT_R_HIT : {}), ...(l ? NT_L_HIT : {}), up: 5 * lean + (side === "b" ? 4 : 0), x: -14 * lean, y: 34, head: 3 * lean + 3, brw: 1, jaw: 1, gb: 1 }, amp);
  keys.push({ at: t, pose: back, stiff: 2.2 });
  keys.push({ at: t + 0.16 * slow, pose: hit, stiff: 7 });
  if (r) face.push({ cls: "nt-stab-r", at: t + 0.22 * slow, dur: 0.1 });
  if (l) face.push({ cls: "nt-stab-l", at: t + 0.22 * slow, dur: 0.1 });
  t += 0.34 * slow;
  if (twist) {
    // the needle stays in: the fist turns one way and the other, the body leans into it, the mouth grits
    for (let k = 0; k < 4; k++) {
      const w = k % 2 ? -1 : 1;
      keys.push({ at: t, pose: ntAmp({ ...hit, ...(r ? { handR: 18 + 30 * w, lowR: 82 + 6 * w } : {}), ...(l ? { handL: -18 - 30 * w, lowL: -82 - 6 * w } : {}), jaw: 0.25, brw: 1, gb: 0.5 * w, head: hit.head! + 1.5 * w }, 1), stiff: 6 });
      t += 0.11 * slow;
    }
    if (r) face.push({ cls: "nt-stab-r", at: t - 0.2 * slow, dur: 0.08 });
    if (l) face.push({ cls: "nt-stab-l", at: t - 0.2 * slow, dur: 0.08 });
  }
  // pulled out, back up into the stance
  keys.push({ at: t, pose: ntAmp({ ...(r ? { armR: 4, lowR: 10 } : {}), ...(l ? { armL: -4, lowL: -10 } : {}), y: 3, jaw: 0.2, brw: 0.4, gb: -0.3 }, amp), stiff: 2.5 });
  return t + 0.22 * slow;
};
/** a run of stabs: r, l, a twist, both at once — quick, a short breath between */
const ntCombo = (plan: ("r" | "l" | "b" | "R" | "L" | "B")[], amp = 1, slow = 1): Action => {
  const keys: Key[] = [], face: Face[] = [];
  let t = 0;
  for (const s of plan) {
    const tw = s === "R" || s === "L" || s === "B";
    t = ntStab(t, s.toLowerCase() as "r" | "l" | "b", keys, face, tw, amp, slow);
    t += 0.08 * slow;
  }
  keys.push({ at: t, pose: { jaw: 0.15 }, stiff: 1.2 });
  return { keys, dur: t + 0.5, face };
};
/** beaten: he shifts his weight from foot to foot, the head the other way */
const ntShift = (rate: number, a: number) => (t: number): Pose => {
  const s = Math.sin(t * rate);
  return { x: 8 * a * s, up: 1.4 * a * s, head: -1.4 * a * s, y: 3 * a * Math.abs(s) };
};

/* Солнце (boss-sun.tsx): huge and slow, every move heavy. He breathes hard all the time, in and out without a stop (the
   user 2026-11-25) — in: the pecs, the arms and the trunk swell (sw → screens.css --sw, swa: the arms grow from the
   shoulders, %), the arms rise, the chin goes up and the jaw drops open; out: all of it sinks back, the jaw half closes
   and the spit flies (boss-sun.tsx useSpit sees the swell turn). The breath runs on its own (snBreathPose in his idle);
   the blows come whenever, on the breath in or out: R — the poker in his right (lava) fist, raised high behind and
   slammed down at the screen; L — the left (yellow) fist, raised and hammered down. Slow wind-ups, a short heavy blow. */
const SN_FULL = { sw: 1, swa: 8, jaw: 1, armR: 10, lowR: 6, armL: -9, lowL: -5, head: -2.5, y: -7, up: -0.8 };
const SN_EMPTY = { sw: 0, swa: 0, jaw: 0.35, armR: -3, lowR: -2, armL: 3, lowL: 2, head: 1.5, y: 2, up: 0.5 };
/** one breath (in + out), s: healthy / below half / below a quarter */
const SN_BREATH = [3.7, 5.2, 6.4];
/** the breath now: in and straight out again, a smooth wave between the empty and the full chest */
const snBreathPose = (t: number, lvl: number): Pose => {
  const u = (1 - Math.cos((2 * Math.PI * t) / SN_BREATH[Math.min(2, lvl)])) / 2;
  const out: Pose = {};
  for (const k of Object.keys(SN_FULL) as (keyof typeof SN_FULL)[]) out[k] = SN_EMPTY[k] + (SN_FULL[k] - SN_EMPTY[k]) * u;
  return out;
};
/** the blows (the breath goes on under them): the poker, then the fist */
const snBlows = (t: number, keys: Key[], face: Face[], amp = 1, slow = 1) => {
  const a = (p: Pose): Pose => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, (v ?? 0) * amp]));
  // the poker: the elbow up and the forearm back, so its hook end stands high; then the forearm swings down and the
  // hook end comes down at us, under him
  keys.push({ at: t, pose: a({ armR: 40, lowR: -48, up: 3.5, x: 8, head: 2, armL: -6 }), stiff: 0.9 });
  keys.push({ at: t + 0.7 * slow, pose: a({ armR: -12, lowR: 52, zR: 14, up: -6, x: -14, head: -3.5, armL: 4 }), stiff: 5 });
  face.push({ cls: "sn-slam", at: t + 0.8 * slow, dur: 0.16 });
  keys.push({ at: t + 0.95 * slow, pose: a({ armR: -6, lowR: 36, zR: 5, up: -3, x: -7 }), stiff: 1.1 });
  t += 1.5 * slow;
  // the fist: raised high, then hammered down under him (we are below him) — the shoulder and the elbow turn down
  keys.push({ at: t, pose: a({ armL: -38, lowL: -42, up: -3, x: -6, head: -2, armR: 4, lowR: -10 }), stiff: 0.9 });
  keys.push({ at: t + 0.62 * slow, pose: a({ armL: 44, lowL: 38, zL: 22, up: 5, x: 12, head: 4 }), stiff: 5 });
  face.push({ cls: "sn-slam", at: t + 0.72 * slow, dur: 0.16 });
  keys.push({ at: t + 0.88 * slow, pose: a({ armL: 30, lowL: 26, zL: 8, up: 3, x: 6 }), stiff: 1.1 });
  t += 1.4 * slow;
  keys.push({ at: t, pose: {}, stiff: 0.8 });
  return t + 0.35 * slow;
};
/** the heavy rock from foot to foot (the feet stay put: only the upper body goes over them) */
const snSway = (rate: number, a: number) => (t: number): Pose => {
  const s = Math.sin(t * rate);
  return { x: 9 * a * s, up: 1.8 * a * s, head: -1.4 * a * s, y: 2 * a * Math.abs(s) };
};
/** he strikes the player: the two blows at once */
const snStrike = (amp = 1, slow = 1): Action => { const keys: Key[] = [], face: Face[] = []; const t = snBlows(0, keys, face, amp, slow); return { keys, dur: t, face }; };

/* Фокус (boss-fokus.tsx, the new art): the flip phone up in his right fist, the laptop under his left arm. A blow: the
   fist goes up and back (the wind-up), then the phone comes down at the screen hard and grows (zR) — the knees give (y),
   he leans in; the lid of the phone swings towards shut on the blow (ph, a loose spring: it flaps and opens again, never
   past open); the mouth snaps open (jaw), the brows frown (brw), the glasses jump (gb). R — a heavy one: a longer
   wind-up, a deeper crouch. The left arm with the laptop sinks a little with each blow, as if he hugs it. */
const FX_BACK = { armR: 12, lowR: -24, handR: -12 };
const FX_HIT = { armR: -20, lowR: 74, handR: 22, zR: 24 };
const fxAmp = (p: Pose, a: number): Pose => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, (v ?? 0) * (k === "jaw" || k === "brw" || k === "gb" || k === "ph" ? 1 : a)]));
const fxBlow = (t: number, heavy: boolean, keys: Key[], amp = 1, slow = 1) => {
  const w = heavy ? 1.5 : 1;
  keys.push({ at: t, pose: fxAmp({ ...FX_BACK, armR: FX_BACK.armR * w, lowR: FX_BACK.lowR * w, up: 2.5, x: -4, y: -4, head: -2, brw: 0.4, jaw: 0.1, gb: -0.4, armL: -2, lowL: -2 }, amp), stiff: 2.2 });
  t += (heavy ? 0.32 : 0.18) * slow;
  keys.push({ at: t, pose: fxAmp({ ...FX_HIT, zR: FX_HIT.zR * (heavy ? 1.3 : 1), up: -5, x: 12, y: heavy ? 44 : 30, head: 4, brw: 1, jaw: 1, gb: 1, ph: 1, armL: 6, lowL: 5 }, amp), stiff: 7 });
  t += 0.2 * slow;
  keys.push({ at: t, pose: fxAmp({ armR: 3, lowR: 8, y: 3, jaw: 0.2, brw: 0.4, gb: -0.3, ph: 0 }, amp), stiff: 2.5 });
  return t + 0.2 * slow;
};
/** a run of blows: r — a quick one, R — a heavy one */
const fxCombo = (plan: ("r" | "R")[], amp = 1, slow = 1): Action => {
  const keys: Key[] = [];
  let t = 0;
  for (const s of plan) { t = fxBlow(t, s === "R", keys, amp, slow); t += 0.1 * slow; }
  keys.push({ at: t, pose: { jaw: 0.12 }, stiff: 1.2 });
  return { keys, dur: t + 0.5 };
};
/** beaten: the weight from foot to foot, the head the other way */
const fxShift = (rate: number, a: number) => (t: number): Pose => {
  const s = Math.sin(t * rate);
  return { x: 8 * a * s, up: 1.4 * a * s, head: -1.4 * a * s, y: 3 * a * Math.abs(s) };
};

const POSES: Record<string, Spec> = {
  solntse: {
    // heavy: slow, overdamped springs; the fists a little quicker on the blow
    springs: {
      up: { k: 55, c: 13 }, x: { k: 50, c: 12 }, y: { k: 30, c: 10 }, head: { k: 70, c: 14 },
      armR: { k: 90, c: 16 }, lowR: { k: 140, c: 19 }, armL: { k: 90, c: 16 }, lowL: { k: 140, c: 19 },
      zR: { k: 120, c: 18 }, zL: { k: 120, c: 18 },
      sw: { k: 16, c: 6.5 }, swa: { k: 6, c: 4.6 }, jaw: { k: 14, c: 7 }, px: { k: 80, c: 15 }, py: { k: 80, c: 15 },
    },
    drag: { lowL: ["armL", -0.05], lowR: ["armR", -0.05], head: ["up", -0.06] },
    // never still: a slow heavy sway; the eyes look about now and then
    // the breath (in and out, never a stop) and the eyes looking about now and then
    idle: (t, lvl = 0) => {
      const g = Math.floor(t / 2.2);
      const r = (n: number) => { const v = Math.sin(n * 12.9898 + g * 78.233) * 43758.5453; return v - Math.floor(v); };
      const b = snBreathPose(t, lvl);
      return {
        ...b,
        up: (b.up ?? 0) + 0.6 * Math.sin(t * 0.55), x: 2 * Math.sin(t * 0.4),
        head: (b.head ?? 0) + 0.8 * Math.sin(t * 0.7 + 1),
        lowR: (b.lowR ?? 0) + 1.2 * Math.sin(t * 0.9 + 2), lowL: (b.lowL ?? 0) + 1.2 * Math.sin(t * 0.8),
        px: (r(1) - 0.5) * 1.4, py: (r(2) - 0.5) * 0.7,
      };
    },
    // the blows whenever (the breath goes on under them)
    actions: [{ a: snStrike(), w: 1 }],
    rest: [1.5, 5],
    hit: { head: -120, up: -40, x: -40, armL: 60, lowL: -70, armR: -60, lowR: 70, jaw: 2 },
    strike: snStrike(),
    // below half (bloody, boss-sun.tsx): the same loop, but slow and heavy — the blows smaller and dragged out, the
    // breath long, a slow rock from foot to foot; below a quarter: no blows any more, only the slow heavy breath
    dazed: { pose: { head: 3, armR: -7, armL: 7 }, act: true, sway: snSway(0.6, 1), actions: [{ a: snStrike(0.7, 2), w: 1 }], rest: [3, 7], strike: snStrike(0.7, 2), speed: 0.6 },
    dying: { pose: { head: 5, armR: -14, armL: 14, up: -1 }, act: false, sway: snSway(0.45, 1.3), noStrike: true },
    shapes: { sw: {}, swa: {}, px: {}, py: {} },
    scale: { armR: "swa", armL: "swa", lowR: "zR", lowL: "zL" },
    vars: (a) => ({
      "--sw": Math.max(0, Math.min(1.2, a.sw)).toFixed(3), "--jaw": Math.max(0, Math.min(1.2, a.jaw)).toFixed(3),
      // the arms' rise (0…1, past the rest): the pec on that side is pulled up and stretched with its arm
      "--rr": Math.max(-0.4, Math.min(1.2, (a.armR ?? 0) / 45)).toFixed(3), "--rl": Math.max(-0.4, Math.min(1.2, -(a.armL ?? 0) / 40)).toFixed(3),
      "--px": a.px.toFixed(3), "--py": a.py.toFixed(3),
    }),
    stiffOwn: true,
  },
  nitka: {
    // quick: stiff springs, the fists quicker still; the glasses on a loose spring (they jump and settle)
    springs: {
      up: { k: 170, c: 15 }, x: { k: 160, c: 15 }, y: { k: 190, c: 17 }, head: { k: 200, c: 14 },
      armR: { k: 260, c: 20 }, lowR: { k: 380, c: 24 }, handR: { k: 900, c: 48 },
      armL: { k: 260, c: 20 }, lowL: { k: 380, c: 24 }, handL: { k: 900, c: 48 },
      zR: { k: 380, c: 30 }, zL: { k: 380, c: 30 },
      jaw: { k: 260, c: 20 }, brw: { k: 160, c: 16 }, gb: { k: 320, c: 7 }, px: { k: 220, c: 20 }, py: { k: 220, c: 20 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.01], lowR: ["armR", -0.05], handR: ["lowR", -0.01], head: ["up", -0.08] },
    // never still: a nervous little bounce, the needles twitch in the fists; the eyes (cross-eyed as drawn) dart about
    // together — a new spot every ~1.2 s; the mouth breathes a little
    idle: (t) => {
      const g = Math.floor(t / 1.2);
      const r = (n: number) => { const v = Math.sin(n * 12.9898 + g * 78.233) * 43758.5453; return v - Math.floor(v); };
      return {
        up: 0.9 * Math.sin(t * 1.3) + 0.4 * Math.sin(t * 2.9 + 1), x: 2.5 * Math.sin(t * 0.9),
        y: 1.5 * (0.5 - 0.5 * Math.cos(t * 2.2)),
        head: 1.6 * Math.sin(t * 1.4 + 1) + 0.8 * Math.sin(t * 0.6),
        armR: 1.6 * Math.sin(t * 1.5 + 2), lowR: 2.5 * Math.sin(t * 1.9 + 1), handR: 4 * Math.sin(t * 2.7),
        armL: 1.6 * Math.sin(t * 1.6), lowL: 2.5 * Math.sin(t * 2.1 + 0.5), handL: 4 * Math.sin(t * 3.1 + 1),
        jaw: 0.08 + 0.08 * (0.5 - 0.5 * Math.cos(t * 2.4)),
        px: (r(1) - 0.5) * 1.8, py: (r(2) - 0.5) * 1.1,
      };
    },
    actions: [
      { a: ntCombo(["r", "l", "r", "L"]), w: 2 }, { a: ntCombo(["l", "R", "b"]), w: 2 },
      { a: ntCombo(["B"]), w: 1 }, { a: ntCombo(["r", "r", "l", "l", "b"]), w: 1 },
    ],
    rest: [1.6, 3.2],
    hit: { head: -300, up: -90, x: -70, y: -60, armL: 110, lowL: -140, armR: -110, lowR: 140, handL: -40, handR: 40, gb: 12, jaw: 6 },
    strike: ntCombo(["R", "b"]),
    // below half: slower and smaller, a shift from foot to foot; below a quarter: a slow lone stab now and then
    dazed: { pose: { armL: 6, armR: -6, head: 3, jaw: 0.25 }, act: true, sway: ntShift(1.8, 1), actions: [{ a: ntCombo(["r", "L"], 0.7, 1.8), w: 1 }, { a: ntCombo(["l", "R"], 0.7, 1.8), w: 1 }], rest: [4, 6], strike: ntCombo(["B"], 0.7, 1.8), speed: 0.65 },
    dying: { pose: { armL: 14, armR: -14, head: 6, up: -2, jaw: 0.4 }, act: true, sway: ntShift(1.2, 1.2), actions: [{ a: ntCombo(["r"], 0.45, 2.2), w: 1 }, { a: ntCombo(["l"], 0.45, 2.2), w: 1 }], rest: [5, 8], strike: ntCombo(["b"], 0.45, 2.4), speed: 0.5 },
    // he breathes hard: the chest swells and the shoulders go up with every breath (the user 2026-11-25)
    breath: (t, dazed) => { const b = 0.5 - 0.5 * Math.cos((t / (dazed ? 1.3 : 1)) * Math.PI * 2); return [1 + 0.016 * b, 1 + 0.036 * b, -5 * b]; },
    // the open shirt's tails: they lag behind his moves and flutter a little
    hem: { sel: ".nt-hem", k: 45, c: 4.2, up: 0.9, x: 0.22, flutter: (t) => 0.9 * Math.sin(t * 1.9) + 0.45 * Math.sin(t * 3.3 + 1) },
    shapes: { jaw: {}, brw: {}, gb: {}, px: {}, py: {} },
    scale: { handR: "zR", handL: "zL" },
    vars: (a) => ({
      "--jaw": Math.max(0, Math.min(1, a.jaw)).toFixed(3), "--brw": a.brw.toFixed(3), "--gb": a.gb.toFixed(3),
      "--px": a.px.toFixed(3), "--py": a.py.toFixed(3),
    }),
    stiffOwn: true,
    hair: { sel: ".nt-glasses-j", k: 260, c: 6, turn: 0.35, jerk: 0.006, flutter: () => 0 },
  },
  fokus: {
    // quick and sharp: stiff springs; the glasses and the hood on a loose spring, the phone's lid looser still
    springs: {
      up: { k: 160, c: 15 }, x: { k: 150, c: 15 }, y: { k: 190, c: 17 }, head: { k: 190, c: 14 },
      armR: { k: 250, c: 20 }, lowR: { k: 360, c: 24 }, handR: { k: 800, c: 44 },
      armL: { k: 140, c: 16 }, lowL: { k: 160, c: 17 }, handL: { k: 400, c: 30 },
      zR: { k: 360, c: 30 },
      jaw: { k: 240, c: 20 }, brw: { k: 160, c: 16 }, gb: { k: 320, c: 7 }, ph: { k: 260, c: 9 }, px: { k: 200, c: 20 }, py: { k: 200, c: 20 },
    },
    drag: { lowL: ["armL", -0.04], handL: ["lowL", -0.01], lowR: ["armR", -0.05], handR: ["lowR", -0.01], head: ["up", -0.08] },
    // never still: a small nervous bounce, the phone twitches in the fist, the laptop arm breathes; the eyes look about
    // (a new spot every ~1.4 s); the mouth a little open
    idle: (t) => {
      const g = Math.floor(t / 1.4);
      const r = (n: number) => { const v = Math.sin(n * 12.9898 + g * 78.233) * 43758.5453; return v - Math.floor(v); };
      return {
        up: 0.8 * Math.sin(t * 1.2) + 0.3 * Math.sin(t * 2.7 + 1), x: 2.2 * Math.sin(t * 0.8),
        y: 1.2 * (0.5 - 0.5 * Math.cos(t * 2)),
        head: 1.4 * Math.sin(t * 1.3 + 1) + 0.7 * Math.sin(t * 0.55),
        armR: 1.4 * Math.sin(t * 1.4 + 2), lowR: 2.2 * Math.sin(t * 1.8 + 1), handR: 3.5 * Math.sin(t * 2.5),
        armL: 1.2 * Math.sin(t * 0.9), lowL: 1.5 * Math.sin(t * 1.1 + 0.5) + 1.5 * (0.5 - 0.5 * Math.cos(t * 0.45)),
        jaw: 0.08 + 0.08 * (0.5 - 0.5 * Math.cos(t * 2.2)),
        px: (r(1) - 0.5) * 1.8, py: (r(2) - 0.5) * 1.1,
      };
    },
    actions: [
      { a: fxCombo(["r", "r", "R"]), w: 2 }, { a: fxCombo(["r", "R"]), w: 2 },
      { a: fxCombo(["R"]), w: 1 }, { a: fxCombo(["r", "r", "r", "R"]), w: 1 },
    ],
    rest: [1.6, 3.2],
    hit: { head: -300, up: -90, x: -70, y: -60, armL: 60, lowL: -60, armR: -110, lowR: 140, handR: 40, gb: 12, jaw: 6, ph: 10 },
    strike: fxCombo(["R", "r"]),
    // below half: slower and smaller, from foot to foot; below a quarter: a slow lone blow now and then
    dazed: { pose: { armL: 4, armR: -6, head: 3, jaw: 0.25 }, act: true, sway: fxShift(1.8, 1), actions: [{ a: fxCombo(["r", "R"], 0.7, 1.8), w: 1 }], rest: [4, 6], strike: fxCombo(["R"], 0.7, 1.8), speed: 0.65 },
    dying: { pose: { armL: 10, armR: -14, head: 6, up: -2, jaw: 0.4 }, act: true, sway: fxShift(1.2, 1.2), actions: [{ a: fxCombo(["r"], 0.45, 2.2), w: 1 }], rest: [5, 8], strike: fxCombo(["R"], 0.45, 2.4), speed: 0.5 },
    breath: (t, dazed) => { const b = 0.5 - 0.5 * Math.cos((t / (dazed ? 1.4 : 1.1)) * Math.PI * 2); return [1 + 0.012 * b, 1 + 0.026 * b, -4 * b]; },
    // the coat's tails lag behind his moves and flutter a little
    hem: { sel: ".fx-hem", k: 40, c: 4, up: 0.9, x: 0.25, flutter: (t) => 0.8 * Math.sin(t * 1.7) + 0.4 * Math.sin(t * 3.1 + 1) },
    shapes: { jaw: {}, brw: {}, gb: {}, ph: {}, px: {}, py: {} },
    scale: { handR: "zR" },
    vars: (a) => ({
      "--jaw": Math.max(0, Math.min(1, a.jaw)).toFixed(3), "--brw": a.brw.toFixed(3), "--gb": a.gb.toFixed(3),
      // the lid only goes towards shut (0 open as drawn … 1 nearly shut)
      "--ph": Math.max(0, Math.min(1, a.ph)).toFixed(3),
      "--px": a.px.toFixed(3), "--py": a.py.toFixed(3),
    }),
    stiffOwn: true,
    // the glasses and the hood: they lag behind the head's turns and the jerks
    hair: { sel: ".fx-glasses-j, .fx-hood-j", k: 200, c: 8, turn: 0.3, jerk: 0.005, flutter: () => 0 },
  },
  // Псих: the old Фокус's art and moves (boss-psih.tsx)
  psih: {
    springs: {
      up: { k: 120, c: 13 }, x: { k: 110, c: 13 }, head: { k: 150, c: 12 },
      armR: { k: 170, c: 17 }, lowR: { k: 260, c: 19 }, handR: { k: 1100, c: 66 },
      armL: { k: 170, c: 17 }, lowL: { k: 260, c: 19 }, handL: { k: 1100, c: 66 },
      zR: { k: 300, c: 30 }, zL: { k: 300, c: 30 },
      gl: { k: 70, c: 13 }, fing: { k: 900, c: 60 }, jaw: { k: 90, c: 14 }, brw: { k: 120, c: 16 }, sq: { k: 120, c: 16 },
      px: { k: 160, c: 18 }, py: { k: 160, c: 18 },
    },
    drag: { lowL: ["armL", -0.06], handL: ["lowL", -0.008], lowR: ["armR", -0.06], handR: ["lowR", -0.008], head: ["up", -0.09] },
    // never still: a slow weight shift, the head nods; the eyes look about (a new spot every ~1.7 s); heavy breathing
    // keeps the mouth a little open
    idle: (t) => {
      const g = Math.floor(t / 1.7);
      const r = (n: number) => { const v = Math.sin(n * 12.9898 + g * 78.233) * 43758.5453; return v - Math.floor(v); };
      return {
        up: 0.8 * Math.sin(t * 0.9) + 0.3 * Math.sin(t * 2.1 + 1),
        x: 2.5 * Math.sin(t * 0.7),
        head: 1.4 * Math.sin(t * 1.1 + 1) + 0.7 * Math.sin(t * 0.47),
        armR: 1.4 * Math.sin(t * 1.2 + 2), lowR: 2 * Math.sin(t * 1.5 + 1), handR: 2.5 * Math.sin(t * 1.9),
        armL: 1.6 * Math.sin(t * 1.3), lowL: 2.4 * Math.sin(t * 1.7 + 0.5), handL: 3 * Math.sin(t * 2.3 + 1),
        jaw: 0.7 + 0.3 * (0.5 - 0.5 * Math.cos((t / 1.25) * Math.PI * 2)),
        px: (r(1) - 0.5) * 1.6, py: (r(2) - 0.5) * 0.9,
      };
    },
    actions: [{ a: fkCombo12, w: 2 }, { a: fkCombo10, w: 1 }],
    // about 5 seconds in the stance between the combos
    rest: [4.8, 5.6],
    hit: { head: -320, up: -90, x: -70, armL: 120, lowL: -150, armR: -110, lowR: 150, handL: -30, handR: 30, gl: 3, jaw: 4 },
    strike: fkCombo(6),
    // below half: he sways from foot to foot, the combos come shorter, slower and smaller
    dazed: { pose: { armL: 6, armR: -5, head: 3, gl: 0.5, jaw: 0.2 }, act: true, sway: fkShift(2, 1),
      actions: [{ a: fkCombo(6, 0.6, 1.7), w: 1 }], rest: [5, 7], strike: fkCombo(4, 0.6, 1.7), speed: 1 },
    // below a quarter: no blows any more — he sways slower and only pushes his sliding glasses back up, slowly
    dying: { pose: { armL: 10, armR: -8, head: 5, jaw: 0.3 }, act: true, sway: fkShift(1.5, 0.85),
      actions: [{ a: fkGlasses, w: 1 }], rest: [0.6, 1.8], strike: fkCombo(2, 0.4, 2.2), speed: 1 },
    // the heavy breath: the chest up and wider, slow and deep
    breath: (t, dazed) => { const b = 0.5 - 0.5 * Math.cos((t / (dazed ? 1.6 : 1.25)) * Math.PI * 2); return [1 + 0.012 * b, 1 + 0.022 * b, -3.5 * b]; },
    shapes: { gl: {}, fing: {}, brw: {}, sq: {}, px: {}, py: {} },
    scale: { handR: "zR", handL: "zL" },
    vars: (a) => ({
      ...fkTemple(a.gl),
      "--gl": a.gl.toFixed(3), "--fing": Math.max(0, Math.min(1, a.fing)).toFixed(3), "--jaw": Math.max(0, Math.min(1.25, a.jaw)).toFixed(3),
      "--brw": a.brw.toFixed(3), "--sq": Math.max(0, Math.min(1, a.sq)).toFixed(3), "--px": a.px.toFixed(3), "--py": a.py.toFixed(3),
    }),
    stiffOwn: true,
    hair: { sel: ".fk-hair", k: 95, c: 7, turn: 0.55, jerk: 0.012, flutter: (t) => 0.8 * Math.sin(t * 2.3) + 0.5 * Math.sin(t * 5.1 + 1) },
  },
  utilizator: {
    // the body is heavy (soft, overdamped), the arms quick
    springs: {
      up: { k: 70, c: 14 }, x: { k: 60, c: 13 }, y: { k: 110, c: 19 }, z: { k: 60, c: 13 }, head: { k: 110, c: 20 },
      armL: { k: 170, c: 18 }, lowL: { k: 320, c: 22 },
      armR: { k: 170, c: 18 }, lowR: { k: 320, c: 22 },
      jaw: { k: 260, c: 26 },
    },
    // the head stays on the neck: a small drag (the T-shirt's neck is cut flat under the chin)
    drag: { lowL: ["armL", -0.03], lowR: ["armR", -0.03], head: ["up", -0.02] },
    // the breath: in — the whole upper body (the legs stand) rises and stands taller, the chest fills, the shoulders go
    // up and the arms open, the chin lifts; out — he slumps below his rest, the shoulders and the arms sag
    idle: (t) => {
      const b = utBreath(t);
      return {
        y: 7 - 30 * b,
        up: 0.4 * Math.sin(t * 0.45),
        x: 1.2 * Math.sin(t * 0.3),
        head: -2.2 * b + 1 + 0.4 * Math.sin(t * 0.6 + 1),
        armL: 5 * b - 1.5, lowL: 3 * b + 0.8 * Math.sin(t * 0.9 + 0.5),
        armR: -5 * b + 1.5, lowR: -3 * b + 1 * Math.sin(t * 0.8 + 1),
        // the mouth stays open; now and then he clenches his jaws (shut, holds, a second squeeze, open again)
        jaw: 1 - utClench(t),
      };
    },
    // the chest: in — fuller and taller (from the belt up), out — it sinks back
    breath: (t, dazed) => { const b = utBreath(dazed ? t * 0.8 : t); return [1 + 0.035 * b, 0.985 + 0.045 * b, 0]; },
    // the mouth: drawn open wide (jaw 1); at rest he shuts it — the lower lip goes up, the chin stretches from its bottom
    // and the corners stay put (screens.css «Утилизатор», --close); he opens it a little with each breath in and yells
    // on the blow
    vars: (a) => ({ "--close": (1 - Math.max(0, Math.min(1, a.jaw ?? 0))).toFixed(3) }),
    actions: [
      { a: utHammer, w: 30 },
      { a: utUpper, w: 26 },
      { a: join(utUpper, shift(utHammer, 0.12)), w: 18 },
      { a: join(utHammer, shift(utHammer, 0.12)), w: 8 },
      { a: taunt, w: 5 },
    ],
    rest: [1.6, 3.6],
    hit: { head: 60, up: 50, x: 40, y: 50, jaw: 3, armL: -80, lowL: 110, armR: 70, lowR: -120 },
    strike: join(utUpper, shift(utHammer, 0.12)),
    // the apron's hem: heavy rubber, it lags behind his lean and sway and swings back on its own
    hem: { sel: ".bs-hem", k: 40, c: 5.5, up: 0.55, x: 0.12, flutter: (t) => 0.35 * Math.sin(t * 1.3) + 0.15 * Math.sin(t * 2.7 + 1) },
    // beaten: he stands on his boots (the legs never move) and sways from the hips like a drunk — slow, never still, the
    // upper body leaning over and back in a loose figure, the head lagging and lolling the other way, the arms hanging
    dazed: {
      pose: { armL: 8, lowL: 20, armR: 16, lowR: 46, head: 5, up: -1.5, y: 4, jaw: 0.5 }, act: false,
      sway: (t) => {
        const a = t * 0.85;
        return {
          up: 4.2 * Math.sin(a) + 1.3 * Math.sin(a * 1.9 + 1.1),
          x: 11 * Math.sin(a - 0.5) + 3 * Math.sin(a * 0.43 + 2),
          y: 3 * Math.sin(a * 2 + 0.3),
          head: -3.2 * Math.sin(a - 1.1) + 1.4 * Math.sin(a * 1.3 + 0.4),
          armL: -3 * Math.sin(a - 0.9), lowL: 4 * Math.sin(a - 1.3),
          armR: -3 * Math.sin(a - 0.9), lowR: 5 * Math.sin(a - 1.2),
        };
      },
    },
  },
  botsman: {
    springs: {
      up: { k: 70, c: 11.5 }, x: { k: 60, c: 11 }, head: { k: 110, c: 11 },
      armL: { k: 110, c: 16 }, lowL: { k: 200, c: 18 }, handL: { k: 320, c: 16 },
      armR: { k: 110, c: 16 }, lowR: { k: 260, c: 20 }, handR: { k: 320, c: 16 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.05], handR: ["lowR", -0.05], head: ["up", -0.08] },
    // on his toes: the guard bobs, the body sways
    idle: (t) => ({
      up: 1.1 * Math.sin(t * 1.3) + 0.4 * Math.sin(t * 2.6 + 1),
      x: 5 * Math.sin(t * 0.65),
      head: 1.8 * Math.sin(t * 1.1 + 1) + 0.8 * Math.sin(t * 0.5),
      armL: 2 * Math.sin(t * 2.2), lowL: 3 * Math.sin(t * 2.2 + 0.6), handL: 2.5 * Math.sin(t * 2.5),
      armR: 2 * Math.sin(t * 2.2 + 1.6), lowR: 3.5 * Math.sin(t * 2.2 + 2.2), handR: 3 * Math.sin(t * 2.4 + 1),
    }),
    actions: [
      { a: btBar, w: 18 },
      { a: join(btBar, shift(btHammer, 0.03)), w: 22 }, // crowbar, then the fist
      { a: btHammer, w: 14 },
      { a: join(btHammer, shift(btHammer, 0.04)), w: 12 },
      { a: join(btBar, shift(btBar, 0.05)), w: 12 },
      { a: join(btHammer, shift(btBar, 0.03), shift(btHammer, 0.03)), w: 12 },
      { a: btTaunt, w: 8 },
    ],
    rest: [0.8, 2.0],
    hit: { head: 240, up: -80, x: -70, armL: 120, lowL: 180, handL: 160, armR: 120, lowR: 200, handR: 180 },
    strike: join(btBar, shift(btHammer, 0.03)),
    // beaten: the guard dropped, the fists hang
    dazed: { pose: { armL: 10, lowL: 22, handL: 6, armR: 18, lowR: 42, handR: 10, head: 6, up: -1.5 }, act: false },
    hem: { sel: ".bs-hem", k: 30, c: 3.2, up: 1.6, x: 0.35, flutter: (t) => 1.6 * Math.sin(t * 1.7) + 0.8 * Math.sin(t * 3.1 + 1) },
  },
  datsik: {
    sel: fistSel, springs: fistSprings, scale: { armL: "sL", armR: "sR" }, cssStrike: true,
    drag: { head: ["up", -0.08] },
    idle: fistIdle,
    actions: [
      { a: dsL, w: 16 }, { a: dsR, w: 14 },
      { a: join(dsL, shift(dsR, 0.04)), w: 22 }, // the one-two
      { a: join(dsL, shift(dsL, 0.04), shift(dsR, 0.04)), w: 16 },
      { a: join(dsR, shift(dsL, 0.04)), w: 14 },
    ],
    rest: [0.8, 2.0],
    hit: { head: 240, up: -70, x: -60, armL: -200, armR: -200, sL: -150, sR: -150 },
    dazed: { pose: { armL: -14, armR: -14, sL: -6, sR: -6, head: 4, up: -1 }, act: false },
  },
  bebyakyan: {
    sel: fistSel, springs: fistSprings, scale: { armL: "sL", armR: "sR" }, cssStrike: true,
    drag: { head: ["up", -0.08] },
    idle: fistIdle,
    actions: [
      { a: bbTorch, w: 22 }, { a: bbJab, w: 18 },
      { a: join(bbJab, shift(bbTorch, 0.04)), w: 18 },
      { a: join(bbTorch, shift(bbTorch, 0.05)), w: 12 },
      { a: join(bbJab, shift(bbJab, 0.04)), w: 14 },
      { a: bbWave, w: 8 },
    ],
    rest: [0.8, 2.0],
    hit: { head: 220, up: 60, x: 50, armL: -180, armR: 180, sL: -120, sR: -120 },
    dazed: { pose: { armL: -12, armR: 12, sL: -5, sR: -5, head: 4, up: -1 }, act: false },
  },
  kedr: {
    sel: fistSel, springs: fistSprings, scale: { armL: "sL", armR: "sR" }, cssStrike: true,
    drag: { head: ["up", -0.08] },
    idle: (t) => ({ ...fistIdle(t), sL: 3 + 3 * Math.sin(t * 1.2), sR: 3 + 3 * Math.sin(t * 1.2 + Math.PI) }), // the claws creep at you in turns
    actions: [
      { a: kdL, w: 16 }, { a: kdR, w: 16 },
      { a: join(kdL, shift(kdR, 0.04)), w: 22 },
      { a: join(kdR, shift(kdL, 0.04), shift(kdR, 0.04)), w: 12 },
      { a: kdGrab, w: 16 },
    ],
    rest: [0.8, 2.0],
    hit: { head: 220, up: 60, x: 50, armL: -180, armR: 180, sL: -150, sR: -150 },
    dazed: { pose: { armL: -10, armR: 10, sL: -6, sR: -6, head: 4, up: -1 }, act: false },
  },
  garkusha: {
    cssStrike: true,
    springs: {
      up: { k: 70, c: 12 }, x: { k: 60, c: 11 }, head: { k: 110, c: 11 },
      armL: { k: 110, c: 16 }, handL: { k: 300, c: 15 }, armR: { k: 110, c: 16 }, handR: { k: 300, c: 15 },
    },
    drag: { handL: ["armL", -0.06], handR: ["armR", -0.06], head: ["up", -0.08] },
    idle: (t) => ({
      up: 0.8 * Math.sin(t * 0.9) + 0.3 * Math.sin(t * 2.1 + 1),
      x: 3 * Math.sin(t * 0.5),
      head: 1.6 * Math.sin(t * 1.0 + 1) + 0.7 * Math.sin(t * 0.45),
      armL: 2 * Math.sin(t * 1.2), handL: 4 * Math.sin(t * 2.2 + 0.4), armR: 2 * Math.sin(t * 1.2 + 2), handR: 4 * Math.sin(t * 2.2 + 2),
    }),
    actions: [
      { a: gkSlapR, w: 20 }, { a: gkSlapL, w: 18 },
      { a: join(gkSlapL, shift(gkSlapR, 0.04)), w: 20 },
      { a: join(gkSlapR, shift(gkSlapR, 0.05)), w: 12 },
      { a: gkCount, w: 12 },
    ],
    rest: [0.8, 2.0],
    hit: { head: 220, up: 60, x: 50, armL: 140, armR: -140, handL: 220, handR: -220 },
    dazed: { pose: { armL: 8, armR: -8, handL: 10, handR: 12, head: 4, up: -1 }, act: false },
  },
  mugo: {
    shapes: {
      wind: { armL: [-75.8, -6.9, -11], lowL: [-93.6, -28.3, -0.24], handL: [2.4, 4.4, 11.27] },
      punch: { armL: [-10.8, -4.9, -11], lowL: [28.2, 8, 11.88], handL: [15, 5.2, -0.86] },
    },
    springs: {
      up: { k: 65, c: 12 }, x: { k: 55, c: 11 }, head: { k: 100, c: 11 },
      armL: { k: 120, c: 16 }, lowL: { k: 200, c: 18 }, handL: { k: 300, c: 16 }, armR: { k: 110, c: 16 }, lowR: { k: 200, c: 18 }, handR: { k: 300, c: 16 },
      wind: { k: 230, c: 25 }, punch: { k: 260, c: 24 },
    },
    drag: { lowL: ["armL", -0.04], handL: ["lowL", -0.04], head: ["up", -0.08] },
    idle: (t) => ({
      up: 0.7 * Math.sin(t * 0.8) + 0.3 * Math.sin(t * 2 + 1),
      x: 3 * Math.sin(t * 0.5),
      head: 1.4 * Math.sin(t * 0.95 + 1) + 0.6 * Math.sin(t * 0.45),
      armL: 1.5 * Math.sin(t * 1.6), lowL: 2 * Math.sin(t * 2 + 0.5), handL: 2 * Math.sin(t * 2.4),
      armR: 1.5 * Math.sin(t * 1.6 + 1.5), handR: 2 * Math.sin(t * 2.2 + 1),
    }),
    actions: [
      { a: mgJab, w: 12 },
      { a: join(mgJab, mgJab), w: 22 },
      { a: join(mgJab, mgJab, mgJab), w: 24 },
      { a: join(mgJab, mgJab, mgJab, mgJab, mgJab), w: 10 }, // the artist's round of five
      { a: join(mgJab, mgCross), w: 20 }, // the one-two
      { a: join(mgJab, mgJab, mgCross, mgCross), w: 10 },
      { a: join(mgCross, mgJab, mgCross), w: 8 },
      { a: mgRaise, w: 12 }, // the fist up, pumping
      { a: mgTaunt, w: 6 },
    ],
    rest: [0.8, 2.0],
    hit: { head: 240, up: 70, x: 60, armL: -100, lowL: 140, handL: 200, armR: 100, handR: -160 },
    strike: join(mgJab, mgJab),
    dazed: { pose: { armL: 5, lowL: 6, armR: 4, head: 4, up: -1 }, act: false },
  },
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
    rest: [0.7, 1.9],
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
    rest: [0.8, 2.0],
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
    rest: [0.7, 1.9],
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
    rest: [0.7, 1.9],
    hit: { head: -300, up: -80, x: -60, armL: 120, lowL: -140, armR: -110, lowR: 150, handL: -220, handR: 220 },
    strike: join(vdKeys, vdKeys),
    dazed: { pose: { armL: -9, armR: 9, lowL: -4, lowR: 4, head: 3 }, act: false },
    // his fast heavy breath (it was screens.css vd-breath): the chest up and wider, the jaw drops with it
    breath: (t) => { const b = 0.5 - 0.5 * Math.cos((t / 1.05) * Math.PI * 2); return [1 + 0.016 * b, 1 + 0.03 * b, -4 * b]; },
    breathFollow: { sel: ".vd-jaw", f: (t) => `translateY(${(4 * (0.5 - 0.5 * Math.cos((t / 1.05) * Math.PI * 2))).toFixed(2)}px)` },
  },
  larek: {
    springs: {
      up: { k: 60, c: 12 }, x: { k: 60, c: 12 }, head: { k: 110, c: 12 },
      armL: { k: 85, c: 15 }, lowL: { k: 170, c: 17 }, handL: { k: 320, c: 16 },
      armR: { k: 85, c: 15 }, lowR: { k: 170, c: 17 }, handR: { k: 320, c: 16 },
    },
    drag: { lowL: ["armL", -0.05], handL: ["lowL", -0.045], lowR: ["armR", -0.05], handR: ["lowR", -0.045], head: ["up", -0.08] },
    // heavy: the belly goes up and down slowly, the raised fist keeps bobbing in the guard
    idle: (t) => ({
      up: 1.3 * Math.sin(t * 0.9) + 0.4 * Math.sin(t * 2.1 + 1),
      x: 2.2 * Math.sin(t * 0.5),
      head: 1.6 * Math.sin(t * 0.8 + 1) + 0.6 * Math.sin(t * 1.9),
      // the brass knuckles held out in front: the forearm turned up from the elbow (the artist drew it hanging)
      armL: LR_HOLD.armL + 2 * Math.sin(t * 1.15), lowL: LR_HOLD.lowL + 3 * Math.sin(t * 1.5 + 0.5), handL: LR_HOLD.handL + 2.5 * Math.sin(t * 2.1 + 1),
      armR: 1.8 * Math.sin(t * 1.05 + 2), lowR: 4 * Math.sin(t * 1.4 + 1), handR: 3 * Math.sin(t * 2.3),
    }),
    actions: [
      { a: lrElbow, w: 28 },
      { a: lrHammer, w: 24 },
      { a: join(lrHammer, shift(lrElbow, 0.05)), w: 20 },
      { a: join(lrElbow, lrElbow), w: 10 },
      { a: join(lrHammer, lrHammer), w: 8 },
      { a: taunt, w: 8 },
    ],
    rest: [0.9, 2.1],
    hit: { head: 260, up: 90, x: 70, armL: -120, lowL: 160, armR: 100, lowR: 160, handL: 200, handR: -200 },
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
    rest: [0.8, 2.0],
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
    const hems = spec.hem ? [...svg.querySelectorAll<SVGGElement>(spec.hem.sel)] : [];
    let hemA = 0, hemV = 0;
    const hairs = spec.hair ? [...svg.querySelectorAll<SVGGElement>(spec.hair.sel)] : [];
    let hairA = 0, hairV = 0;
    let hangA = 0, hangV = 0;
    const follow = spec.breathFollow ? [...svg.querySelectorAll<SVGGElement>(spec.breathFollow.sel)] : [];
    svg.classList.add("posed");
    // x — the upper body's shift sideways, y — up and down (px of the rig), z — its growth towards the screen (%)
    const keys: string[] = [...JOINTS, "x", "y", "z", "jaw", ...Object.keys(spec.shapes ?? {}), ...Object.values(spec.scale ?? {}) as string[]];
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
    const pick = (list: { a: Action; w: number }[]): Action => {
      const all = list.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * all;
      for (const x of list) { r -= x.w; if (r < 0) return x.a; }
      return list[0].a;
    };
    let raf = 0;
    const faceOff = new Map<string, number>();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      for (const [c, end] of faceOff) if (t >= end) { svg.classList.remove(c); faceOff.delete(c); }
      // a hit on him: a push to every joint
      const arena = svg.closest(".arena-photo");
      const hit = !!arena?.classList.contains("hit");
      if (hit && !wasHit) for (const k of keys) vel[k] += (spec.hit[k] ?? 0) * (0.8 + Math.random() * 0.4);
      wasHit = hit;
      // he strikes the player: that blow now, whatever he was doing
      const strike = !!arena?.classList.contains("strike");
      const dazed = svg.classList.contains("dazed");
      const ph = svg.classList.contains("dying") && spec.dying ? spec.dying : dazed ? spec.dazed : undefined;
      const strikeA = ph?.noStrike ? undefined : ph?.strike ?? spec.strike;
      if (strike && !wasStrike && strikeA) { act = strikeA; actT = 0; }
      if (spec.cssStrike && strike !== wasStrike) svg.classList.toggle("posed", !strike);
      wasStrike = strike;
      // the action: its key now (a dazed boss — half as often, slower)
      let pose: Pose = {};
      let stiff = 1;
      if (act) {
        const before = actT;
        actT += dt * (ph?.speed ?? (dazed ? 0.75 : 1));
        for (const f of act.face ?? []) if (f.at >= before && f.at < actT || (before === 0 && f.at === 0)) {
          svg.classList.remove(f.cls);
          void svg.getBoundingClientRect(); // restart its keyframes
          svg.classList.add(f.cls);
          faceOff.set(f.cls, t + f.dur);
        }
        let cur: Key | null = null;
        for (const k of act.keys) if (k.at <= actT) cur = k;
        if (cur) { pose = cur.pose; stiff = cur.stiff ?? 1; }
        if (actT >= act.dur) {
          act = null;
          const rest = ph?.rest ?? spec.rest;
          wait = rest[0] + Math.random() * (rest[1] - rest[0]) * (dazed && !ph?.rest ? 2 : 1);
        }
      } else if ((wait -= dt) <= 0) {
        if (ph && !ph.act) wait = 1;
        else { act = pick(ph?.actions ?? spec.actions); actT = 0; }
      }
      const idle = spec.idle(t, ph ? (ph === spec.dying ? 2 : 1) : 0);
      if (ph) for (const [k, v] of Object.entries(ph.pose)) idle[k as J] = (idle[k as J] ?? 0) + (v ?? 0);
      if (ph?.sway) for (const [k, v] of Object.entries(ph.sway(t))) idle[k as J] = (idle[k as J] ?? 0) + (v ?? 0);
      for (const k of keys) {
        const s = spec.springs[k] ?? SPRING0;
        let target = (idle[k] ?? 0) + (pose[k] ?? 0);
        const d = spec.drag[k as J];
        if (d) target += vel[d[0]] * d[1];
        const st = spec.stiffOwn && !(k in pose) ? 1 : stiff;
        const kk = s.k * st, cc = s.c * Math.sqrt(st);
        // semi-implicit Euler in small steps (stiff springs stay stable at 15–30 fps)
        const n = Math.ceil(dt / 0.008);
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          vel[k] += (kk * (target - ang[k]) - cc * vel[k]) * h;
          ang[k] += vel[k] * h;
        }
      }
      const br = spec.breath?.(t, dazed);
      if (spec.hem) {
        const hm = spec.hem;
        const target = -(hm.up * ang.up + hm.x * ang.x) + hm.flutter(t);
        const n = Math.ceil(dt / 0.008), h = dt / n;
        for (let i = 0; i < n; i++) { hemV += (hm.k * (target - hemA) - hm.c * hemV) * h; hemA += hemV * h; }
        const tr = `skewX(${hemA.toFixed(2)}deg) scaleX(${(1 + Math.abs(hemV) * 0.0006).toFixed(4)})`;
        for (const el of hems) el.style.transform = tr;
      }
      if (spec.hair) {
        const hs = spec.hair;
        // the head's and the body's turns pull it back; a jerk of the upper body (its speed) throws it the other way
        const target = -hs.turn * (ang.head + ang.up) - hs.jerk * (vel.x + vel.up * 2) + hs.flutter(t);
        const n = Math.ceil(dt / 0.008), h = dt / n;
        for (let i = 0; i < n; i++) { hairV += (hs.k * (target - hairA) - hs.c * hairV) * h; hairA += hairV * h; }
        const tr = `rotate(${hairA.toFixed(2)}deg) skewX(${(hairA * 0.8).toFixed(2)}deg) scaleY(${(1 - Math.min(0.05, Math.abs(hairV) * 0.0004)).toFixed(4)})`;
        for (const el of hairs) el.style.transform = tr;
      }
      if (spec.hang) {
        const target = -spec.hang.chain.reduce((a, j) => a + ang[j], 0);
        const n = Math.ceil(dt / 0.008), h = dt / n;
        for (let i = 0; i < n; i++) { hangV += (spec.hang.k * (target - hangA) - spec.hang.c * hangV) * h; hangA += hangV * h; }
        const tr = `rotate(${hangA.toFixed(2)}deg)`;
        for (const el of hangs) el.style.transform = tr;
      }
      const joint = (j: J) => {
        let tx = 0, ty = 0, r = ang[j];
        for (const [n, sh] of Object.entries(spec.shapes ?? {})) {
          const o = sh[j];
          if (o) { tx += o[0] * ang[n]; ty += o[1] * ang[n]; r += o[2] * ang[n]; }
        }
        const sc = spec.scale?.[j];
        return `${tx || ty ? `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) ` : ""}rotate(${r.toFixed(2)}deg)${sc ? ` scale(${(1 + ang[sc] / 100).toFixed(4)})` : ""}`;
      };
      for (const j of JOINTS) {
        const tr = j === "up"
          ? `translateX(${ang.x.toFixed(2)}px)${ang.y || ang.z ? ` translateY(${ang.y.toFixed(2)}px) scale(${(1 + ang.z / 100).toFixed(4)})` : ""} rotate(${ang.up.toFixed(2)}deg)${br ? ` translateY(${br[2].toFixed(2)}px) scale(${br[0].toFixed(4)}, ${br[1].toFixed(4)})` : ""}`
          : joint(j);
        for (const el of els[j]) el.style.transform = tr;
      }
      if (spec.vars) for (const [k, v] of Object.entries(spec.vars(ang))) svg.style.setProperty(k, v);
      if (spec.breathFollow) { const tr = spec.breathFollow.f(t, ang); for (const el of follow) el.style.transform = tr; }
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
      for (const c of faceOff.keys()) svg.classList.remove(c);
      for (const j of JOINTS) for (const el of els[j]) el.style.transform = "";
      for (const el of follow) el.style.transform = "";
      for (const el of hangs) el.style.transform = "";
      for (const el of hems) el.style.transform = "";
      for (const el of hairs) el.style.transform = "";
      for (const b of bends) { for (const s of b.strips) s.el.style.transform = ""; for (const el of b.turns) el.style.transform = ""; }
    };
  }, [svgRef, baseId, rigKey]);
}
