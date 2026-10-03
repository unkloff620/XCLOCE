"use client";
/* Vector backgrounds: the player's room (layered), location banners, the yard, boss arenas. */
import { OL } from "./icons.tsx";

const s = (w = 4) => ({ stroke: OL, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });

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
  { x: 36, y: 78 },
  { x: 54, y: 88 },
  { x: 62, y: 72 },
  { x: 44, y: 66 },
  { x: 26, y: 90 },
];

/** Night yard: houses with balconies and AC units, a 24/7 kiosk, graffiti, a lamp post, a tree, a bench, puddles. */
export function YardScene() {
  const win = (x: number, y: number, on: boolean, k: string) => (
    <g key={k}>
      <rect x={x} y={y} width="22" height="28" rx="2" fill={on ? "#ffcc33" : "#232a63"} {...s(2.5)} />
      {on && <rect x={x + 3} y={y + 3} width="7" height="22" fill="rgba(255,255,255,0.35)" />}
      <path d={`M${x + 11} ${y} V${y + 28}`} stroke={OL} strokeWidth="2" />
    </g>
  );
  return (
    <svg viewBox="0 0 400 560" width="100%" style={{ display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id="yard-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141838" />
          <stop offset="0.7" stopColor="#3a2a5a" />
          <stop offset="1" stopColor="#5a3a62" />
        </linearGradient>
        <radialGradient id="yard-lamp" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#ffe9a6" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffe9a6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="yard-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4e72" />
          <stop offset="1" stopColor="#30334f" />
        </linearGradient>
      </defs>
      <rect width="400" height="560" fill="url(#yard-sky)" />
      {/* moon and stars */}
      <circle cx="330" cy="54" r="22" fill="#fff6c2" />
      <circle cx="322" cy="48" r="20" fill="#1b2046" />
      {[[30, 30], [120, 18], [210, 40], [270, 22], [380, 96], [160, 70], [250, 84]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#fff6c2" className="twinkle" />)}
      {/* far skyline */}
      <path d="M0 210 V150 H30 V120 H58 V160 H90 V100 H120 V140 H150 V90 H186 V130 H220 V110 H250 V150 H290 V120 H320 V160 H360 V130 H400 V210 Z" fill="#241b42" />
      {/* main house on the left */}
      <rect x="0" y="96" width="196" height="250" fill="#6a3f5e" {...s()} />
      <rect x="0" y="86" width="204" height="14" fill="#4a2a44" {...s(3)} />
      {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => win(14 + c * 36, 112 + r * 52, (r * 5 + c) % 3 !== 0, `${r}${c}`)))}
      {/* balconies and AC units */}
      <rect x="44" y="190" width="56" height="8" fill="#3a2440" {...s(2.5)} />
      <path d="M48 198 V214 M58 198 V214 M68 198 V214 M78 198 V214 M88 198 V214 M96 198 V214" stroke={OL} strokeWidth="2.5" />
      <path d="M46 214 H98" stroke={OL} strokeWidth="3" />
      <path d="M52 186 L60 170 L68 186 M70 186 L78 172 L86 186" stroke="#f2f3fb" strokeWidth="3" fill="none" />
      <rect x="152" y="246" width="30" height="20" rx="3" fill="#c9ceea" {...s(2.5)} />
      <circle cx="162" cy="256" r="6" fill="#6e75a6" stroke={OL} strokeWidth="2" />
      <rect x="116" y="144" width="30" height="20" rx="3" fill="#c9ceea" {...s(2.5)} />
      <circle cx="126" cy="154" r="6" fill="#6e75a6" stroke={OL} strokeWidth="2" />
      {/* entrance with a lamp */}
      <rect x="138" y="288" width="40" height="58" rx="4" fill="#2a1a2e" {...s(3)} />
      <rect x="132" y="282" width="52" height="8" fill="#4a2a44" {...s(2.5)} />
      <circle cx="158" cy="276" r="5" fill="#ffe9a6" />
      <circle cx="170" cy="318" r="3" fill="#ffcc33" />
      {/* 24/7 crypto kiosk */}
      <rect x="200" y="252" width="96" height="94" rx="4" fill="#2b6a7a" {...s()} />
      <rect x="196" y="236" width="104" height="22" rx="4" fill="#ff4d6d" {...s(3)} />
      <text x="248" y="252" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff" fontFamily="var(--font-display), sans-serif">КРИПТО 24/7</text>
      <rect x="210" y="268" width="50" height="40" rx="3" fill="#ffe9a6" {...s(2.5)} />
      <path d="M216 300 L226 288 L236 294 L252 276" stroke="#2ee88a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="266" y="270" width="22" height="76" rx="3" fill="#1a3a44" {...s(2.5)} />
      {/* graffiti wall */}
      <rect x="296" y="196" width="104" height="150" fill="#4a3060" {...s()} />
      {Array.from({ length: 6 }, (_, r) => <path key={r} d={`M296 ${214 + r * 22} H400`} stroke="rgba(0,0,0,0.2)" strokeWidth="2" />)}
      <text x="348" y="262" textAnchor="middle" fontSize="30" fontWeight="900" fill="#2ee88a" stroke={OL} strokeWidth="2.5" fontFamily="var(--font-display), sans-serif" transform="rotate(-8 348 262)">HODL</text>
      <path d="M318 312 L330 290 L342 312 Z" fill="#ff4d6d" {...s(2.5)} />
      <path d="M352 320 C362 300 384 304 386 318" stroke="#ffcc33" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* ground: curb, asphalt, puddles, manhole */}
      <path d="M0 346 H400 V560 H0 Z" fill="url(#yard-ground)" {...s()} />
      <path d="M0 352 H400" stroke="#8a8fb8" strokeWidth="7" />
      <path d="M0 352 H400" stroke={OL} strokeWidth="2" strokeDasharray="30 10" />
      <ellipse cx="300" cy="500" rx="58" ry="12" fill="#5a6aa8" opacity="0.55" />
      <ellipse cx="300" cy="500" rx="30" ry="4" fill="#ffe9a6" opacity="0.4" />
      <ellipse cx="90" cy="430" rx="34" ry="8" fill="#5a6aa8" opacity="0.45" />
      <ellipse cx="200" cy="540" rx="30" ry="9" fill="#2c2f48" {...s(3)} />
      <path d="M180 540 H220 M186 534 H214 M186 546 H214" stroke="#4a4e72" strokeWidth="2" />
      {[[40, 470, 60], [240, 450, 80], [120, 520, 40], [330, 420, 40]].map(([x, y, w]) => <path key={x} d={`M${x} ${y} h${w}`} stroke="#2c2f48" strokeWidth="4" strokeLinecap="round" />)}
      {/* tree */}
      <g>
        <path d="M330 352 V280" stroke={OL} strokeWidth="14" strokeLinecap="round" />
        <path d="M330 352 V280" stroke="#6b4320" strokeWidth="8" strokeLinecap="round" />
        <circle cx="330" cy="226" r="40" fill="#2ee88a" {...s()} />
        <circle cx="298" cy="252" r="26" fill="#2bb56b" {...s()} />
        <circle cx="364" cy="250" r="26" fill="#2bb56b" {...s()} />
        <circle cx="318" cy="214" r="9" fill="#7ff0b0" opacity="0.7" />
      </g>
      {/* lamp post with a light cone */}
      <path d="M150 196 L250 196 L300 352 L100 352 Z" fill="url(#yard-lamp)" />
      <path d="M200 352 V186" stroke={OL} strokeWidth="9" />
      <path d="M200 352 V186" stroke="#6e75a6" strokeWidth="4" />
      <path d="M186 180 H214 L210 196 H190 Z" fill="#ffcc33" {...s(3)} />
      {/* bench */}
      <g>
        <rect x="44" y="322" width="110" height="12" rx="4" fill="#ff8a3d" {...s(3)} />
        <rect x="44" y="338" width="110" height="10" rx="4" fill="#ff8a3d" {...s(3)} />
        <path d="M56 348 V366 M142 348 V366" stroke={OL} strokeWidth="6" />
      </g>
      {/* trash can */}
      <path d="M262 368 H292 L288 410 H266 Z" fill="#3a8a5a" {...s(3)} />
      <rect x="258" y="360" width="38" height="10" rx="3" fill="#2bb56b" {...s(3)} />
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
