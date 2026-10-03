"use client";
/*
 * Player character, redrawn from the reference art (public domain of the project, traced into vector layers).
 * Coordinates are the reference's 1024×1536 pixels; the visible window is 768×1536 around the figure.
 * Layers bottom → top: body (skin, shading, line art, eyes) → base shorts → PANTS → SHIRT → SHOES → hair → HEAD → ACCESSORY.
 * Clothes reuse traced regions (tank, shorts, arms, legs, feet) so every item sits exactly on the body.
 */
import type { ReactNode } from "react";
import type { Slot } from "../../content/items.ts";
import { SLOTS, itemById } from "../../content/items.ts";
import { OL } from "./icons.tsx";
import { DEFAULT_LOOK, EYE_COLORS, HAIR_COLORS, SKIN_TONES, type Look } from "../../content/home.ts";
import * as P from "./hero-paths.ts";

const W = 4; // outline width used by the old 360×720 hair/hat shapes
const INK = "#120c0a";
/** old hair and hats were drawn for a head at (180,150); the traced head sits at (512,111) */
const HEAD_SHIFT = "translate(332 -39)";

/** darker / lighter shade of a #rrggbb colour */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

/** hair drawn BEHIND the head (long hair, bun) */
function HairBack({ style, color }: { style: string; color: string }) {
  if (style === "bald") return null;
  if (style === "long") {
    return <path d="M90 150 C80 70 130 44 180 44 C232 44 282 70 270 150 L282 300 C250 318 214 312 200 300 L160 300 C146 312 110 318 78 300 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />;
  }
  if (style === "bun") {
    return <circle cx="180" cy="50" r="34" fill={color} stroke={OL} strokeWidth={W} />;
  }
  return null;
}

/** hair drawn OVER the head */
function HairFront({ style, color }: { style: string; color: string }) {
  const hl = shade(color, 0.35);
  switch (style) {
    case "messy":
      return (
        <g>
          <path d="M92 146 C82 96 104 58 136 50 L146 30 L162 48 L178 22 L194 46 L214 28 L222 52 C258 58 280 96 268 146 C256 118 238 104 220 100 L210 120 L196 102 L178 124 L164 104 L146 122 L136 104 C118 110 102 124 92 146 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
          <path d="M150 70 C164 62 186 62 200 68" stroke={hl} strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
      );
    case "buzz":
      return <path d="M94 138 C94 84 130 60 180 60 C230 60 266 84 266 138 C250 114 220 104 180 104 C140 104 110 114 94 138 Z" fill={color} opacity="0.88" stroke={OL} strokeWidth={W} strokeLinejoin="round" />;
    case "long":
      return (
        <g>
          <path d="M94 150 C86 76 136 48 180 50 C226 48 276 76 266 150 C258 120 240 100 214 92 C196 112 160 118 128 108 C112 118 100 132 94 150 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
          <path d="M146 70 C162 60 190 60 206 66" stroke={hl} strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
      );
    case "mohawk":
      return (
        <g>
          <path d="M96 136 C98 92 130 66 180 66 C230 66 262 92 264 136 C246 116 220 106 180 106 C140 106 114 116 96 136 Z" fill={shade(color, -0.35)} opacity="0.7" />
          <path d="M156 106 L150 60 L164 70 L162 22 L180 44 L192 8 L200 44 L214 26 L210 70 L222 62 L206 106 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
        </g>
      );
    case "curly":
      return (
        <g fill={color} stroke={OL} strokeWidth={W}>
          {[[104, 120, 22], [116, 88, 24], [142, 66, 26], [178, 56, 28], [214, 66, 26], [242, 88, 24], [256, 120, 22], [160, 96, 20], [200, 96, 20]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}
          <path d="M126 80 C150 70 210 70 234 80" stroke={hl} strokeWidth="5" strokeLinecap="round" fill="none" />
        </g>
      );
    case "bun":
      return (
        <g>
          <path d="M94 140 C90 84 134 60 180 60 C226 60 270 84 266 140 C254 116 230 102 180 102 C130 102 106 116 94 140 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
          <path d="M150 74 C164 66 196 66 210 74" stroke={hl} strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
      );
    case "bald":
      return null;
    default: // short
      return (
        <g>
          <path d="M96 140 C92 70 140 50 180 52 C226 50 270 72 264 140 C252 112 236 98 214 96 C206 110 186 116 160 110 C140 112 116 116 96 140 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
          <path d="M150 74 C164 66 186 64 200 70" stroke={hl} strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
      );
  }
}


/* ---------------- body ---------------- */
const EYES = [
  { cx: 475, cy: 143, ex: 471, ey: 144 },
  { cx: 550, cy: 142, ex: 552, ey: 144 },
];

function Body({ look }: { look: Look }) {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[1];
  const iris = EYE_COLORS[look.eyes] ?? EYE_COLORS[0];
  return (
    <g>
      <path d={P.SIL} fill={skin.base} />
      <path d={P.SHADE} fill={skin.shade} />
      <path d={P.EYES_WHITE} fill="#fbfbfb" />
      <path d={P.LINES_SKIN} fill={INK} fillRule="evenodd" />
      {/* coloured irises on top of the traced ones, kept inside the eye opening */}
      <g className="blink">
        {EYES.map((e, i) => (
          <g key={i}>
            <clipPath id={`eye-clip-${i}`}><ellipse cx={e.ex} cy={e.ey} rx="19" ry="8" /></clipPath>
            <g clipPath={`url(#eye-clip-${i})`}>
              <circle cx={e.cx} cy={e.cy} r="10.5" fill={iris} />
              <circle cx={e.cx} cy={e.cy} r="4.6" fill={INK} />
              <circle cx={e.cx - 5} cy={e.cy - 3.5} r="2.6" fill="#fff" />
            </g>
          </g>
        ))}
      </g>
      {/* base shorts: an empty pants slot never looks naked */}
      <path d={P.SHORTS} fill="#343135" />
      <path d={P.SHORTS_DARK} fill="#1d1b1f" />
      <path d={P.LINES_SHORTS} fill={INK} fillRule="evenodd" />
    </g>
  );
}

/* ---------------- clothes on the traced regions ---------------- */
const outlined = { stroke: INK, strokeWidth: 9, strokeLinejoin: "round" as const, paintOrder: "stroke" as const };

function Tank({ color, shadeColor, children }: { color: string; shadeColor: string; children?: ReactNode }) {
  return (
    <g>
      <path d={P.TANK} fill={color} />
      <path d={P.TANK_SHADE} fill={shadeColor} />
      <path d={P.LINES_TANK} fill={INK} fillRule="evenodd" />
      {children}
    </g>
  );
}

function Shorts({ color, dark }: { color: string; dark: string }) {
  return (
    <g>
      <path d={P.SHORTS} fill={color} />
      <path d={P.SHORTS_DARK} fill={dark} />
      <path d={P.LINES_SHORTS} fill={INK} fillRule="evenodd" />
    </g>
  );
}

function Shoes({ upper, sole, strapOnly }: { upper: string; sole: string; strapOnly?: boolean }) {
  return (
    <g>
      <clipPath id="feet-clip"><path d={P.FEET} /></clipPath>
      {strapOnly ? (
        <g>
          <g clipPath="url(#feet-clip)">
            <rect x="200" y="1474" width="640" height="40" fill={sole} />
            <rect x="200" y="1418" width="640" height="30" fill={upper} />
          </g>
          <path d="M290 1418 H420 M600 1418 H740 M290 1448 H420 M600 1448 H740" stroke={INK} strokeWidth="5" clipPath="url(#feet-clip)" />
        </g>
      ) : (
        <g>
          <path d={P.FEET} fill={upper} {...outlined} />
          <g clipPath="url(#feet-clip)">
            <rect x="200" y="1468" width="640" height="40" fill={sole} />
            <path d="M200 1468 H840" stroke={INK} strokeWidth="5" />
            <path d="M330 1420 L360 1440 M340 1404 L370 1424 M690 1420 L660 1440 M680 1404 L650 1424" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          </g>
        </g>
      )}
    </g>
  );
}

const WEAR: Record<string, () => ReactNode> = {
  "tee-white": () => <Tank color="#fcfcfc" shadeColor="#cfd0d6" />,
  "tee-pump": () => (
    <Tank color="#2ee88a" shadeColor="#21b46a">
      <path d="M452 590 L494 530 L522 560 L578 480 M548 480 H578 V510" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
    </Tank>
  ),
  "hoodie-hodl": () => (
    <g>
      <path d={P.ARMS} fill="#8d6bff" {...outlined} />
      <path d="M248 820 H312 M712 820 H782" stroke="#7552e8" strokeWidth="18" strokeLinecap="round" />
      <Tank color="#8d6bff" shadeColor="#7552e8">
        <path d="M430 300 C440 250 584 250 594 300" fill="none" stroke={INK} strokeWidth="34" strokeLinecap="round" />
        <path d="M430 300 C440 250 584 250 594 300" fill="none" stroke="#7552e8" strokeWidth="22" strokeLinecap="round" />
        <path d="M430 640 H594 L604 720 H420 Z" fill="#7552e8" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        <text x="512" y="560" textAnchor="middle" fontSize="62" fontWeight="900" fill="#ffcc33" stroke={INK} strokeWidth="4" paintOrder="stroke" fontFamily="var(--font-display), sans-serif">HODL</text>
        <path d="M494 300 L488 380 M530 300 L536 380" stroke="#f2f3fb" strokeWidth="7" strokeLinecap="round" />
      </Tank>
    </g>
  ),
  jeans: () => (
    <g>
      <path d={P.JEANS} fill="#3d6fd6" {...outlined} />
      <path d="M512 760 V950 M512 950 C506 1100 500 1250 498 1380 M512 950 C518 1100 524 1250 526 1380" fill="none" stroke="#2a52a8" strokeWidth="6" />
      <path d="M350 762 H676" stroke={INK} strokeWidth="5" />
      <path d="M392 1370 H442 M582 1370 H632" stroke="#2a52a8" strokeWidth="8" strokeLinecap="round" />
    </g>
  ),
  "shorts-remote": () => <Shorts color="#ff8a3d" dark="#d0661f" />,
  sneakers: () => <Shoes upper="#f2f3fb" sole="#ff4d6d" />,
  slippers: () => <Shoes upper="#3fd2ff" sole="#2c3566" strapOnly />,
  "cap-moon": () => (
    <g transform={HEAD_SHIFT}>
      <path d="M96 116 C96 52 140 36 180 36 C222 36 266 52 264 116 Z" fill="#151933" stroke={OL} strokeWidth={W} />
      <path d="M220 112 H320 C316 132 270 136 224 128 Z" fill="#151933" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <path d="M166 92 L180 60 L194 92 L180 84 Z" fill="#ffcc33" stroke={OL} strokeWidth="3" strokeLinejoin="round" />
    </g>
  ),
  "santa-hat": () => (
    <g transform={HEAD_SHIFT}>
      <path d="M100 112 C110 50 170 20 250 40 L282 120" fill="#ff4d6d" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <rect x="88" y="98" width="184" height="34" rx="17" fill="#f2f3fb" stroke={OL} strokeWidth={W} />
      <circle cx="286" cy="124" r="20" fill="#f2f3fb" stroke={OL} strokeWidth={W} />
    </g>
  ),
  "laser-eyes": () => (
    <g className="laser">
      <path d="M475 143 L-200 60 M550 142 L1220 60" stroke="#ff4d6d" strokeWidth="22" strokeLinecap="round" opacity="0.45" />
      <path d="M475 143 L-200 60 M550 142 L1220 60" stroke="#ffd0d8" strokeWidth="7" strokeLinecap="round" />
      <circle cx="475" cy="143" r="10" fill="#ff4d6d" />
      <circle cx="550" cy="142" r="10" fill="#ff4d6d" />
    </g>
  ),
  "gold-chain": () => (
    <g>
      <path d="M454 296 C458 360 486 404 512 404 C538 404 566 360 570 296" fill="none" stroke={INK} strokeWidth="16" strokeLinecap="round" />
      <path d="M454 296 C458 360 486 404 512 404 C538 404 566 360 570 296" fill="none" stroke="#ffcc33" strokeWidth="9" strokeLinecap="round" strokeDasharray="12 7" />
      <rect x="490" y="394" width="44" height="44" rx="7" fill="#ffcc33" stroke={INK} strokeWidth="5" />
      <text x="512" y="427" textAnchor="middle" fontSize="28" fontWeight="900" fill={INK} fontFamily="sans-serif">₿</text>
    </g>
  ),
};

export function Character({ equipped, look = DEFAULT_LOOK, size = 220, className, breathe = true }: { equipped: Partial<Record<Slot | string, string>>; look?: Look; size?: number; className?: string; breathe?: boolean }) {
  // a worn item may hide other slots (a hoodie over a shirt)
  const hidden = new Set<Slot>();
  for (const id of Object.values(equipped)) for (const h of (id ? itemById(id)?.hides : undefined) ?? []) hidden.add(h);
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const layer = (slot: Slot) => {
    const id = equipped[slot];
    if (!id || hidden.has(slot)) return null;
    const draw = WEAR[id];
    return draw ? <g key={slot}>{draw()}</g> : null;
  };
  return (
    <svg className={className} viewBox="128 0 768 1536" width={size / 2} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      {/* shadow on the floor: the character stands, not floats */}
      <ellipse cx="512" cy="1494" rx="250" ry="28" fill="rgba(0,0,0,0.3)" />
      <g className={breathe ? "breath" : undefined}>
        <g transform={HEAD_SHIFT}><HairBack style={look.hair} color={hair} /></g>
        <Body look={look} />
        {SLOTS.filter((s) => s === "PANTS" || s === "SHIRT" || s === "SHOES").map(layer)}
        <g transform={HEAD_SHIFT}><HairFront style={look.hair} color={hair} /></g>
        {SLOTS.filter((s) => s === "HEAD" || s === "ACCESSORY" || s === "SPECIAL").map(layer)}
      </g>
    </svg>
  );
}
