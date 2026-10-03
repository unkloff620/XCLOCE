"use client";
/*
 * Player rooms (400×560). Three rooms with their own furniture and one shared "station" on the right:
 * desk + main monitor + upgradable equipment (second monitor, chair, PC, RGB). Equipment the player does not own
 * is drawn as a dashed ghost with a "+" so it is clear what can be bought.
 */
import type { ReactNode } from "react";
import { OL } from "./icons.tsx";

const s = (w = 4) => ({ stroke: OL, strokeWidth: w, strokeLinejoin: "round" as const, strokeLinecap: "round" as const });
const ghost = { fill: "rgba(255,255,255,0.04)", stroke: "rgba(220,225,255,0.45)", strokeWidth: 3, strokeDasharray: "8 6" };

/* ---------------- shared pieces ---------------- */
function Rug({ color, pattern }: { color: string; pattern: string }) {
  return (
    <g>
      <ellipse cx="200" cy="512" rx="140" ry="32" fill={color} {...s()} />
      <ellipse cx="200" cy="512" rx="112" ry="22" fill="none" stroke={pattern} strokeWidth="5" strokeDasharray="14 8" />
    </g>
  );
}

function Plus({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="13" fill="#ffcc33" {...s(3)} />
      <path d={`M${x - 6} ${y} H${x + 6} M${x} ${y - 6} V${y + 6}`} stroke={OL} strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

function LevelBadge({ x, y, lv }: { x: number; y: number; lv: number }) {
  return (
    <g>
      <rect x={x - 13} y={y - 10} width="26" height="20" rx="6" fill={lv >= 3 ? "#ffcc33" : lv === 2 ? "#3fd2ff" : "#2ee88a"} {...s(2.5)} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="900" fill={OL} fontFamily="var(--font-display), sans-serif">{["", "I", "II", "III"][lv] ?? lv}</text>
    </g>
  );
}

function Hot({ id, onPick, children, label }: { id: string; onPick?: (id: string) => void; children: ReactNode; label: string }) {
  if (!onPick) return <g>{children}</g>;
  return (
    <g role="button" aria-label={label} tabIndex={0} style={{ cursor: "pointer" }} onClick={() => onPick(id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(id)}>
      {children}
    </g>
  );
}

/** Station: desk, main monitor and the four upgradable things. */
function Station({ levels, onPick, desk }: { levels: Record<string, number>; onPick?: (id: string) => void; desk: string }) {
  const m2 = levels.monitor2 ?? 0;
  const chair = levels.chair ?? 0;
  const pc = levels.pc ?? 0;
  const rgb = levels.rgb ?? 0;
  const rgbColors = ["#ff4d6d", "#ffcc33", "#2ee88a", "#3fd2ff", "#8d6bff"];
  return (
    <g>
      {/* RGB strip along the ceiling and the desk */}
      <Hot id="rgb" onPick={onPick} label="RGB-подсветка">
        {rgb > 0 ? (
          <g className="rgb-glow">
            <rect x="0" y="0" width="400" height="10" fill="url(#rgb-strip)" />
            <rect x="262" y="330" width="134" height="6" fill="url(#rgb-strip)" />
            <ellipse cx="330" cy="420" rx="70" ry="10" fill="url(#rgb-strip)" opacity="0.35" />
            <LevelBadge x={232} y={22} lv={rgb} />
          </g>
        ) : (
          <g>
            <rect x="262" y="330" width="134" height="6" {...ghost} />
            <Plus x={232} y={22} />
          </g>
        )}
        <defs>
          <linearGradient id="rgb-strip" x1="0" y1="0" x2="1" y2="0">
            {rgbColors.map((c, i) => <stop key={c} offset={i / (rgbColors.length - 1)} stopColor={c} />)}
          </linearGradient>
        </defs>
      </Hot>

      {/* desk */}
      <rect x="262" y="330" width="134" height="16" rx="4" fill={desk} {...s()} />
      <path d="M276 346 V420 M384 346 V420" stroke={OL} strokeWidth="7" />
      <path d="M276 346 V420 M384 346 V420" stroke={desk} strokeWidth="3" />

      {/* PC tower under the desk */}
      <Hot id="pc" onPick={onPick} label="Мощный системник">
        <g transform="translate(-66 0)">
        {pc > 0 ? (
          <g>
            <rect x="338" y="352" width="42" height="66" rx="5" fill="#151933" {...s()} />
            <rect x="344" y="358" width="30" height="40" rx="3" fill="#0b1030" stroke={OL} strokeWidth="2" />
            {[0, 1].map((k) => (
              <g key={k} className="fan" style={{ transformOrigin: `${359}px ${368 + k * 20}px` }}>
                <circle cx="359" cy={368 + k * 20} r="8" fill={pc >= 3 ? "#ff4d6d" : pc === 2 ? "#3fd2ff" : "#2ee88a"} opacity="0.85" />
                <path d={`M351 ${368 + k * 20} H367 M359 ${360 + k * 20} V${376 + k * 20}`} stroke={OL} strokeWidth="2" />
              </g>
            ))}
            <circle cx="372" cy="410" r="3" fill="#2ee88a" />
            <LevelBadge x={359} y={346} lv={pc} />
          </g>
        ) : (
          <g>
            <rect x="338" y="352" width="42" height="66" rx="5" {...ghost} />
            <Plus x={359} y={385} />
          </g>
        )}
        </g>
      </Hot>

      {/* main monitor (always there) */}
      <rect x="318" y="262" width="72" height="54" rx="6" fill="#0b1030" {...s()} />
      {[0, 1, 2, 3, 4].map((i) => {
        const h = [14, 22, 10, 26, 18][i];
        return <rect key={i} x={326 + i * 12} y={306 - h - i * 3} width="7" height={h} fill={i % 2 ? "#ff4d6d" : "#2ee88a"} />;
      })}
      <rect x="348" y="316" width="12" height="14" fill="#2c3566" {...s(3)} />
      {/* keyboard */}
      <rect x="306" y="322" width="70" height="9" rx="3" fill="#c9ceea" {...s(2.5)} />

      {/* second monitor */}
      <Hot id="monitor2" onPick={onPick} label="Второй монитор">
        {m2 > 0 ? (
          <g>
            <g transform="rotate(-6 290 290)">
              <rect x="262" y="264" width="58" height="46" rx="6" fill="#0b1030" {...s()} />
              <path d="M268 300 L282 288 L292 294 L310 274" fill="none" stroke="#3fd2ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {m2 >= 2 && <text x="291" y="282" textAnchor="middle" fontSize="10" fontWeight="900" fill="#ffcc33" fontFamily="sans-serif">CRIT</text>}
            </g>
            <rect x="284" y="310" width="10" height="20" fill="#2c3566" {...s(3)} />
            <LevelBadge x={278} y={258} lv={m2} />
          </g>
        ) : (
          <g>
            <rect x="262" y="264" width="58" height="46" rx="6" {...ghost} />
            <Plus x={291} y={287} />
          </g>
        )}
      </Hot>

      {/* gaming chair in front of the desk */}
      <Hot id="chair" onPick={onPick} label="Геймерское кресло">
        <g transform="translate(40 40)">
        {chair > 0 ? (
          <g>
            <path d="M296 300 C296 284 340 284 340 300 L338 386 H298 Z" fill={chair >= 3 ? "#ffcc33" : chair === 2 ? "#8d6bff" : "#ff4d6d"} {...s()} />
            <path d="M306 304 C306 296 330 296 330 304 L328 360 H308 Z" fill="#151933" opacity="0.55" />
            <rect x="290" y="382" width="56" height="16" rx="6" fill="#151933" {...s()} />
            <path d="M318 398 V426 M300 432 H336" stroke={OL} strokeWidth="6" strokeLinecap="round" />
            <circle cx="300" cy="434" r="5" fill="#2c3566" {...s(2)} />
            <circle cx="336" cy="434" r="5" fill="#2c3566" {...s(2)} />
            <LevelBadge x={318} y={294} lv={chair} />
          </g>
        ) : (
          <g>
            <path d="M296 300 C296 284 340 284 340 300 L338 386 H298 Z" {...ghost} />
            <Plus x={318} y={340} />
          </g>
        )}
        </g>
      </Hot>
    </g>
  );
}

/* ---------------- room 1: Каморка ---------------- */
function Basic() {
  return (
    <g>
      <defs>
        <linearGradient id="r1-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#343b82" />
          <stop offset="1" stopColor="#1d2150" />
        </linearGradient>
        <pattern id="r1-paper" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="transparent" />
          <path d="M20 8 L24 16 L20 24 L16 16 Z" fill="rgba(255,255,255,0.05)" />
        </pattern>
      </defs>
      <rect width="400" height="420" fill="url(#r1-wall)" />
      <rect width="400" height="420" fill="url(#r1-paper)" />
      {/* window with curtains and the night city */}
      <rect x="26" y="66" width="134" height="154" rx="10" fill="#0b1030" {...s()} />
      <clipPath id="r1-win"><rect x="30" y="70" width="126" height="146" rx="7" /></clipPath>
      <g clipPath="url(#r1-win)">
        <rect x="30" y="70" width="126" height="146" fill="#141a45" />
        <circle cx="128" cy="100" r="14" fill="#fff6c2" />
        <circle cx="124" cy="96" r="14" fill="#141a45" />
        {[[34, 150, 22, 66], [58, 126, 20, 90], [80, 160, 26, 56], [108, 140, 22, 76], [132, 118, 24, 98]].map(([x, y, w, h]) => (
          <g key={x}>
            <rect x={x} y={y} width={w} height={h} fill="#1e2557" stroke={OL} strokeWidth="2" />
            {Array.from({ length: Math.floor(h / 16) }, (_, k) => <rect key={k} x={x + 5} y={y + 6 + k * 16} width="5" height="6" fill={k % 3 ? "#ffcc33" : "#3d4380"} />)}
          </g>
        ))}
        <path d="M34 200 L60 186 L80 194 L104 166 L124 174 L152 140" fill="none" stroke="#2ee88a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M93 68 V218 M28 143 H158" stroke={OL} strokeWidth="5" />
      <path d="M18 60 H170" stroke={OL} strokeWidth="6" strokeLinecap="round" />
      <path d="M22 62 C34 120 18 180 30 232 H48 C40 180 54 120 44 62 Z" fill="#c2384f" {...s(3)} />
      <path d="M166 62 C154 120 170 180 158 232 H140 C148 180 134 120 144 62 Z" fill="#c2384f" {...s(3)} />
      <rect x="18" y="226" width="150" height="14" rx="5" fill="#c9ceea" {...s()} />
      {/* poster in the middle */}
      <g transform="rotate(-3 210 120)">
        <rect x="176" y="62" width="70" height="92" rx="5" fill="#ffcc33" {...s()} />
        <path d="M211 76 L222 100 H200 Z" fill="#ff4d6d" {...s(2.5)} />
        <rect x="204" y="100" width="14" height="18" fill="#e8ebff" {...s(2.5)} />
        <path d="M207 118 L211 128 L215 118" fill="#ff8a3d" {...s(2.5)} />
        <text x="211" y="146" textAnchor="middle" fontSize="14" fontWeight="900" fill={OL} fontFamily="var(--font-display), sans-serif">HODL</text>
      </g>
      {/* wall clock */}
      <circle cx="210" cy="196" r="18" fill="#e8ebff" {...s(3)} />
      <path d="M210 196 V184 M210 196 L219 200" stroke={OL} strokeWidth="3" strokeLinecap="round" />
      {/* plant in the corner */}
      <g>
        <path d="M36 330 C30 290 50 278 58 262 M58 330 C60 292 80 284 86 266 M48 330 C40 300 20 296 14 278" fill="none" stroke={OL} strokeWidth="10" strokeLinecap="round" />
        <path d="M36 330 C30 290 50 278 58 262 M58 330 C60 292 80 284 86 266 M48 330 C40 300 20 296 14 278" fill="none" stroke="#2ee88a" strokeWidth="5" strokeLinecap="round" />
        {[[58, 262, -30], [86, 266, -40], [14, 278, 30]].map(([x, y, r]) => <ellipse key={x} cx={x} cy={y} rx="13" ry="7" fill="#2ee88a" {...s(3)} transform={`rotate(${r} ${x} ${y})`} />)}
        <path d="M22 330 H76 L70 376 H28 Z" fill="#ff8a3d" {...s()} />
        <path d="M24 342 H74" stroke={OL} strokeWidth="3" />
      </g>
      {/* skirting and wooden floor */}
      <rect x="0" y="406" width="400" height="14" fill="#151933" />
      <path d="M0 420 H400 V560 H0 Z" fill="#8a5a2b" {...s()} />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M0 ${442 + i * 24} H400`} stroke="#6b4320" strokeWidth="3" />)}
      {Array.from({ length: 10 }, (_, i) => <path key={`v${i}`} d={`M${(i * 61 + (i % 2) * 30) % 400} ${442 + (i % 5) * 24} v24`} stroke="#6b4320" strokeWidth="3" />)}
      <Rug color="#8d6bff" pattern="#b9a4ff" />
    </g>
  );
}

/* ---------------- room 2: Офис трейдера ---------------- */
function Office() {
  return (
    <g>
      <defs>
        <linearGradient id="r2-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14404a" />
          <stop offset="1" stopColor="#0a2229" />
        </linearGradient>
        <linearGradient id="r2-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a5b" />
          <stop offset="0.6" stopColor="#8d3a7a" />
          <stop offset="1" stopColor="#2a1a4a" />
        </linearGradient>
      </defs>
      <rect width="400" height="420" fill="url(#r2-wall)" />
      {/* glass wall with a sunset skyline */}
      <rect x="14" y="40" width="236" height="200" rx="8" fill="url(#r2-sky)" {...s()} />
      <circle cx="96" cy="150" r="30" fill="#ffd27a" opacity="0.9" />
      {[[20, 150, 30, 90], [52, 120, 24, 120], [78, 170, 28, 70], [108, 100, 30, 140], [140, 140, 22, 100], [164, 112, 34, 128], [200, 160, 26, 80], [226, 130, 22, 110]].map(([x, y, w, h]) => (
        <g key={x}>
          <rect x={x} y={y} width={w} height={h} fill="#1a1236" />
          {Array.from({ length: Math.floor(h / 14) }, (_, k) => <rect key={k} x={x + 4} y={y + 6 + k * 14} width={w - 8} height="3" fill={k % 2 ? "#ffcc33" : "rgba(255,204,51,0.25)"} />)}
        </g>
      ))}
      <path d="M93 40 V240 M172 40 V240" stroke={OL} strokeWidth="5" />
      <path d="M20 60 L60 44 M110 70 L160 48" stroke="rgba(255,255,255,0.35)" strokeWidth="5" strokeLinecap="round" />
      {/* big ticker on the wall */}
      <rect x="258" y="40" width="34" height="200" rx="5" fill="#06161c" {...s(3)} />
      {["BTC", "SOL", "ETH", "DOGE", "PEPE"].map((t, i) => (
        <g key={t}>
          <text x="275" y={64 + i * 38} textAnchor="middle" fontSize="9" fontWeight="900" fill="#c9ceea" fontFamily="sans-serif">{t}</text>
          <text x="275" y={78 + i * 38} textAnchor="middle" fontSize="9" fontWeight="900" fill={i % 2 ? "#ff4d6d" : "#2ee88a"} fontFamily="sans-serif">{i % 2 ? "▼" : "▲"}{3 + i * 2}%</text>
        </g>
      ))}
      {/* coffee machine on a side table */}
      <rect x="20" y="330" width="80" height="12" rx="3" fill="#3a2a1a" {...s(3)} />
      <path d="M30 342 V404 M90 342 V404" stroke={OL} strokeWidth="5" />
      <rect x="34" y="276" width="52" height="54" rx="6" fill="#c9ceea" {...s()} />
      <rect x="44" y="286" width="32" height="14" rx="3" fill="#06161c" />
      <circle cx="52" cy="293" r="3" fill="#2ee88a" />
      <rect x="50" y="312" width="20" height="16" rx="3" fill="#fff" {...s(2.5)} />
      <path d="M56 306 C54 300 60 298 58 292" stroke="rgba(255,255,255,0.6)" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* tall plant */}
      <path d="M232 400 C226 340 240 300 220 262 M232 400 C238 344 258 318 262 286" fill="none" stroke="#1e7a48" strokeWidth="7" strokeLinecap="round" />
      {[[220, 262], [262, 286], [228, 310], [252, 330]].map(([x, y]) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx="16" ry="8" fill="#2ee88a" {...s(3)} transform={`rotate(${x > 240 ? -30 : 30} ${x} ${y})`} />)}
      <path d="M216 396 H250 L246 420 H220 Z" fill="#e8ebff" {...s(3)} />
      {/* carpet floor */}
      <rect x="0" y="406" width="400" height="14" fill="#06161c" />
      <path d="M0 420 H400 V560 H0 Z" fill="#2c3a4a" {...s()} />
      {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${i * 36} 420 L${i * 36 - 40} 560`} stroke="rgba(0,0,0,0.18)" strokeWidth="4" />)}
      <Rug color="#1f8a8a" pattern="#7ff0e6" />
    </g>
  );
}

/* ---------------- room 3: Пентхаус To The Moon ---------------- */
function Penthouse() {
  return (
    <g>
      <defs>
        <linearGradient id="r3-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1240" />
          <stop offset="1" stopColor="#140820" />
        </linearGradient>
        <radialGradient id="r3-space" cx="0.6" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#2b2a6e" />
          <stop offset="1" stopColor="#05051a" />
        </radialGradient>
        <linearGradient id="r3-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1a8" />
          <stop offset="0.5" stopColor="#ffcc33" />
          <stop offset="1" stopColor="#c98a12" />
        </linearGradient>
      </defs>
      <rect width="400" height="420" fill="url(#r3-wall)" />
      {/* panoramic window: the moon is close */}
      <path d="M14 250 V70 C14 40 40 26 70 26 H210 C240 26 258 40 258 70 V250 Z" fill="url(#r3-space)" {...s()} />
      {[[40, 60], [70, 110], [120, 50], [200, 90], [230, 160], [40, 200], [170, 210], [100, 160]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#fff" opacity="0.85" />)}
      <circle cx="176" cy="120" r="54" fill="#e9e6d6" {...s(3)} />
      {[[160, 100, 10], [196, 140, 13], [180, 96, 6], [150, 140, 7]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="#c9c4ad" />)}
      <circle cx="62" cy="214" r="20" fill="#3fa9ff" {...s(3)} />
      <path d="M52 204 C60 208 66 200 74 206 M48 220 C58 224 70 218 78 224" stroke="#2ee88a" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* rocket flying past */}
      <g transform="rotate(35 110 80)">
        <rect x="104" y="64" width="12" height="26" rx="6" fill="#e8ebff" {...s(2.5)} />
        <path d="M104 86 L98 96 L104 92 Z M116 86 L122 96 L116 92 Z" fill="#ff4d6d" {...s(2)} />
        <path d="M107 92 L110 104 L113 92" fill="#ffcc33" />
      </g>
      <path d="M136 26 V250" stroke={OL} strokeWidth="5" />
      <path d="M14 250 H258" stroke="url(#r3-gold)" strokeWidth="8" />
      {/* gold framed bitcoin painting */}
      <rect x="264" y="40" width="44" height="54" rx="4" fill="#140820" stroke="url(#r3-gold)" strokeWidth="6" />
      <text x="286" y="78" textAnchor="middle" fontSize="28" fontWeight="900" fill="#ffcc33" fontFamily="sans-serif">₿</text>
      {/* chandelier */}
      <path d="M200 0 V18" stroke="url(#r3-gold)" strokeWidth="4" />
      <path d="M176 18 H224 L214 34 H186 Z" fill="url(#r3-gold)" {...s(2.5)} />
      {[184, 200, 216].map((x) => <path key={x} d={`M${x} 34 l-4 10 h8 Z`} fill="#fff6c2" {...s(1.5)} />)}
      {/* velvet sofa */}
      <rect x="10" y="330" width="110" height="34" rx="12" fill="#8d2a5e" {...s()} />
      <rect x="18" y="352" width="94" height="40" rx="8" fill="#a8356f" {...s()} />
      <rect x="4" y="344" width="22" height="52" rx="8" fill="#8d2a5e" {...s()} />
      <rect x="104" y="344" width="22" height="52" rx="8" fill="#8d2a5e" {...s()} />
      <path d="M20 396 V408 M110 396 V408" stroke="url(#r3-gold)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="44" cy="346" r="9" fill="#ffcc33" {...s(2)} />
      {/* marble floor */}
      <rect x="0" y="406" width="400" height="14" fill="url(#r3-gold)" />
      <path d="M0 420 H400 V560 H0 Z" fill="#e8e4f0" {...s()} />
      {Array.from({ length: 6 }, (_, r) => Array.from({ length: 7 }, (_, c) => ((r + c) % 2 ? <rect key={`${r}${c}`} x={c * 60 - (r % 2) * 30} y={420 + r * 24} width="60" height="24" fill="#d4cfe0" /> : null)))}
      <path d="M30 440 C80 460 60 500 120 520 M260 430 C300 470 340 460 380 520" stroke="rgba(120,110,150,0.35)" strokeWidth="2" fill="none" />
      <Rug color="#ffcc33" pattern="#fff1a8" />
    </g>
  );
}

const BODIES: Record<string, () => ReactNode> = { basic: Basic, office: Office, penthouse: Penthouse };
const DESKS: Record<string, string> = { basic: "#5a3a1e", office: "#2a3640", penthouse: "#3a2a10" };

export function RoomScene({ room = "basic", levels = {}, onPick }: { room?: string; levels?: Record<string, number>; onPick?: (id: string) => void }) {
  const Body = BODIES[room] ?? Basic;
  return (
    <svg viewBox="0 0 400 560" width="100%" style={{ display: "block" }}>
      <Body />
      <Station levels={levels} onPick={onPick} desk={DESKS[room] ?? DESKS.basic} />
    </svg>
  );
}

/** Small preview of a room for the room picker. */
export function RoomThumb({ room }: { room: string }) {
  const Body = BODIES[room] ?? Basic;
  return (
    <svg viewBox="0 0 400 560" width="100%" style={{ display: "block" }} aria-hidden="true">
      <Body />
      <Station levels={{ monitor2: 1, chair: 1, pc: 1, rgb: 1 }} desk={DESKS[room] ?? DESKS.basic} />
    </svg>
  );
}
