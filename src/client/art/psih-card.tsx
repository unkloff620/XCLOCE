"use client";
/*
 * Псих's mentor card (tools/ui/psih-card.py, the artist's layers, 1200×520): the bloody knife gets up from where it lies in
 * the top right and slashes the card three times — each slash opens behind its point as it runs along — goes back down;
 * the slashes stay a while, then heal away one after another, slowly, and it starts over. Drawn on the card's own pixels
 * (viewBox 0 0 1200 520, fitted into the card), under the text.
 */
import { useEffect, useId, useRef } from "react";
import { frameGate } from "../eco.ts";
import { PSIH_CARD as C } from "./psih-card-data.ts";

const U = "/assets/ui";
const CUTS = ["cut-a", "cut-b", "cut-c"] as const;
const K = C.knife;
/** the timings (s): it rests, goes to a slash, cuts it, follows through; goes home; the slashes stay, heal one by one */
const T = { rest: 1.2, go: 0.42, cut: 0.2, follow: 0.14, home: 0.6, hold: 1.8, heal: 2.6, stagger: 0.7, after: 0.9 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp = (t: number) => Math.min(1, Math.max(0, t));
type V = readonly number[];

export function PsihCardSlash() {
  const cutsRef = useRef<SVGSVGElement>(null);
  const knifeRef = useRef<SVGSVGElement>(null);
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    const cs = cutsRef.current, ks = knifeRef.current;
    if (!cs || !ks) return;
    const knife = ks.querySelector<SVGGElement>(".psc-knife");
    const wipes = [...cs.querySelectorAll<SVGRectElement>(".psc-wipe")];
    const cuts = [...cs.querySelectorAll<SVGGElement>(".psc-cut")];
    if (!knife) return;
    const S = CUTS.map((n) => C[n]);
    const len = S.map((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]));
    const open = (i: number, f: number) => wipes[i].setAttribute("width", (f <= 0 ? 0 : 30 + (len[i] + 40) * f).toFixed(1));
    const fade = (i: number, o: number) => { cuts[i].style.opacity = o.toFixed(3); };
    // the knife: its point at p, turned by ang (deg, 0: as it lies), lifted (bigger, a longer shadow) by lift 0…1
    const put = (p: V, ang: number, lift: number) => {
      const k = 1 + lift * 0.08;
      knife.setAttribute("transform", `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${ang.toFixed(2)}) scale(${k.toFixed(3)}) translate(${-K.tip[0]} ${-K.tip[1]})`);
      knife.style.filter = `drop-shadow(${(4 + lift * 14).toFixed(1)}px ${(6 + lift * 18).toFixed(1)}px ${(3 + lift * 6).toFixed(1)}px rgba(20,0,0,${(0.5 - lift * 0.15).toFixed(2)}))`;
    };
    const rest = () => { put(K.tip, 0, 0); S.forEach((_, i) => { open(i, 1); fade(i, 1); }); };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { put(K.tip, 0, 0); S.forEach((_, i) => open(i, 0)); return; }
    // the timeline: the moments each part begins
    const per = T.go + T.cut + T.follow;
    const cutEnd = T.rest + S.length * per;
    const homeEnd = cutEnd + T.home;
    const holdEnd = homeEnd + T.hold;
    const healEnd = holdEnd + (S.length - 1) * T.stagger + T.heal;
    const loop = healEnd + T.after;
    // past the slash's end the point runs on a little, rising off the card
    const over = (s: (typeof S)[number], f: number): number[] => {
      const dx = (s.b[0] - s.a[0]) / Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), dy = (s.b[1] - s.a[1]) / Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      return [s.b[0] + dx * 60 * f, s.b[1] + dy * 60 * f - 30 * f * f];
    };
    // as it cuts the knife leans into the stroke a little (its handle trails behind the point)
    const lean = (s: (typeof S)[number]) => Math.max(-22, Math.min(22, (s.b[0] - s.a[0]) * 0.02 - (s.b[1] - s.a[1]) * 0.05));
    const gate = frameGate();
    let raf = 0, t0 = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      if (!t0) t0 = now;
      const t = ((now - t0) / 1000) % loop;
      if (t < T.rest) { put(K.tip, 0, 0); S.forEach((_, i) => { open(i, 0); fade(i, 1); }); return; }
      if (t < cutEnd) {
        const v0 = t - T.rest, i = Math.min(S.length - 1, Math.floor(v0 / per)), s = S[i], v = v0 - i * per;
        S.forEach((_, j) => { open(j, j < i ? 1 : 0); fade(j, 1); });
        const from = i === 0 ? K.tip : over(S[i - 1], 1), fromAng = i === 0 ? 0 : lean(S[i - 1]);
        if (v < T.go) {
          // up off the card, across to the slash's start, a swing back before the cut
          const f = ease(v / T.go);
          put([lerp(from[0], s.a[0], f), lerp(from[1], s.a[1], f) - Math.sin(f * Math.PI) * 50], lerp(fromAng, lean(s) - 14, f), Math.sin(f * Math.PI) * 0.8 + (1 - f) * (i ? 0.4 : 0) + f * 0.25);
        } else if (v < T.go + T.cut) {
          const f = clamp((v - T.go) / T.cut), g = f * f * (3 - 2 * f);
          open(i, g);
          put([lerp(s.a[0], s.b[0], g), lerp(s.a[1], s.b[1], g)], lean(s) - 14 + 14 * g, 0.25 - 0.25 * Math.sin(g * Math.PI));
        } else {
          open(i, 1);
          const f = ease((v - T.go - T.cut) / T.follow);
          put(over(s, f), lean(s), f * 0.4);
        }
        return;
      }
      if (t < homeEnd) {
        // back down where it lay
        const f = ease((t - cutEnd) / T.home), e = over(S[S.length - 1], 1);
        S.forEach((_, i) => { open(i, 1); fade(i, 1); });
        put([lerp(e[0], K.tip[0], f), lerp(e[1], K.tip[1], f) - Math.sin(f * Math.PI) * 40], lerp(lean(S[S.length - 1]), 0, f), (1 - f) * 0.4 + Math.sin(f * Math.PI) * 0.3);
        return;
      }
      if (t < holdEnd) { rest(); return; }
      // the slashes heal one after another, slowly
      put(K.tip, 0, 0);
      S.forEach((_, i) => { open(i, 1); fade(i, 1 - ease(clamp((t - holdEnd - i * T.stagger) / T.heal))); });
    };
    S.forEach((_, i) => open(i, 0));
    put(K.tip, 0, 0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const ang = (s: { a: V; b: V }) => (Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * 180) / Math.PI;
  return (
    <>
      <svg ref={cutsRef} className="psc psc-cuts" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          {CUTS.map((n, i) => {
            const s = C[n];
            return (
              <clipPath key={n} id={`psc-c${i}${u}`} clipPathUnits="userSpaceOnUse">
                <rect className="psc-wipe" x={s.a[0] - 30} y={s.a[1] - 90} width={0} height={180} transform={`rotate(${ang(s).toFixed(2)} ${s.a[0]} ${s.a[1]})`} />
              </clipPath>
            );
          })}
        </defs>
        {CUTS.map((n, i) => {
          const s = C[n];
          return (
            <g key={n} className="psc-cut" clipPath={`url(#psc-c${i}${u})`}>
              <image href={`${U}/psih-card-${n}.webp`} x={s.x} y={s.y} width={s.w} height={s.h} />
            </g>
          );
        })}
      </svg>
      <svg ref={knifeRef} className="psc psc-knife-layer" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g className="psc-knife">
          <image href={`${U}/psih-card-knife.webp`} x={K.x} y={K.y} width={K.w} height={K.h} />
        </g>
      </svg>
    </>
  );
}
