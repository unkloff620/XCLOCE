"use client";
/* Vector backgrounds: the player's room (layered), location banners, the yard, boss arenas. */
import type { ReactNode } from "react";
import { OL } from "./icons.tsx";

const s = (w = 4) => ({ stroke: OL, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });

/* ---------------- room: separate layers so rooms and decor can be swapped later ---------------- */
export interface RoomTheme {
  wall: [string, string];
  floor: [string, string];
  window: "city" | "moon";
  decor: { poster?: string; desk?: boolean; plant?: boolean; lamp?: boolean; rug?: string };
}
export const ROOMS: Record<string, RoomTheme> = {
  basic: { wall: ["#2f3577", "#1d2150"], floor: ["#8a5a2b", "#6b4320"], window: "city", decor: { poster: "HODL", desk: true, plant: true, lamp: true, rug: "#8d6bff" } },
};

function Wall({ t }: { t: RoomTheme }) {
  return (
    <g>
      <defs>
        <linearGradient id="room-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.wall[0]} />
          <stop offset="1" stopColor={t.wall[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="440" fill="url(#room-wall)" />
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={i * 48 - 8} y="0" width="22" height="440" fill="rgba(255,255,255,0.03)" />)}
      <rect x="0" y="400" width="400" height="14" fill="rgba(0,0,0,0.25)" />
    </g>
  );
}
function Window({ t }: { t: RoomTheme }) {
  return (
    <g>
      <rect x="28" y="70" width="130" height="150" rx="10" fill="#0b1030" {...s()} />
      <g clipPath="url(#win-clip)">
        <defs>
          <clipPath id="win-clip"><rect x="32" y="74" width="122" height="142" rx="7" /></clipPath>
        </defs>
        <circle cx="128" cy="104" r="14" fill="#fff6c2" />
        {[[34, 150, 22, 66], [58, 128, 20, 88], [80, 160, 26, 56], [108, 140, 22, 76], [132, 120, 24, 96]].map(([x, y, w, h]) => (
          <g key={x}>
            <rect x={x} y={y} width={w} height={h} fill="#1e2557" stroke={OL} strokeWidth="2" />
            {Array.from({ length: Math.floor(h / 16) }, (_, k) => <rect key={k} x={x + 5} y={y + 6 + k * 16} width="5" height="6" fill={k % 3 ? "#ffcc33" : "#3d4380"} />)}
          </g>
        ))}
        <path d="M34 200 L60 186 L80 194 L104 166 L124 174 L152 140" fill="none" stroke="#2ee88a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M93 72 V218 M30 145 H156" stroke={OL} strokeWidth="5" />
      <rect x="20" y="214" width="146" height="14" rx="5" fill="#c9ceea" {...s()} />
    </g>
  );
}
function Poster({ text }: { text: string }) {
  return (
    <g transform="rotate(4 300 130)">
      <rect x="250" y="66" width="104" height="132" rx="6" fill="#ffcc33" {...s()} />
      <path d="M302 92 L318 126 H286 Z" fill="#ff4d6d" {...s(3)} />
      <rect x="292" y="126" width="20" height="26" fill="#e8ebff" {...s(3)} />
      <path d="M296 152 L302 168 L308 152" fill="#ff8a3d" {...s(3)} />
      <text x="302" y="190" textAnchor="middle" fontSize="20" fontWeight="900" fill={OL} fontFamily="var(--font-display), sans-serif">{text}</text>
    </g>
  );
}
function Floor({ t }: { t: RoomTheme }) {
  return (
    <g>
      <path d="M0 414 H400 V560 H0 Z" fill={t.floor[0]} {...s()} />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M0 ${436 + i * 24} H400`} stroke={t.floor[1]} strokeWidth="3" />)}
      {Array.from({ length: 8 }, (_, i) => <path key={`v${i}`} d={`M${(i * 61 + (i % 2) * 30) % 400} ${436 + (i % 5) * 24} v24`} stroke={t.floor[1]} strokeWidth="3" />)}
    </g>
  );
}
function Desk() {
  return (
    <g>
      <rect x="276" y="300" width="112" height="72" rx="6" fill="#151933" {...s()} />
      <path d="M296 374 V392 M368 374 V392" stroke={OL} strokeWidth="5" />
      <rect x="290" y="244" width="84" height="56" rx="6" fill="#0b1030" {...s()} />
      {[0, 1, 2, 3, 4].map((i) => {
        const up = i % 2 === 0;
        const h = [16, 24, 12, 28, 20][i];
        return <rect key={i} x={300 + i * 14} y={290 - h - i * 3} width="8" height={h} fill={up ? "#2ee88a" : "#ff4d6d"} />;
      })}
      <rect x="326" y="300" width="12" height="10" fill="#2c3566" {...s(3)} />
      <rect x="248" y="346" width="58" height="24" rx="6" fill="#ff4d6d" {...s()} />
      <rect x="252" y="370" width="50" height="40" rx="8" fill="#c21d42" {...s()} />
      <path d="M262 410 V424 M292 410 V424" stroke={OL} strokeWidth="5" />
    </g>
  );
}
function Plant() {
  return (
    <g>
      <path d="M36 300 C30 260 50 248 58 232 M58 300 C60 262 80 254 86 236 M48 300 C40 270 20 266 14 248" fill="none" stroke={OL} strokeWidth="10" strokeLinecap="round" />
      <path d="M36 300 C30 260 50 248 58 232 M58 300 C60 262 80 254 86 236 M48 300 C40 270 20 266 14 248" fill="none" stroke="#2ee88a" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="58" cy="232" rx="12" ry="7" fill="#2ee88a" {...s(3)} transform="rotate(-30 58 232)" />
      <ellipse cx="86" cy="236" rx="12" ry="7" fill="#2ee88a" {...s(3)} transform="rotate(-40 86 236)" />
      <ellipse cx="14" cy="248" rx="12" ry="7" fill="#2ee88a" {...s(3)} transform="rotate(30 14 248)" />
      <path d="M24 300 H74 L68 344 H30 Z" fill="#ff8a3d" {...s()} />
    </g>
  );
}
function Lamp() {
  return (
    <g>
      <path d="M200 0 V40" stroke={OL} strokeWidth="4" />
      <path d="M176 40 H224 L232 62 H168 Z" fill="#ffcc33" {...s()} />
      <path d="M150 62 L250 62 L320 420 L80 420 Z" fill="rgba(255,220,120,0.06)" />
    </g>
  );
}

export function RoomScene({ room = "basic", children }: { room?: string; children?: ReactNode }) {
  const t = ROOMS[room] ?? ROOMS.basic;
  return (
    <svg viewBox="0 0 400 560" width="100%" style={{ display: "block" }} aria-hidden="true">
      <Wall t={t} />
      <Window t={t} />
      {t.decor.poster && <Poster text={t.decor.poster} />}
      <Floor t={t} />
      {t.decor.rug && <ellipse cx="200" cy="500" rx="130" ry="30" fill={t.decor.rug} {...s()} opacity="0.95" />}
      {t.decor.desk && <Desk />}
      {t.decor.plant && <Plant />}
      {t.decor.lamp && <Lamp />}
      {children}
    </svg>
  );
}

/* ---------------- location banners (360×140) ---------------- */
export function LocationScene({ scene }: { scene: string }) {
  const sky: Record<string, [string, string]> = {
    openspace: ["#2f3577", "#1b1f47"], market: ["#3a1a52", "#1a0c2a"], serverroom: ["#0f2f3a", "#06161c"], basement: ["#3a2610", "#160d04"], board: ["#3a1424", "#170710"],
  };
  const [a, b] = sky[scene] ?? sky.openspace;
  const id = `loc-${scene}`;
  return (
    <svg viewBox="0 0 360 140" width="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="360" height="140" fill={`url(#${id})`} />
      {scene === "openspace" && (
        <g>
          {[20, 130, 240].map((x) => (
            <g key={x}>
              <rect x={x} y="78" width="96" height="16" rx="3" fill="#c9ceea" {...s(3)} />
              <rect x={x + 22} y="44" width="52" height="34" rx="4" fill="#0b1030" {...s(3)} />
              <path d={`M${x + 28} 70 L${x + 40} 60 L${x + 50} 66 L${x + 66} 50`} stroke="#2ee88a" strokeWidth="3" fill="none" />
              <path d={`M${x + 10} 94 V128 M${x + 86} 94 V128`} stroke={OL} strokeWidth="4" />
            </g>
          ))}
          <rect x="0" y="124" width="360" height="16" fill="#6b4320" />
        </g>
      )}
      {scene === "market" && (
        <g>
          {[10, 130, 250].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 56 H${x + 100} L${x + 90} 36 H${x + 10} Z`} fill={["#ff4d6d", "#2ee88a", "#ffcc33"][i]} {...s(3)} />
              <rect x={x + 6} y="56" width="88" height="56" fill="#2c3566" {...s(3)} />
              {[0, 1, 2, 3].map((k) => <rect key={k} x={x + 16 + k * 18} y={92 - (k * 7 + 6) % 26} width="9" height={(k * 7 + 6) % 26 + 10} fill={k % 2 ? "#ff4d6d" : "#2ee88a"} />)}
            </g>
          ))}
          <rect x="0" y="112" width="360" height="28" fill="#2a1a3a" />
        </g>
      )}
      {scene === "serverroom" && (
        <g>
          {[20, 90, 160, 230, 300].map((x) => (
            <g key={x}>
              <rect x={x} y="22" width="50" height="104" rx="4" fill="#151933" {...s(3)} />
              {Array.from({ length: 8 }, (_, k) => (
                <g key={k}>
                  <rect x={x + 6} y={30 + k * 12} width="38" height="7" fill="#232a52" />
                  <circle cx={x + 40} cy={33.5 + k * 12} r="2" fill={(k + x) % 3 ? "#2ee88a" : "#ff4d6d"} />
                </g>
              ))}
            </g>
          ))}
        </g>
      )}
      {scene === "basement" && (
        <g>
          {[18, 128, 238].map((x) => (
            <g key={x}>
              <path d={`M${x} 40 H${x + 104} M${x} 120 H${x + 104} M${x + 4} 40 V120 M${x + 100} 40 V120`} stroke="#9aa0c8" strokeWidth="4" />
              {[0, 1, 2].map((k) => (
                <g key={k}>
                  <rect x={x + 10 + k * 30} y="50" width="24" height="60" rx="3" fill="#2c3566" {...s(2.5)} />
                  <circle cx={x + 22 + k * 30} cy="68" r="8" fill="#151933" stroke={OL} strokeWidth="2" />
                  <circle cx={x + 22 + k * 30} cy="92" r="8" fill="#151933" stroke={OL} strokeWidth="2" />
                </g>
              ))}
            </g>
          ))}
          <circle cx="330" cy="26" r="10" fill="#ffcc33" opacity="0.7" />
        </g>
      )}
      {scene === "board" && (
        <g>
          <rect x="110" y="18" width="140" height="70" rx="6" fill="#e8ebff" {...s(3)} />
          <path d="M120 30 L150 70 L180 46 L240 80" stroke="#ff4d6d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 112 H340 L330 128 H30 Z" fill="#6b4320" {...s(3)} />
          {[50, 110, 170, 230, 290].map((x) => <circle key={x} cx={x} cy="100" r="11" fill="#151933" {...s(3)} />)}
        </g>
      )}
      <rect width="360" height="140" fill="none" stroke={OL} strokeWidth="5" />
    </svg>
  );
}

/* ---------------- yard (400×560). Item spots are in YARD_SPOTS (percent of the scene) ---------------- */
export const YARD_SPOTS = [
  { x: 22, y: 76 },
  { x: 50, y: 84 },
  { x: 78, y: 75 },
  { x: 36, y: 64 },
  { x: 66, y: 63 },
];
export function YardScene() {
  return (
    <svg viewBox="0 0 400 560" width="100%" style={{ display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id="yard-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1f47" />
          <stop offset="1" stopColor="#3a2a5a" />
        </linearGradient>
      </defs>
      <rect width="400" height="560" fill="url(#yard-sky)" />
      {[[30, 30], [120, 60], [210, 24], [330, 50], [270, 90]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.5" fill="#fff6c2" />)}
      <rect x="0" y="70" width="250" height="250" fill="#5a3a5e" {...s()} />
      {Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, c) => (
        <rect key={`${r}${c}`} x={18 + c * 46} y={90 + r * 52} width="28" height="34" rx="3" fill={(r + c) % 3 ? "#ffcc33" : "#2a2f63"} {...s(3)} />
      )))}
      <rect x="250" y="150" width="150" height="170" fill="#45305a" {...s()} />
      <text x="325" y="250" textAnchor="middle" fontSize="34" fontWeight="900" fill="#2ee88a" stroke={OL} strokeWidth="2.5" fontFamily="var(--font-display), sans-serif" transform="rotate(-8 325 250)">HODL</text>
      <path d="M0 320 H400 V560 H0 Z" fill="#3d4060" {...s()} />
      <path d="M0 330 H400" stroke="#7a7fa8" strokeWidth="6" />
      {[[60, 400, 70], [250, 470, 90], [150, 520, 50], [330, 380, 40]].map(([x, y, w]) => <path key={x} d={`M${x} ${y} h${w}`} stroke="#2c2f48" strokeWidth="4" strokeLinecap="round" />)}
      <g>
        <rect x="300" y="270" width="12" height="70" fill="#151933" {...s(3)} />
        <circle cx="330" cy="236" r="44" fill="#2ee88a" {...s()} />
        <circle cx="300" cy="260" r="26" fill="#2bb56b" {...s()} />
        <circle cx="362" cy="262" r="24" fill="#2bb56b" {...s()} />
      </g>
      <g>
        <rect x="40" y="300" width="120" height="14" rx="4" fill="#ff8a3d" {...s(3)} />
        <rect x="40" y="318" width="120" height="12" rx="4" fill="#ff8a3d" {...s(3)} />
        <path d="M52 330 V348 M148 330 V348" stroke={OL} strokeWidth="6" />
      </g>
      <g>
        <path d="M200 340 V180" stroke={OL} strokeWidth="9" />
        <path d="M200 340 V180" stroke="#6e75a6" strokeWidth="4" />
        <path d="M186 180 H214 L210 196 H190 Z" fill="#ffcc33" {...s(3)} />
        <path d="M150 196 L250 196 L280 340 L120 340 Z" fill="rgba(255,220,120,0.07)" />
      </g>
    </svg>
  );
}

/* ---------------- boss arena: the raster photo sits in a vector frame on a themed stage ---------------- */
export function ArenaBackdrop({ theme, final }: { theme: { a: string; b: string; accent: string }; final?: boolean }) {
  const id = `arena-${theme.accent.slice(1)}`;
  return (
    <svg viewBox="0 0 400 440" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={theme.a} />
          <stop offset="1" stopColor={theme.b} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" stopColor={theme.accent} stopOpacity="0.45" />
          <stop offset="1" stopColor={theme.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="440" fill={`url(#${id}-bg)`} />
      {final && (
        <g className="sunrays" style={{ transformOrigin: "200px 200px" }}>
          {Array.from({ length: 16 }, (_, i) => <path key={i} d="M200 200 L188 -60 L212 -60 Z" fill="#ffd23f" opacity="0.16" transform={`rotate(${i * 22.5} 200 200)`} />)}
        </g>
      )}
      {/* falling chart in the background */}
      <g opacity="0.35">
        {Array.from({ length: 9 }, (_, i) => {
          const h = 30 + ((i * 37) % 60);
          const y = 40 + i * 22;
          return (
            <g key={i}>
              <path d={`M${24 + i * 42} ${y - 12} v${h + 24}`} stroke={i % 3 === 1 ? "#2ee88a" : theme.accent} strokeWidth="3" />
              <rect x={16 + i * 42} y={y} width="16" height={h} fill={i % 3 === 1 ? "#2ee88a" : theme.accent} />
            </g>
          );
        })}
      </g>
      <rect width="400" height="440" fill={`url(#${id}-glow)`} />
      <ellipse cx="200" cy="420" rx="170" ry="34" fill="rgba(0,0,0,0.45)" />
      <ellipse cx="200" cy="414" rx="140" ry="22" fill={theme.accent} opacity="0.25" />
    </svg>
  );
}

/** Silhouette used until a boss photo is provided. */
export function BossSilhouette({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 200 240" width="100%" height="100%" aria-hidden="true">
      <circle cx="100" cy="80" r="52" fill="#151933" stroke={OL} strokeWidth="5" />
      <path d="M20 240 C20 170 60 140 100 140 C140 140 180 170 180 240 Z" fill="#151933" stroke={OL} strokeWidth="5" />
      <text x="100" y="100" textAnchor="middle" fontSize="64" fontWeight="900" fill={accent} fontFamily="var(--font-display), sans-serif">?</text>
    </svg>
  );
}
