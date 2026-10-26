"use client";
/*
 * «Взрыв» — what a won boss fight gives by its mode (content/medals.ts): a bronze, silver or gold blast. Every one adds
 * damage to the boss's weapon at once; MEDAL_SET of a kind is the full bonus. (The coins with the boss's face are the
 * «Дела» medals for wins over him.)
 */
import type { MedalTier } from "../../content/medals.ts";

const C: Record<MedalTier, [string, string, string]> = {
  bronze: ["#ffd2a0", "#d9813d", "#7a3d12"],
  silver: ["#ffffff", "#c9d1dc", "#5f6874"],
  gold: ["#fff3a8", "#ffc21a", "#8a5a00"],
};
// a jagged burst: 12 rays, long and short in turn
const RAYS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 26 : i % 4 ? 46 : 40;
  return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`;
}).join(" ");

export function BlastIcon({ tier, size = 24, dim = false }: { tier: MedalTier; size?: number; dim?: boolean }) {
  const [hi, mid, dark] = C[tier];
  const id = `bl-${tier}`;
  return (
    <svg className={`blast ${tier} ${dim ? "dim" : ""}`} viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" stopColor={hi} />
          <stop offset="0.8" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <polygon points={RAYS} fill={`url(#${id})`} stroke="#1e1006" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="13" fill="#fff" opacity="0.75" />
    </svg>
  );
}
