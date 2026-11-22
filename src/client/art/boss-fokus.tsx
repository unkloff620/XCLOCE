"use client";
/*
 * Фокус (tools/boss/assemble-fokus.py): the artist's layers on soft joints — the puppet (boss-puppet.ts) bends the legs,
 * the body and the arms at the shoulders, the elbows and the wrists; the face is plain SVG over the body. The pose engine
 * (boss-poses.ts POSES.fokus) runs everything: the berserk combo (slow → faster and faster, the right fist and the knife
 * in turn), the glasses sliding down the nose (--gl: the nose squashes under them), the open panting mouth after it
 * (--jaw: the chin, the lower lip and the lower teeth drop, the throat opens), the push of the glasses back up with the
 * pointing finger (--fing swaps the fist for the finger hand), the frown (--brw), the squint (--sq), the eyes looking
 * about (--px, --py), the hair lagging and flopping (.fk-hair). The eyelids are drawn here: skin under the head's eye
 * holes. Every stab splashes blood off the knife's point (the class fk-stab, useBlood).
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units): his right eye (the left of the picture), his left */
const HOLES = [{ x: 326, y: 129.5, w: 25.5, h: 11 }, { x: 388, y: 126, w: 24.5, h: 11.5 }];
const SKIN = "#e68c63";
const LID_LINE = "#5a2a18";
/** the knife's point in the left hand's own frame (rig units, as drawn) */
const KNIFE_TIP = [764.5, 608.5] as const;
/** the waist: the upper body leans round it */
const WAIST = [372, 610] as const;

export function FokusRig({ id, rig, bust, dazed, svgRef, wrapRef, puppet, viewBox }: {
  id: string; rig: Rig; bust: boolean; dazed: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
  const handL = useRef<SVGGElement>(null);
  const blood = useRef<SVGGElement>(null);
  useBlood(svgRef, handL, blood, !bust);
  const src = (p: string) => `/bosses/${id}/rig/${p}.webp${P[p]?.v ? `?v=${P[p].v}` : ""}`;
  // a picture: plain SVG, or warped by the puppet on the back / front canvas (fade: drawn with that group's opacity)
  const pic = (p: string, pp?: "back" | "front", fade?: string) => {
    const r = P[p];
    if (!r) return null;
    const on = puppet && pp;
    return <image className={on ? "pp" : undefined} data-pp={on ? pp : undefined} data-pp-body={on && p === "body" ? "1" : undefined}
      data-pp-fade={on ? fade : undefined} href={src(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
  };
  const at = (x: number, y: number): CSSProperties => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" });
  const origin = (p: string): CSSProperties => { const pv = P[p]?.pivot ?? [rig.w / 2, rig.h]; return at(pv[0], pv[1]); };
  const box = (p: string, fx: number, fy: number): CSSProperties => { const r = P[p]; return r ? at(r.x + r.w * fx, r.y + r.h * fy) : {}; };
  const bone = (cls: string, p: string, kids: ReactNode, size?: number, ref?: RefObject<SVGGElement | null>) => (
    <g className={cls} ref={ref} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
  );
  const lids = (cls: string) => (
    <g className={cls}>
      {HOLES.map((h, i) => (
        <g key={i} style={at(h.x, h.y - 1)}>
          <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={SKIN} />
          <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.3} fill={LID_LINE} />
        </g>
      ))}
    </g>
  );
  const svgEl = (
    <svg key={id} ref={svgRef} className={`boss-rig rig-fokus ${dazed ? "dazed" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="fk-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the legs: the feet stay planted, only the shins and the feet are fixed: the hips and the thighs go with the upper body (br-up), the bend fades out at the knees */}
        {P.legs && (puppet ? (
          <image className="pp" data-pp="back" data-pp-follow="br-up" data-pp-follow-at="0.36,0.56" href={src("legs")}
            x={P.legs.x} y={P.legs.y} width={P.legs.w} height={P.legs.h} preserveAspectRatio="none" />
        ) : pic("legs"))}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* the left shoulder behind the body (an empty elbow in it: its end bends with the forearm) */}
          {bone("br-arm br-arm-l", "armL", <>{pic("armL", "back")}{bone("br-low br-low-l", "lowL", null, 130)}</>, 140)}
          {pic("body", "back")}
          {/* the face, plain SVG: the whites and the pupils under the head's eye holes, the lids over them, the head, the
              nose, the mouth (the chin, the throat, the teeth, the lips — the lower ones on the jaw), the brows, the
              glasses with their arm, the hair on top */}
          {bone("br-head", "head", <>
            {pic("eyes")}
            <g className="fk-pupils">{pic("pupils")}</g>
            {lids("fk-lids-sq")}
            {lids("fk-lids")}
            {pic("head")}
            <g className="fk-nose" style={box("nose", 0.5, 1)}>{pic("nose")}</g>
            <g className="fk-chin" style={box("chin", 0.5, 0)}>{pic("chin")}</g>
            <g className="fk-throat" style={box("throat", 0.5, 0)}>{pic("throat")}</g>
            {pic("teeth-up")}
            <g className="fk-jaw">{pic("teeth-low")}</g>
            {pic("lips-up")}
            <g className="fk-jaw">{pic("lips")}</g>
            <g className="br-brow-r" style={origin("browR")}>{pic("browR")}</g>
            <g className="br-brow-l" style={origin("browL")}>{pic("browL")}</g>
            <g className="fk-glasses" style={box("glasses", 0.5, 0.4)}>{pic("glasses")}</g>
            <g className="fk-hair" style={box("hair", 0.5, 0.18)}>{pic("hair")}</g>
            {/* the glasses' arm over the hair: hinged on the glasses, resting on the ear — it bends between them (--ta0/--ta1/--ts) */}
            <g className="fk-temple" style={at(444, 149)}>{pic("temple")}</g>
          </>)}
          {/* the right arm (the fist on the hip): the fist or the hand with the pointing finger on the same wrist */}
          {bone("br-arm br-arm-r", "armR", <>
            {pic("armR", "front")}
            {bone("br-low br-low-r", "lowR", <>
              {pic("lowR", "front")}
              {bone("br-hand br-hand-r", "handR", <>
                <g className="fk-fist">{pic("handR", "front", "fk-fist")}</g>
                <g className="fk-finger">{pic("fingerR", "front", "fk-finger")}</g>
              </>, 90)}
            </>, 130)}
          </>, 140)}
          {/* the left arm with the knife: in front of the body (its shoulder copy is behind, above) */}
          {bone("br-arm br-arm-l", "armL", bone("br-low br-low-l", "lowL", <>
            {pic("lowL", "front")}
            {bone("br-hand br-hand-l", "handL", pic("handL", "front"), 90, handL)}
          </>, 130), 140)}
        </g>
      </g>
      {!puppet && <g ref={blood} className="fk-blood" />}
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={id} className="br-pup rig-fokus-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
      {/* the blood over the puppet's canvas (the knife is drawn there) */}
      <svg className="br-pup-over" viewBox={viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <g ref={blood} className="fk-blood" />
      </svg>
    </div>
  );
}

/**
 * Blood off the knife: when a stab lands (the pose engine puts the class fk-stab on the rig), a burst of drops flies
 * from the knife's point along the stab, falls with gravity and fades, a few long streaks among them. The point is
 * read off the hand's group every frame (its CSS / pose transforms included), in the rig's own units.
 */
function useBlood(svgRef: RefObject<SVGSVGElement | null>, handRef: RefObject<SVGGElement | null>, layerRef: RefObject<SVGGElement | null>, on: boolean) {
  useEffect(() => {
    if (!on || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const NS = "http://www.w3.org/2000/svg";
    type Drop = { el: SVGElement; x: number; y: number; vx: number; vy: number; r: number; life: number; age: number; streak: boolean };
    const drops: Drop[] = [];
    let raf = 0, last = 0, was = false;
    let prev: [number, number] | null = null;
    let vel: [number, number] = [0, 0];
    const tip = (): [number, number] | null => {
      const svg = svgRef.current, hand = handRef.current;
      const a = svg?.getScreenCTM(), b = hand?.getScreenCTM();
      if (!a || !b) return null;
      const m = a.inverse().multiply(b);
      return [m.a * KNIFE_TIP[0] + m.c * KNIFE_TIP[1] + m.e, m.b * KNIFE_TIP[0] + m.d * KNIFE_TIP[1] + m.f];
    };
    const burst = (p: [number, number]) => {
      const layer = layerRef.current;
      if (!layer) return;
      const sp = Math.hypot(vel[0], vel[1]) || 1;
      const dir: [number, number] = [vel[0] / sp, vel[1] / sp];
      for (let i = 0; i < 22; i++) {
        const streak = i < 6;
        const el = document.createElementNS(NS, streak ? "line" : "circle");
        const a = Math.atan2(dir[1], dir[0]) + (Math.random() - 0.5) * 1.9;
        const s = 220 + Math.random() * 480;
        const r = streak ? 3.5 + Math.random() * 2.5 : 2.5 + Math.random() * 5;
        el.setAttribute("fill", i % 3 ? "#b30f12" : "#7a0508");
        el.setAttribute("stroke", "#7a0508");
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-width", streak ? r.toFixed(2) : "0.6");
        layer.appendChild(el);
        drops.push({ el, x: p[0], y: p[1], vx: Math.cos(a) * s - dir[0] * 40, vy: Math.sin(a) * s - 120 * Math.random(), r, life: 0.45 + Math.random() * 0.45, age: 0, streak });
      }
    };
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (document.hidden) { last = 0; return; }
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const p = tip();
      if (p && prev && dt > 0) vel = [(p[0] - prev[0]) / dt * 0.5 + vel[0] * 0.5, (p[1] - prev[1]) / dt * 0.5 + vel[1] * 0.5];
      prev = p;
      const now = !!svgRef.current?.classList.contains("fk-stab");
      if (now && !was && p) burst(p);
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
