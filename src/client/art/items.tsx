/* Item and weapon pictures, same style as the icon set (64×64, dark outline, flat fills). */
import type { ReactNode } from "react";
import { Icon, OL, Svg } from "./icons.tsx";

const S = { stroke: OL, strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const ART: Record<string, () => ReactNode> = {
  mouse: () => (
    <>
      <path d="M32 6 C28 2 20 4 22 10" fill="none" stroke={OL} strokeWidth="6" strokeLinecap="round" />
      <path d="M32 6 C28 2 20 4 22 10" fill="none" stroke="#9aa0c8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 12 C46 12 50 24 50 36 C50 50 42 58 32 58 C22 58 14 50 14 36 C14 24 18 12 32 12 Z" fill="#e8ebff" {...S} />
      <path d="M32 12 V30 M14 30 H50" stroke={OL} strokeWidth="3" />
      <rect x="29" y="18" width="6" height="9" rx="3" fill="#ff4d6d" stroke={OL} strokeWidth="2.5" />
      <path d="M20 38 C20 44 23 49 28 51" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </>
  ),
  "red-candle": () => (
    <>
      <path d="M32 3 V61" stroke={OL} strokeWidth="8" strokeLinecap="round" />
      <path d="M32 3 V61" stroke="#ff8a9e" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="18" y="14" width="28" height="36" rx="4" fill="#ff4d6d" {...S} />
      <path d="M24 20 V42" stroke="#ffc2cd" strokeWidth="4" strokeLinecap="round" />
      <path d="M50 18 L58 26 M58 18 V26 H50" stroke={OL} strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </>
  ),
  keyboard: () => (
    <>
      <rect x="3" y="18" width="58" height="30" rx="6" fill="#2c3566" {...S} />
      {[0, 1, 2].map((r) =>
        Array.from({ length: 6 - (r === 2 ? 3 : 0) }, (_, c) => (
          <rect key={`${r}-${c}`} x={9 + c * 8.3 + (r === 1 ? 2 : 0)} y={23 + r * 8} width="6" height="5.5" rx="1.5" fill={r === 0 && c === 0 ? "#ff4d6d" : "#e8ebff"} stroke={OL} strokeWidth="1.8" />
        )),
      )}
      <rect x="34" y="39" width="22" height="5.5" rx="1.5" fill="#3fd2ff" stroke={OL} strokeWidth="1.8" />
    </>
  ),
  gpu: () => (
    <>
      <rect x="3" y="16" width="56" height="30" rx="5" fill="#2c3566" {...S} />
      <path d="M8 46 V54 H28 V46" fill="#ffcc33" {...S} />
      {[16, 32, 48].map((x) => (
        <g key={x}>
          <circle cx={x - 1} cy="31" r="10" fill="#151933" stroke={OL} strokeWidth="3" />
          <path d={`M${x - 1} 21 L${x + 2} 31 L${x - 1} 41 M${x - 11} 31 L${x - 1} 28 L${x + 9} 31`} stroke="#8d6bff" strokeWidth="2.5" fill="none" />
          <circle cx={x - 1} cy="31" r="2.6" fill="#3fd2ff" />
        </g>
      ))}
      <path d="M8 19 H54" stroke="#3ddc84" strokeWidth="2.5" />
    </>
  ),
  "rug-pull-gun": () => (
    <>
      <path d="M6 22 H44 L52 18 V34 L44 30 H34 L30 52 H18 L22 30 H6 Z" fill="#8d6bff" {...S} />
      <rect x="10" y="22" width="22" height="8" rx="2" fill="#ffcc33" stroke={OL} strokeWidth="2.5" />
      <path d="M52 22 L62 18 M52 26 H62 M52 30 L62 34" stroke="#ff4d6d" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M12 26 H28" stroke={OL} strokeWidth="2" strokeDasharray="3 3" />
    </>
  ),
  "energy-drink": () => (
    <>
      <path d="M18 10 H46 L44 14 V54 L46 58 H18 L20 54 V14 Z" fill="#3ddc84" {...S} />
      <rect x="20" y="22" width="24" height="24" fill="#151933" stroke={OL} strokeWidth="3" />
      <path d="M34 25 L26 35 H31 L29 43 L38 32 H33 Z" fill="#ffcc33" stroke={OL} strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 16 V20" stroke="#c4ffd9" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  "energy-pack": () => (
    <>
      {[10, 24, 38].map((x, i) => (
        <g key={x}>
          <path d={`M${x} 14 H${x + 16} V54 H${x} Z`} fill={i === 1 ? "#ffcc33" : "#3ddc84"} {...S} />
          <path d={`M${x + 9} 28 L${x + 5} 35 H${x + 8} L${x + 7} 41 L${x + 12} 33 H${x + 9} Z`} fill={OL} />
        </g>
      ))}
      <path d="M6 40 H58 V56 H6 Z" fill="#c9ceea" {...S} />
    </>
  ),
  "sticker-hodl": () => (
    <>
      <path d="M8 12 H56 V44 L44 56 H8 Z" fill="#ffcc33" {...S} />
      <path d="M44 56 V44 H56" fill="#d18f00" {...S} />
      <text x="31" y="35" textAnchor="middle" fontSize="15" fontWeight="900" fill={OL} fontFamily="sans-serif">HODL</text>
    </>
  ),
  "bottle-cap": () => (
    <>
      <path d="M32 6 L37 10 L43 8 L46 14 L52 15 L52 21 L57 25 L54 31 L57 37 L52 41 L52 47 L46 48 L43 54 L37 52 L32 56 L27 52 L21 54 L18 48 L12 47 L12 41 L7 37 L10 31 L7 25 L12 21 L12 15 L18 14 L21 8 L27 10 Z" fill="#ff4d6d" {...S} />
      <circle cx="32" cy="31" r="12" fill="#ffd0d8" stroke={OL} strokeWidth="3" />
    </>
  ),
  spinner: () => (
    <>
      <path d="M32 32 L32 10 M32 32 L13 43 M32 32 L51 43" stroke={OL} strokeWidth="14" strokeLinecap="round" />
      <path d="M32 32 L32 10 M32 32 L13 43 M32 32 L51 43" stroke="#3fd2ff" strokeWidth="8" strokeLinecap="round" />
      {[[32, 10], [13, 43], [51, 43]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill="#e8ebff" stroke={OL} strokeWidth="3" />)}
      <circle cx="32" cy="32" r="7" fill="#ffcc33" stroke={OL} strokeWidth="3" />
    </>
  ),
  "flyer-passive": () => (
    <>
      <path d="M12 6 H46 L54 14 V58 H12 Z" fill="#e8ebff" {...S} />
      <path d="M18 18 H40 M18 26 H46 M18 34 H34" stroke={OL} strokeWidth="3" strokeLinecap="round" />
      <path d="M20 50 L28 42 L34 46 L46 36" stroke="#3ddc84" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  "lost-wallet": () => (
    <>
      <path d="M8 20 L44 10 L48 20" fill="#ff8a3d" {...S} />
      <rect x="6" y="20" width="52" height="34" rx="6" fill="#a8581c" {...S} />
      <path d="M40 30 H58 V44 H40 a7 7 0 0 1 0 -14 Z" fill="#c8732e" {...S} />
      <circle cx="42" cy="37" r="3" fill="#ffcc33" stroke={OL} strokeWidth="2" />
      <rect x="12" y="15" width="20" height="10" rx="2" fill="#3ddc5f" stroke={OL} strokeWidth="2.5" transform="rotate(-12 22 20)" />
    </>
  ),
  "trophy-sun": () => (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d="M32 4 L36 16 H28 Z" fill="#ffcc33" stroke={OL} strokeWidth="2.5" strokeLinejoin="round" transform={`rotate(${i * 45} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="15" fill="#ffcc33" {...S} />
      <path d="M26 27 C28 23 32 22 36 23" stroke="#fff6c2" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    </>
  ),
  // clothing
  "tee-white": () => <Tee fill="#f2f3fb" />,
  "tee-pump": () => <Tee fill="#2ee88a" mark="up" />,
  "hoodie-hodl": () => <Tee fill="#8d6bff" hood />,
  jeans: () => <Pants fill="#3d6fd6" />,
  "shorts-remote": () => <Pants fill="#ff8a3d" short />,
  sneakers: () => <Shoe fill="#f2f3fb" sole="#ff4d6d" />,
  slippers: () => <Shoe fill="#3fd2ff" sole="#2c3566" />,
  "cap-moon": () => (
    <>
      <path d="M10 38 C10 20 20 12 32 12 C44 12 52 20 52 38 Z" fill="#151933" {...S} />
      <path d="M44 38 H62 C60 44 50 44 44 42 Z" fill="#151933" {...S} />
      <path d="M26 30 L32 18 L38 30 L32 27 Z" fill="#ffcc33" stroke={OL} strokeWidth="2.5" strokeLinejoin="round" />
    </>
  ),
  "santa-hat": () => (
    <>
      <path d="M10 44 C14 26 26 10 46 14 L52 30" fill="#ff4d6d" {...S} />
      <rect x="6" y="40" width="44" height="12" rx="6" fill="#f2f3fb" {...S} />
      <circle cx="52" cy="32" r="6" fill="#f2f3fb" {...S} />
    </>
  ),
  "laser-eyes": () => (
    <>
      <path d="M2 30 H62" stroke="#ff4d6d" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
      <rect x="6" y="22" width="22" height="16" rx="6" fill="#151933" {...S} />
      <rect x="36" y="22" width="22" height="16" rx="6" fill="#151933" {...S} />
      <path d="M28 28 H36" stroke={OL} strokeWidth="4" />
      <circle cx="17" cy="30" r="4" fill="#ff4d6d" />
      <circle cx="47" cy="30" r="4" fill="#ff4d6d" />
    </>
  ),
  "gold-chain": () => (
    <>
      <path d="M10 12 C12 36 22 46 32 46 C42 46 52 36 54 12" fill="none" stroke={OL} strokeWidth="9" strokeLinecap="round" />
      <path d="M10 12 C12 36 22 46 32 46 C42 46 52 36 54 12" fill="none" stroke="#ffcc33" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 4" />
      <rect x="23" y="42" width="18" height="18" rx="3" fill="#ffcc33" {...S} />
      <path d="M28 51 H36" stroke={OL} strokeWidth="3" />
    </>
  ),
};

function Tee({ fill, hood, mark }: { fill: string; hood?: boolean; mark?: "up" }) {
  return (
    <>
      {hood && <path d="M20 12 C20 4 44 4 44 12" fill={fill} {...S} />}
      <path d={hood ? "M22 10 L6 20 L10 56 H18 V28 L18 58 H46 V28 L46 56 H54 L58 20 L42 10 C40 16 24 16 22 10 Z" : "M22 8 L8 16 L12 30 L18 28 V58 H46 V28 L52 30 L56 16 L42 8 C40 14 24 14 22 8 Z"} fill={fill} {...S} />
      {mark === "up" && <path d="M24 44 L32 34 L36 40 L42 30 M36 30 H42 V36" stroke={OL} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      {hood && <text x="32" y="44" textAnchor="middle" fontSize="10" fontWeight="900" fill="#ffcc33" stroke={OL} strokeWidth="0.6" fontFamily="sans-serif">HODL</text>}
    </>
  );
}
function Pants({ fill, short }: { fill: string; short?: boolean }) {
  const h = short ? 36 : 58;
  return (
    <>
      <path d={`M14 6 H50 L52 ${h} H36 L32 22 L28 ${h} H12 Z`} fill={fill} {...S} />
      <path d="M14 12 H50" stroke={OL} strokeWidth="3" />
    </>
  );
}
function Shoe({ fill, sole }: { fill: string; sole: string }) {
  return (
    <>
      <path d="M8 22 H28 C34 30 46 32 56 36 V46 H8 Z" fill={fill} {...S} />
      <path d="M8 44 H56 V52 H8 Z" fill={sole} {...S} />
      <path d="M22 26 L28 32 M18 28 L24 34" stroke={OL} strokeWidth="2.5" strokeLinecap="round" />
    </>
  );
}

/** Items drawn by the artist (public/assets/items/<id>.webp, built by tools/items/build-items.py). */
const RASTER_ITEMS = new Set([
  "fist", "mouse", "red-candle", "keyboard", "gpu", "rug-pull-gun",
  "tee-white", "tee-pump", "jeans", "shorts-remote", "sneakers", "cap-moon",
  "energy-drink", "lost-wallet", "bottle-cap", "flyer-passive", "spinner", "sticker-hodl",
]);

/** Picture of any item; keys use the key icon, unknown ids fall back to a coin. */
export function ItemArt({ id, size = 40 }: { id: string; size?: number }) {
  if (RASTER_ITEMS.has(id)) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ flex: "none", display: "block" }}>
        <image href={`/assets/items/${id}.webp`} x="0" y="0" width="64" height="64" />
      </svg>
    );
  }
  if (id.startsWith("key-")) return <Icon name="key" size={size} />;
  if (id === "coins") return <Icon name="coins" size={size} />;
  const f = ART[id];
  if (!f) return <Icon name="chest" size={size} />;
  return <Svg size={size}>{f()}</Svg>;
}
