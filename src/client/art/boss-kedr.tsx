"use client";
/*
 * Кедр (the new model 2026-11-26, tools/boss/assemble-kedr.py): the artist's layers on soft joints — the puppet
 * (boss-puppet.ts) bends the legs (only the feet stay: a crouch bends the knees), the body and the arms at the
 * shoulders, the elbows and the wrists; in his open left hand the fingers and the thumb (two empty bones, .kd-fingers and
 * .kd-thumb) come together and part again all the time — he works his fingers (--fg); the face is plain SVG over the body. The pose engine (boss-poses.ts POSES.kedr) runs
 * everything: three quick blows of the hammer, the third one sticks and he yanks it out, the arm springs back smoothly;
 * while he hammers the left arm bends to the body; both arms rise with every breath in; the mouth (closed as drawn)
 * opens on a blow (--jaw: the chin and the lower teeth drop, at most the artist's «2 × Shift + ↓»), the brows move all
 * the time — up, a frown, one twitch (--brw, --bru), the pupils look about
 * (--px, --py), the lids blink. Every blow of the hammer splashes blood off its face (the class kd-hit, useHammerBlood).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units): his right eye (the left of the picture), his left */
const HOLES = [{ x: 357, y: 176.5, w: 25, h: 8 }, { x: 423, y: 174.5, w: 24.5, h: 7.5 }];
const SKIN = "#f7975c";
const LID_LINE = "#5a2a18";
/** the waist: the upper body leans and bends round it */
const WAIST = [408, 700] as const;
/** the left hand's knuckles: its fingers bend round them when it clenches */
const KNUCKLES = [616, 782] as const;
/** where the fingers end: from the knuckles to here the fingers' bone takes over */
const FINGERTIPS = [586, 836] as const;
/** the hammer's face (the end that hits), in the fist's own frame (rig units) */
const FACE = [45, 672] as const;
/** the thumb: its root and its tip */
const THUMB = { root: [584, 757], tip: [559, 794] } as const;

/** the parts drawn beaten below half HP (tools/boss/beaten-blood.py), and their pictures" version */
const BEATEN = new Set(["armL", "armR", "body", "chin", "handL", "handR", "head", "legs", "lowL", "lowR"]);
const BEATEN_V = 1;

export function KedrRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
  id: string; look: string; rig: Rig; bust: boolean; dazed: boolean; dying: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
  const hand = useRef<SVGGElement>(null);
  const blood = useRef<SVGGElement>(null);
  useHammerBlood(svgRef, hand, blood, !bust);
  // below half HP: beaten — blood, cuts, bruises, torn clothes (tools/boss/beaten-blood.py, <part>-blood.webp)
  const src = (p: string) => dazed && !bust && BEATEN.has(p) ? `/bosses/${id}/rig/${p}-blood.webp?v=${BEATEN_V}` : `/bosses/${id}/rig/${p}.webp${P[p]?.v ? `?v=${P[p].v}` : ""}`;
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
  const lids = (
    <g className="kd-lids">
      {HOLES.map((h, i) => (
        <g key={i} style={at(h.x, h.y - 1)}>
          <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={SKIN} />
          <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.2} fill={LID_LINE} />
        </g>
      ))}
    </g>
  );
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-kedr ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="kd-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the legs: the feet stay planted, the hips go with the upper body — a crouch bends the knees */}
        {P.legs && (puppet ? (
          <image className="pp" data-pp="back" data-pp-follow="br-up" data-pp-follow-at="0.22,0.72" href={src("legs")}
            x={P.legs.x} y={P.legs.y} width={P.legs.w} height={P.legs.h} preserveAspectRatio="none" />
        ) : pic("legs"))}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* his right arm with the hammer behind the body (the artist's order): the sleeve, the forearm, the fist */}
          {bone("br-arm br-arm-r", "armR", <>
            {pic("armR", "back")}
            {bone("br-low br-low-r", "lowR", <>
              {pic("lowR", "back")}
              {bone("br-hand br-hand-r", "handR", pic("handR", "back"), 70, hand)}
            </>, 110)}
          </>, 130)}
          {pic("body", "back")}
          {/* the face: the mouth inside (the throat, the teeth, the chin that drops), the whites and the pupils under the
              head's eye holes, the lids, the head, the brows */}
          {bone("br-head", "head", <>
            {pic("throat")}
            {pic("teeth-up")}
            <g className="kd-jaw">{pic("teeth-low")}{pic("chin")}</g>
            {pic("eyes")}
            <g className="kd-pupils">{pic("pupils")}</g>
            {lids}
            {pic("head")}
            <g className="kd-brows" style={box("brows", 0.5, 0.5)}><g className="kd-brows-u" style={box("brows", 0.5, 0.5)}>{pic("brows")}</g></g>
          </>, 150)}
          {/* his left arm over the body: the sleeve, the forearm, the open hand — its fingers bend at the knuckles */}
          {bone("br-arm br-arm-l", "armL", <>
            {pic("armL", "front")}
            {bone("br-low br-low-l", "lowL", <>
              {pic("lowL", "front")}
              {bone("br-hand br-hand-l", "handL", <>
                {pic("handL", "front")}
                <g className="kd-fingers" data-pivot={`${KNUCKLES[0]},${KNUCKLES[1]}`} data-pp-dangle={`${FINGERTIPS[0]},${FINGERTIPS[1]},19`} style={at(KNUCKLES[0], KNUCKLES[1])} />
                <g className="kd-thumb" data-pivot={`${THUMB.root[0]},${THUMB.root[1]}`} data-pp-dangle={`${THUMB.tip[0]},${THUMB.tip[1]},24`} style={at(THUMB.root[0], THUMB.root[1])} />
              </>, 60)}
            </>, 110)}
          </>, 130)}
        </g>
      </g>
      {!puppet && <g ref={blood} className="kd-blood" />}
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-kedr-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
      <svg className="br-pup-over" viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g ref={blood} className="kd-blood" />
      </svg>
    </div>
  );
}

/**
 * Blood off the hammer: when a blow lands (the pose engine puts kd-hit on the rig), a burst of drops and streaks flies
 * from the hammer's face along the blow and back up off what it hit, falls and fades; a few drops stay on the face a
 * moment. The face's place is read off the fist's group every frame.
 */
function useHammerBlood(svgRef: RefObject<SVGSVGElement | null>, handRef: RefObject<SVGGElement | null>, layerRef: RefObject<SVGGElement | null>, on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const NS = "http://www.w3.org/2000/svg";
    type Drop = { el: SVGElement; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; streak: boolean };
    const drops: Drop[] = [];
    let raf = 0, last = 0, was = false;
    let prev: [number, number] | null = null;
    let vel: [number, number] = [0, 0];
    const face = (): [number, number] | null => {
      const a = svgRef.current?.getScreenCTM(), b = handRef.current?.getScreenCTM();
      if (!a || !b) return null;
      const m = a.inverse().multiply(b), [x, y] = FACE;
      return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    };
    const burst = (p: [number, number], v: [number, number]) => {
      const layer = layerRef.current;
      if (!layer) return;
      const sp = Math.hypot(v[0], v[1]) || 1;
      const dir: [number, number] = [v[0] / sp, v[1] / sp];
      for (let i = 0; i < 22; i++) {
        const streak = i < 6;
        const el = document.createElementNS(NS, streak ? "line" : "circle");
        // most fly on along the blow, the rest bounce back up off what it hit
        const back = i % 3 === 0;
        const a = Math.atan2(back ? -dir[1] : dir[1], back ? dir[0] * 0.4 : dir[0]) + (Math.random() - 0.5) * 2.4;
        const s = 160 + Math.random() * 420;
        const r = streak ? 2.5 + Math.random() * 2.5 : 1.6 + Math.random() * 4;
        el.setAttribute("fill", i % 3 ? "#b30f12" : "#7a0508");
        el.setAttribute("stroke", "#7a0508");
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-width", streak ? r.toFixed(2) : "0.5");
        layer.appendChild(el);
        drops.push({ el, x: p[0] + (Math.random() - 0.5) * 10, y: p[1] + (Math.random() - 0.5) * 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 140 * Math.random(), r, life: 0.45 + Math.random() * 0.45, age: 0, streak });
      }
    };
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const p = face();
      if (p && prev && dt > 0) vel = [(p[0] - prev[0]) / dt * 0.5 + vel[0] * 0.5, (p[1] - prev[1]) / dt * 0.5 + vel[1] * 0.5];
      prev = p;
      const now = !!svgRef.current?.classList.contains("kd-hit");
      if (now && !was && p) burst(p, vel);
      was = now;
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
  }, [svgRef, handRef, layerRef, on]);
}
