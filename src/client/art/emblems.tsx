/* Clan emblems: a shield in the clan colour with a symbol. */
import type { ReactNode } from "react";
import { OL, Svg } from "./icons.tsx";

const S = { stroke: OL, strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const SYMBOL: Record<string, ReactNode> = {
  rocket: <><path d="M32 12 C40 18 42 30 38 40 H26 C22 30 24 18 32 12 Z" fill="#e8ebff" {...S} /><circle cx="32" cy="26" r="4" fill="#3fd2ff" stroke={OL} strokeWidth="2.5" /><path d="M28 40 L32 50 L36 40" fill="#ff8a3d" {...S} /></>,
  diamond: <><path d="M20 22 H44 L50 30 L32 50 L14 30 Z" fill="#3fd2ff" {...S} /><path d="M14 30 H50 M26 22 L32 30 L38 22 M32 30 V50" stroke={OL} strokeWidth="2.5" fill="none" /></>,
  bull: <><path d="M16 18 C18 26 22 28 26 28 M48 18 C46 26 42 28 38 28" fill="none" stroke={OL} strokeWidth="8" strokeLinecap="round" /><path d="M16 18 C18 26 22 28 26 28 M48 18 C46 26 42 28 38 28" fill="none" stroke="#e8ebff" strokeWidth="3.5" strokeLinecap="round" /><path d="M22 28 H42 L40 44 C38 48 26 48 24 44 Z" fill="#2ee88a" {...S} /></>,
  bear: <><circle cx="22" cy="22" r="6" fill="#a8581c" {...S} /><circle cx="42" cy="22" r="6" fill="#a8581c" {...S} /><circle cx="32" cy="34" r="14" fill="#c8732e" {...S} /><ellipse cx="32" cy="39" rx="6" ry="4" fill="#f4c49c" stroke={OL} strokeWidth="2.5" /><circle cx="27" cy="31" r="2" fill={OL} /><circle cx="37" cy="31" r="2" fill={OL} /></>,
  moon: <path d="M40 14 C30 16 24 26 26 36 C28 46 38 50 46 46 C36 52 20 46 18 32 C16 20 28 12 40 14 Z" fill="#ffcc33" {...S} />,
  skull: <><path d="M32 14 C42 14 48 22 48 30 C48 36 44 38 42 40 V46 H22 V40 C20 38 16 36 16 30 C16 22 22 14 32 14 Z" fill="#e8ebff" {...S} /><circle cx="25" cy="30" r="4" fill={OL} /><circle cx="39" cy="30" r="4" fill={OL} /></>,
  crown: <path d="M14 42 L16 20 L25 30 L32 16 L39 30 L48 20 L50 42 Z" fill="#ffcc33" {...S} />,
  flame: <path d="M32 12 C38 22 46 26 44 38 C42 46 36 50 32 50 C26 50 20 46 20 38 C20 30 26 28 28 20 C30 24 31 27 31 30 C34 26 34 18 32 12 Z" fill="#ff8a3d" {...S} />,
};
export function Emblem({ emblem, color, size = 44 }: { emblem: string; color: string; size?: number }) {
  return (
    <Svg size={size}>
      <path d="M32 4 L56 12 V30 C56 46 45 56 32 60 C19 56 8 46 8 30 V12 Z" fill={color} {...S} />
      <path d="M32 9 L51 15.5 V30 C51 42 43 50 32 54 Z" fill="rgba(0,0,0,0.18)" />
      {SYMBOL[emblem] ?? SYMBOL.crown}
    </Svg>
  );
}
