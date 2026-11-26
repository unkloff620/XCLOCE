"use client";
/*
 * Химик's mentor card (tools/ui/himik-card.py, the artist's layers, 1200×520): the poison stands in his flasks and test
 * tubes in the card's corners — it waves, sways a little and bubbles (the glass twice: the solid copy, the poison, the
 * see-through copy); and the molecule on the paper gets written line by line as if by an unseen hand, its dots dabbed
 * on last, stays a while, fades, and is written again. The corners are drawn on the card's own pixels at the frame's
 * scale (screens.css «Химик's card»: the nine-slice 276 470 240 320 at 0.37), so the glass sits exactly on the frame.
 */
import { useEffect, useId, useRef } from "react";
import { frameGate } from "../eco.ts";
import { HIMIK_CARD as C } from "./himik-card-data.ts";

const U = "/assets/ui";
const P = { top: "#9dff3a", mid: "#46d10f", deep: "#167a0a", line: "#e2ffa8" };
/** the corners: the card's pixels each one shows (the nine-slice's corner pieces) */
const CORNERS = { tl: [0, 0, 320, 276], tr: [730, 0, 470, 276], bl: [0, 280, 320, 240], br: [730, 280, 470, 240] } as const;
type Corner = keyof typeof CORNERS;

/** a liquid's body: a wavy surface at y (humps len wide, amp high) from x0 to x1 (+ one len to slide), down to bottom */
function surf(x0: number, x1: number, y: number, bottom: number, amp: number, len: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0, k = 0; x <= x1 + len; x += len / 2, k++) d += ` Q${(x + len / 4).toFixed(1)} ${(y + (k % 2 ? amp : -amp)).toFixed(1)} ${(x + len / 2).toFixed(1)} ${y}`;
  return { top: d, body: `${d} L${x1 + len} ${bottom} L${x0} ${bottom} Z` };
}

function GlassCorner({ c }: { c: Corner }) {
  const [x, y, w, h] = CORNERS[c];
  const u = useId().replace(/[^a-zA-Z0-9]/g, "");
  const mid = `hmc-m-${c}${u}`, gid = `hmc-g-${c}${u}`;
  const mine = C.vessels.filter((v) => v.x >= x && v.x < x + w && v.y >= y && v.y < y + h);
  return (
    <svg className={`hmc-glass hmc-${c}`} viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true">
      <defs>
        <mask id={mid} maskUnits="userSpaceOnUse" x={0} y={0} width={1200} height={520}>
          <image href={`${U}/himik-card-poison.webp`} x={0} y={0} width={1200} height={520} />
        </mask>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={P.top} />
          <stop offset="0.4" stopColor={P.mid} />
          <stop offset="1" stopColor={P.deep} />
        </linearGradient>
      </defs>
      <image href={`${U}/himik-card-glass-b.webp`} x={0} y={0} width={1200} height={520} />
      <g mask={`url(#${mid})`}>
        {mine.map((v, i) => {
          const bottom = v.y + v.h + 6, big = v.w > 60;
          const a = surf(v.x - 40, v.x + v.w + 40, v.lvl, bottom, big ? 3 : 2, big ? 26 : 14);
          const b = surf(v.x - 40, v.x + v.w + 40, v.lvl + 2, bottom, big ? 2.4 : 1.6, big ? 20 : 11);
          const n = big ? 7 : 3;
          return (
            <g key={i} className="hmc-sway" style={{ transformOrigin: `${v.x + v.w / 2}px ${v.lvl}px`, transformBox: "view-box", animationDelay: `${-i * 0.9}s` }}>
              <g className={`hmc-wave-b ${big ? "big" : ""}`}><path d={b.body} fill={P.deep} opacity={0.75} /></g>
              <g className={`hmc-wave-f ${big ? "big" : ""}`}><path d={a.body} fill={`url(#${gid})`} /><path d={a.top} fill="none" stroke={P.line} strokeWidth={2} opacity={0.75} /></g>
              {Array.from({ length: n }, (_, j) => (
                <circle key={j} className="hmc-bub" cx={v.x + v.w * ((j + 0.7) / (n + 0.4))} cy={v.y + v.h - 5} r={(big ? 3 : 2) + (j % 3)}
                  fill="rgba(230,255,200,0.8)" style={{ animationDelay: `${((j * 0.61 + i * 0.37) % 2.2).toFixed(2)}s`, ["--rise" as string]: `${(v.y + v.h - v.lvl - 8).toFixed(1)}px` }} />
              ))}
            </g>
          );
        })}
      </g>
      <image href={`${U}/himik-card-glass-a.webp`} x={0} y={0} width={1200} height={520} opacity={0.7} />
    </svg>
  );
}

/** the molecule written by an unseen hand: its strokes revealed one after another along their skeleton */
function Molecule() {
  const ref = useRef<SVGSVGElement>(null);
  const wid = `hmc-write${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const lines = [...root.querySelectorAll<SVGPolylineElement>(".hmc-pen")];
    const dots = [...root.querySelectorAll<SVGCircleElement>(".hmc-dab")];
    const ink = root.querySelector<SVGGElement>(".hmc-ink");
    const len = C.strokes.map((s) => s.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0));
    lines.forEach((l, i) => { l.style.strokeDasharray = `${len[i] + 1} ${len[i] + 40}`; });
    const show = (i: number, f: number) => { lines[i].style.strokeDashoffset = `${((1 - f) * (len[i] + 1)).toFixed(1)}`; };
    const done = () => { lines.forEach((_, i) => show(i, 1)); dots.forEach((d) => d.setAttribute("r", d.dataset.r ?? "0")); if (ink) ink.style.opacity = "1"; };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    // the timeline (s): the pen moves 260 px/s along a line and lifts for a moment between lines; the dots, a hold, a fade
    const SPEED = 260, LIFT = 0.06, DAB = 0.18, HOLD = 4, FADE = 0.9, REST = 0.8;
    const starts: number[] = [];
    let t = 0.3;
    len.forEach((l) => { starts.push(t); t += l / SPEED + LIFT; });
    const dotsAt = t, holdAt = dotsAt + dots.length * DAB + 0.2, fadeAt = holdAt + HOLD, loop = fadeAt + FADE + REST;
    const gate = frameGate();
    let raf = 0, t0 = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!gate(now)) return;
      if (!t0) t0 = now;
      const s = ((now - t0) / 1000) % loop;
      if (ink) ink.style.opacity = s < fadeAt ? "1" : String(Math.max(0, 1 - (s - fadeAt) / FADE));
      lines.forEach((_, i) => show(i, Math.min(1, Math.max(0, (s - starts[i]) / (len[i] / SPEED)))));
      dots.forEach((d, i) => { const f = Math.min(1, Math.max(0, (s - dotsAt - i * DAB) / DAB)); d.setAttribute("r", (f * +(d.dataset.r ?? 0)).toFixed(2)); });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const m = C.mol;
  return (
    <svg ref={ref} className="hmc-mol" viewBox={`0 0 ${m.w} ${m.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <mask id={wid} maskUnits="userSpaceOnUse" x={0} y={0} width={m.w} height={m.h}>
          {C.strokes.map((s, i) => (
            <polyline key={i} className="hmc-pen" points={s.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={17}
              strokeLinecap="round" strokeLinejoin="round" style={{ strokeDashoffset: 9999 }} />
          ))}
          {C.dots.map((d, i) => <circle key={i} className="hmc-dab" cx={d[0]} cy={d[1]} r={0} data-r={d[2]} fill="#fff" />)}
        </mask>
      </defs>
      <g className="hmc-ink" mask={`url(#${wid})`}>
        <image href={`${U}/himik-card-mol.webp`} x={0} y={0} width={m.w} height={m.h} />
      </g>
    </svg>
  );
}

export function HimikCardFx() {
  return (
    <>
      <Molecule />
      {(Object.keys(CORNERS) as Corner[]).map((c) => <GlassCorner key={c} c={c} />)}
    </>
  );
}
