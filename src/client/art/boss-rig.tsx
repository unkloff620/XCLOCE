"use client";
/*
 * Animated boss built from the artist's layers (tools/boss/build-boss.py): body breathes, head sways around the neck,
 * fists bob in a guard around the elbows, eyes blink. Bosses without a rig use their flat picture.
 * Bosses with a full face (pupils, brows, mouth layers) also look around and react to hits: the arena gets the
 * class "ouch" for a moment — angry brows turn into sad ones and the grin into a closed mouth.
 * Below half HP a boss with a "<id>-beaten" rig (tools/boss/align-variant.py) switches to its beaten look.
 * Bosses with whole arms (armL/armR + handL/handR, Гаркуша): the arm swings at the shoulder and the hand turns at the wrist
 * inside it; the irises are clipped to the eye whites so they can look around.
 */
import { BOSS_RIGS } from "./boss-rig-data.ts";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[] };

export function hasBossRig(id: string): boolean {
  return id in BOSS_RIGS;
}

/** HP share (0..1) below which the beaten look is shown. */
export const BEATEN_BELOW = 0.5;

export function BossRig({ id: baseId, hpShare = 1 }: { id: string; hpShare?: number }) {
  const id = hpShare < BEATEN_BELOW && `${baseId}-beaten` in BOSS_RIGS ? `${baseId}-beaten` : baseId;
  const rig = BOSS_RIGS[id];
  if (!rig) return null;
  const P = rig.parts;
  const img = (p: string, extra?: string) => {
    const r: Part | undefined = P[p];
    return r ? <image className={extra} href={`/bosses/${id}/rig/${p}.webp`} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" /> : null;
  };
  const origin = (p: string) => {
    const pv = P[p]?.pivot ?? [rig.w / 2, rig.h];
    return { transformOrigin: `${pv[0]}px ${pv[1]}px`, transformBox: "view-box" as const };
  };
  // whole arm: the sleeve swings at the shoulder, the hand inside it at the wrist
  const arm = (side: "L" | "R") =>
    P[`arm${side}`] ? (
      <g className={`br-arm br-arm-${side.toLowerCase()}`} style={origin(`arm${side}`)}>
        {img(`arm${side}`)}
        <g className={`br-hand br-hand-${side.toLowerCase()}`} style={origin(`hand${side}`)}>{img(`hand${side}`)}</g>
      </g>
    ) : null;
  const clipEyes = !!P.armL && !!P.pupils && !!P.eyes;
  const maskId = `br-eyes-${id}`;
  // bosses with a full face (Кедр): pupils glance around, brows and mouth change when he is hit (class "ouch" on the arena)
  return (
    <svg key={id} className={`boss-rig rig-${baseId} ${id.endsWith("-beaten") ? "beaten" : ""}`} viewBox={`0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g className="br-breath" style={{ transformOrigin: `${rig.w / 2}px ${rig.h}px`, transformBox: "view-box" }}>
        {img("body")}
        <g className="br-head" style={origin("head")}>
          {img("head")}
          {clipEyes && (
            <mask id={maskId} style={{ maskType: "alpha" }} maskUnits="userSpaceOnUse" x="0" y="0" width={rig.w} height={rig.h}>{img("eyes")}</mask>
          )}
          <g className="br-eyes-open">
            {img("eyes")}
            {P.pupils && <g mask={clipEyes ? `url(#${maskId})` : undefined}><g className="br-pupils">{img("pupils")}</g></g>}
          </g>
          {img("eyes-closed", "br-eyes-closed")}
          {P.brows && <g className="br-brows">{img("brows", "br-brows-angry")}{img("brows-sad", "br-brows-sad")}</g>}
          {img("mouth", "br-mouth")}
          {img("mouth-closed", "br-mouth-closed")}
        </g>
        {img("collar")}
        {P.foreL && <g className="br-fist-l" style={origin("foreL")}>{img("foreL")}</g>}
        {P.foreR && <g className="br-fist-r" style={origin("foreR")}>{img("foreR")}</g>}
        {arm("R")}
        {arm("L")}
      </g>
    </svg>
  );
}
