/* Clan emblems: a shield in the clan colour with the artist's symbol on it (public/assets/ui/emblem-<symbol>.webp). */
import { OL, Svg } from "./icons.tsx";

const SYMBOLS = new Set(["rocket", "diamond", "bull", "bear", "moon", "skull", "crown", "flame"]);

export function Emblem({ emblem, color, size = 44 }: { emblem: string; color: string; size?: number }) {
  const sym = SYMBOLS.has(emblem) ? emblem : "crown";
  const id = `emb-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <Svg size={size}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path d="M32 4 L56 12 V30 C56 46 45 56 32 60 C19 56 8 46 8 30 V12 Z" fill={color} stroke={OL} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M32 4 L56 12 V30 C56 46 45 56 32 60 C19 56 8 46 8 30 V12 Z" fill={`url(#${id})`} />
      <path d="M32 8.5 L52 15 V30 C52 43.5 43 51.5 32 55.5 C21 51.5 12 43.5 12 30 V15 Z" fill="none" stroke="#ffd25a" strokeOpacity="0.55" strokeWidth="1.6" />
      <image href={`/assets/ui/emblem-${sym}.webp`} x="13" y="12" width="38" height="38" />
    </Svg>
  );
}
