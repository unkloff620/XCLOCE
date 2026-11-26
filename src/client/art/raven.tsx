"use client";
/*
 * «Ворон» on the hero's right shoulder (the left of the picture, drawn mirrored) (the poker's royal flush; slot «SPECIAL»; tools/rig/build-raven.py). He sits with
 * the wing on his back, looks about — now right, now left (the artist's two bodies) — and every few seconds spreads his
 * wings and flaps: the wings come out a little open, then each flap goes from the half-open drawing with the tips bent
 * down to the spread one with the tips bent up (the puppet-bent frames of the strips crossfade, so the feathers bend
 * smoothly), the body lifts off the shoulder a little on each stroke, then he folds them back. `still`: he only sits.
 */
import { useEffect, useRef } from "react";
import { frameGate } from "../eco.ts";
import { RAVEN as R } from "./raven-data.ts";

const A = "/assets/hero/raven";
const V = "?v=1";
/** where his feet hold (his canvas) and where they go on the hero (the top of his right shoulder — the left of the
 *  picture, the rig's units); he is drawn mirrored there (the far wing goes towards the head and behind it) */
const FEET = [552, 478] as const;
const AT = { x: 228, y: 352, k: 0.44 };
/** the timeline of one loop (s): he sits, looks left a while, opens, flaps, folds */
const T = { loop: 9.5, lookL: [1.4, 3.1], open: 4.4, flaps: 4, flap: 0.52, fold: 0.3 };
const FW = R.w * 0.5, FH = (R.h + 2 * R.pad) * 0.5;
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
    const bodyR = q<SVGImageElement>(".rv-body-r"), bodyL = q<SVGImageElement>(".rv-body-l"), closed = q<SVGImageElement>(".rv-closed");
    const lift = q<SVGGElement>(".rv-lift");
    const wings = (["far-half", "near-half", "far-full", "near-full"] as WingName[]).map((n) => ({ n, el: g.querySelector<SVGSVGElement>(`.rv-${n}`) })).filter((w): w is { n: WingName; el: SVGSVGElement } => !!w.el);
    const show = (el: Element, o: number) => el.setAttribute("opacity", o.toFixed(3));
    const pose = (k: number) => { const i = Math.round(((k + 1) / 2) * (R.frames - 1)); wings.forEach(({ el }) => el.setAttribute("viewBox", `${i * FW} 0 ${FW} ${FH}`)); };
    const sit = (left: boolean) => { show(bodyR, left ? 0 : 1); show(bodyL, left ? 1 : 0); show(closed, left ? 0 : 1); wings.forEach(({ el }) => show(el, 0)); lift.setAttribute("transform", ""); };
    if (still || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || g.closest(".rig.still")) { sit(false); return; }
    const gate = frameGate();
    let raf = 0;
    const flapEnd = T.open + 0.2 + T.flaps * T.flap;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      const t = (now / 1000) % T.loop;
      if (t < T.open) { sit(t > T.lookL[0] && t < T.lookL[1]); return; }
      // the wings out: the closed one goes, the half-open ones come
      show(bodyL, 0); show(bodyR, 1);
      const half = wings.filter((w) => w.n.endsWith("half")), full = wings.filter((w) => w.n.endsWith("full"));
      if (t < T.open + 0.2) {
        const f = (t - T.open) / 0.2;
        show(closed, 1 - f); half.forEach(({ el }) => show(el, f)); full.forEach(({ el }) => show(el, 0)); pose(-0.2 * f);
        lift.setAttribute("transform", "");
        return;
      }
      show(closed, 0);
      if (t < flapEnd) {
        // a stroke: s = 1 up (spread, tips up), -1 down (half-open, tips down)
        const s = -Math.cos(((t - T.open - 0.2) / T.flap) * Math.PI * 2);
        const up = 0.5 + 0.5 * s;
        full.forEach(({ el }) => show(el, up)); half.forEach(({ el }) => show(el, 1 - up)); pose(s);
        lift.setAttribute("transform", `translate(0 ${(-26 * up).toFixed(1)})`);
        return;
      }
      if (t < flapEnd + T.fold) {
        const f = (t - flapEnd) / T.fold;
        full.forEach(({ el }) => show(el, 0)); half.forEach(({ el }) => show(el, 1 - f)); show(closed, f); pose(-0.2 * (1 - f));
        lift.setAttribute("transform", "");
        return;
      }
      sit(false);
    };
    sit(false);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [still, layer]);
  const wing = (n: WingName) => (
    <svg className={`rv-${n}`} x={0} y={-R.pad} width={R.w} height={R.h + 2 * R.pad} viewBox={`${((R.frames - 1) / 2) * FW} 0 ${FW} ${FH}`} opacity={0} overflow="hidden">
      <image href={`${A}/${n}.webp${V}`} x={0} y={0} width={FW * R.frames} height={FH} />
    </svg>
  );
  return (
    <g className="rv" transform={`translate(${AT.x} ${AT.y}) scale(${-AT.k} ${AT.k}) translate(${-FEET[0]} ${-FEET[1]})`} pointerEvents="none">
      <g ref={root}>
        <g className="rv-lift">
          {layer === "back" ? <>{wing("far-half")}{wing("far-full")}</> : (
            <>
              <image className="rv-body-r" href={`${A}/body-r.webp${V}`} x={0} y={0} width={R.w} height={R.h} />
              <image className="rv-body-l" href={`${A}/body-l.webp${V}`} x={0} y={0} width={R.w} height={R.h} opacity={0} />
              <image className="rv-closed" href={`${A}/wing-closed.webp${V}`} x={0} y={0} width={R.w} height={R.h} />
              {wing("near-half")}{wing("near-full")}
            </>
          )}
        </g>
      </g>
    </g>
  );
}
