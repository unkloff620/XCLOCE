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

const SKIN = "#f4c49c";
const SKIN_D = "#d99a6c";
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

function Body() {
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
      <circle cx="84" cy="452" r="21" fill={SKIN} stroke={OL} strokeWidth={W} />
      <circle cx="276" cy="452" r="21" fill={SKIN} stroke={OL} strokeWidth={W} />
      <path d={TORSO} fill="#9aa0c8" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <rect x="160" y="226" width="40" height="44" rx="10" fill={SKIN_D} stroke={OL} strokeWidth={W} />
      {/* head */}
      <circle cx="94" cy="160" r="20" fill={SKIN} stroke={OL} strokeWidth={W} />
      <circle cx="266" cy="160" r="20" fill={SKIN} stroke={OL} strokeWidth={W} />
      <circle cx="180" cy="150" r="88" fill={SKIN} stroke={OL} strokeWidth={W} />
      <path d="M96 140 C92 70 140 50 180 52 C226 50 270 72 264 140 C252 112 236 98 214 96 C206 110 186 116 160 110 C140 112 116 116 96 140 Z" fill="#4a2c1a" stroke={OL} strokeWidth={W} strokeLinejoin="round" />
      <path d="M150 74 C164 66 186 64 200 70" stroke="#7a4a2c" strokeWidth="6" strokeLinecap="round" fill="none" />
      <g className="blink">
        <ellipse cx="150" cy="162" rx="15" ry="18" fill="#fff" stroke={OL} strokeWidth={W} />
        <ellipse cx="210" cy="162" rx="15" ry="18" fill="#fff" stroke={OL} strokeWidth={W} />
        <circle cx="153" cy="166" r="8" fill={OL} />
        <circle cx="213" cy="166" r="8" fill={OL} />
        <circle cx="156" cy="162" r="2.6" fill="#fff" />
        <circle cx="216" cy="162" r="2.6" fill="#fff" />
      </g>
      <path d="M132 136 L166 140 M228 136 L194 140" stroke={OL} strokeWidth="7" strokeLinecap="round" />
      <path d="M156 202 C168 214 192 214 204 202" fill="none" stroke={OL} strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="124" cy="196" rx="12" ry="7" fill="#ff8a9e" opacity="0.55" />
      <ellipse cx="236" cy="196" rx="12" ry="7" fill="#ff8a9e" opacity="0.55" />
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

export function Character({ equipped, size = 220, className }: { equipped: Partial<Record<Slot, string>>; size?: number; className?: string }) {
  // a worn item may hide other slots (a hoodie over a shirt)
  const hidden = new Set<Slot>();
  for (const id of Object.values(equipped)) for (const h of (id && itemById(id)?.hides) ?? []) hidden.add(h);
  return (
    <svg className={className} viewBox="0 0 360 720" width={size / 2} height={size} aria-hidden="true" style={{ overflow: "visible" }}>
      {SLOTS.map((slot) => {
        if (slot === "BODY") return <Body key="BODY" />;
        const id = equipped[slot];
        if (!id || hidden.has(slot)) return null;
        const draw = WEAR[id];
        return draw ? <g key={slot}>{draw()}</g> : null;
      })}
    </svg>
  );
}
