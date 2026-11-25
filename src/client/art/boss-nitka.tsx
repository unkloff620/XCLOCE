"use client";
/*
 * Нитка (the mentor «Мотя Нитка», tools/boss/assemble-nitka.py): the artist's layers on soft joints — the puppet
 * (boss-puppet.ts) bends the legs (only the feet stay: a crouch bends the knees), the body and the arms at the
 * shoulders, the elbows and the wrists; the face is plain SVG over the body. The pose engine (boss-poses.ts
 * POSES.nitka) runs everything: quick stabs with the needles in both fists (each lands with a little crouch, the body
 * bending down over the knees), a stab with a twist (the fist turns left and right in the wound), both fists at once;
 * the mouth opens on a stab (--jaw: the chin and the lower teeth drop — the artist's «Shift + 3 × ↓», 7.2 rig px), the
 * brows frown (--brw), the cross-eyed pupils look about together (--px, --py), the lids blink; the glasses jump on the
 * nose with a quick move (--gb, a loose spring) and wobble (.nt-glasses-j). Every stab splashes blood off the needle's
 * point (the classes nt-stab-r / nt-stab-l, useNeedleBlood). Below half HP the needles are bloody (the artist's copies).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units): his right eye (the left of the picture), his left */
const HOLES = [{ x: 311, y: 143.5, w: 18.5, h: 9 }, { x: 364.5, y: 138, w: 22, h: 9 }];
const SKIN = "#f7a56d";
const LID_LINE = "#5a2a18";
/** the needles' points (the end that comes out under the fist and goes in), in each hand's own frame (rig units) */
const TIP = { r: [137, 366.5], l: [580.5, 414] } as const;
/** the shirt's tails swing from here (rig units: the middle of the chest) */
const HEM = [370, 560] as const;
/** the waist: the upper body leans and bends round it */
const WAIST = [370, 640] as const;

export function NitkaRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
  id: string; look: string; rig: Rig; bust: boolean; dazed: boolean; dying: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
  const handR = useRef<SVGGElement>(null);
  const handL = useRef<SVGGElement>(null);
  const blood = useRef<SVGGElement>(null);
  useNeedleBlood(svgRef, handR, handL, blood, !bust);
  // below half HP: the fists with the bloody needles (the artist's own copies)
  const hand = (p: "handR" | "handL") => (dazed && !bust && P[`${p}-blood`] ? `${p}-blood` : p);
  const src = (p: string) => `/bosses/${id}/rig/${p}.webp${P[p]?.v ? `?v=${P[p].v}` : ""}`;
  const pic = (p: string, pp?: "back" | "front") => {
    const r = P[p];
    if (!r) return null;
    const on = puppet && pp;
    return <image className={on ? "pp" : undefined} data-pp={on ? pp : undefined} data-pp-body={on && p === "body" ? "1" : undefined}
      href={src(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
  };
  const at = (x: number, y: number): CSSProperties => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" });
  const origin = (p: string): CSSProperties => { const pv = P[p]?.pivot ?? [rig.w / 2, rig.h]; return at(pv[0], pv[1]); };
  const box = (p: string, fx: number, fy: number): CSSProperties => { const r = P[p]; return r ? at(r.x + r.w * fx, r.y + r.h * fy) : {}; };
  const bone = (cls: string, p: string, kids: ReactNode, size?: number, ref?: RefObject<SVGGElement | null>) => (
    <g className={cls} ref={ref} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
  );
  const shirt = (p: string) => {
    const r = P[p];
    if (!r) return null;
    return puppet
      ? <image className="pp" data-pp="back" data-pp-follow="nt-hem" data-pp-follow-at="0.98,0.5" href={src(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />
      : pic(p);
  };
  const lids = (cls: string) => (
    <g className={cls}>
      {HOLES.map((h, i) => (
        <g key={i} style={at(h.x, h.y - 1)}>
          <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={SKIN} />
          <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.2} fill={LID_LINE} />
        </g>
      ))}
    </g>
  );
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-nitka ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="nt-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the legs: the feet stay planted, the hips go with the upper body — a crouch bends the knees */}
        {P.legs && (puppet ? (
          <image className="pp" data-pp="back" data-pp-follow="br-up" data-pp-follow-at="0.25,0.72" href={src("legs")}
            x={P.legs.x} y={P.legs.y} width={P.legs.w} height={P.legs.h} preserveAspectRatio="none" />
        ) : pic("legs"))}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* his right upper arm behind the body (the artist's order), an empty elbow in it */}
          {bone("br-arm br-arm-r", "armR", <>{pic("armR", "back")}{bone("br-low br-low-r", "lowR", null, 120)}</>, 130)}
          {pic("body", "back")}
          {/* the open shirt's halves: their tails below the chest swing with an empty group (the pose engine's hem) */}
          <g className="nt-hem" style={at(HEM[0], HEM[1])} />
          {shirt("shirtR")}
          {shirt("shirtL")}
          {/* his left upper arm over the shirt, an empty elbow in it */}
          {bone("br-arm br-arm-l", "armL", <>{pic("armL", "back")}{bone("br-low br-low-l", "lowL", null, 120)}</>, 130)}
          {/* the face: the mouth inside (the throat, the teeth, the chin that drops), the whites and the pupils under the
              head's eye holes, the lids, the head, the brows, the glasses */}
          {bone("br-head", "head", <>
            {pic("throat")}
            <g className="nt-jaw">{pic("teeth-low")}</g>
            {pic("teeth-up")}
            <g className="nt-jaw">{pic("chin")}</g>
            {pic("eyes")}
            <g className="nt-pupils">{pic("pupils")}</g>
            {lids("nt-lids")}
            {pic("head")}
            <g className="nt-brows" style={box("brows", 0.5, 0.5)}>{pic("brows")}</g>
            <g className="nt-glasses" style={box("glasses", 0.5, 0.45)}><g className="nt-glasses-j" style={box("glasses", 0.5, 0.45)}>{pic("glasses")}</g></g>
          </>, 150)}
          {/* the forearms and the fists with the needles, in front */}
          {bone("br-arm br-arm-r", "armR", bone("br-low br-low-r", "lowR", <>
            {pic("lowR", "front")}
            {bone("br-hand br-hand-r", "handR", pic(hand("handR"), "front"), 80, handR)}
          </>, 120), 130)}
          {bone("br-arm br-arm-l", "armL", bone("br-low br-low-l", "lowL", <>
            {pic("lowL", "front")}
            {bone("br-hand br-hand-l", "handL", pic(hand("handL"), "front"), 80, handL)}
          </>, 120), 130)}
        </g>
      </g>
      {!puppet && <g ref={blood} className="nt-blood" />}
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-nitka-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
      <svg className="br-pup-over" viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g ref={blood} className="nt-blood" />
      </svg>
    </div>
  );
}

/**
 * Blood off a needle: when a stab lands (the pose engine puts nt-stab-r / nt-stab-l on the rig), a burst of drops flies
 * from that needle's point along the stab, falls and fades. The points are read off the hands' groups every frame.
 */
function useNeedleBlood(svgRef: RefObject<SVGSVGElement | null>, rRef: RefObject<SVGGElement | null>, lRef: RefObject<SVGGElement | null>, layerRef: RefObject<SVGGElement | null>, on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const NS = "http://www.w3.org/2000/svg";
    type Drop = { el: SVGElement; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; streak: boolean };
    const drops: Drop[] = [];
    let raf = 0, last = 0;
    const was = { r: false, l: false };
    const prev: Record<"r" | "l", [number, number] | null> = { r: null, l: null };
    const vel: Record<"r" | "l", [number, number]> = { r: [0, 0], l: [0, 0] };
    const tip = (k: "r" | "l"): [number, number] | null => {
      const svg = svgRef.current, h = (k === "r" ? rRef : lRef).current;
      const a = svg?.getScreenCTM(), b = h?.getScreenCTM();
      if (!a || !b) return null;
      const m = a.inverse().multiply(b), [x, y] = TIP[k];
      return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    };
    const burst = (p: [number, number], v: [number, number]) => {
      const layer = layerRef.current;
      if (!layer) return;
      const sp = Math.hypot(v[0], v[1]) || 1;
      const dir: [number, number] = [v[0] / sp, v[1] / sp];
      for (let i = 0; i < 16; i++) {
        const streak = i < 4;
        const el = document.createElementNS(NS, streak ? "line" : "circle");
        const a = Math.atan2(dir[1], dir[0]) + (Math.random() - 0.5) * 2.2;
        const s = 180 + Math.random() * 380;
        const r = streak ? 2.5 + Math.random() * 2 : 1.8 + Math.random() * 3.6;
        el.setAttribute("fill", i % 3 ? "#b30f12" : "#7a0508");
        el.setAttribute("stroke", "#7a0508");
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-width", streak ? r.toFixed(2) : "0.5");
        layer.appendChild(el);
        drops.push({ el, x: p[0], y: p[1], vx: Math.cos(a) * s - dir[0] * 30, vy: Math.sin(a) * s - 110 * Math.random(), r, life: 0.4 + Math.random() * 0.4, age: 0, streak });
      }
    };
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      for (const k of ["r", "l"] as const) {
        const p = tip(k);
        if (p && prev[k] && dt > 0) vel[k] = [(p[0] - prev[k]![0]) / dt * 0.5 + vel[k][0] * 0.5, (p[1] - prev[k]![1]) / dt * 0.5 + vel[k][1] * 0.5];
        prev[k] = p;
        const now = !!svgRef.current?.classList.contains(`nt-stab-${k}`);
        if (now && !was[k] && p) burst(p, vel[k]);
        was[k] = now;
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.age += dt;
        d.vy += 900 * dt;
        d.vx *= 1 - 1.5 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const k = 1 - d.age / d.life;
        if (k <= 0) { d.el.remove(); drops.splice(i, 1); continue; }
        d.el.setAttribute("opacity", Math.min(1, k * 1.6).toFixed(2));
        if (d.streak) {
          d.el.setAttribute("x1", d.x.toFixed(1)); d.el.setAttribute("y1", d.y.toFixed(1));
          d.el.setAttribute("x2", (d.x - d.vx * 0.045).toFixed(1)); d.el.setAttribute("y2", (d.y - d.vy * 0.045).toFixed(1));
        } else {
          d.el.setAttribute("cx", d.x.toFixed(1)); d.el.setAttribute("cy", d.y.toFixed(1)); d.el.setAttribute("r", d.r.toFixed(2));
        }
      }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); for (const d of drops) d.el.remove(); };
  }, [svgRef, rRef, lRef, layerRef, on]);
}
