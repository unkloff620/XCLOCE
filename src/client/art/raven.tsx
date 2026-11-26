"use client";
/*
 * «Ворон» on the hero's right shoulder (the left of the picture) (the poker's royal flush; slot «SPECIAL»; tools/rig/build-raven.py). He sits with
 * the wing on his back, looks about — now right, now left (the artist's two bodies) — and every few seconds takes off: he
 * crouches, the spread wings grow out from their roots (stretched from short to full), he rises a few pixels off the
 * shoulder, stretching up as he leaves, hovers ~1.5 s flapping — each wing turns round its root, stretches a little
 * longer on the way up and shorter on the way down, its feathers bend with the puppet-bent frames of the strip — turns his
 * head left and back in the air, comes down, squashes a little as he lands and the wings shrink back into the folded
 * one. Every layer stays opaque: the drawings are moved and stretched, never faded.
 * Two layers on one clock (the page's time): "wings" — both wings, drawn behind the whole hero (they never flap in his
 * face), "body" — the bird on the shoulder. `still`: he only sits.
 */
import { useEffect, useRef } from "react";
import { frameGate } from "../eco.ts";
import { RAVEN as R } from "./raven-data.ts";

const A = "/assets/hero/raven";
const V = "?v=3";
/** where his feet hold (his canvas) and where they go on the hero (the top of his right shoulder — the left of the
 *  picture, the rig's units) */
const FEET = [552, 478] as const;
const AT = { x: 292, y: 374, k: 0.44 };
/** the timeline of one loop (s): he sits, looks left a while; crouches (`crouch`) while the wings grow out (`open`), flies
 *  `flight` (rising `rise` in `climb`, hovering, coming down in `climb`), turns his head left in the air (`airL`, from the
 *  take-off), lands squashing (`land`) while the wings shrink back (`open`) */
const T = { loop: 9.5, lookL: [1.4, 3.1], crouch: 0.22, start: 4.3, open: 0.2, climb: 0.38, flight: 2.1, flap: 0.42, airL: [0.75, 1.4], land: 0.24, rise: 110 };
const UP = T.start + T.crouch, DOWN = UP + T.flight;
const FW = R.w * 0.5, FH = (R.h + 2 * R.pad) * 0.5;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => { const k = clamp(x); return k * k * (3 - 2 * k); };
type WingName = "far-full" | "near-full";

export function Raven({ still, layer }: { still?: boolean; layer: "wings" | "body" }) {
  const root = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    const none = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const q = <T extends Element>(s: string) => (g.querySelector<T>(s) ?? none) as unknown as T;
    const bodyR = q<SVGImageElement>(".rv-body-r"), bodyL = q<SVGImageElement>(".rv-body-l"), airL = q<SVGImageElement>(".rv-body-air-l"), closed = q<SVGImageElement>(".rv-closed");
    const lift = q<SVGGElement>(".rv-lift");
    const wings = (["far-full", "near-full"] as WingName[]).map((n) => ({ n, g: g.querySelector<SVGGElement>(`.rv-g-${n}`), el: g.querySelector<SVGSVGElement>(`.rv-${n}`) }))
      .filter((w): w is { n: WingName; g: SVGGElement; el: SVGSVGElement } => !!w.el && !!w.g);
    const show = (el: Element, on: boolean) => el.setAttribute("opacity", on ? "1" : "0");
    /** which body: "r", "l" (sitting, his wing drawn on), "air-l" (the head left, the wings open) */
    const body = (b: "r" | "l" | "air-l") => { show(bodyR, b === "r"); show(bodyL, b === "l"); show(airL, b === "air-l"); };
    /** the wings: `out` 0 (folded: the closed one on his back) … 1 (spread full length); k: the stroke (-1 down … 1 up) */
    const wingsAt = (out: number, k = 0) => {
      show(closed, out <= 0);
      const i = Math.round(((k + 1) / 2) * (R.frames - 1));
      wings.forEach(({ n, g: wg, el }) => {
        show(el, out > 0);
        if (out <= 0) return;
        el.setAttribute("viewBox", `${i * FW} 0 ${FW} ${FH}`);
        // round the root: turned down … up, stretched along the wing (grown out of the root when opening, a little longer
        // up, shorter down) and across it (thinner when short)
        const [rx, ry] = R.roots[n], far = n.startsWith("far");
        const a = (-34 * (1 - out) + out * (6 + 26 * k)) * (far ? 1 : -1);
        const sx = (0.3 + 0.7 * out) * (1 + 0.07 * k), sy = 0.75 + 0.25 * out;
        wg.setAttribute("transform", `translate(${rx} ${ry}) rotate(${a.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(${-rx} ${-ry})`);
      });
    };
    /** the bird's lift (h up), its squash (s < 1 lower and wider, > 1 taller) and tilt, round his feet */
    const place = (h: number, s = 1, tilt = 0) => {
      const w = 1 / Math.sqrt(s);
      lift.setAttribute("transform", `translate(${FEET[0]} ${(FEET[1] - h).toFixed(1)}) rotate(${tilt.toFixed(2)}) scale(${w.toFixed(4)} ${s.toFixed(4)}) translate(${-FEET[0]} ${-FEET[1]})`);
    };
    const sit = (left: boolean) => { body(left ? "l" : "r"); wingsAt(0); place(0); };
    if (still || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || g.closest(".rig.still")) { sit(false); return; }
    const gate = frameGate();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const t = (now / 1000) % T.loop;
      if (t < T.start || t >= DOWN + T.land) { sit(t > T.lookL[0] && t < T.lookL[1]); return; }
      const ft = t - UP;
      body(ft > T.airL[0] && ft < T.airL[1] ? "air-l" : "r");
      // the wings grow out while he crouches, flap all the flight, shrink back as he settles
      const out = t < UP ? ease((t - (UP - T.open)) / T.open) : t < DOWN ? 1 : 1 - ease((t - DOWN) / T.open);
      // the strokes start from the middle going up when he leaves the shoulder
      const ph = ((t - UP) / T.flap) * Math.PI * 2;
      const k = t < UP || t >= DOWN ? 0 : Math.sin(ph);
      wingsAt(out, k);
      if (t < UP) {
        // the crouch before the jump: down and squashed
        const c = Math.sin(clamp((t - T.start) / T.crouch) * Math.PI * 0.5);
        place(-4 * c, 1 - 0.07 * c);
        return;
      }
      if (t >= DOWN) {
        // the landing: squashed, then back
        const l = Math.sin(clamp((t - DOWN) / T.land) * Math.PI);
        place(-3 * l, 1 - 0.06 * l);
        return;
      }
      // in the air: the height eased in and out, a little bob with each stroke; stretched as he leaves and comes down
      const air = ease(ft / T.climb) * ease((DOWN - t) / T.climb);
      const h = T.rise * air + 7 * Math.cos(ph) * air;
      const speed = Math.sin(Math.PI * clamp(ft / T.climb)) + Math.sin(Math.PI * clamp((DOWN - t) / T.climb));
      place(h, 1 + 0.06 * speed - 0.02 * k * air, 2.5 * Math.sin(ph + 0.6) * air);
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
          {layer === "wings" ? <>{wing("far-full")}{wing("near-full")}</> : (
            <>
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
