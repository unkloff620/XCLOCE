"use client";
/*
 * Псих's flat in 1024×1843 (tools/boss/build-psih-room.py, the artist's layers): the punching bag swings on its chains
 * without a stop (round where the chains come down — the hooks and the ceiling's cables stay put); the safe's door on the
 * left slowly swings to and fro on its hinges; the old TV's screen is static noise (frames); the boombox on it shakes to
 * the music; the police are out in the street: their lights in the window, on the ceiling and on the wet floor go red —
 * blue — red, flashing twice each (the artist's red light; its blue copy and its dark copy over it).
 */
import { PSIH_ROOM as R } from "./arena-psih-data.ts";

const A = "/assets/arena/psih";
const RH = 1843;
const box = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x, y: b.y, width: b.w, height: b.h, preserveAspectRatio: "none" as const });
const at = (p: readonly number[]) => ({ transformOrigin: `${p[0]}px ${p[1]}px`, transformBox: "view-box" as const });

export function PsihRoom({ uid = "a" }: { uid?: string }) {
  const b = R.bag, n = R.noise, [px, py] = R.bagPivot;
  return (
    <g className="psr-live">
      <defs>
        <clipPath id={`psr-up-${uid}`}><rect x={-10} y={-10} width={1044} height={py + 10.5} /></clipPath>
        <clipPath id={`psr-dn-${uid}`}><rect x={-10} y={py} width={1044} height={RH} /></clipPath>
      </defs>
      <image href={`${A}/room.webp`} x={0} y={0} width={1024} height={RH} preserveAspectRatio="none" />
      {/* the police lights: the light dies between the flashes (the dark copy), goes blue (the blue copy) and back */}
      <image className="psr-dark" href={`${A}/police-dark.webp`} {...box(R["police-dark"])} />
      <image className="psr-blue" href={`${A}/police-blue.webp`} {...box(R["police-blue"])} />
      {/* the bag: the top (hooks, cables) still, the rest swings round where the chains come down */}
      <g clipPath={`url(#psr-up-${uid})`}><image href={`${A}/bag.webp`} {...box(b)} /></g>
      <g className="psr-bag" style={at([px, py])}><g clipPath={`url(#psr-dn-${uid})`}><image href={`${A}/bag.webp`} {...box(b)} /></g></g>
      <g className="psr-door" style={at(R.hinge)}><image href={`${A}/door.webp`} {...box(R.door)} /></g>
      <image href={`${A}/lamp.webp`} {...box(R.lamp)} />
      <image href={`${A}/tv.webp`} {...box(R.tv)} />
      {/* the static on the screen: the frames in a strip, stepped through */}
      <svg x={n.x} y={n.y} width={n.w} height={n.h} viewBox={`0 0 ${n.w} ${n.h}`} overflow="hidden">
        <image className="psr-noise" href={`${A}/tv-noise.webp`} x={0} y={0} width={n.w * n.frames} height={n.h} preserveAspectRatio="none"
          style={{ ["--strip" as string]: `${-n.w * n.frames}px` }} />
      </svg>
      <g className="psr-boom" style={at(R.boomFoot)}><image href={`${A}/boombox.webp`} {...box(R.boombox)} /></g>
    </g>
  );
}
