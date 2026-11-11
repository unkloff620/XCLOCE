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

const POSES: Record<string, Spec> = {
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
    const els = {} as Record<J, SVGGElement | null>;
    for (const j of JOINTS) els[j] = svg.querySelector<SVGGElement>(SEL[j]);
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
      } else if ((wait -= dt) <= 0) { act = pick(); actT = 0; }
      const idle = spec.idle(t);
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
      for (const j of JOINTS) {
        const el = els[j];
        if (!el) continue;
        el.style.transform = j === "up" ? `translateX(${ang.x.toFixed(2)}px) rotate(${ang.up.toFixed(2)}deg)` : `rotate(${ang[j].toFixed(2)}deg)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      svg.classList.remove("posed");
      for (const j of JOINTS) if (els[j]) els[j]!.style.transform = "";
    };
  }, [svgRef, baseId, rigKey]);
}
