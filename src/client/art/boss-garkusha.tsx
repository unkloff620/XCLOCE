"use client";
/*
 * Гаркуша (the artist's new model 2026-11-26, tools/boss/assemble-garkusha.py): the layers on soft joints — the puppet
 * (boss-puppet.ts) bends the legs (only the feet stay: a crouch bends the knees), the body and the arms in three pieces
 * at the shoulders, the elbows and the wrists (a fist with a stack of cash in each); the face is plain SVG over the body —
 * the whites and the pupils under the head's eye holes, the lids, the brows. The pose engine (boss-poses.ts POSES.garkusha) runs
 * everything: slaps with the cash (the held-out right one swings across, the raised left one comes down at you), he
 * flaunts the stack by his face, shakes both; the arms rise with every breath in; the brows frown and lift (--brw, --bru), the pupils look about (--px, --py).
 */
import type { CSSProperties, ReactNode, RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units): his right eye (the left of the picture), his left */
const HOLES = [{ x: 372, y: 190, w: 28, h: 12 }, { x: 443, y: 196.5, w: 24.5, h: 11.5 }];
const SKIN = "#f9a56b";
const LID_LINE = "#5a2a18";
/** the waist: the upper body leans and bends round it */
const WAIST = [400, 716] as const;

export function GarkushaRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
  id: string; look: string; rig: Rig; bust: boolean; dazed: boolean; dying: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
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
  const lids = (
    <g className="gk-lids">
      {HOLES.map((h, i) => (
        <g key={i} style={at(h.x, h.y - 1)}>
          <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={SKIN} />
          <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.2} fill={LID_LINE} />
        </g>
      ))}
    </g>
  );
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-garkusha ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="gk-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the legs: the feet stay planted, the hips go with the upper body — a crouch bends the knees */}
        {P.legs && (puppet ? (
          <image className="pp" data-pp="back" data-pp-follow="br-up" data-pp-follow-at="0.22,0.72" href={src("legs")}
            x={P.legs.x} y={P.legs.y} width={P.legs.w} height={P.legs.h} preserveAspectRatio="none" />
        ) : pic("legs"))}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* his left upper arm behind the jacket (the artist's order), an empty elbow in it */}
          {bone("br-arm br-arm-l", "armL", <>{pic("armL", "back")}{bone("br-low br-low-l", "lowL", null, 110)}</>, 130)}
          {pic("body", "back")}
          {/* the face: the whites and the pupils under the head's eye holes, the lids, the head */}
          {bone("br-head", "head", <>
            {pic("eyes")}
            <g className="gk-pupils">{pic("pupils")}</g>
            {lids}
            {pic("head")}
            {/* the brows: a frown (down and in), up (a sneer), each one twitches on its own a little */}
            <g className="gk-brows" style={box("brows", 0.5, 0.6)}><g className="gk-brows-u" style={box("brows", 0.5, 0.6)}>{pic("brows")}</g></g>
          </>, 150)}
          {/* the left forearm (up from the elbow) and the raised fist with the cash, over the jacket */}
          {bone("br-arm br-arm-l", "armL", bone("br-low br-low-l", "lowL", <>
            {pic("lowL", "front")}
            {bone("br-hand br-hand-l", "handL", pic("handL", "front"), 90)}
          </>, 110), 130)}
          {/* the right arm held out: the upper arm, the forearm, the fist with the cash — over everything */}
          {bone("br-arm br-arm-r", "armR", <>
            {pic("armR", "front")}
            {bone("br-low br-low-r", "lowR", <>
              {pic("lowR", "front")}
              {bone("br-hand br-hand-r", "handR", pic("handR", "front"), 90)}
            </>, 110)}
          </>, 130)}
        </g>
      </g>
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-garkusha-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
    </div>
  );
}
