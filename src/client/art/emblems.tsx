/*
 * Clan emblems: a drawn shield (public/assets/ui/clan-shield-<style>.webp, tools/clans/build-shield.py), its field
 * painted in the clan colour (the field mask clan-shield-<style>-field.webp), the clan symbol on it
 * (public/assets/ui/emblem-<symbol>.webp). The emblem string is "<symbol>" or "<symbol>:<style>" (content/clans.ts).
 */
import { useId } from "react";
import { Svg } from "./icons.tsx";
import { parseEmblem, type ClanShield } from "../../content/clans.ts";

const SYMBOLS = new Set(["rocket", "diamond", "bull", "bear", "moon", "skull", "crown", "flame"]);

/** where the symbol sits on each shield, in the 64-unit viewBox (the boxes printed by build-shield.py, scaled up a bit) */
const SHIELDS: Record<ClanShield, { x: number; y: number; s: number; k: number }> = {
  gold: { x: 21.0, y: 15.0, s: 22.0, k: 1.5 },
  silver: { x: 19.0, y: 13.0, s: 26.0, k: 1.35 },
  iron: { x: 19.0, y: 12.0, s: 26.0, k: 1.35 },
  bronze: { x: 20.5, y: 13.5, s: 22.0, k: 1.45 },
  neon: { x: 19.0, y: 12.0, s: 26.0, k: 1.35 },
  round: { x: 16.0, y: 14.5, s: 32.0, k: 1.25 },
  crown: { x: 21.5, y: 18.0, s: 21.0, k: 1.45 },
};

export function Emblem({ emblem, color, size = 44, shield }: { emblem: string; color: string; size?: number; shield?: ClanShield }) {
  const p = parseEmblem(emblem);
  const sym = SYMBOLS.has(p.symbol) ? p.symbol : "crown";
  const style = shield ?? p.shield;
  const b = SHIELDS[style];
  const z = b.s * b.k, x = b.x - (z - b.s) / 2, y = b.y - (z - b.s) / 2;
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const mask = `embm-${uid}`, shade = `embg-${uid}`;
  return (
    <Svg size={size}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <image href={`/assets/ui/clan-shield-${style}-field.webp`} x="0" y="0" width="64" height="64" />
        </mask>
        {/* light from the top left, a darker bottom: the field reads as enamel, not a flat fill */}
        <radialGradient id={shade} cx="0.38" cy="0.28" r="0.8">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.42" />
        </radialGradient>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect x="0" y="0" width="64" height="64" fill={color} />
        <rect x="0" y="0" width="64" height="64" fill={`url(#${shade})`} />
      </g>
      <image href={`/assets/ui/emblem-${sym}.webp`} x={x} y={y} width={z} height={z} />
      <image href={`/assets/ui/clan-shield-${style}.webp`} x="0" y="0" width="64" height="64" />
    </Svg>
  );
}
