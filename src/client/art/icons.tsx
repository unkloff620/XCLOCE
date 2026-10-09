/* Vector icon set. One style: 64×64 grid, 3.5px dark outline, flat fill + one light highlight. */
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

function Coin({ fill, rim, children }: { fill: string; rim: string; children: ReactNode }) {
  return (
    <>
      <circle cx="32" cy="34" r="25" fill={rim} {...S} />
      <circle cx="32" cy="31" r="25" fill={fill} {...S} />
      <circle cx="32" cy="31" r="18" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
      <path d="M17 20 a18 18 0 0 1 12 -7" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="3.5" strokeLinecap="round" />
      {children}
    </>
  );
}

const ICONS: Record<string, () => ReactNode> = {
  RUB: () => (
    <Coin fill="#2fc7a6" rim="#127a63">
      <path d="M27 45 V18 H36 a7.5 7.5 0 0 1 0 15 H22 M22 39 H36" fill="none" stroke={OL} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 45 V18 H36 a7.5 7.5 0 0 1 0 15 H22 M22 39 H36" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </Coin>
  ),
  USD: () => (
    <Coin fill="#3ddc5f" rim="#1b8a33">
      <path d="M40 22 c-3 -4 -16 -5 -16 3 c0 8 17 4 17 12 c0 8 -14 7 -18 3 M32 14 V48" fill="none" stroke={OL} strokeWidth="9" strokeLinecap="round" />
      <path d="M40 22 c-3 -4 -16 -5 -16 3 c0 8 17 4 17 12 c0 8 -14 7 -18 3 M32 14 V48" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
    </Coin>
  ),
  SOL: () => (
    <Coin fill="#8d6bff" rim="#4b2fb8">
      <path d="M21 22 H43 L39 26 M21 31 H43 M25 36 L21 40 H43" fill="none" stroke={OL} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 22 H43 L39 26 M21 31 H43 M25 36 L21 40 H43" fill="none" stroke="#e9fffb" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </Coin>
  ),
  BTC: () => (
    <Coin fill="#ff9a1f" rim="#b35c00">
      <path d="M25 17 V45 M25 18 H35 a6.5 6.5 0 0 1 0 13 H25 M25 31 H37 a7 7 0 0 1 0 14 H25 M30 13 V18 M30 45 V49 M35 13 V18 M35 45 V49" fill="none" stroke={OL} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 17 V45 M25 18 H35 a6.5 6.5 0 0 1 0 13 H25 M25 31 H37 a7 7 0 0 1 0 14 H25 M30 13 V18 M30 45 V49 M35 13 V18 M35 45 V49" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </Coin>
  ),
  energy: () => (
    <>
      <path d="M37 4 L12 37 H29 L24 60 L52 24 H34 Z" fill="#ffcc33" {...S} />
      <path d="M33 13 L20 31" stroke="#fff6c2" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  xp: () => (
    <>
      <path d="M32 5 L40 23 L59 24 L44 37 L49 57 L32 46 L15 57 L20 37 L5 24 L24 23 Z" fill="#8d6bff" {...S} />
      <path d="M26 26 L31 15" stroke="#d9ceff" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  key: () => (
    <>
      <circle cx="20" cy="32" r="12" fill="#ffcc33" {...S} />
      <circle cx="20" cy="32" r="4.5" fill={OL} />
      <path d="M31 28 H57 V36 H51 V43 H44 V36 H31 Z" fill="#ffcc33" {...S} />
    </>
  ),
  lock: () => (
    <>
      <path d="M20 28 V20 a12 12 0 0 1 24 0 V28" fill="none" stroke={OL} strokeWidth="10" />
      <path d="M20 28 V20 a12 12 0 0 1 24 0 V28" fill="none" stroke="#9aa0c8" strokeWidth="4.5" />
      <rect x="11" y="27" width="42" height="31" rx="7" fill="#c9ceea" {...S} />
      <path d="M32 38 V47" stroke={OL} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  clock: () => (
    <>
      <circle cx="32" cy="33" r="25" fill="#e8ebff" {...S} />
      <path d="M32 18 V34 L42 40" fill="none" stroke={OL} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  trophy: () => (
    <>
      <path d="M14 12 H4 v6 a12 12 0 0 0 14 11 M50 12 H60 v6 a12 12 0 0 1 -14 11" fill="none" stroke={OL} strokeWidth="9" />
      <path d="M14 12 H4 v6 a12 12 0 0 0 14 11 M50 12 H60 v6 a12 12 0 0 1 -14 11" fill="none" stroke="#ffcc33" strokeWidth="4" />
      <path d="M14 8 H50 V22 a18 18 0 0 1 -36 0 Z" fill="#ffcc33" {...S} />
      <path d="M27 40 H37 V48 H27 Z M18 50 H46 V58 H18 Z" fill="#d18f00" {...S} />
      <path d="M21 14 V22" stroke="#fff3bf" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  swords: () => (
    <>
      <path d="M8 8 L40 40 M40 40 l6 -6 M40 40 l-6 6" fill="none" stroke={OL} strokeWidth="10" strokeLinecap="round" />
      <path d="M56 8 L24 40 M24 40 l-6 -6 M24 40 l6 6" fill="none" stroke={OL} strokeWidth="10" strokeLinecap="round" />
      <path d="M8 8 L40 40" stroke="#e8ebff" strokeWidth="5" strokeLinecap="round" />
      <path d="M56 8 L24 40" stroke="#e8ebff" strokeWidth="5" strokeLinecap="round" />
      <path d="M42 46 L52 56 M22 46 L12 56" stroke={OL} strokeWidth="10" strokeLinecap="round" />
      <path d="M42 46 L52 56 M22 46 L12 56" stroke="#ff8a3d" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  chest: () => (
    <>
      <path d="M8 26 a24 14 0 0 1 48 0 V30 H8 Z" fill="#c8732e" {...S} />
      <rect x="8" y="28" width="48" height="28" rx="4" fill="#a8581c" {...S} />
      <path d="M8 36 H56" stroke={OL} strokeWidth="3.5" />
      <rect x="26" y="31" width="12" height="14" rx="3" fill="#ffcc33" {...S} />
    </>
  ),
  gift: () => (
    <>
      <rect x="8" y="26" width="48" height="12" rx="3" fill="#ff4d6d" {...S} />
      <rect x="12" y="38" width="40" height="20" rx="3" fill="#e2365a" {...S} />
      <path d="M27 26 V58 M37 26 V58" stroke={OL} strokeWidth="3" />
      <rect x="27" y="26" width="10" height="32" fill="#ffcc33" />
      <path d="M27 26 V58 M37 26 V58" stroke={OL} strokeWidth="3" />
      <path d="M32 25 C24 10 10 14 16 22 C19 26 27 26 32 25 Z M32 25 C40 10 54 14 48 22 C45 26 37 26 32 25 Z" fill="#ffcc33" {...S} />
    </>
  ),
  shop: () => (
    <>
      <path d="M8 24 L14 10 H50 L56 24 Z" fill="#ff4d6d" {...S} />
      <path d="M20 10 L18 24 M32 10 V24 M44 10 L46 24" stroke={OL} strokeWidth="3" />
      <rect x="11" y="24" width="42" height="32" rx="3" fill="#e8ebff" {...S} />
      <rect x="18" y="33" width="12" height="23" fill="#3fd2ff" {...S} />
      <rect x="35" y="32" width="12" height="10" rx="2" fill="#ffcc33" {...S} />
    </>
  ),
  exchange: () => (
    <>
      <circle cx="32" cy="32" r="27" fill="#3fd2ff" {...S} />
      <path d="M18 26 H44 L37 19 M46 38 H20 L27 45" fill="none" stroke={OL} strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 26 H44 L37 19 M46 38 H20 L27 45" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  map: () => (
    <>
      <path d="M6 14 L22 8 L42 14 L58 8 V50 L42 56 L22 50 L6 56 Z" fill="#3ddc84" {...S} />
      <path d="M22 8 V50 M42 14 V56" stroke={OL} strokeWidth="3" />
      <path d="M28 24 l6 6 m0 -6 l-6 6" stroke="#ff4d6d" strokeWidth="4.5" strokeLinecap="round" />
    </>
  ),
  shirt: () => (
    <>
      <path d="M22 8 L8 16 L12 30 L18 28 V56 H46 V28 L52 30 L56 16 L42 8 C40 14 24 14 22 8 Z" fill="#8d6bff" {...S} />
      <path d="M25 22 V40" stroke="#c6b5ff" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  user: () => (
    <>
      <circle cx="32" cy="22" r="13" fill="#e8ebff" {...S} />
      <path d="M8 58 a24 20 0 0 1 48 0 Z" fill="#8d6bff" {...S} />
    </>
  ),
  door: () => (
    <>
      <rect x="14" y="6" width="36" height="54" rx="4" fill="#8a5a2b" {...S} />
      <rect x="20" y="12" width="24" height="18" rx="2" fill="#6b4320" stroke={OL} strokeWidth="2.5" />
      <rect x="20" y="34" width="24" height="18" rx="2" fill="#6b4320" stroke={OL} strokeWidth="2.5" />
      <circle cx="42" cy="34" r="3.5" fill="#ffcc33" stroke={OL} strokeWidth="2" />
      <path d="M50 60 H6" stroke={OL} strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  bolt: () => <path d="M37 4 L12 37 H29 L24 60 L52 24 H34 Z" fill="#ffcc33" {...S} />,
  fire: () => (
    <>
      <path d="M32 4 C40 18 54 24 50 42 C47 54 38 60 32 60 C22 60 12 52 13 40 C14 30 22 26 24 16 C28 22 30 26 30 30 C34 24 34 14 32 4 Z" fill="#ff8a3d" {...S} />
      <path d="M32 34 C38 40 40 46 36 52 C34 55 28 55 26 51 C24 46 28 42 32 34 Z" fill="#ffcc33" stroke={OL} strokeWidth="3" />
    </>
  ),
  coins: () => (
    <>
      <ellipse cx="22" cy="46" rx="16" ry="7" fill="#d18f00" {...S} />
      <ellipse cx="22" cy="41" rx="16" ry="7" fill="#ffcc33" {...S} />
      <ellipse cx="42" cy="36" rx="16" ry="7" fill="#d18f00" {...S} />
      <ellipse cx="42" cy="31" rx="16" ry="7" fill="#ffcc33" {...S} />
      <ellipse cx="34" cy="24" rx="16" ry="7" fill="#ffcc33" {...S} />
    </>
  ),
  /* talent: a glowing chip with a star (earned by damage, spent on the computer) */
  talent: () => (
    <>
      <path d="M22 6 V14 M32 6 V14 M42 6 V14 M22 50 V58 M32 50 V58 M42 50 V58 M6 22 H14 M6 32 H14 M6 42 H14 M50 22 H58 M50 32 H58 M50 42 H58" stroke={OL} strokeWidth="8" strokeLinecap="round" />
      <path d="M22 6 V14 M32 6 V14 M42 6 V14 M22 50 V58 M32 50 V58 M42 50 V58 M6 22 H14 M6 32 H14 M6 42 H14 M50 22 H58 M50 32 H58 M50 42 H58" stroke="#ffcc33" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="12" y="12" width="40" height="40" rx="7" fill="#2fc7e8" {...S} />
      <path d="M32 18 L36 27 L46 28 L38.5 34.5 L41 44 L32 39 L23 44 L25.5 34.5 L18 28 L28 27 Z" fill="#fff6c2" stroke={OL} strokeWidth="3" strokeLinejoin="round" />
      <path d="M17 19 a4 4 0 0 1 4 -3" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
};

export type IconName = keyof typeof ICONS | string;
/** Icons drawn by the artist: icon name → public/assets/ui/<file>.webp (built by tools/items/build-items.py). */
const RASTER_ICONS: Partial<Record<string, string>> = { shirt: "wardrobe", gift: "bonus", bolt: "tech", shop: "shop", exchange: "exchange", map: "tasks",
  energy: "energy-can", key: "key", RUB: "rub", USD: "usd", SOL: "sol", BTC: "btc", coins: "coins", xp: "authority",
  // achievement pictures (tools/ui/cut-achievements.py)
  "ach-damage": "ach-damage", "ach-hits": "ach-hits", "ach-wins": "ach-wins", "ach-yard": "ach-yard", "ach-chests": "ach-chests", "ach-weekly": "ach-weekly",
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
  const f = ICONS[name];
  if (!f) return <Svg size={size} className={className}><circle cx="32" cy="32" r="24" fill="#6e75a6" {...S} /></Svg>;
  return <Svg size={size} className={className}>{f()}</Svg>;
}

/* ---------- bottom menu icons (larger, two-tone, the active tab glows in its colour) ---------- */
export const NAV_GLOW: Record<string, string> = { home: "#ffcc33", bosses: "#ff4d6d", yard: "#3ddc84", shop: "#ff4d6d", inventory: "#3fd2ff", clans: "#b06bff" };
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
  const body = (() => {
    switch (id) {
      case "home":
        return (
          <>
            <path d="M8 30 L32 9 L56 30" fill="none" stroke={OL} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 27 V56 H50 V27 L32 12 Z" fill="#ffcc33" {...S} />
            <path d="M8 30 L32 9 L56 30" fill="none" stroke="#ff4d6d" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="26" y="38" width="12" height="18" rx="2" fill="#7a3d12" {...S} />
            <rect x="40" y="33" width="8" height="8" rx="1.5" fill="#3fd2ff" stroke={OL} strokeWidth="3" />
          </>
        );
      case "bosses":
        return (
          <>
            <path d="M12 22 L6 6 L22 14 M52 22 L58 6 L42 14" fill="#e8ebff" {...S} />
            <path d="M32 8 C48 8 56 18 56 30 C56 40 50 44 48 46 V54 H16 V46 C14 44 8 40 8 30 C8 18 16 8 32 8 Z" fill="#ff4d6d" {...S} />
            <path d="M16 28 L28 32 L26 38 L17 36 Z M48 28 L36 32 L38 38 L47 36 Z" fill={OL} />
            <path d="M24 54 V47 M32 54 V47 M40 54 V47" stroke={OL} strokeWidth="3.5" />
            <path d="M18 17 C22 13 26 12 30 12" stroke="#ffb3c1" strokeWidth="4" strokeLinecap="round" fill="none" />
          </>
        );
      case "yard":
        return (
          <>
            <rect x="28" y="36" width="8" height="22" rx="2" fill="#8a5a2b" {...S} />
            <circle cx="32" cy="24" r="18" fill="#3ddc84" {...S} />
            <circle cx="18" cy="34" r="10" fill="#2bb56b" {...S} />
            <circle cx="46" cy="34" r="10" fill="#2bb56b" {...S} />
            <path d="M24 16 C27 12 31 11 35 12" stroke="#c4ffd9" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M4 58 H60" stroke={OL} strokeWidth="4" strokeLinecap="round" />
          </>
        );
      case "inventory":
        return (
          <>
            <path d="M22 16 V12 a10 10 0 0 1 20 0 V16" fill="none" stroke={OL} strokeWidth="9" />
            <path d="M22 16 V12 a10 10 0 0 1 20 0 V16" fill="none" stroke="#1f7fb0" strokeWidth="4" />
            <path d="M10 26 a10 10 0 0 1 10 -10 H44 a10 10 0 0 1 10 10 V52 a6 6 0 0 1 -6 6 H16 a6 6 0 0 1 -6 -6 Z" fill="#3fd2ff" {...S} />
            <rect x="18" y="34" width="28" height="14" rx="4" fill="#1f7fb0" {...S} />
            <path d="M28 38 H36" stroke="#ffcc33" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M16 24 C17 21 19 20 22 20" stroke="#d5f6ff" strokeWidth="4" strokeLinecap="round" fill="none" />
          </>
        );
      case "clans":
        return (
          <>
            <path d="M32 6 L54 14 V30 C54 44 44 54 32 58 C20 54 10 44 10 30 V14 Z" fill="#b06bff" {...S} />
            <path d="M32 12 L48 18 V30 C48 40 41 48 32 51 Z" fill="#7d3fe0" />
            <path d="M22 26 L27 32 L32 22 L37 32 L42 26 L40 40 H24 Z" fill="#ffcc33" stroke={OL} strokeWidth="3" strokeLinejoin="round" />
          </>
        );
      default:
        return <circle cx="32" cy="32" r="24" fill="#6e75a6" {...S} />;
    }
  })();
  return <Svg size={size}>{body}</Svg>;
}
