"use client";
/*
 * Фокус (the new art 2026-11-25, tools/boss/assemble-fokus.py): a hacker in a hood and a long coat, a flip phone in his
 * raised right fist, a laptop under his left arm. The puppet (boss-puppet.ts) bends the legs (only the feet stay: a
 * blow bends the knees), the body, the coat and the arms at the shoulders and the elbows; the coat's tails (the front
 * and the back between the legs) swing behind his moves (fx-hem, the pose engine's hem). The head is plain SVG in its
 * hood: the hood (its back, its rim and the shadow the rim throws on the face) goes with the head and bends a little
 * behind its moves (.fx-hood-j, the pose engine's hair spring), so the head never leaves it. The right fist with the
 * phone is plain SVG too (over the face): the blows are with the phone, down at the screen — the flip phone's lid swings
 * towards shut on every blow and springs back open (--ph, never past open). The left arm only holds the laptop and
 * sinks a little now and then. The face: the chin and the lower teeth drop (--jaw, the artist's «Shift + 3 × ↓» = 13.1
 * rig px), the brows frown (--brw), the pupils look about (--px, --py), the lids blink, the glasses jump on a quick move
 * (--gb) and wobble (.fx-glasses-j).
 */
import type { CSSProperties, ReactNode, RefObject } from "react";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[]; frames?: number; v?: string };
type Rig = { w: number; h: number; parts: Record<string, Part> };

/** the eye holes of the head (rig units) and the skin round each (the lids) */
const HOLES = [{ x: 337, y: 187, w: 22.5, h: 10.5, skin: "#c96236" }, { x: 393.5, y: 175, w: 27.5, h: 10.5, skin: "#f4ad78" }];
const LID_LINE = "#4a2414";
/** the coat's tails swing from here (rig units) */
const HEM = [395, 700] as const;
/** the waist: the upper body leans and bends round it */
const WAIST = [395, 730] as const;

export function FokusRig({ id, look, rig, bust, dazed, dying, svgRef, wrapRef, puppet, viewBox }: {
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
  // the hood bends a little behind the head's moves, from the neck
  const hood = (p: string) => <g className="fx-hood-j" style={at(P.head?.pivot?.[0] ?? 396, (P.head?.pivot?.[1] ?? 300) - 10)}>{pic(p)}</g>;
  const lids = (
    <g className="fx-lids">
      {HOLES.map((h, i) => (
        <g key={i} style={at(h.x, h.y - 1)}>
          <rect x={h.x - 2} y={h.y - 2} width={h.w + 4} height={h.h + 3} fill={h.skin} />
          <rect x={h.x - 2} y={h.y + h.h - 0.2} width={h.w + 4} height={1.2} fill={LID_LINE} />
        </g>
      ))}
    </g>
  );
  const lid = P.phone?.pivot ?? [234.5, 238.2];
  const svgEl = (
    <svg key={look} ref={svgRef} className={`boss-rig rig-fx ${dazed ? "dazed" : ""} ${dying ? "dying" : ""}`} viewBox={viewBox} width="100%" height="100%"
      preserveAspectRatio={bust ? "xMidYMin slice" : "xMidYMax meet"} aria-hidden="true">
      <g className="fx-root" style={at(rig.w / 2, rig.h - 20)}>
        {/* the coat's back between the legs: with the body, its tail swings */}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          <g className="fx-hem" style={at(HEM[0], HEM[1])} />
          {pic("coatBack", "back", ["fx-hem", "0.95,0.15"])}
        </g>
        {/* the legs: the feet stay planted, the hips go with the upper body — a blow bends the knees */}
        {pic("legs", "back", ["br-up", "0.25,0.72"])}
        <g className="br-up" style={at(WAIST[0], WAIST[1])}>
          {/* his right upper arm behind the body (the artist's order), the empty elbow in it */}
          {bone("br-arm br-arm-r", "armR", <>{pic("armR", "back")}{bone("br-low br-low-r", "lowR", null, 110)}</>, 130)}
          {pic("body", "back")}
          {/* the long coat: its tails below the chest swing with fx-hem */}
          {pic("coat", "back", ["fx-hem", "0.98,0.45"])}
          {/* the right forearm over the coat, the empty wrist in it */}
          {bone("br-arm br-arm-r", "armR", bone("br-low br-low-r", "lowR", <>{pic("lowR", "back")}{bone("br-hand br-hand-r", "handR", null, 80)}</>, 110), 130)}
          {/* the laptop under the left arm, held by the forearm */}
          {bone("br-arm br-arm-l", "armL", bone("br-low br-low-l", "lowL", pic("laptop", "back"), 120), 130)}
          {bone("br-arm br-arm-l", "armL", <>{pic("armL", "back")}{bone("br-low br-low-l", "lowL", <>{pic("lowL", "back")}{bone("br-hand br-hand-l", "handL", pic("handL", "back"), 80)}</>, 120)}</>, 130)}
          {/* the head in its hood: the hood's back, the neck, the face (the mouth inside, the teeth, the chin that drops,
              the whites and the pupils under the eye holes, the lids, the head, the brows, the glasses), the shadow of
              the hood's rim on the face, the rim */}
          {bone("br-head", "head", <>
            {hood("hoodBack")}
            {pic("neck")}
            {pic("throat")}
            <g className="fx-jaw">{pic("teeth-low")}{pic("chin")}</g>
            {pic("teeth-up")}
            {pic("eyes")}
            <g className="fx-pupils">{pic("pupils")}</g>
            {lids}
            {pic("head")}
            <g className="fx-brows" style={box("brows", 0.5, 0.5)}>{pic("brows")}</g>
            <g className="fx-glasses" style={box("glasses", 0.5, 0.45)}><g className="fx-glasses-j" style={box("glasses", 0.5, 0.45)}>{pic("glasses")}</g></g>
            {hood("hoodShadow")}
            {hood("hoodFront")}
          </>, 150)}
          {/* the fist with the phone over the face (plain SVG): the lid turns on its hinge */}
          {bone("br-arm br-arm-r", "armR", bone("br-low br-low-r", "lowR", bone("br-hand br-hand-r", "handR", <>
            {pic("handR")}
            <g className="fx-lid" style={at(lid[0], lid[1])}>{pic("phone")}</g>
          </>, 80), 110), 130)}
        </g>
      </g>
    </svg>
  );
  if (!puppet) return svgEl;
  return (
    <div ref={wrapRef} key={look} className="br-pup rig-fx-pup">
      <canvas className="br-pup-back" aria-hidden="true" />
      {svgEl}
      <canvas className="br-pup-front" aria-hidden="true" />
    </div>
  );
}
