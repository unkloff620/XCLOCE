/*
 * Clan emblems: a drawn shield (public/assets/ui/clan-shield-<style>.webp, tools/clans/build-shield.py), its field
 * painted in the clan colour (the field mask clan-shield-<style>-field.webp), the clan symbol on it
 * (public/assets/ui/emblem-<symbol>.webp). The emblem string is "<symbol>" or "<symbol>:<style>" (content/clans.ts).
 */
import { useId } from "react";
import { Svg } from "./icons.tsx";
import { parseEmblem, type ClanShield } from "../../content/clans.ts";

const SYMBOLS = new Set(["rocket", "diamond", "bull", "bear", "moon", "skull", "crown", "flame"]);

/** the deepest point of each shield's field (cy) and its depth (r), 64-unit viewBox, printed by build-shield.py;
 * the symbol is centred there (every shield is centred on its field, so x is always the middle) */
const SHIELDS: Record<ClanShield, { cy: number; r: number }> = {
  gold: { cy: 26.8, r: 15.2 },
  silver: { cy: 27.2, r: 17.7 },
  iron: { cy: 26.2, r: 17.5 },
  bronze: { cy: 26.5, r: 14.8 },
  neon: { cy: 26.2, r: 17.8 },
  round: { cy: 30.5, r: 24.1 },
  crown: { cy: 29.2, r: 15.1 },
};

/** a clan logo alone (the symbol art), for the logo picker */
export function ClanLogo({ symbol, size = 34 }: { symbol: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/assets/ui/emblem-${SYMBOLS.has(symbol) ? symbol : "crown"}.webp`} alt="" width={size} height={size} draggable={false} style={{ display: "block", flex: "none" }} />;
}

/** `bare`: the shield alone, without the logo (the shield style picker) */
export function Emblem({ emblem, color, size = 44, shield, bare }: { emblem: string; color: string; size?: number; shield?: ClanShield; bare?: boolean }) {
  const p = parseEmblem(emblem);
  const sym = SYMBOLS.has(p.symbol) ? p.symbol : "crown";
  const style = shield ?? p.shield;
  const b = SHIELDS[style];
  const z = Math.min(b.r * 2.3, 38), x = 32 - z / 2, y = b.cy - z / 2;
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
      {!bare && <image href={`/assets/ui/emblem-${sym}.webp`} x={x} y={y} width={z} height={z} />}
      <image href={`/assets/ui/clan-shield-${style}.webp`} x="0" y="0" width="64" height="64" />
    </Svg>
  );
}
