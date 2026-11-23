"use client";
/*
 * Солнце (tools/boss/assemble-solntse.py): the 13th boss — huge, heavy and slow. The artist's layers on soft joints: the
 * puppet (boss-puppet.ts) bends the legs (only the feet are fixed), the arms at the shoulders and the elbows; the trunk,
 * the apron, the pecs and the face are plain SVG over the body. The pose engine (boss-poses.ts POSES.solntse) runs it all:
 * the breath — in: the chest, the arms and the body swell (--sw), the arms rise, the jaw drops (--jaw); out: they sink
 * back, the jaw half closes and the spit flies out of the mouth (the class sn-spit, useSpit) — and between the breaths
 * the slow heavy blows with the poker (the right fist) and the left fist, the jaw shut. Drool hangs from the mouth's
 * corners all the time.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the waist: the upper body leans round it (rig units) */
const WAIST = [470, 640] as const;
/** the pecs swell from the breastbone, the trunk from the belt */
const STERNUM = [506, 296] as const;
const BELT = [430, 600] as const;
/** the pecs' root (the bottom of the breastbone): they are pulled from here when an arm goes up */
const PEC_ROOT = [500, 405] as const;
/** the jaw's hinge (it drops and turns a little round it) and the mouth's corners, where the drool hangs */
const JAW_HINGE = [486, 128] as const;
const CORNERS = [[462, 156], [509, 154]] as const;
/** the mouth's middle: the spit flies from here */
const MOUTH = [486, 152] as const;

export function SunRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
  id: string; look: string; rig: Rig; bust: boolean; dazed: boolean; dying: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
  const head = useRef<SVGGElement>(null);
  const spit = useRef<SVGGElement>(null);
  // the card (bust) drools and spits too, like in the fight
  useSpit(svgRef, head, spit, true);
  const src = (p: string) => `/bosses/${id}/rig/${p}.webp${P[p]?.v ? `?v=${P[p].v}` : ""}`;
  const pic = (p: string, pp?: "back" | "front", fade?: string) => {
    const r = P[p];
    if (!r) return null;
    const on = puppet && pp;
    return <image className={on ? "pp" : undefined} data-pp={on ? pp : undefined} data-pp-fade={on ? fade : undefined} href={src(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
  };
  // the lava cracks glowing over their part (tools/boss/solntse-glow.py), pulsing like embers (screens.css .sn-glow)
  const glow = (p: string, pp?: "back" | "front", n = 0) => <g className={`sn-glow sn-glow-${n}`}>{pic(`${p}-glow`, pp, `sn-glow-${n}`)}</g>;
  const at = (x: number, y: number): CSSProperties => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" });
  const origin = (p: string): CSSProperties => { const pv = P[p]?.pivot ?? [rig.w / 2, rig.h]; return at(pv[0], pv[1]); };
  const bone = (cls: string, p: string, kids: ReactNode, size?: number, ref?: RefObject<SVGGElement | null>) => (
    <g className={cls} ref={ref} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
  );
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-solntse ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="sn-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the legs: only the feet stay planted, the rest of the leg goes with the upper body; drawn over the apron (the
            front canvas, under the arms) */}
        {P.legs && (puppet ? (
          <image className="pp" data-pp="front" data-pp-follow="br-up" data-pp-follow-at="0.5,0.86" href={src("legs")}
            x={P.legs.x} y={P.legs.y} width={P.legs.w} height={P.legs.h} preserveAspectRatio="none" />
        ) : pic("legs"))}
        {P["legs-glow"] && <g className="sn-glow sn-glow-3">{puppet ? (
          <image className="pp" data-pp="front" data-pp-follow="br-up" data-pp-follow-at="0.5,0.86" data-pp-fade="sn-glow-3" href={src("legs-glow")}
            x={P["legs-glow"].x} y={P["legs-glow"].y} width={P["legs-glow"].w} height={P["legs-glow"].h} preserveAspectRatio="none" />
        ) : pic("legs-glow")}</g>}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* the trunk and the apron swell a little from the belt, the pecs a lot from the breastbone */}
          {/* his left (yellow) arm behind the body: on the back canvas, under everything */}
          {bone("br-arm br-arm-l", "armL", <>
            {pic("armL", "back")}
            {bone("br-low br-low-l", "lowL", pic("lowL", "back"), 150)}
          </>, 170)}
          {/* the trunk on the back canvas too: the right shoulder lies over it and under the pecs */}
          <g className="sn-trunk" style={at(BELT[0], BELT[1])}>{pic("body", "back")}{glow("body", "back", 1)}</g>
          {/* the right (lava) shoulder: over the trunk, under the pecs (the back canvas); an empty elbow in it, so its end
              bends with the forearm */}
          {bone("br-arm br-arm-r", "armR", <>
            {pic("armR", "back")}
            {glow("armR", "back", 0)}
            {bone("br-low br-low-r", "lowR", null, 150)}
          </>, 170)}
          {/* each pec hangs on its arm: the arm goes up — the pec is pulled up towards the shoulder and stretched (from the
              breastbone's bottom, it stays on the body) */}
          <g className="sn-pull sn-pull-r" style={at(PEC_ROOT[0], PEC_ROOT[1])}>
            <g className="sn-pec sn-pec-r" style={at(STERNUM[0], STERNUM[1])}>{pic("chestR")}{glow("chestR", undefined, 2)}</g>
          </g>
          <g className="sn-pull sn-pull-l" style={at(PEC_ROOT[0] + 8, PEC_ROOT[1])}>
            <g className="sn-pec sn-pec-l" style={at(STERNUM[0], STERNUM[1])}>{pic("chestL")}</g>
          </g>
          {/* the apron over the pecs */}
          <g className="sn-trunk" style={at(BELT[0], BELT[1])}>{pic("apron")}</g>
          {/* the face: the mouth inside (the throat, the upper teeth) under the jaw, the whites and the pupils under the
              head's eye holes, the head on top; the jaw drops with the breath in and carries the drool */}
          {bone("br-head", "head", <>
            {pic("mouthIn")}
            <g className="sn-jaw" style={at(JAW_HINGE[0], JAW_HINGE[1])}>
              {pic("jawLow")}
              {CORNERS.map(([x, y], i) => <SunDrool key={i} x={x} y={y} k={bust ? 1.7 : 1} cls={`sn-drool sn-drool-${i}`} />)}
            </g>
            {pic("eyes")}
            <g className="sn-pupils">{pic("pupils")}</g>
            {pic("head")}
          </>, 170, head)}
          {/* the right forearm (lava) with the poker in its fist, in front of everything (its shoulder copy is above) */}
          {bone("br-arm br-arm-r", "armR", bone("br-low br-low-r", "lowR", <>{pic("lowR", "front")}{glow("lowR", "front", 1)}{pic("poker", "front")}</>, 150), 170)}
        </g>
      </g>
      {!puppet && <g ref={spit} className="sn-spit-layer" />}
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-solntse-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
      <svg className="br-pup-over" viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g ref={spit} className="sn-spit-layer" />
      </svg>
    </div>
  );
}

/** a string of drool hanging off a corner of the mouth: it stretches and shrinks, a drop gathers at its end and falls */
function SunDrool({ x, y, k = 1, cls }: { x: number; y: number; k?: number; cls: string }) {
  return (
    <g className={cls} transform={`translate(${x} ${y}) scale(${k})`}>
      <g className="sn-drool-str">
        <path d="M-2 0 C-1.8 7 -1.1 14 -0.8 22 C-0.6 27 0.6 27 0.8 22 C1.1 14 1.8 7 2 0 Z" fill="rgba(226,240,255,0.72)" stroke="rgba(120,150,175,0.75)" strokeWidth="0.45" />
        <path d="M-0.6 1.5 C-0.5 8 -0.4 14 -0.3 20" stroke="rgba(255,255,255,0.9)" strokeWidth="0.45" fill="none" strokeLinecap="round" />
        <ellipse cx="0" cy="25" rx="2.1" ry="2.6" fill="rgba(226,240,255,0.85)" stroke="rgba(120,150,175,0.75)" strokeWidth="0.45" />
      </g>
      <g className="sn-drool-drop">
        <path d="M0 -3.2 C1.5 -1 2.1 0.5 2.1 1.5 A2.1 2.1 0 0 1 -2.1 1.5 C-2.1 0.5 -1.5 -1 0 -3.2 Z" fill="rgba(226,240,255,0.85)" stroke="rgba(120,150,175,0.75)" strokeWidth="0.45" />
      </g>
    </g>
  );
}

/**
 * The spit of the breath out: when it starts (the pose engine puts the class sn-spit on the rig), a spray of drops and a
 * few strings fly out of the mouth — forward and down, they fall with gravity and fade. The mouth is read off the head's
 * group every frame (its pose transform included), in the rig's own units.
 */
function useSpit(svgRef: RefObject<SVGSVGElement | null>, headRef: RefObject<SVGGElement | null>, layerRef: RefObject<SVGGElement | null>, on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const NS = "http://www.w3.org/2000/svg";
    type Drop = { el: SVGElement; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; streak: boolean };
    const drops: Drop[] = [];
    let raf = 0, last = 0, was = false;
    const mouth = (): [number, number] | null => {
      const svg = svgRef.current, h = headRef.current;
      const a = svg?.getScreenCTM(), b = h?.getScreenCTM();
      if (!a || !b) return null;
      const m = a.inverse().multiply(b);
      return [m.a * MOUTH[0] + m.c * MOUTH[1] + m.e, m.b * MOUTH[0] + m.d * MOUTH[1] + m.f];
    };
    const burst = (p: [number, number]) => {
      const layer = layerRef.current;
      if (!layer) return;
      for (let i = 0; i < 18; i++) {
        const streak = i < 4;
        const el = document.createElementNS(NS, streak ? "line" : "circle");
        // out of the mouth, a fan forward (down the screen) and to the sides
        const a = Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const s = 90 + Math.random() * 260;
        const r = streak ? 1.6 + Math.random() * 1.4 : 1 + Math.random() * 2.6;
        el.setAttribute("fill", "rgba(230,242,255,0.85)");
        el.setAttribute("stroke", streak ? "rgba(230,242,255,0.8)" : "rgba(120,150,175,0.7)");
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-width", streak ? r.toFixed(2) : "0.5");
        layer.appendChild(el);
        drops.push({ el, x: p[0] + (Math.random() - 0.5) * 18, y: p[1], vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.55 - 70 - Math.random() * 90, r, life: 0.55 + Math.random() * 0.5, age: 0, streak });
      }
    };
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const now = !!svgRef.current?.classList.contains("sn-spit");
      if (now && !was) { const p = mouth(); if (p) burst(p); }
      was = now;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.age += dt;
        d.vy += 700 * dt;
        d.vx *= 1 - 1.2 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        const k = 1 - d.age / d.life;
        if (k <= 0) { d.el.remove(); drops.splice(i, 1); continue; }
        d.el.setAttribute("opacity", Math.min(1, k * 1.5).toFixed(2));
        if (d.streak) {
          d.el.setAttribute("x1", d.x.toFixed(1)); d.el.setAttribute("y1", d.y.toFixed(1));
          d.el.setAttribute("x2", (d.x - d.vx * 0.05).toFixed(1)); d.el.setAttribute("y2", (d.y - d.vy * 0.05).toFixed(1));
        } else {
          d.el.setAttribute("cx", d.x.toFixed(1)); d.el.setAttribute("cy", d.y.toFixed(1)); d.el.setAttribute("r", d.r.toFixed(2));
        }
      }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); for (const d of drops) d.el.remove(); };
  }, [svgRef, headRef, layerRef, on]);
}
