"use client";
/** Home backdrop: room theme (bought in the shop) + the workplace that evolves with upgrades. */
import { memo, type ReactElement } from "react";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function Skyline({ color, windows, seed }: { color: string; windows: string; seed: number }) {
  const r = rng(seed);
  const blds: ReactElement[] = [];
  let x = -10;
  let i = 0;
  while (x < 410) {
    const w = 30 + r() * 40;
    const h = 120 + r() * 200;
    blds.push(<rect key={`b${i}`} x={x} y={560 - 150 - h} width={w} height={h + 150} fill={color} />);
    for (let k = 0; k < 10; k++) {
      if (r() > 0.55) blds.push(<rect key={`w${i}-${k}`} x={x + 4 + r() * (w - 10)} y={560 - 150 - h + 10 + r() * (h - 10)} width="4" height="6" fill={windows} opacity={0.4 + r() * 0.5} />);
    }
    x += w + 2;
    i++;
  }
  return <g>{blds}</g>;
}

function Desk({ tier }: { tier: number }) {
  // small workplace behind the hero (left side), grows with tier
  const mons = [0, 1, 1, 2, 3, 4, 6][Math.min(6, tier)];
  return (
    <g transform="translate(14 330)">
      <rect x="0" y="70" width="150" height="10" rx="3" fill={tier >= 4 ? "#22252f" : "#5a3d26"} stroke="#000" strokeWidth="2" />
      <rect x="6" y="80" width="8" height="60" fill="#111" /><rect x="136" y="80" width="8" height="60" fill="#111" />
      {tier === 1 && (
        <g>
          <path d="M40 70 l6 -32 h50 l6 32z" fill="#6b6f7a" stroke="#000" strokeWidth="2" />
          <rect x="49" y="42" width="44" height="24" fill="#0b2a3a" />
          <path d="M52 60 l10 -8 8 4 12 -12" stroke="#22e58b" strokeWidth="2" fill="none" />
        </g>
      )}
      {Array.from({ length: mons }, (_, i) => {
        const row = i >= 3 ? 1 : 0;
        const col = row ? i - 3 : i;
        const x = 8 + col * 48;
        const y = 22 - row * 40;
        return (
          <g key={i}>
            <rect x={x} y={y} width="44" height="32" rx="2" fill="#060b16" stroke="#1d2740" strokeWidth="2.5" />
            <polyline points={`${x + 4},${y + 24} ${x + 12},${y + 18} ${x + 20},${y + 22} ${x + 30},${y + 10} ${x + 40},${y + 14}`} fill="none" stroke={i % 3 === 1 ? "#ff3b5c" : "#22e58b"} strokeWidth="2" />
            {row === 0 && <rect x={x + 19} y={y + 32} width="6" height="16" fill="#222" />}
          </g>
        );
      })}
      {tier >= 3 && <rect x="152" y="20" width="26" height="60" rx="3" fill="#111320" stroke="#b45cff" strokeWidth="2.5" className="rgb" />}
      {tier >= 5 && (
        <g>
          <rect x="-8" y="-60" width="26" height="130" rx="2" fill="#0f1220" stroke="#2c3550" strokeWidth="2" />
          {Array.from({ length: 8 }, (_, j) => <circle key={j} cx="10" cy={-50 + j * 15} r="2" fill={j % 2 ? "#22e58b" : "#3fa7ff"} className={j % 3 ? "" : "blink"} />)}
        </g>
      )}
      {tier >= 6 && <text x="75" y="-30" fontSize="16" textAnchor="middle" fill="#ffd23f" fontWeight="900" stroke="#000" strokeWidth="3" paintOrder="stroke">🐋 HQ</text>}
    </g>
  );
}

function SceneImpl({ theme, tier }: { theme: string; tier: number }) {
  const t = theme.replace("t-", "");
  return (
    <svg className="scene-svg" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={t === "penthouse" ? "#ffd23f" : t === "moon" ? "#9fd8ff" : "#9dff3a"} stopOpacity=".55" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          {t === "neon" && (<><stop offset="0" stopColor="#0a2a22" /><stop offset="1" stopColor="#06120f" /></>)}
          {t === "moon" && (<><stop offset="0" stopColor="#05051a" /><stop offset="1" stopColor="#141a3a" /></>)}
          {t === "penthouse" && (<><stop offset="0" stopColor="#2a1d05" /><stop offset="1" stopColor="#120c02" /></>)}
          {t === "default" && (<><stop offset="0" stopColor="#1a1630" /><stop offset="1" stopColor="#0c0a16" /></>)}
        </linearGradient>
        <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".85" />
        </linearGradient>
      </defs>
      <rect width="400" height="560" fill="url(#sky)" />
      {t === "default" && (
        <g>
          <rect x="230" y="40" width="150" height="150" rx="6" fill="#141030" stroke="#2a2440" strokeWidth="8" />
          <circle cx="345" cy="78" r="18" fill="#f4f1d8" opacity=".85" />
          <path d="M305 40 v150 M230 115 h150" stroke="#2a2440" strokeWidth="6" />
          <rect x="20" y="40" width="90" height="120" fill="#161618" stroke="#000" strokeWidth="3" transform="rotate(-3 65 100)" />
          <text x="65" y="78" fontSize="17" textAnchor="middle" fill="#e8e3d0" fontWeight="900" transform="rotate(-3 65 100)">BUY</text>
          <text x="65" y="102" fontSize="15" textAnchor="middle" fill="#e8e3d0" fontWeight="900" transform="rotate(-3 65 100)">HODL</text>
          <text x="65" y="126" fontSize="13" textAnchor="middle" fill="#e8e3d0" fontWeight="900" transform="rotate(-3 65 100)">REPEAT</text>
          <path d="M0 400 h400 v160 h-400z" fill="#1c1410" />
          {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M0 ${410 + i * 30} h400`} stroke="#000" strokeOpacity=".4" />)}
        </g>
      )}
      {t === "neon" && (
        <g>
          <circle cx="250" cy="150" r="140" fill="url(#moonGlow)" />
          <circle cx="250" cy="150" r="82" fill="#b6ff7a" opacity=".85" />
          <circle cx="226" cy="130" r="14" fill="#8bd85a" opacity=".6" /><circle cx="280" cy="176" r="10" fill="#8bd85a" opacity=".6" />
          <Skyline color="#071a14" windows="#9dff3a" seed={7} />
          <text x="70" y="250" fontSize="22" fill="#9dff3a" fontWeight="900" transform="rotate(-10 70 250)" className="neon" style={{ fontFamily: "var(--font-comic), sans-serif" }}>GOOD MEMES</text>
          <text x="330" y="330" fontSize="18" fill="#ff3d81" fontWeight="900" transform="rotate(8 330 330)" className="neon" textAnchor="middle" style={{ fontFamily: "var(--font-comic), sans-serif" }}>HODL</text>
        </g>
      )}
      {t === "moon" && (
        <g>
          {Array.from({ length: 70 }, (_, i) => { const r = rng(i + 3); return <circle key={i} cx={r() * 400} cy={r() * 320} r={r() * 1.6 + 0.3} fill="#fff" opacity={0.3 + r() * 0.7} />; })}
          <circle cx="90" cy="110" r="36" fill="#3a6bd8" /><path d="M64 100 q20 -14 40 6" stroke="#2fb36b" strokeWidth="10" fill="none" />
          <ellipse cx="200" cy="600" rx="420" ry="190" fill="#9aa0ab" />
          <circle cx="90" cy="470" r="22" fill="#80868f" /><circle cx="320" cy="490" r="30" fill="#80868f" />
          <path d="M320 420 v-90 l44 14 -44 14" stroke="#ddd" strokeWidth="4" fill="#22e58b" />
        </g>
      )}
      {t === "penthouse" && (
        <g>
          <rect x="20" y="40" width="360" height="250" fill="#120c02" stroke="#ffd23f" strokeWidth="6" />
          <Skyline color="#1e1504" windows="#ffd23f" seed={11} />
          <rect x="20" y="40" width="360" height="250" fill="none" stroke="#ffd23f" strokeWidth="6" />
          <path d="M200 40 v250" stroke="#ffd23f" strokeWidth="4" />
          <path d="M0 380 h400 v180 h-400z" fill="#e8e3d0" opacity=".14" />
          {[60, 140, 260, 340].map((x) => <circle key={x} cx={x} cy={520} r="12" fill="#ffd23f" stroke="#7a5a10" strokeWidth="2" />)}
        </g>
      )}
      <Desk tier={tier} />
      <rect y="380" width="400" height="180" fill="url(#floorG)" />
    </svg>
  );
}
export const Scene = memo(SceneImpl);
