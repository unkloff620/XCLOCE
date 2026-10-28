/* Icons: the artist's pictures (public/assets/ui, public/assets/nav) in a 64×64 SVG box; a grey dot for an unknown name. */
import type { ReactNode } from "react";

export const OL = "#07080f";
const S = { stroke: OL, strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export function Svg({ size = 32, children, vb = "0 0 64 64", className }: { size?: number; children: ReactNode; vb?: string; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox={vb} aria-hidden="true" style={{ flex: "none", display: "block" }}>
      {children}
    </svg>
  );
}

export type IconName = string;
/** Icons drawn by the artist: icon name → public/assets/ui/<file>.webp (built by tools/items/build-items.py). */
const RASTER_ICONS: Partial<Record<string, string>> = { shirt: "wardrobe", gift: "bonus", bolt: "tech", shop: "shop", exchange: "exchange", map: "tasks",
  energy: "energy-can", key: "key", RUB: "rub", USD: "usd", SOL: "sol", BTC: "btc", coins: "coins", xp: "authority",
  lock: "lock", clock: "clock", sun: "sun", trophy: "trophy", swords: "swords", chest: "chest", mail: "mail", fire: "fire", talent: "talent",
  // achievement pictures (tools/ui/cut-achievements.py)
  "ach-damage": "ach-damage", "ach-hits": "ach-hits", "ach-wins": "ach-wins", "ach-yard": "ach-yard", "ach-chests": "ach-chests", "ach-weekly": "ach-weekly", "ach-solo": "ach-solo",
};

export function Icon({ name, size = 28, className }: { name: IconName; size?: number; className?: string }) {
  const art = RASTER_ICONS[name];
  if (art) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: "none", display: "block" }}>
        <image href={`/assets/ui/${art}.webp`} x="0" y="0" width="64" height="64" />
      </svg>
    );
  }
  return <Svg size={size} className={className}><circle cx="32" cy="32" r="24" fill="#6e75a6" {...S} /></Svg>;
}

/* ---------- bottom menu icons (the active tab glows in its colour) ---------- */
export const NAV_GLOW: Record<string, string> = { home: "#ffcc33", bosses: "#ff4d6d", yard: "#3ddc84", shop: "#ff4d6d", inventory: "#3fd2ff", clans: "#ffb347" };
/** Bottom-menu icons drawn by the artist (public/assets/nav, cut from the sheet by tools/items/build-nav.py). */
const NAV_ART = new Set(["home", "bosses", "yard", "shop", "inventory", "clans"]);

export function NavIcon({ id, size = 34 }: { id: string; size?: number }) {
  if (NAV_ART.has(id)) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <image href={`/assets/nav/${id}.webp`} x="0" y="0" width="64" height="64" />
      </svg>
    );
  }
  return <Svg size={size}><circle cx="32" cy="32" r="24" fill="#6e75a6" {...S} /></Svg>;
}
