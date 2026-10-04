"use client";
/*
 * Animated boss built from the artist's layers (tools/boss/build-boss.py): body breathes, head sways around the neck,
 * fists bob in a guard around the elbows, eyes blink. Bosses without a rig use their flat picture.
 */
import { BOSS_RIGS } from "./boss-rig-data.ts";

type Part = { x: number; y: number; w: number; h: number; pivot?: readonly number[] };

export function hasBossRig(id: string): boolean {
  return id in BOSS_RIGS;
}

export function BossRig({ id }: { id: string }) {
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
  return (
    <svg className="boss-rig" viewBox={`0 0 ${rig.w} ${rig.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g className="br-breath" style={{ transformOrigin: `${rig.w / 2}px ${rig.h}px`, transformBox: "view-box" }}>
        {img("body")}
        <g className="br-head" style={origin("head")}>
          {img("head")}
          {img("eyes", "br-eyes-open")}
          {img("eyes-closed", "br-eyes-closed")}
        </g>
        <g className="br-fist-l" style={origin("foreL")}>{img("foreL")}</g>
        <g className="br-fist-r" style={origin("foreR")}>{img("foreR")}</g>
      </g>
    </svg>
  );
}
