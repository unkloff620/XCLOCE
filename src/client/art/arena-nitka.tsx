"use client";
/*
 * Нитка's workshop in 1024×1536 (tools/boss/build-nitka-room.py, the artist's layers): the evening city behind the
 * window, the bare trees in front of it sway in the wind, the window's glass over them; the hanging lamp swings on its
 * cord and its light flickers, the desk lamp by the sewing machine flickers too, and the sewing machine sews now and
 * then (it shakes for a moment).
 */
import { NITKA_ROOM as R } from "./arena-nitka-data.ts";

const A = "/assets/arena/nitka";
const box = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x, y: b.y, width: b.w, height: b.h, preserveAspectRatio: "none" as const });

export function NitkaRoom({ uid = "a" }: { uid?: string }) {
  const t = R.trees, m = R.machine;
  return (
    <g className="ntr-live">
      <defs>
        <radialGradient id={`ntr-glow-${uid}`}>
          <stop offset="0" stopColor="#ffe6a8" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffc46a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ff9a3a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`ntr-cone-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffb35a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <image href={`${A}/far.webp`} x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
      {/* the trees sway from their roots (the bottom of the window) */}
      <g className="ntr-trees" style={{ transformOrigin: `${t.x + t.w * 0.6}px ${t.y + t.h}px`, transformBox: "view-box" }}>
        <image href={`${A}/trees.webp`} {...box(t)} />
      </g>
      <image href={`${A}/glass.webp`} {...box(R.glass)} />
      <image href={`${A}/room.webp`} x={0} y={0} width={1024} height={1536} preserveAspectRatio="none" />
      {/* the desk lamp by the sewing machine: its light flickers */}
      <g style={{ mixBlendMode: "screen" }}>
        <circle className="ntr-desk" cx={R.desk[0]} cy={R.desk[1]} r={70} fill={`url(#ntr-glow-${uid})`} />
      </g>
      {/* the sewing machine sews now and then: it shakes for a moment */}
      <g className="ntr-machine" style={{ transformOrigin: `${m.x + m.w / 2}px ${m.y + m.h}px`, transformBox: "view-box" }}>
        <image href={`${A}/machine.webp`} {...box(m)} />
      </g>
      {/* the hanging lamp swings on its cord; its light goes with it and flickers */}
      <g className="ntr-lamp" style={{ transformOrigin: `${R.lampPivot[0]}px ${R.lampPivot[1]}px`, transformBox: "view-box" }}>
        <g className="ntr-light" style={{ mixBlendMode: "screen" }}>
          <polygon points={`${R.bulb[0] - 70},${R.bulb[1] + 10} ${R.bulb[0] + 70},${R.bulb[1] + 10} ${R.bulb[0] + 330},${R.bulb[1] + 900} ${R.bulb[0] - 330},${R.bulb[1] + 900}`} fill={`url(#ntr-cone-${uid})`} />
          <circle cx={R.bulb[0]} cy={R.bulb[1] + 6} r={120} fill={`url(#ntr-glow-${uid})`} />
        </g>
        <image href={`${A}/lamp.webp`} {...box(R.lamp)} />
      </g>
    </g>
  );
}
