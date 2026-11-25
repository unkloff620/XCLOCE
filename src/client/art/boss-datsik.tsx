"use client";
/*
 * Дацкоу (the new full-height art 2026-11-25, tools/boss/assemble-datsik.py): a long-haired lad in a dirty T-shirt and
 * jeans, both fists up at his chest. The puppet (boss-puppet.ts) bends the legs (only the feet stay: a punch bends the
 * knees), the body and the arms at the shoulders and the elbows; the forearms carry the fists. The head is plain SVG:
 * the long hair swings behind the head's moves (.dz-hair, the pose engine's hair spring), the chin with the lower teeth
 * and the tongue drops (--jaw, 30 px of the face sheet = 6.45 rig px), the brows frown (--brw), the pupils look about
 * (--px, --py), the lids blink. The punches (boss-poses.ts POSES.datsik) come down at the bottom of the screen and the
 * fist grows at it (zR / zL).
 */
import type { CSSProperties, ReactNode, RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units) and the skin over each (the lids) */
const HOLES = [{ x: 256.5, y: 161, w: 22, h: 8.5, skin: "#fc9571" }, { x: 316, y: 160.5, w: 23, h: 8, skin: "#f88a67" }];
const LID_LINE = "#5a2a18";
/** the waist: the upper body leans and bends round it */
const WAIST = [280, 600] as const;

export function DatsikRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
  id: string; look: string; rig: Rig; bust: boolean; dazed: boolean; dying: boolean; svgRef: RefObject<SVGSVGElement | null>; wrapRef: RefObject<HTMLDivElement | null>; puppet: boolean; viewBox: string;
}) {
  const P = rig.parts;
  const src = (p: string) => `/bosses/${id}/rig/${p}.webp${P[p]?.v ? `?v=${P[p].v}` : ""}`;
  const pic = (p: string, pp?: "back" | "front", follow?: [string, string]) => {
    const r = P[p];
    if (!r) return null;
    const on = puppet && pp;
    return <image className={on ? "pp" : undefined} data-pp={on ? pp : undefined} data-pp-body={on && p === "body" ? "1" : undefined}
      data-pp-follow={on && follow ? follow[0] : undefined} data-pp-follow-at={on && follow ? follow[1] : undefined}
      href={src(p)} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" />;
  };
  const at = (x: number, y: number): CSSProperties => ({ transformOrigin: `${x}px ${y}px`, transformBox: "view-box" });
  const origin = (p: string): CSSProperties => { const pv = P[p]?.pivot ?? [rig.w / 2, rig.h]; return at(pv[0], pv[1]); };
  const box = (p: string, fx: number, fy: number): CSSProperties => { const r = P[p]; return r ? at(r.x + r.w * fx, r.y + r.h * fy) : {}; };
  const bone = (cls: string, p: string, kids: ReactNode, size?: number) => (
    <g className={cls} data-pivot={P[p]?.pivot ? `${P[p].pivot![0]},${P[p].pivot![1]}` : undefined} data-pp-size={size} style={origin(p)}>{kids}</g>
  );
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-dz ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="dz-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* his left upper arm behind the T-shirt, then the T-shirt with the neck */}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {bone("br-arm br-arm-l", "armL", <>{pic("armL", "back")}{bone("br-low br-low-l", "lowL", null, 120)}</>, 130)}
          {pic("body", "back")}
        </g>
        {/* the jeans over the T-shirt's hem: the feet stay planted, the hips go with the upper body — a punch bends the knees */}
        {pic("legs", "back", ["br-up", "0.25,0.72"])}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* the face (the mouth inside, the tongue and the lower teeth on the jaw, the upper teeth, the whites and the pupils
              under the eye holes, the lids, the head, the chin, the brows) and the long hair over it */}
          {bone("br-head", "head", <>
            {pic("throat")}
            <g className="dz-jaw">{pic("tongue")}{pic("teeth-low")}</g>
            {pic("teeth-up")}
            {pic("eyes")}
            <g className="dz-pupils">{pic("pupils")}</g>
            <g className="dz-lids">
              {HOLES.map((h, i) => (
                <g key={i} style={at(h.x, h.y - 1)}>
                  <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={h.skin} />
                  <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.2} fill={LID_LINE} />
                </g>
              ))}
            </g>
            {pic("head")}
            <g className="dz-jaw">{pic("chin")}</g>
            <g className="dz-brows" style={box("brows", 0.5, 0.5)}>{pic("brows")}</g>
            <g className="dz-hair" style={box("hair", 0.5, 0.12)}>{pic("hair")}</g>
          </>, 150)}
          {/* the arms with the fists in front (over the hair): soft shoulders and elbows */}
          {bone("br-arm br-arm-r", "armR", <>{pic("armR", "front")}{bone("br-low br-low-r", "lowR", pic("lowR", "front"), 120)}</>, 130)}
          {bone("br-arm br-arm-l", "armL", bone("br-low br-low-l", "lowL", pic("lowL", "front"), 120), 130)}
        </g>
      </g>
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-dz-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
    </div>
  );
}
