/*
 * Clan emblems: the drawn gold-rimmed shield (public/assets/ui/clan-shield.webp, tools/clans/build-shield.py), its field
 * painted in the clan colour (the field mask clan-shield-field.webp), the artist's symbol on it
 * (public/assets/ui/emblem-<symbol>.webp).
 */
import { useId } from "react";
import { Svg } from "./icons.tsx";

const SYMBOLS = new Set(["rocket", "diamond", "bull", "bear", "moon", "skull", "crown", "flame"]);

export function Emblem({ emblem, color, size = 44 }: { emblem: string; color: string; size?: number }) {
  const sym = SYMBOLS.has(emblem) ? emblem : "crown";
  const uid = useId().replace(/[^a-z0-9]/gi, "");
  const mask = `embm-${uid}`, shade = `embg-${uid}`;
  return (
    <Svg size={size}>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <image href="/assets/ui/clan-shield-field.webp" x="0" y="0" width="64" height="64" />
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
      <image href={`/assets/ui/emblem-${sym}.webp`} x="16.5" y="12.5" width="31" height="31" />
      <image href="/assets/ui/clan-shield.webp" x="0" y="0" width="64" height="64" />
    </Svg>
  );
}
