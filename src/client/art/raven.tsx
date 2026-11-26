"use client";
/*
 * «Ворон» on the hero's right shoulder (the left of the picture) (the poker's royal flush; slot «SPECIAL»; tools/rig/build-raven.py). He sits with
 * the wing on his back, looks about — now right, now left (the artist's two bodies) — and every few seconds takes off: the
 * wings open (the half-open drawing, then the spread one), he rises a few pixels off the shoulder, hovers ~1.5 s flapping
 * (each wing turns round its root and its feathers bend with the puppet-bent frames of the strip — every layer stays
 * opaque, the drawings are switched, never faded), turns his head left and back in the air, and lands on the shoulder
 * again, folding the wings. `still`: he only sits.
 */
import { useEffect, useRef } from "react";
import { frameGate } from "../eco.ts";
import { RAVEN as R } from "./raven-data.ts";

const A = "/assets/hero/raven";
const V = "?v=2";
/** where his feet hold (his canvas) and where they go on the hero (the top of his right shoulder — the left of the
 *  picture, the rig's units); he faces the head as drawn, his wings go behind it when spread */
const FEET = [552, 478] as const;
const AT = { x: 292, y: 374, k: 0.44 };
/** the timeline of one loop (s): he sits, looks left a while; opens the wings, flies from `up` to `down` (rising `rise`
 *  in `climb`, hovering, coming down in `climb`), turns his head left in the air (`airL`), folds the wings */
const T = { loop: 9.5, lookL: [1.4, 3.1], open: 4.4, up: 4.52, down: 6.52, fold: 0.12, climb: 0.32, flap: 0.4, airL: [5.15, 5.85], rise: 110 };
const FW = R.w * 0.5, FH = (R.h + 2 * R.pad) * 0.5;
const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
type WingName = "far-half" | "near-half" | "far-full" | "near-full";

/** `layer`: "back" — the far wing alone (drawn under the hero's head: it goes behind it), "front" — the rest; the two run
 *  on one clock (the page's time), so they move together */
export function Raven({ still, layer = "front" }: { still?: boolean; layer?: "back" | "front" }) {
  const root = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    const none = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const q = <T extends Element>(s: string) => (g.querySelector<T>(s) ?? none) as unknown as T;
    const bodyR = q<SVGImageElement>(".rv-body-r"), bodyL = q<SVGImageElement>(".rv-body-l"), airL = q<SVGImageElement>(".rv-body-air-l"), closed = q<SVGImageElement>(".rv-closed");
    const lift = q<SVGGElement>(".rv-lift");
    const wings = (["far-half", "near-half", "far-full", "near-full"] as WingName[]).map((n) => ({ n, g: g.querySelector<SVGGElement>(`.rv-g-${n}`), el: g.querySelector<SVGSVGElement>(`.rv-${n}`) }))
      .filter((w): w is { n: WingName; g: SVGGElement; el: SVGSVGElement } => !!w.el && !!w.g);
    const show = (el: Element, on: boolean) => el.setAttribute("opacity", on ? "1" : "0");
    /** which body: "r", "l" (sitting, his wing drawn on), "air-l" (the head left, the wings open) */
    const body = (b: "r" | "l" | "air-l") => { show(bodyR, b === "r"); show(bodyL, b === "l"); show(airL, b === "air-l"); };
    /** the wings: none (closed on the back), the half-open or the spread drawing; k: the stroke (-1 down … 1 up) */
    const wingsAt = (kind: "none" | "half" | "full", k = 0) => {
      show(closed, kind === "none");
      const i = Math.round(((k + 1) / 2) * (R.frames - 1));
      wings.forEach(({ n, g: wg, el }) => {
        const on = n.endsWith(kind);
        show(el, on);
        if (!on) return;
        el.setAttribute("viewBox", `${i * FW} 0 ${FW} ${FH}`);
        // the whole wing turns round its root too: down and up (the far wing goes off to the left, the near one to the right)
        const [rx, ry] = R.roots[n], a = (kind === "full" ? 6 + 26 * k : 0) * (n.startsWith("far") ? 1 : -1);
        wg.setAttribute("transform", `rotate(${a.toFixed(2)} ${rx} ${ry})`);
      });
    };
    const sit = (left: boolean) => { body(left ? "l" : "r"); wingsAt("none"); lift.setAttribute("transform", ""); };
    if (still || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || g.closest(".rig.still")) { sit(false); return; }
    const gate = frameGate();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const t = (now / 1000) % T.loop;
      if (t < T.open || t >= T.down + T.fold) { sit(t > T.lookL[0] && t < T.lookL[1]); return; }
      body(t > T.airL[0] && t < T.airL[1] ? "air-l" : "r");
      if (t < T.up || t >= T.down) { wingsAt("half"); lift.setAttribute("transform", ""); return; }
      // in the air: the strokes from the middle going up, the height eased in and out, a little bob with each stroke
      const ph = ((t - T.up) / T.flap) * Math.PI * 2;
      const k = Math.sin(ph);
      wingsAt("full", k);
      const h = T.rise * ease((t - T.up) / T.climb) * ease((T.down - t) / T.climb) + 7 * Math.cos(ph) * ease((t - T.up) / T.climb) * ease((T.down - t) / T.climb);
      lift.setAttribute("transform", `translate(0 ${(-h).toFixed(1)})`);
    };
    sit(false);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still, layer]);
  const wing = (n: WingName) => (
    <g className={`rv-g-${n}`}>
      <svg className={`rv-${n}`} x={0} y={-R.pad} width={R.w} height={R.h + 2 * R.pad} viewBox={`${((R.frames - 1) / 2) * FW} 0 ${FW} ${FH}`} opacity={0} overflow="hidden">
        <image href={`${A}/${n}.webp${V}`} x={0} y={0} width={FW * R.frames} height={FH} />
      </svg>
    </g>
  );
  return (
    <g className="rv" transform={`translate(${AT.x} ${AT.y}) scale(${AT.k}) translate(${-FEET[0]} ${-FEET[1]})`} pointerEvents="none">
      <g ref={root}>
        <g className="rv-lift">
          {layer === "back" ? <>{wing("far-half")}{wing("far-full")}</> : (
            <>
              {/* the near wing behind his body too: it never covers his head */}
              {wing("near-half")}{wing("near-full")}
              <image className="rv-body-r" href={`${A}/body-r.webp${V}`} x={0} y={0} width={R.w} height={R.h} />
              <image className="rv-body-l" href={`${A}/body-l.webp${V}`} x={0} y={0} width={R.w} height={R.h} opacity={0} />
              <image className="rv-body-air-l" href={`${A}/body-air-l.webp${V}`} x={0} y={0} width={R.w} height={R.h} opacity={0} />
              <image className="rv-closed" href={`${A}/wing-closed.webp${V}`} x={0} y={0} width={R.w} height={R.h} />
            </>
          )}
        </g>
      </g>
    </g>
  );
}
