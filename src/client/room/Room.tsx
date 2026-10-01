"use client";
/**
 * Illustrated player room (SVG, 400x520). Evolves with the workplace tier (1..7) and shows the player's
 * dressable shiba character from behind. Monitors display live market data.
 */
import { memo } from "react";
import { cosmeticById, type Outfit } from "../../shared/retention.ts";

export interface MonitorTicker {
  ticker: string;
  change: number;
  history: number[];
}

function spark(h: number[], w: number, ht: number): string {
  if (h.length < 2) return "";
  const min = Math.min(...h);
  const max = Math.max(...h);
  const span = max - min || 1;
  return h.map((v, i) => `${((i / (h.length - 1)) * w).toFixed(1)},${(ht - ((v - min) / span) * ht).toFixed(1)}`).join(" ");
}

function ChartScreen({ x, y, w, h, t }: { x: number; y: number; w: number; h: number; t?: MonitorTicker }) {
  const up = (t?.change ?? 0) >= 0;
  const col = up ? "#22e58b" : "#ff3b5c";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#060b16" stroke="#1d2740" strokeWidth="2.5" />
      <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="2" fill="url(#screenGlow)" opacity=".55" />
      {[0.33, 0.66].map((k) => <line key={k} x1={x + 3} x2={x + w - 3} y1={y + h * k} y2={y + h * k} stroke="#13203a" strokeWidth=".8" />)}
      {t && <polyline points={spark(t.history, w - 10, h - 18)} transform={`translate(${x + 5} ${y + 13})`} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" className="mon-line" />}
      {t && (
        <>
          <text x={x + 5} y={y + 10} fontSize="6.5" fontWeight="700" fill="#cfd8ea" fontFamily="monospace">${t.ticker}</text>
          <rect x={x + w - 30} y={y + 3} width="26" height="9" rx="2" fill={up ? "#0f3d27" : "#3d0f19"} />
          <text x={x + w - 17} y={y + 10} fontSize="6" fontWeight="700" textAnchor="middle" fill={col} fontFamily="monospace">{up ? "+" : ""}{(t.change * 100).toFixed(1)}%</text>
        </>
      )}
    </g>
  );
}

function ListScreen({ x, y, w, h, list }: { x: number; y: number; w: number; h: number; list: MonitorTicker[] }) {
  const rows = list.slice(0, 5);
  const rh = (h - 8) / 5;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#060b16" stroke="#1d2740" strokeWidth="2.5" />
      {rows.map((r, i) => {
        const up = r.change >= 0;
        const yy = y + 4 + i * rh;
        return (
          <g key={r.ticker}>
            <circle cx={x + 7} cy={yy + rh / 2} r="2.6" fill={["#ffb02e", "#22e58b", "#ff7ab0", "#3fa7ff", "#b45cff"][i % 5]} />
            <text x={x + 12} y={yy + rh / 2 + 2.2} fontSize="5.6" fill="#cfd8ea" fontFamily="monospace" fontWeight="700">{r.ticker}</text>
            <polyline points={spark(r.history.slice(-20), 18, rh - 5)} transform={`translate(${x + w - 46} ${yy + 2.5})`} fill="none" stroke={up ? "#22e58b" : "#ff3b5c"} strokeWidth="1" />
            <text x={x + w - 4} y={yy + rh / 2 + 2.2} fontSize="5.4" textAnchor="end" fill={up ? "#22e58b" : "#ff3b5c"} fontFamily="monospace">{up ? "+" : ""}{(r.change * 100).toFixed(1)}%</text>
          </g>
        );
      })}
    </g>
  );
}

/** Shiba character seen from behind / 3-4, sitting in a chair, wearing the outfit. */
function Character({ outfit, tier }: { outfit: Outfit; tier: number }) {
  const hoodie = cosmeticById(outfit.hoodie)?.color ?? "#22252e";
  const hat = cosmeticById(outfit.hat)?.variant ?? "none";
  const glasses = cosmeticById(outfit.glasses)?.variant ?? "none";
  const phones = cosmeticById(outfit.headphones)?.variant ?? "none";
  const chairCol = tier >= 4 ? "#2a0f17" : "#2b2b33";
  const chairTrim = tier >= 4 ? "#b3283c" : "#444652";
  return (
    <g className="character">
      {/* chair back */}
      <path d="M150 300 q-8 -70 40 -78 h44 q48 8 40 78 l-6 70 h-112z" fill={chairCol} stroke="#0a0a0e" strokeWidth="2" />
      <path d="M160 300 q-4 -58 36 -66 h32 q40 8 36 66" fill="none" stroke={chairTrim} strokeWidth="4" opacity=".9" />
      {tier >= 7 && <path d="M196 232 l6 -12 6 8 6 -12 6 12 6 -8 6 12z" fill="#ffd23f" stroke="#a87b00" strokeWidth="1" />}
      {/* body (hoodie) */}
      <path d="M168 372 q-6 -66 22 -92 q22 -14 44 0 q28 26 22 92z" fill={hoodie} stroke="#0a0a0e" strokeWidth="2" />
      <path d="M190 282 q22 16 44 0" fill="none" stroke="#000" strokeOpacity=".35" strokeWidth="3" />
      {/* hood */}
      <path d="M182 290 q30 22 60 0 l-6 -14 q-24 14 -48 0z" fill={hoodie} stroke="#0a0a0e" strokeWidth="1.5" />
      <path d="M182 290 q30 22 60 0" fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="2" />
      {/* small shiba print on the back */}
      <g transform="translate(200 312) scale(.45)" opacity=".85">
        <circle cx="25" cy="25" r="22" fill="#fff" fillOpacity=".12" />
        <path d="M10 14 l6 12 -10 2z M40 14 l-6 12 10 2z" fill="#e3a857" />
        <ellipse cx="25" cy="29" rx="15" ry="13" fill="#e3a857" />
        <ellipse cx="25" cy="34" rx="8" ry="6" fill="#f6e6c8" />
      </g>
      {/* right arm reaching the keyboard */}
      <path d="M248 316 q30 4 44 -10" stroke={hoodie} strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M248 316 q30 4 44 -10" stroke="#0a0a0e" strokeWidth="1.5" strokeOpacity=".5" fill="none" />
      <circle cx="294" cy="305" r="7" fill="#e3a857" stroke="#9a6a2c" strokeWidth="1.2" />
      {/* head — shiba, back three-quarter */}
      <g className="head">
        <path d="M184 238 l4 -34 22 22z" fill="#d99a45" stroke="#8a5a24" strokeWidth="1.5" />
        <path d="M244 238 l-2 -34 -22 22z" fill="#d99a45" stroke="#8a5a24" strokeWidth="1.5" />
        <path d="M189 232 l3 -20 12 13z" fill="#f2c9a0" />
        <ellipse cx="214" cy="248" rx="36" ry="32" fill="#e3a857" stroke="#8a5a24" strokeWidth="1.5" />
        <path d="M244 252 q14 6 10 20 q-8 6 -18 2z" fill="#f6e6c8" />
        <path d="M184 258 q-6 14 6 22 q20 6 42 0" fill="none" stroke="#c98a3e" strokeWidth="3" opacity=".6" />
        {/* hat */}
        {hat === "cap" && (
          <g>
            <path d="M180 236 q34 -36 68 0 z" fill="#e63946" stroke="#7a1520" strokeWidth="1.5" />
            <path d="M244 234 q18 0 22 8 q-10 4 -24 0z" fill="#b8202c" />
          </g>
        )}
        {hat === "beanie" && (
          <g>
            <path d="M180 240 q34 -44 68 0 z" fill="#1e7a4a" stroke="#0b3d24" strokeWidth="1.5" />
            <rect x="180" y="234" width="68" height="9" rx="4" fill="#26995d" />
            <circle cx="214" cy="200" r="6" fill="#26995d" />
            <text x="214" y="241.5" fontSize="6" textAnchor="middle" fill="#e8fff2" fontWeight="800" fontFamily="sans-serif">HODL</text>
          </g>
        )}
        {hat === "crown" && <path d="M188 222 l8 -18 9 12 9 -16 9 16 9 -12 8 18z" fill="#ffd23f" stroke="#a87b00" strokeWidth="1.5" />}
        {/* headphones */}
        {phones !== "none" && (
          <g>
            <path d="M182 246 q32 -50 64 0" fill="none" stroke="#15161c" strokeWidth="6" />
            <rect x="242" y="240" width="12" height="22" rx="5" fill="#15161c" stroke={phones === "rgb" ? "url(#rgbStroke)" : "#3a3d48"} strokeWidth="2" />
            <rect x="174" y="240" width="12" height="22" rx="5" fill="#15161c" stroke={phones === "rgb" ? "url(#rgbStroke)" : "#3a3d48"} strokeWidth="2" />
          </g>
        )}
        {/* glasses temple visible from behind */}
        {glasses === "shades" && <path d="M246 250 h14 l2 6 h-12z" fill="#0b0b0f" />}
        {glasses === "laser" && (
          <g>
            <path d="M246 248 h16 v8 h-16z" fill="#ff2a2a" opacity=".85" />
            <path d="M262 252 L300 236" stroke="#ff2a2a" strokeWidth="2.5" className="laser" />
          </g>
        )}
      </g>
      {/* chair base */}
      <rect x="206" y="372" width="12" height="40" fill="#15161c" />
      <path d="M170 418 h84 M212 412 v8" stroke="#15161c" strokeWidth="6" strokeLinecap="round" />
      <circle cx="172" cy="422" r="4" fill="#0a0a0e" /><circle cx="252" cy="422" r="4" fill="#0a0a0e" />
    </g>
  );
}

function RoomImpl({ tier, outfit, tickers }: { tier: number; outfit: Outfit; tickers: MonitorTicker[] }) {
  const t = Math.max(1, Math.min(7, tier));
  const best = [...tickers].sort((a, b) => b.change - a.change);
  const worst = [...tickers].sort((a, b) => a.change - b.change);
  const deskTop = t >= 5 ? "#232838" : t >= 3 ? "#3a2c22" : "#6b4a2f";
  return (
    <svg className="room-svg" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Комната игрока">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t >= 5 ? "#191433" : "#1d1a2a"} />
          <stop offset="1" stopColor="#0d0b16" />
        </linearGradient>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1d17" />
          <stop offset="1" stopColor="#120c0a" />
        </linearGradient>
        <radialGradient id="lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="monGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#3fa7ff" stopOpacity=".45" />
          <stop offset="1" stopColor="#3fa7ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="neonPink" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ff3d81" stopOpacity=".5" />
          <stop offset="1" stopColor="#ff3d81" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a3a6a" />
          <stop offset="1" stopColor="#060b16" />
        </linearGradient>
        <linearGradient id="rgbStroke" x1="0" x2="1">
          <stop offset="0" stopColor="#ff3d81" /><stop offset=".5" stopColor="#3fa7ff" /><stop offset="1" stopColor="#22e58b" />
        </linearGradient>
        <linearGradient id="city" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1446" /><stop offset="1" stopColor="#3a1d5c" />
        </linearGradient>
        <pattern id="bricks" width="40" height="20" patternUnits="userSpaceOnUse">
          <path d="M0 10h40M20 0v10M0 20h40M0 10v10M40 10v10" stroke="#fff" strokeOpacity=".035" strokeWidth="1" fill="none" />
        </pattern>
      </defs>

      {/* walls & floor */}
      <rect width="400" height="360" fill="url(#wall)" />
      <rect width="400" height="360" fill="url(#bricks)" />
      <path d="M0 360 h400 v160 h-400z" fill="url(#floor)" />
      {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M0 ${372 + i * 26} h400`} stroke="#000" strokeOpacity=".35" />)}
      <path d="M0 360 h400" stroke="#000" strokeWidth="4" strokeOpacity=".5" />

      {/* window with night city */}
      <g>
        <rect x="8" y="70" width={t >= 4 ? 92 : 76} height="130" rx="4" fill="url(#city)" stroke="#2a2440" strokeWidth="5" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={14 + i * 17} y={130 - ((i * 37) % 40)} width="14" height={80 + ((i * 37) % 40)} fill="#0e0a24" />
        ))}
        {Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={16 + ((i * 23) % (t >= 4 ? 80 : 64))} y={110 + ((i * 41) % 80)} width="3" height="4" fill={i % 3 ? "#ffd23f" : "#ff7ab0"} opacity=".75" className={i % 5 === 0 ? "blink" : undefined} />
        ))}
        <path d={`M${t >= 4 ? 54 : 46} 70 v130 M8 135 h${t >= 4 ? 92 : 76}`} stroke="#2a2440" strokeWidth="4" />
        <circle cx="70" cy="92" r="9" fill="#f4f1d8" opacity=".85" />
      </g>

      {/* posters */}
      {t >= 2 && (
        <g transform="rotate(-2 140 120)">
          <rect x="106" y="64" width="70" height="104" rx="3" fill="#15161a" stroke="#000" strokeWidth="2" />
          <text x="141" y="90" fontSize="15" textAnchor="middle" fill="#e8e3d0" style={{ fontFamily: "var(--font-display), sans-serif" }} fontWeight="800">BUY</text>
          <text x="141" y="109" fontSize="13" textAnchor="middle" fill="#e8e3d0" style={{ fontFamily: "var(--font-display), sans-serif" }} fontWeight="800">HODL</text>
          <text x="141" y="127" fontSize="12" textAnchor="middle" fill="#e8e3d0" style={{ fontFamily: "var(--font-display), sans-serif" }} fontWeight="800">SLEEP</text>
          <text x="141" y="145" fontSize="11" textAnchor="middle" fill="#e8e3d0" style={{ fontFamily: "var(--font-display), sans-serif" }} fontWeight="800">REPEAT</text>
          <path d="M118 74 l6 -6 6 6 6 -6 6 6" stroke="#ffd23f" fill="none" strokeWidth="1.5" />
        </g>
      )}
      <g transform="rotate(3 230 110)">
        <rect x="190" y={t >= 3 ? 56 : 80} width="72" height="92" rx="3" fill="#0f1a3a" stroke="#000" strokeWidth="2" />
        <circle cx="240" cy={t >= 3 ? 80 : 104} r="12" fill="#e8e3d0" />
        <path d={`M204 ${t >= 3 ? 130 : 154} l22 -40 8 4 -22 40z`} fill="#ff3d81" />
        <path d={`M204 ${t >= 3 ? 130 : 154} l-6 10 10 -4z`} fill="#ffb02e" />
        <text x="226" y={t >= 3 ? 143 : 167} fontSize="10" textAnchor="middle" fill="#fff" fontWeight="800" style={{ fontFamily: "var(--font-display), sans-serif" }}>TO THE MOON</text>
      </g>
      {/* neon sign */}
      {t >= 3 && (
        <g className="neon">
          <ellipse cx="320" cy="100" rx="70" ry="40" fill="url(#neonPink)" />
          <text x="320" y="94" fontSize="20" textAnchor="middle" fill="#ff7ab0" style={{ fontFamily: "var(--font-display), sans-serif" }} fontWeight="800" transform="rotate(-8 320 100)">WAGMI</text>
          <text x="326" y="116" fontSize="13" textAnchor="middle" fill="#7cc4ff" style={{ fontFamily: "var(--font-display), sans-serif" }} fontWeight="600" transform="rotate(-8 320 100)">gm, degen</text>
        </g>
      )}
      {/* shelf with plants & figures */}
      {t >= 4 && (
        <g>
          <rect x="270" y="168" width="110" height="5" fill="#4a3426" />
          <path d="M282 168 q-8 -18 2 -26 q4 10 2 26z M290 168 q6 -20 -2 -30 q-6 14 2 30z" fill="#2f8f4e" />
          <rect x="280" y="156" width="14" height="12" rx="2" fill="#7a4a2a" />
          <rect x="304" y="146" width="8" height="22" fill="#3fa7ff" /><rect x="313" y="150" width="7" height="18" fill="#ff3d81" /><rect x="321" y="144" width="9" height="24" fill="#ffd23f" />
          <rect x="340" y="152" width="34" height="14" rx="3" fill="#0b0f18" stroke="#22e58b" strokeWidth="1" />
          <text x="357" y="162" fontSize="8" textAnchor="middle" fill="#22e58b" fontFamily="monospace" fontWeight="700">GM ☕</text>
        </g>
      )}
      {t >= 6 && (
        <g>
          <rect x="330" y="190" width="58" height="76" rx="3" fill="#e8e3d0" transform="rotate(4 359 228)" />
          <text x="360" y="214" fontSize="9" textAnchor="middle" fill="#1a1a1a" fontWeight="800" fontFamily="sans-serif" transform="rotate(4 359 228)">NO RISK</text>
          <text x="360" y="228" fontSize="9" textAnchor="middle" fill="#1a1a1a" fontWeight="800" fontFamily="sans-serif" transform="rotate(4 359 228)">=</text>
          <text x="360" y="242" fontSize="9" textAnchor="middle" fill="#1a1a1a" fontWeight="800" fontFamily="sans-serif" transform="rotate(4 359 228)">NO LAMBO</text>
        </g>
      )}

      {/* bed with sleeping cat (left) */}
      <g>
        <rect x="-10" y={t >= 2 ? 330 : 380} width="110" height={t >= 2 ? 70 : 30} rx="8" fill={t >= 2 ? "#2a2f45" : "#3a3a44"} />
        <path d={`M-10 ${t >= 2 ? 340 : 386} q60 -16 110 0`} stroke="#3c4566" strokeWidth="10" fill="none" />
        <g className="cat" transform={`translate(26 ${t >= 2 ? 314 : 364})`}>
          <ellipse cx="22" cy="14" rx="22" ry="10" fill="#d8d2c8" />
          <path d="M6 14 q-4 -14 8 -12 l2 -6 4 6 4 -6 2 6" fill="#d8d2c8" />
          <path d="M30 10 q10 -2 14 6" stroke="#8a8378" strokeWidth="3" fill="none" />
          <path d="M8 9 q2 2 4 0" stroke="#333" strokeWidth="1" fill="none" />
          <text x="40" y="0" fontSize="8" fill="#9aa4b8" className="zzz">z</text>
        </g>
      </g>

      {/* floor items */}
      <ellipse cx="200" cy="440" rx={t >= 5 ? 150 : 110} ry="26" fill={t >= 5 ? "#2c2142" : "#2a2420"} opacity=".9" />
      {t >= 5 && <circle cx="200" cy="440" r="18" fill="#ffd23f" opacity=".35" />}
      <g transform="translate(20 448) rotate(-8)">
        <rect width="62" height="40" rx="3" fill="#c9a86a" stroke="#7a5a2c" />
        <text x="31" y="17" fontSize="7" textAnchor="middle" fill="#7a2a1a" fontWeight="800" fontFamily="sans-serif">PIZZA</text>
        <text x="31" y="27" fontSize="5.5" textAnchor="middle" fill="#7a2a1a" fontFamily="sans-serif">fuels gains</text>
      </g>
      {t >= 6 && (
        <g>
          <rect x="318" y="452" width="56" height="7" rx="3" fill="#2a2a30" />
          <circle cx="320" cy="455" r="12" fill="#1b1b20" stroke="#3a3a44" strokeWidth="2" />
          <circle cx="372" cy="455" r="12" fill="#1b1b20" stroke="#3a3a44" strokeWidth="2" />
        </g>
      )}
      <g transform="translate(300 470)">
        <rect width="10" height="16" rx="2" fill={t >= 3 ? "#22e58b" : "#c0c4cc"} />
        <rect y="3" width="10" height="4" fill="#111" opacity=".5" />
      </g>

      {/* PC tower (RGB) */}
      {t >= 3 && (
        <g>
          <rect x="332" y="300" width="44" height="88" rx="4" fill="#111320" stroke="url(#rgbStroke)" strokeWidth="2.5" />
          <circle cx="354" cy="326" r="11" fill="none" stroke="#b45cff" strokeWidth="3" className="fan" />
          <circle cx="354" cy="358" r="11" fill="none" stroke="#3fa7ff" strokeWidth="3" className="fan" />
        </g>
      )}
      {/* server racks */}
      {t >= 6 &&
        [0, 1].slice(0, t >= 7 ? 2 : 1).map((k) => (
          <g key={k}>
            <rect x={358 - k * 0} y={196 + 0} width="0" height="0" />
            <rect x={6 + k * 34} y="210" width="30" height="120" rx="3" fill="#0f1220" stroke="#2c3550" strokeWidth="2" />
            {Array.from({ length: 8 }, (_, j) => (
              <g key={j}>
                <rect x={10 + k * 34} y={216 + j * 14} width="22" height="9" rx="1" fill="#070a14" />
                <circle cx={28 + k * 34} cy={220.5 + j * 14} r="1.6" fill={j % 2 ? "#22e58b" : "#3fa7ff"} className={j % 3 === 0 ? "blink" : undefined} />
              </g>
            ))}
          </g>
        ))}

      {/* lamp */}
      <ellipse cx="120" cy="250" rx="90" ry="70" fill="url(#lamp)" />
      <path d="M96 290 l14 -40 h22 l-6 6" stroke="#2a2a30" strokeWidth="3" fill="none" />
      <path d="M124 246 l20 -6 4 12 -18 6z" fill="#2a2a30" />

      {/* desk */}
      <rect x={t >= 5 ? 70 : 96} y="300" width={t >= 5 ? 330 : 280} height="14" rx="3" fill={deskTop} stroke="#0a0a0e" strokeWidth="1.5" />
      <rect x={t >= 5 ? 76 : 102} y="314" width="10" height="70" fill="#14141a" />
      <rect x="380" y="314" width="10" height="70" fill="#14141a" />
      {t >= 4 && <rect x={t >= 5 ? 70 : 96} y="312" width={t >= 5 ? 330 : 280} height="3" fill="url(#rgbStroke)" className="neon" />}

      {/* screens */}
      <ellipse cx="270" cy="250" rx="130" ry="70" fill="url(#monGlow)" opacity={0.4 + t * 0.07} />
      {t === 1 && (
        <g>
          <path d="M240 298 l6 -46 h70 l6 46z" fill="#6b6f7a" stroke="#2a2a30" strokeWidth="1.5" />
          <ChartScreen x={250} y={257} w={62} h={38} t={best[0]} />
        </g>
      )}
      {t === 2 && <ChartScreen x={240} y={228} w={100} h={62} t={best[0]} />}
      {t === 3 && (
        <g>
          <ChartScreen x={178} y={226} w={92} h={60} t={best[0]} />
          <ListScreen x={276} y={226} w={92} h={60} list={best} />
        </g>
      )}
      {t >= 4 && (
        <g>
          <ChartScreen x={150} y={228} w={80} h={56} t={best[0]} />
          <ChartScreen x={236} y={222} w={92} h={64} t={best[1] ?? best[0]} />
          <ListScreen x={334} y={228} w={60} h={56} list={best} />
        </g>
      )}
      {t >= 5 && (
        <g>
          <ChartScreen x={190} y={160} w={80} h={56} t={worst[0]} />
          <ListScreen x={276} y={160} w={90} h={56} list={worst} />
        </g>
      )}
      {t >= 7 && (
        <g>
          <ChartScreen x={104} y={170} w={80} h={52} t={best[2] ?? best[0]} />
          <rect x="104" y="160" width="0" height="0" />
        </g>
      )}
      {t >= 2 && [190, 290].slice(0, t >= 4 ? 2 : 1).map((x) => <rect key={x} x={x + 18} y="288" width="8" height="12" fill="#1a1a22" />)}

      {/* desk props: keyboard, noodles with steam, energy drink */}
      <rect x="252" y="292" width="62" height="8" rx="2" fill="#1a1c26" stroke={t >= 3 ? "url(#rgbStroke)" : "#33343c"} strokeWidth="1.2" />
      <g transform="translate(330 274)">
        <path d="M0 4 h20 l-3 22 h-14z" fill="#f4efe6" stroke="#b9b1a2" />
        <rect x="0" y="8" width="20" height="5" fill="#e63946" />
        <path d="M6 0 q-4 -8 2 -14 M13 0 q-4 -8 2 -14" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" fill="none" className="steam" />
      </g>
      <g transform="translate(356 276)">
        <rect width="11" height="22" rx="2" fill="#1a1d22" stroke="#3a3d48" />
        <path d="M2 6 l3 6 2 -4 2 6" stroke="#22e58b" strokeWidth="1.5" fill="none" />
      </g>

      <Character outfit={outfit} tier={t} />

      {/* vignette */}
      <rect width="400" height="520" fill="url(#vignette)" />
      <defs>
        <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
          <stop offset=".6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".55" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export const Room = memo(RoomImpl);

/** Character only, cropped, for the wardrobe preview. */
export function CharacterPreview({ outfit, size = 180 }: { outfit: Outfit; size?: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="140 180 160 250" aria-label="Персонаж">
      <defs>
        <linearGradient id="rgbStroke" x1="0" x2="1">
          <stop offset="0" stopColor="#ff3d81" /><stop offset=".5" stopColor="#3fa7ff" /><stop offset="1" stopColor="#22e58b" />
        </linearGradient>
      </defs>
      <ellipse cx="214" cy="424" rx="60" ry="8" fill="#000" opacity=".35" />
      <Character outfit={outfit} tier={4} />
    </svg>
  );
}
