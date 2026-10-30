"use client";
/*
 * Pigeons in the yard, in the artist's layers (public/assets/yard/pigeon, tools/yard/pigeon/build.py): they walk about
 * on the ground (steps, the head nodding), stop and peck at grain, turn round. A tap scares one: it flaps its wings and
 * flies away; a while later another one walks in from the side.
 * Each lives on its own little timer; positions are percent of the yard picture (x — left, y — up from the bottom).
 */
import { useEffect, useRef, useState } from "react";
import { haptic } from "../telegram.ts";

const P = "/assets/yard/pigeon";
type Mode = "idle" | "walk" | "peck" | "fly" | "gone";
interface Bird { x: number; y: number; dir: 1 | -1; mode: Mode; dur: number }
export interface PigeonArea { x0: number; x1: number; y0: number; y1: number }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function Pigeon({ area, delay }: { area: PigeonArea; delay: number }) {
  const [b, setB] = useState<Bird>(() => ({ x: rnd(area.x0, area.x1), y: rnd(area.y0, area.y1), dir: Math.random() < 0.5 ? 1 : -1, mode: "idle", dur: 0 }));
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  const later = (ms: number, f: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => alive.current && f(), ms);
  };
  // what it does next: walk somewhere near, peck, or stand a bit
  const next = (cur: Bird) => {
    const r = Math.random();
    if (r < 0.45) {
      const x = Math.min(area.x1, Math.max(area.x0, cur.x + rnd(-14, 14)));
      const y = Math.min(area.y1, Math.max(area.y0, cur.y + rnd(-3, 3)));
      const dur = Math.max(0.8, Math.hypot(x - cur.x, (y - cur.y) * 2) / 6);
      const nb: Bird = { x, y, dir: x >= cur.x ? 1 : -1, mode: "walk", dur };
      setB(nb);
      later(dur * 1000, () => { const s = { ...nb, mode: "idle" as Mode }; setB(s); later(rnd(300, 900), () => next(s)); });
    } else if (r < 0.85) {
      const nb: Bird = { ...cur, mode: "peck" };
      setB(nb);
      later(rnd(1800, 3400), () => { const s = { ...nb, mode: "idle" as Mode }; setB(s); later(rnd(300, 1000), () => next(s)); });
    } else {
      const nb: Bird = { ...cur, dir: cur.dir === 1 ? -1 : 1, mode: "idle" };
      setB(nb);
      later(rnd(800, 2000), () => next(nb));
    }
  };
  useEffect(() => {
    alive.current = true;
    later(delay, () => next(b));
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scare = () => {
    if (b.mode === "fly" || b.mode === "gone") return;
    haptic.tap();
    const nb: Bird = { ...b, mode: "fly" };
    setB(nb);
    later(1500, () => {
      setB({ ...nb, mode: "gone" });
      // a while later another one walks in from the side
      later(rnd(12_000, 25_000), () => {
        const from: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        const start: Bird = { x: from === 1 ? -8 : 108, y: rnd(area.y0, area.y1), dir: from, mode: "idle", dur: 0 };
        setB(start);
        later(60, () => {
          const x = rnd(area.x0, area.x1);
          const dur = Math.abs(x - start.x) / 6;
          const w: Bird = { ...start, x, mode: "walk", dur };
          setB(w);
          later(dur * 1000, () => { const s = { ...w, mode: "idle" as Mode }; setB(s); later(500, () => next(s)); });
        });
      });
    });
  };
  // further up the ground = further away = smaller
  const scale = 1 - (b.y - area.y0) / 60;
  return (
    <button type="button" className={`pg ${b.mode}`} onClick={scare} aria-label="Голубь"
      style={{ left: `${b.x}%`, bottom: `${b.y}%`, ["--dir" as string]: b.dir, ["--s" as string]: scale, transitionDuration: b.mode === "walk" ? `${b.dur}s` : "0s" }}>
      <span className="pg-flip">
        {/* eslint-disable @next/next/no-img-element */}
        <img className="pg-l pg-leg b" src={`${P}/leg-back.webp`} alt="" draggable={false} />
        <img className="pg-l pg-leg f" src={`${P}/leg-front.webp`} alt="" draggable={false} />
        <img className="pg-l pg-wings" src={`${P}/wings.webp`} alt="" draggable={false} />
        <img className="pg-l pg-body" src={`${P}/body.webp`} alt="" draggable={false} />
        <img className="pg-l pg-head" src={`${P}/head.webp`} alt="" draggable={false} />
        {/* eslint-enable @next/next/no-img-element */}
        {b.mode === "peck" && <i className="pg-grain"><b /><b /><b /></i>}
      </span>
    </button>
  );
}

export function Pigeons({ area, n }: { area: PigeonArea; n: number }) {
  return <>{Array.from({ length: n }, (_, i) => <Pigeon key={i} area={area} delay={400 + i * 900} />)}</>;
}
