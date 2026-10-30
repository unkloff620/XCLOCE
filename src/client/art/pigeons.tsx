"use client";
/*
 * Pigeons in the yard, in the artist's layers (public/assets/yard/pigeon, tools/yard/pigeon/build.py; the poses follow
 * his references: walking, pecking, flying). One animation loop per bird moves every part smoothly toward the pose of
 * what it does now — no jumps between poses: walk about (steps, the head nodding, the body swaying), stop and peck at the
 * grain (the body leans, the head goes down, a few jabs), look about, turn round (a quick squash through the middle).
 * A tap scares it: it tilts up, beats its wings, tucks its legs and flies off (paying a few roubles, shown where it sat); another one walks in 5–10 minutes later.
 * Positions are percent of the yard picture: x — the middle, y — the feet, up from the bottom.
 */
import { useEffect, useRef, useState } from "react";
import { haptic } from "../telegram.ts";
import { useGame } from "../store.tsx";
import { Icon } from "./icons.tsx";
import type { Granted } from "../api.ts";

const P = "/assets/yard/pigeon";
export interface PigeonArea { x0: number; x1: number; y0: number; y1: number }
type Act = "idle" | "walk" | "peck" | "turn" | "fly" | "gone" | "land";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** the pose: the upper body's lean and lift, the head's turn and shift, the wings' lift, the legs' swing */
interface Pose { up: number; upY: number; head: number; headX: number; headY: number; wn: number; wf: number; lf: number; lb: number; tuck: number }
const ZERO: Pose = { up: 0, upY: 0, head: 0, headX: 0, headY: 0, wn: 0, wf: 0, lf: 0, lb: 0, tuck: 0 };

function Pigeon({ area, delay }: { area: PigeonArea; delay: number }) {
  const { act } = useGame();
  const actRef = useRef(act); actRef.current = act;
  const [gain, setGain] = useState<{ x: number; y: number; rub: number; key: number } | null>(null);
  const root = useRef<HTMLButtonElement>(null);
  const flip = useRef<HTMLSpanElement>(null);
  const up = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLImageElement>(null);
  const wn = useRef<HTMLImageElement>(null);
  const wf = useRef<HTMLImageElement>(null);
  const lf = useRef<HTMLImageElement>(null);
  const lb = useRef<HTMLImageElement>(null);
  const grain = useRef<HTMLElement>(null);
  const scareRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const st = {
      x: rnd(area.x0, area.x1), y: rnd(area.y0, area.y1), dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, face: 1,
      act: "idle" as Act, until: performance.now() + delay, tx: 0, ty: 0, phase: 0, t: 0,
      pose: { ...ZERO }, fly: 0, fx: 0, fy: 0,
    };
    st.face = st.dir;
    const choose = (now: number) => {
      const r = Math.random();
      if (r < 0.42) {
        st.tx = Math.min(area.x1, Math.max(area.x0, st.x + rnd(-15, 15)));
        st.ty = Math.min(area.y1, Math.max(area.y0, st.y + rnd(-3, 3)));
        const d = st.tx >= st.x ? 1 : -1;
        if (d !== st.dir) { st.dir = d; }
        st.act = "walk";
        st.until = Infinity;
      } else if (r < 0.8) {
        st.act = "peck";
        st.until = now + rnd(1800, 3600);
      } else if (r < 0.9) {
        st.dir = st.dir === 1 ? -1 : 1;
        st.act = "turn";
        st.until = now + 700;
      } else {
        st.act = "idle";
        st.until = now + rnd(900, 2200);
      }
      st.t = 0;
    };
    scareRef.current = () => {
      if (st.act === "fly" || st.act === "gone" || st.act === "land") return;
      haptic.tap();
      // a scared pigeon pays a few roubles right where it sat: the sum floats up there and fades
      const at = { x: st.x, y: st.y };
      void actRef.current<{ reward: Granted | null }>("pigeon_scare", {}).then((r) => {
        const rub = r?.reward?.currencies?.RUB;
        if (rub) setGain({ x: at.x, y: at.y, rub, key: Date.now() });
      });
      st.act = "fly";
      st.t = 0;
      st.fly = 0;
    };
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      st.t += dt;
      const el = root.current;
      if (!el) { raf = requestAnimationFrame(tick); return; }
      // what it does
      if (st.act !== "fly" && st.act !== "gone" && st.act !== "walk" && st.act !== "land" && now >= st.until) choose(now);
      if (st.act === "walk") {
        const dx = st.tx - st.x, dy = st.ty - st.y, dist = Math.hypot(dx, dy * 2);
        const v = 5.5 * dt; // percent of the yard a second
        if (dist <= v) { st.x = st.tx; st.y = st.ty; st.act = "idle"; st.until = now + rnd(250, 900); }
        else { st.x += (dx / dist) * v; st.y += ((dy / dist) * v) / 2; }
        st.phase += dt * (Math.PI * 2) / 0.5;
      }
      if (st.act === "gone" && now >= st.until) {
        // another one flies in from the sky and lands
        const from: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        st.x = rnd(area.x0, area.x1); st.y = rnd(area.y0, area.y1);
        st.dir = from; st.face = from;
        st.act = "land"; st.fly = 0; st.t = 0; st.pose = { ...ZERO, up: -11, upY: -4, tuck: 1, wn: 64, wf: 72 };
        el.style.visibility = "";
      }
      // the pose it is going to
      const g: Pose = { ...ZERO };
      const s = Math.sin(st.phase);
      if (st.act === "walk") {
        // walking tall: the body and the head up, the head bobbing forward and back at each step
        g.lf = s * 15; g.lb = -s * 15;
        g.up = -5 + Math.sin(st.phase * 2) * 1; g.upY = -1.5 - Math.abs(Math.cos(st.phase)) * 1.4;
        g.head = -7; g.headX = Math.sin(st.phase * 2 + 0.6) * 4.5;
      } else if (st.act === "peck") {
        // searching and pecking: the body low, the head looks about over the ground, then sharp jabs down and back
        const cyc = st.t % 1.1;
        const jab = cyc < 0.07 ? cyc / 0.07 : cyc < 0.15 ? 1 : cyc < 0.24 ? 1 - (cyc - 0.15) / 0.09 : cyc > 0.45 && cyc < 0.51 ? (cyc - 0.45) / 0.06 : cyc >= 0.51 && cyc < 0.58 ? 1 - (cyc - 0.51) / 0.07 : 0;
        g.up = 12; g.head = 24 + jab * 14 + Math.sin(st.t * 2.3) * 3; g.headY = jab * 1.6; g.headX = Math.sin(st.t * 1.7) * 1.5;
      } else if (st.act === "idle" || st.act === "turn") {
        g.head = Math.sin(st.t * 1.7) * 5 - 2;
      } else if (st.act === "fly" || st.act === "land") {
        g.up = -11; g.upY = -4; g.tuck = 1;
        const f = Math.sin(st.t * 38);
        g.wn = 64 + f * 28; g.wf = 72 + Math.sin(st.t * 38 - 0.6) * 26;
      }
      // smoothly toward it (the wings in flight follow at once)
      const k = 1 - Math.exp(-dt * (st.act === "fly" ? 14 : 9));
      const p = st.pose;
      // the wings in flight and the neck's jabs follow at once (a real pigeon's neck moves in jerks)
      const sharp = (key: keyof Pose) => ((st.act === "fly" || st.act === "land") && (key === "wn" || key === "wf")) || (st.act === "peck" && (key === "head" || key === "headY"));
      for (const key of Object.keys(p) as (keyof Pose)[]) p[key] += (g[key] - p[key]) * (sharp(key) ? 1 : k);
      // turning round: through the middle, quick
      st.face += (st.dir - st.face) * (1 - Math.exp(-dt * 10));
      // flying off: up and away to the side, smaller and fading
      let extra = "", op = 1;
      if (st.act === "fly") {
        st.fly += dt;
        const u = Math.min(1, st.fly / 1.6);
        st.fx = st.dir * (u * u * 380 + u * 20);
        st.fy = -(u * 900 + u * u * 200);
        extra = ` translate(${st.fx}%, ${st.fy}%) scale(${1 - u * 0.45})`;
        op = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
        if (u >= 1) { st.act = "gone"; st.until = now + rnd(5 * 60_000, 10 * 60_000); el.style.visibility = "hidden"; } // the next one comes in 5–10 minutes
      }
      if (st.act === "land") {
        // coming down from the sky: the way off, backwards, slowing to the ground; then the wings fold
        st.fly += dt;
        const u = Math.max(0, 1 - st.fly / 1.8);
        extra = ` translate(${-st.dir * (u * u * 380 + u * 20)}%, ${-(u * 900 + u * u * 200)}%) scale(${1 - u * 0.45})`;
        op = u > 0.85 ? (1 - u) / 0.15 : 1;
        if (u <= 0) { st.act = "idle"; st.until = now + rnd(600, 1400); }
      }
      const depth = 1 - (st.y - area.y0) / 60;
      el.style.left = `${st.x}%`;
      el.style.bottom = `${st.y}%`;
      el.style.opacity = String(op);
      el.style.transform = `translateX(-50%) scale(${depth})${extra}`;
      el.style.zIndex = String(2 + Math.round((area.y1 - st.y) * 2));
      if (flip.current) flip.current.style.transform = `scaleX(${st.face})`;
      if (up.current) up.current.style.transform = `translateY(${p.upY}%) rotate(${p.up}deg)`;
      if (head.current) head.current.style.transform = `translate(${p.headX}%, ${p.headY}%) rotate(${p.head}deg)`;
      if (wn.current) wn.current.style.transform = `rotate(${p.wn}deg)`;
      if (wf.current) wf.current.style.transform = `rotate(${p.wf}deg) translate(${p.wf / 30}%, ${-p.wf / 30}%)`;
      const tuck = p.tuck * 40;
      if (lf.current) lf.current.style.transform = `rotate(${p.lf + tuck}deg) translateY(${-p.tuck * 6}%)`;
      if (lb.current) lb.current.style.transform = `rotate(${p.lb + tuck}deg) translateY(${-p.tuck * 6}%)`;
      if (grain.current) grain.current.style.opacity = st.act === "peck" ? "1" : "0";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    {gain && <span key={gain.key} className="pg-gain num" style={{ left: `${gain.x}%`, bottom: `${gain.y + 4}%` }} onAnimationEnd={() => setGain(null)}><Icon name="RUB" size={18} />+{gain.rub}</span>}
    <button ref={root} type="button" className="pg" onClick={() => scareRef.current()} aria-label="Голубь">
      <span ref={flip} className="pg-flip">
        {/* eslint-disable @next/next/no-img-element */}
        <img ref={lb} className="pg-l pg-leg b" src={`${P}/leg-back.webp`} alt="" draggable={false} />
        <img ref={lf} className="pg-l pg-leg f" src={`${P}/leg-front.webp`} alt="" draggable={false} />
        {/* the upper body (it leans to peck, tilts up to fly): the far wing, the body, the head, the near wing */}
        <span ref={up} className="pg-l pg-up">
          <img ref={wf} className="pg-l pg-wing far" src={`${P}/wing-far.webp`} alt="" draggable={false} />
          <img className="pg-l pg-body" src={`${P}/body.webp`} alt="" draggable={false} />
          <img ref={head} className="pg-l pg-head" src={`${P}/head.webp`} alt="" draggable={false} />
          <img ref={wn} className="pg-l pg-wing near" src={`${P}/wing-near.webp`} alt="" draggable={false} />
        </span>
        {/* eslint-enable @next/next/no-img-element */}
        <i ref={grain} className="pg-grain" style={{ opacity: 0 }}><b /><b /><b /></i>
      </span>
    </button>
    </>
  );
}

export function Pigeons({ area, n }: { area: PigeonArea; n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <Pigeon key={i} area={area} delay={400 + i * 900} />)}</>;
}
