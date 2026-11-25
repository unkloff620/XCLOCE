"use client";
/*
 * Нитка's mentor card (tools/ui/nitka-card.py): the needle with its thread embroiders «НИТКА» in the card's top right
 * corner, stitch after stitch in the artist's order — it comes up out of the denim, runs along the stitch (the stitch
 * shows behind its point), dives in, slides under the cloth to the next one. Then it lies back down where the artist
 * put it, the word stays a while, is pulled out stitch by stitch, and it starts over. Drawn over the corner of the card
 * (the card's own pixels, viewBox 800 0 400 200: the frame's corner slice, scaled like it — screens.css).
 */
import { useEffect, useRef } from "react";
import { NITKA_CARD as C } from "./nitka-card-data.ts";

const SHEET = "/assets/ui/nitka-card-sew.webp";
type V = readonly [number, number] | readonly number[];
const N = C.needle;
/** the needle's own direction (from its point to its eye) as it lies */
const NAT = Math.atan2(N.eye[1] - N.tip[1], N.eye[0] - N.tip[0]);
/** sewing: tipped up off the cloth (its eye up to the right), a bit shorter (it stands out of the cloth towards us) */
const SEW = { ang: -0.38, k: 0.6 };
/** how deep the point goes into the cloth */
const DEEP = 16;
/** the timings (s) of one stitch: comes up, runs along, dives, slides under to the next */
const T = { up: 0.08, run: 0.2, dive: 0.08, hop: 0.07 };
const START = 0.55, HOME = 0.7, HOLD = 5, PULL = 0.045, REST = 1.6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function NitkaCardSew() {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const needle = root.querySelector<SVGGElement>(".ncs-needle");
    const thread = root.querySelector<SVGGElement>(".ncs-thread");
    const inner = root.querySelectorAll<SVGGElement>(".ncs-in");
    const wipes = [...root.querySelectorAll<SVGRectElement>(".ncs-wipe")];
    if (!needle || !thread) return;
    const S = C.stitches;
    const len = S.map((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]));
    const show = (i: number, f: number) => wipes[i]?.setAttribute("width", (f <= 0 ? 0 : f >= 1 ? len[i] + 8 : 4 + len[i] * f).toFixed(2));
    // the needle: its point at p, turned by `ang` (0: as it lies), `k` long, sunk `d` into the cloth (the part under it cut off)
    const put = (p: V, ang: number, k: number, d: number, lift: number) => {
      const outer = `translate(${p[0].toFixed(2)} ${p[1].toFixed(2)}) rotate(${((NAT + ang) * 180 / Math.PI).toFixed(2)})`;
      const inn = `translate(${(-d).toFixed(2)} 0) scale(${k.toFixed(3)} 1) rotate(${(-NAT * 180 / Math.PI).toFixed(2)}) translate(${-N.tip[0]} ${-N.tip[1]})`;
      needle.setAttribute("transform", outer);
      thread.setAttribute("transform", outer);
      inner.forEach((g) => g.setAttribute("transform", inn));
      needle.style.filter = `drop-shadow(${(1 + lift * 3).toFixed(1)}px ${(1.5 + lift * 5).toFixed(1)}px ${(1 + lift * 2).toFixed(1)}px rgba(20,25,45,${(0.45 - lift * 0.15).toFixed(2)}))`;
    };
    const rest = () => { put(N.tip, 0, 1, 0, 0); S.forEach((_, i) => show(i, 1)); };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { rest(); return; }
    // the timeline: the moments each part begins
    const per = T.up + T.run + T.dive + T.hop;
    const sewEnd = START + S.length * per;
    const homeEnd = sewEnd + HOME;
    const holdEnd = homeEnd + HOLD;
    const pullEnd = holdEnd + S.length * PULL;
    const loop = pullEnd + REST;
    const wob = (t: number) => Math.sin(t * 23) * 0.04;
    let raf = 0, t0 = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (!t0) t0 = now;
      const t = ((now - t0) / 1000) % loop;
      if (t < START) {
        // it gets up from where it lies and goes to the first stitch
        const f = ease(t / START);
        S.forEach((_, i) => show(i, 0));
        put([lerp(N.tip[0], S[0].a[0], f), lerp(N.tip[1], S[0].a[1], f) - Math.sin(f * Math.PI) * 14], SEW.ang * f, lerp(1, SEW.k, f), 0, f);
      } else if (t < sewEnd) {
        const u = t - START, i = Math.min(S.length - 1, Math.floor(u / per)), s = S[i], v = u - i * per;
        S.forEach((_, j) => show(j, j < i ? 1 : 0));
        if (v < T.up) put(s.a, SEW.ang + wob(t), SEW.k, DEEP * (1 - ease(v / T.up)), 1);
        else if (v < T.up + T.run) {
          const f = ease((v - T.up) / T.run);
          show(i, f);
          put([lerp(s.a[0], s.b[0], f), lerp(s.a[1], s.b[1], f)], SEW.ang + wob(t), SEW.k, 0, 1);
        } else if (v < T.up + T.run + T.dive) { show(i, 1); put(s.b, SEW.ang + wob(t), SEW.k, DEEP * ease((v - T.up - T.run) / T.dive), 1); }
        else {
          show(i, 1);
          const n = S[i + 1]?.a ?? s.b, f = ease((v - T.up - T.run - T.dive) / T.hop);
          put([lerp(s.b[0], n[0], f), lerp(s.b[1], n[1], f)], SEW.ang, SEW.k, DEEP, 1);
        }
      } else if (t < homeEnd) {
        // out of the cloth and back down where it lay
        const f = ease((t - sewEnd) / HOME), e = S[S.length - 1].b;
        S.forEach((_, i) => show(i, 1));
        put([lerp(e[0], N.tip[0], f), lerp(e[1], N.tip[1], f) - Math.sin(f * Math.PI) * 10], SEW.ang * (1 - f), lerp(SEW.k, 1, f), DEEP * (1 - Math.min(1, f * 3)), 1 - f);
      } else if (t < holdEnd) rest();
      else if (t < pullEnd) {
        // the word is pulled out, the last stitch first
        const g = (t - holdEnd) / PULL;
        S.forEach((_, i) => show(i, Math.min(1, Math.max(0, S.length - i - g))));
        put(N.tip, 0, 1, 0, 0);
      } else { S.forEach((_, i) => show(i, 0)); put(N.tip, 0, 1, 0, 0); }
    };
    rest();
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ang = (s: (typeof C.stitches)[number]) => (Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * 180) / Math.PI;
  return (
    <svg ref={svg} className="ncs" viewBox="800 0 400 200" aria-hidden="true">
      <defs>
        {C.stitches.map((s, i) => (
          <clipPath key={i} id={`ncs-c${i}`} clipPathUnits="userSpaceOnUse">
            <rect className="ncs-wipe" x={s.a[0] - 4} y={s.a[1] - 8} width={0} height={16} transform={`rotate(${ang(s).toFixed(2)} ${s.a[0]} ${s.a[1]})`} />
          </clipPath>
        ))}
        <clipPath id="ncs-cloth" clipPathUnits="userSpaceOnUse"><rect x={0} y={-60} width={400} height={120} /></clipPath>
      </defs>
      {C.stitches.map((s, i) => (
        <g key={i} clipPath={`url(#ncs-c${i})`}>
          <svg x={s.x} y={s.y} width={s.w} height={s.h} viewBox={`${s.sx} 0 ${s.w} ${s.h}`} overflow="hidden">
            <image href={SHEET} x={0} y={0} width={C.sheet[0]} height={C.sheet[1]} />
          </svg>
        </g>
      ))}
      {/* the thread from its eye (over the cloth, never cut), then the needle — the part in the cloth cut off */}
      <g className="ncs-thread">
        <g className="ncs-in">
          <svg x={C.thread.x} y={C.thread.y} width={C.thread.w} height={C.thread.h} viewBox={`${C.thread.sx} 0 ${C.thread.w} ${C.thread.h}`} overflow="hidden">
            <image href={SHEET} x={0} y={0} width={C.sheet[0]} height={C.sheet[1]} />
          </svg>
        </g>
      </g>
      <g className="ncs-needle" clipPath="url(#ncs-cloth)">
        <g className="ncs-in">
          <svg x={N.x} y={N.y} width={N.w} height={N.h} viewBox={`${N.sx} 0 ${N.w} ${N.h}`} overflow="hidden">
            <image href={SHEET} x={0} y={0} width={C.sheet[0]} height={C.sheet[1]} />
          </svg>
        </g>
      </g>
    </svg>
  );
}
