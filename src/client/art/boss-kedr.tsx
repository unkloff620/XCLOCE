"use client";
/*
 * Кедр (the new model 2026-11-26, tools/boss/assemble-kedr.py): the artist's layers on soft joints — the puppet
 * (boss-puppet.ts) bends the legs (only the feet stay: a crouch bends the knees), the body and the arms at the
 * shoulders, the elbows and the wrists; his open left hand also bends at the knuckles (an empty bone, .kd-fingers: the
 * hand clenches into a fist — --fg); the face is plain SVG over the body. The pose engine (boss-poses.ts POSES.kedr) runs
 * everything: three quick blows of the hammer, the third one sticks and he yanks it out, the arm springs back smoothly;
 * while he hammers the left arm bends to the body, its fist clenched; both arms rise a little with every breath in; the
 * mouth opens on a blow (--jaw: the chin and the lower teeth drop), the brows frown (--brw), the pupils look about
 * (--px, --py), the lids blink.
 */
import type { CSSProperties, ReactNode, RefObject } from "react";

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
/** where the fingers end (between the fingertips and the thumb's tip): from the knuckles to here the fingers' bone takes over */
const FINGERTIPS = [586, 836] as const;

export function KedrRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
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
  const bone = (cls: string, p: string, kids: ReactNode, size?: number) => (
    <g className={cls} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
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
              {bone("br-hand br-hand-r", "handR", pic("handR", "back"), 70)}
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
            <g className="kd-brows" style={box("brows", 0.5, 0.5)}>{pic("brows")}</g>
          </>, 150)}
          {/* his left arm over the body: the sleeve, the forearm, the open hand — its fingers bend at the knuckles */}
          {bone("br-arm br-arm-l", "armL", <>
            {pic("armL", "front")}
            {bone("br-low br-low-l", "lowL", <>
              {pic("lowL", "front")}
              {bone("br-hand br-hand-l", "handL", <>
                {pic("handL", "front")}
                <g className="kd-fingers" data-pivot={`${KNUCKLES[0]},${KNUCKLES[1]}`} data-pp-dangle={`${FINGERTIPS[0]},${FINGERTIPS[1]},46`} style={at(KNUCKLES[0], KNUCKLES[1])} />
              </>, 60)}
            </>, 110)}
          </>, 130)}
        </g>
      </g>
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-kedr-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
    </div>
  );
}
