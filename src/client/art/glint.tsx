"use client";
import { useId } from "react";

/**
 * A gleam on polished metal (Боцман's crowbar, in his fist and in the hero's glove): a soft band of light slides along the
 * metal now and then (only over the metal: `mask` — white where it shows, tools/boss/make-shine.py), and once a cycle the
 * light catches one spot — a bright four-pointed flash, as if a lamp got reflected (screens.css «metal-glint»).
 * Drawn inside the same group as the picture, in its coordinates; `delay` (s) keeps two of them out of step.
 */
export function MetalGlint({ mask, box, star, size = 26, delay = 0 }: {
  mask: string;
  box: { x: number; y: number; w: number; h: number };
  star: [number, number];
  size?: number;
  delay?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const anim = { animationDelay: `${delay}s` };
  const r = size, t = size * 0.12;
  return (
    <g className="metal-glint" pointerEvents="none" aria-hidden="true">
      <defs>
        <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x={box.x} y={box.y} width={box.w} height={box.h}>
          <image href={mask} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="none" />
        </mask>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.42" stopColor="#eef6ff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.58" stopColor="#eef6ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-r`}>
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.35" stopColor="#f2f8ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#dfeaff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* the soft band: slanted, it slides across the metal's box */}
      <g mask={`url(#${uid}-m)`} style={{ mixBlendMode: "screen" }}>
        <g className="metal-glint-band" style={{ ...anim, ["--w" as string]: `${box.w + box.h}px`, transformBox: "view-box" } as React.CSSProperties}>
          <rect x={box.x - box.h * 0.9} y={box.y - box.h * 0.5} width={box.h * 0.9} height={box.h * 2} fill={`url(#${uid}-g)`}
            transform={`rotate(18 ${box.x} ${box.y + box.h / 2})`} />
        </g>
      </g>
      {/* the flash: a glow with four rays, popping up for a moment */}
      <g className="metal-glint-star" style={{ ...anim, transformOrigin: `${star[0]}px ${star[1]}px`, transformBox: "view-box" }}>
        <circle cx={star[0]} cy={star[1]} r={r * 0.75} fill={`url(#${uid}-r)`} />
        <path fill="#fff" d={`M${star[0]} ${star[1] - r} L${star[0] + t} ${star[1] - t} L${star[0] + r} ${star[1]} L${star[0] + t} ${star[1] + t} L${star[0]} ${star[1] + r} L${star[0] - t} ${star[1] + t} L${star[0] - r} ${star[1]} L${star[0] - t} ${star[1] - t} Z`} />
        <path fill="#fff" opacity="0.7" transform={`rotate(45 ${star[0]} ${star[1]})`} d={`M${star[0]} ${star[1] - r * 0.5} L${star[0] + t * 0.6} ${star[1]} L${star[0]} ${star[1] + r * 0.5} L${star[0] - t * 0.6} ${star[1]} Z`} />
      </g>
    </g>
  );
}
