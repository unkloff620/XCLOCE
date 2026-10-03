"use client";
/*
 * Full-height player character built from layers on one 360×720 grid:
 *   BODY → PANTS → SHIRT → SHOES → HEAD → ACCESSORY → SPECIAL
 * A new piece of clothing is one more entry in WEAR (same grid) plus a catalog record in src/content/items.ts.
 */
import type { ReactNode } from "react";
import type { Slot } from "../../content/items.ts";
import { SLOTS, itemById } from "../../content/items.ts";
import { OL } from "./icons.tsx";
import { DEFAULT_LOOK, EYE_COLORS, HAIR_COLORS, SKIN_TONES, type Look } from "../../content/home.ts";

const W = 4; // outline width on this grid

/** a limb: thick rounded line with a dark outline */
function Limb({ d, color, width }: { d: string; color: string; width: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={OL} strokeWidth={width + W * 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

const ARM_L = "M114 284 C100 330 90 380 86 440";
const ARM_R = "M246 284 C260 330 270 380 274 440";
const LEG_L = "M146 470 L140 650";
const LEG_R = "M214 470 L220 650";
const TORSO = "M112 276 C140 256 220 256 248 276 L258 470 C220 482 140 482 102 470 Z";

/** darker / lighter shade of a #rrggbb colour */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

/** hair drawn BEHIND the head (long hair, bun) */
function HairBack({ style, color }: { style: string; color: string }) {
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
    default: // short
      return (
        <g>
          <path d="M96 140 C92 70 140 50 180 52 C226 50 270 72 264 140 C252 112 236 98 214 96 C206 110 186 116 160 110 C140 112 116 116 96 140 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
          <path d="M150 74 C164 66 186 64 200 70" stroke={hl} strokeWidth="6" strokeLinecap="round" fill="none" />
        </g>
      );
  }
}

function Body({ look }: { look: Look }) {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[1];
  const SKIN = skin.base;
  const SKIN_D = skin.shade;
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const brow = shade(hair, -0.35);
  const iris = EYE_COLORS[look.eyes] ?? EYE_COLORS[0];
  return (
    <g>
      <Limb d={LEG_L} color={SKIN} width={42} />
      <Limb d={LEG_R} color={SKIN} width={42} />
      <ellipse cx="134" cy="668" rx="34" ry="17" fill={SKIN} stroke={OL} strokeWidth={W} />
      <ellipse cx="226" cy="668" rx="34" ry="17" fill={SKIN} stroke={OL} strokeWidth={W} />
      {/* underwear so an empty slot never looks naked */}
      <path d="M104 450 H256 L258 520 H188 L180 500 L172 520 H102 Z" fill="#6e75a6" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <Limb d={ARM_L} color={SKIN} width={32} />
      <Limb d={ARM_R} color={SKIN} width={32} />
      {/* hands with a thumb */}
      <circle cx="84" cy="452" r="21" fill={SKIN} stroke={OL} strokeWidth={W} />
      <circle cx="276" cy="452" r="21" fill={SKIN} stroke={OL} strokeWidth={W} />
      <path d="M96 440 C104 446 104 456 98 462" fill="none" stroke={SKIN_D} strokeWidth="4" strokeLinecap="round" />
      <path d="M264 440 C256 446 256 456 262 462" fill="none" stroke={SKIN_D} strokeWidth="4" strokeLinecap="round" />
      <path d={TORSO} fill="#9aa0c8" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      {/* neck with a shadow under the chin */}
      <rect x="158" y="222" width="44" height="50" rx="12" fill={SKIN} stroke={OL} strokeWidth={W} />
      <path d="M162 236 C172 246 188 246 198 236" fill={SKIN_D} />
      <HairBack style={look.hair} color={hair} />
      {/* ears */}
      <circle cx="94" cy="160" r="20" fill={SKIN} stroke={OL} strokeWidth={W} />
      <circle cx="266" cy="160" r="20" fill={SKIN} stroke={OL} strokeWidth={W} />
      <path d="M92 152 C86 158 88 168 96 170" fill="none" stroke={SKIN_D} strokeWidth="4" strokeLinecap="round" />
      <path d="M268 152 C274 158 272 168 264 170" fill="none" stroke={SKIN_D} strokeWidth="4" strokeLinecap="round" />
      {/* head + jaw shading */}
      <circle cx="180" cy="150" r="88" fill={SKIN} stroke={OL} strokeWidth={W} />
      <path d="M104 190 C126 236 234 236 256 190 C236 222 124 222 104 190 Z" fill={SKIN_D} opacity="0.45" />
      <HairFront style={look.hair} color={hair} />
      {/* eyes: white, coloured iris, pupil, two highlights */}
      <g className="blink">
        <ellipse cx="150" cy="164" rx="16" ry="19" fill="#fff" stroke={OL} strokeWidth={W} />
        <ellipse cx="210" cy="164" rx="16" ry="19" fill="#fff" stroke={OL} strokeWidth={W} />
        <circle cx="153" cy="168" r="10" fill={iris} stroke={OL} strokeWidth="2" />
        <circle cx="213" cy="168" r="10" fill={iris} stroke={OL} strokeWidth="2" />
        <circle cx="153" cy="168" r="4.6" fill={OL} />
        <circle cx="213" cy="168" r="4.6" fill={OL} />
        <circle cx="157" cy="163" r="3" fill="#fff" />
        <circle cx="217" cy="163" r="3" fill="#fff" />
        <circle cx="149" cy="172" r="1.4" fill="#fff" opacity="0.8" />
        <circle cx="209" cy="172" r="1.4" fill="#fff" opacity="0.8" />
      </g>
      {/* brows, nose, mouth, cheeks */}
      <path d="M130 136 C142 128 158 130 168 138" stroke={brow} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M230 136 C218 128 202 130 192 138" stroke={brow} strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M178 176 C172 190 174 196 184 196" fill="none" stroke={SKIN_D} strokeWidth="5" strokeLinecap="round" />
      <path d="M154 206 C166 220 194 220 206 206 C196 212 164 212 154 206 Z" fill="#7a2a36" stroke={OL} strokeWidth="4" strokeLinejoin="round" />
      <path d="M162 209 C172 213 188 213 198 209" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="122" cy="196" rx="13" ry="7" fill="#ff8a9e" opacity="0.5" />
      <ellipse cx="238" cy="196" rx="13" ry="7" fill="#ff8a9e" opacity="0.5" />
    </g>
  );
}

function Shirt({ color, long, hood, children }: { color: string; long?: boolean; hood?: boolean; children?: ReactNode }) {
  return (
    <g>
      {hood && <path d="M120 286 C110 236 250 236 240 286 Z" fill={color} stroke={OL} strokeWidth={W} />}
      <Limb d={long ? ARM_L.replace("86 440", "88 430") : "M114 284 C106 306 100 326 98 346"} color={color} width={long ? 38 : 42} />
      <Limb d={long ? ARM_R.replace("274 440", "272 430") : "M246 284 C254 306 260 326 262 346"} color={color} width={long ? 38 : 42} />
      <path d={TORSO} fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <path d="M150 262 C162 280 198 280 210 262" fill="none" stroke={OL} strokeWidth={W} strokeLinecap="round" />
      <path d="M126 300 C122 350 122 400 124 440" stroke="rgba(255,255,255,0.35)" strokeWidth="9" strokeLinecap="round" fill="none" />
      {children}
    </g>
  );
}

function Pants({ color, short }: { color: string; short?: boolean }) {
  const end = short ? 560 : 640;
  return (
    <g>
      <Limb d={`M146 476 L${short ? 144 : 140} ${end}`} color={color} width={54} />
      <Limb d={`M214 476 L${short ? 216 : 220} ${end}`} color={color} width={54} />
      <path d="M100 450 H260 L262 512 H98 Z" fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <path d="M100 466 H260" stroke={OL} strokeWidth="3" />
      <path d="M180 470 V510" stroke={OL} strokeWidth="3" />
    </g>
  );
}

function Shoes({ color, sole, flat }: { color: string; sole: string; flat?: boolean }) {
  const one = (x: number, flip: number) => (
    <g transform={`translate(${x} 0) scale(${flip} 1)`}>
      <path d={flat ? "M-40 664 C-40 650 30 650 40 664 Z" : "M-36 662 C-36 636 -10 630 6 640 C20 646 40 650 42 664 Z"} fill={color} stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <rect x="-42" y="662" width="86" height="14" rx="7" fill={sole} stroke={OL} strokeWidth={W} />
      {!flat && <path d="M-12 642 L-2 652 M-22 646 L-12 656" stroke={OL} strokeWidth="3.5" strokeLinecap="round" />}
    </g>
  );
  return (
    <g>
      {one(134, -1)}
      {one(226, 1)}
    </g>
  );
}

const WEAR: Record<string, () => ReactNode> = {
  "tee-white": () => <Shirt color="#f2f3fb" />,
  "tee-pump": () => (
    <Shirt color="#2ee88a">
      <path d="M136 410 L164 372 L182 392 L220 340 M196 340 H220 V364" fill="none" stroke={OL} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </Shirt>
  ),
  "hoodie-hodl": () => (
    <Shirt color="#8d6bff" long hood>
      <path d="M136 400 H224 L230 452 H130 Z" fill="#7552e8" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <text x="180" y="374" textAnchor="middle" fontSize="40" fontWeight="900" fill="#ffcc33" stroke={OL} strokeWidth="2.5" fontFamily="var(--font-display), sans-serif">HODL</text>
      <path d="M166 278 L162 330 M194 278 L198 330" stroke="#f2f3fb" strokeWidth="5" strokeLinecap="round" />
    </Shirt>
  ),
  jeans: () => <Pants color="#3d6fd6" />,
  "shorts-remote": () => <Pants color="#ff8a3d" short />,
  sneakers: () => <Shoes color="#f2f3fb" sole="#ff4d6d" />,
  slippers: () => <Shoes color="#3fd2ff" sole="#2c3566" flat />,
  "cap-moon": () => (
    <g>
      <path d="M96 116 C96 52 140 36 180 36 C222 36 266 52 264 116 Z" fill="#151933" stroke={OL} strokeWidth={W} />
      <path d="M220 112 H320 C316 132 270 136 224 128 Z" fill="#151933" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <path d="M166 92 L180 60 L194 92 L180 84 Z" fill="#ffcc33" stroke={OL} strokeWidth="3" strokeLinejoin="round" />
    </g>
  ),
  "santa-hat": () => (
    <g>
      <path d="M100 112 C110 50 170 20 250 40 L282 120" fill="#ff4d6d" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <rect x="88" y="98" width="184" height="34" rx="17" fill="#f2f3fb" stroke={OL} strokeWidth={W} />
      <circle cx="286" cy="124" r="20" fill="#f2f3fb" stroke={OL} strokeWidth={W} />
    </g>
  ),
  "laser-eyes": () => (
    <g className="laser">
      <path d="M150 166 L-40 120 M210 166 L400 120" stroke="#ff4d6d" strokeWidth="16" strokeLinecap="round" opacity="0.45" />
      <path d="M150 166 L-40 120 M210 166 L400 120" stroke="#ffd0d8" strokeWidth="5" strokeLinecap="round" />
      <circle cx="153" cy="166" r="9" fill="#ff4d6d" />
      <circle cx="213" cy="166" r="9" fill="#ff4d6d" />
    </g>
  ),
  "gold-chain": () => (
    <g>
      <path d="M140 266 C142 320 160 344 180 344 C200 344 218 320 220 266" fill="none" stroke={OL} strokeWidth="13" strokeLinecap="round" />
      <path d="M140 266 C142 320 160 344 180 344 C200 344 218 320 220 266" fill="none" stroke="#ffcc33" strokeWidth="7" strokeLinecap="round" strokeDasharray="10 6" />
      <rect x="164" y="334" width="32" height="32" rx="5" fill="#ffcc33" stroke={OL} strokeWidth={W} />
      <text x="180" y="358" textAnchor="middle" fontSize="18" fontWeight="900" fill={OL} fontFamily="sans-serif">₿</text>
    </g>
  ),
};

export function Character({ equipped, look = DEFAULT_LOOK, size = 220, className, breathe = true }: { equipped: Partial<Record<Slot | string, string>>; look?: Look; size?: number; className?: string; breathe?: boolean }) {
  // a worn item may hide other slots (a hoodie over a shirt)
  const hidden = new Set<Slot>();
  for (const id of Object.values(equipped)) for (const h of (id ? itemById(id)?.hides : undefined) ?? []) hidden.add(h);
  return (
    <svg className={className} viewBox="0 0 360 720" width={size / 2} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      {/* soft shadow on the floor: the character stands, not floats */}
      <ellipse cx="180" cy="684" rx="120" ry="16" fill="rgba(0,0,0,0.28)" />
      <g className={breathe ? "breath" : undefined}>
      {SLOTS.map((slot) => {
        if (slot === "BODY") return <Body key="BODY" look={look} />;
        const id = equipped[slot];
        if (!id || hidden.has(slot)) return null;
        const draw = WEAR[id];
        return draw ? <g key={slot}>{draw()}</g> : null;
      })}
      </g>
    </svg>
  );
}
