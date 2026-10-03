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

function Body({ look, pants, shirt }: { look: Look; pants: boolean; shirt: boolean }) {
  const skin = SKIN_TONES[look.skin] ?? SKIN_TONES[1];
  const iris = EYE_COLORS[look.eyes] ?? EYE_COLORS[0];
  return (
    <g>
      <path d={P.SIL} fill={skin.base} stroke={INK} strokeWidth="8" strokeLinejoin="round" />
      <path d={P.SHADE} fill={skin.shade} />
      {!shirt && <Torso shade={skin.shade} />}
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
      {/* base shorts: an empty pants slot never looks naked (hidden under real pants) */}
      {!pants && (
        <g>
          <path d={P.SHORTS} fill="#343135" />
          <path d={P.SHORTS_DARK} fill="#1d1b1f" />
          <path d={P.LINES_SHORTS} fill={INK} fillRule="evenodd" />
        </g>
      )}
    </g>
  );
}

/** Bare torso drawn when no shirt is worn: sides, collarbones, chest, abs, shading (mirrored around x=512). */
const M = (d: string) => d; // marker for paths that are mirrored below
const TORSO_SIDE = M("M370 412 C368 450 368 474 374 500 C384 556 392 598 388 640 C384 682 372 712 364 740");
const TORSO_SHADE = M("M370 412 C368 450 368 474 374 500 C384 556 392 598 388 640 C384 682 372 712 364 740 L392 740 C404 690 414 640 410 590 C404 540 392 470 396 420 Z");
const PEC_SHADE = M("M396 420 C410 456 460 474 506 458 L506 476 C456 496 404 476 390 440 Z");
const PEC = M("M392 372 C392 428 446 466 506 454");
const COLLAR = M("M430 318 C456 332 486 336 506 330");
const ABS = M("M466 500 C482 508 496 508 506 504 M462 556 C480 562 496 562 506 558 M464 610 C480 616 496 616 506 612");
const OBLIQUE = M("M418 520 C436 580 448 640 466 716");

function mirror(d: string) {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${1024 - Number(x)} ${y}`);
}

function Torso({ shade: sh }: { shade: string }) {
  const both = (d: string) => `${d} ${mirror(d)}`;
  const line = shade(sh, -0.45);
  return (
    <g>
      <path d={both(TORSO_SHADE)} fill={sh} opacity="0.9" />
      <path d={both(PEC_SHADE)} fill={sh} />
      <path d="M496 600 C504 640 520 640 528 600 L528 700 C520 716 504 716 496 700 Z" fill={sh} opacity="0.45" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={both(TORSO_SIDE)} stroke={INK} strokeWidth="7" />
        <path d={both(PEC)} stroke={INK} strokeWidth="5" />
        <path d={both(COLLAR)} stroke={line} strokeWidth="4" />
        <path d={both(ABS)} stroke={line} strokeWidth="4" />
        <path d={both(OBLIQUE)} stroke={line} strokeWidth="3.5" />
        <path d="M512 352 V440 M512 470 V690" stroke={line} strokeWidth="3.5" />
      </g>
      <ellipse cx="512" cy="706" rx="5" ry="7" fill={line} />
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

/* ---------------- jeans: slim straight cut, waistband, fly, pockets, seams, cuffs ---------------- */
const JEANS_SHAPE =
  "M356 736 H668 C676 790 680 860 674 960 L684 1390 H598 L542 994 Q512 968 482 994 L426 1390 H340 L350 960 C344 860 348 790 356 736 Z";
function Jeans() {
  const blue = "#3a6fd8";
  const dark = "#2a52a8";
  const light = "#6d9bf0";
  const stitch = "#e8b04b";
  return (
    <g>
      <path d={JEANS_SHAPE} fill={blue} stroke={INK} strokeWidth="9" strokeLinejoin="round" />
      {/* shading on the inner and outer side of each leg */}
      <path d="M350 960 L340 1390 H372 L378 980 C370 900 366 840 362 790 Z" fill={dark} opacity="0.75" />
      <path d="M542 994 L598 1390 H628 L572 1000 C560 990 550 990 542 994 Z" fill={dark} opacity="0.75" />
      <path d="M482 994 L460 1160 L470 1170 L496 990 Z" fill={dark} opacity="0.5" />
      <path d="M392 1000 C396 1120 392 1260 386 1360 M636 1000 C634 1120 640 1260 646 1360" fill="none" stroke={light} strokeWidth="9" strokeLinecap="round" opacity="0.55" />
      {/* knee creases */}
      <path d="M380 1170 C396 1178 414 1178 430 1170 M594 1170 C610 1178 628 1178 644 1170" fill="none" stroke={dark} strokeWidth="5" strokeLinecap="round" />
      {/* waistband, loops, button, fly */}
      <path d="M356 736 H668 L670 770 H354 Z" fill={dark} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      {[384, 448, 576, 640].map((x) => <rect key={x} x={x - 5} y="732" width="10" height="44" rx="3" fill={blue} stroke={INK} strokeWidth="4" />)}
      <circle cx="512" cy="753" r="9" fill="#e8b04b" stroke={INK} strokeWidth="4" />
      <path d="M512 770 V900 C530 900 540 880 540 850 V772" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M530 776 V850 C530 874 524 888 514 892" fill="none" stroke={stitch} strokeWidth="3" strokeDasharray="7 6" />
      {/* front pockets with stitching */}
      <path d="M372 772 C386 822 420 846 462 842" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M652 772 C638 822 604 846 562 842" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M384 778 C398 816 424 832 456 830 M640 778 C626 816 600 832 568 830" fill="none" stroke={stitch} strokeWidth="3" strokeDasharray="7 6" />
      {/* side seams */}
      <path d="M352 800 C350 880 352 940 352 990 L344 1380 M672 800 C674 880 672 940 672 990 L680 1380" fill="none" stroke={stitch} strokeWidth="3" strokeDasharray="7 6" opacity="0.8" />
      {/* rolled cuffs */}
      <path d="M342 1354 H426 L424 1390 H340 Z M598 1354 H682 L684 1390 H600 Z" fill={light} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d="M346 1372 H422 M602 1372 H678" stroke={blue} strokeWidth="4" />
    </g>
  );
}

/* ---------------- sneakers: drawn for the left foot, mirrored for the right ---------------- */
function Sneaker({ upper, accent, sole }: { upper: string; accent: string; sole: string }) {
  return (
    <g>
      {/* sole */}
      <path d="M274 1486 C272 1508 286 1520 306 1520 H410 C426 1520 434 1508 432 1490 L428 1478 C380 1490 318 1494 274 1486 Z" fill={sole} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <path d="M282 1506 H424" stroke="rgba(0,0,0,0.25)" strokeWidth="4" />
      {/* upper */}
      <path d="M334 1388 C334 1410 318 1430 294 1446 C272 1460 268 1480 278 1490 C318 1496 380 1492 430 1482 L428 1400 C414 1382 352 1380 334 1388 Z" fill={upper} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      {/* toe cap and side panel shade */}
      <path d="M280 1486 C276 1468 288 1452 306 1446 C318 1460 320 1476 316 1490 C302 1491 290 1490 280 1486 Z" fill="rgba(0,0,0,0.08)" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
      <path d="M402 1400 L428 1402 L430 1482 L404 1486 C410 1456 408 1426 402 1400 Z" fill="rgba(0,0,0,0.12)" />
      {/* accent stripe (generic, no brand) */}
      <path d="M332 1468 C350 1444 372 1470 392 1446 C404 1432 414 1440 424 1430" fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
      <path d="M332 1468 C350 1444 372 1470 392 1446 C404 1432 414 1440 424 1430" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" />
      {/* collar, tongue, laces */}
      <ellipse cx="380" cy="1392" rx="44" ry="9" fill="#2c2f48" stroke={INK} strokeWidth="5" />
      <path d="M352 1396 C350 1414 342 1428 330 1438" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M346 1404 L366 1408 M340 1416 L360 1421 M332 1428 L352 1434" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M346 1404 L366 1408 M340 1416 L360 1421 M332 1428 L352 1434" stroke="#f2f3fb" strokeWidth="2.5" strokeLinecap="round" />
      {/* heel tab */}
      <path d="M420 1396 L432 1398 L432 1430 L422 1428 Z" fill={accent} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    </g>
  );
}

function Slipper({ strap, sole }: { strap: string; sole: string }) {
  return (
    <g>
      <path d="M272 1490 C270 1508 284 1518 302 1518 H412 C428 1518 436 1506 434 1490 Z" fill={sole} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <path d="M300 1458 C330 1430 392 1424 424 1436 L428 1470 C390 1460 330 1468 296 1484 Z" fill={strap} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <path d="M318 1462 C350 1446 390 1442 418 1448" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

const pair = (one: ReactNode) => (
  <g>
    {one}
    <g transform="translate(1024 0) scale(-1 1)">{one}</g>
  </g>
);

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
  jeans: () => <Jeans />,
  "shorts-remote": () => <Shorts color="#ff8a3d" dark="#d0661f" />,
  sneakers: () => pair(<Sneaker upper="#f4f5fb" accent="#ff4d6d" sole="#e9e3d6" />),
  slippers: () => pair(<Slipper strap="#3fd2ff" sole="#2c3566" />),
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
        <Body look={look} pants={!!equipped.PANTS && !hidden.has("PANTS")} shirt={!!equipped.SHIRT && !hidden.has("SHIRT")} />
        {SLOTS.filter((s) => s === "PANTS" || s === "SHIRT" || s === "SHOES").map(layer)}
        <g transform={HEAD_SHIFT}><HairFront style={look.hair} color={hair} /></g>
        {SLOTS.filter((s) => s === "HEAD" || s === "ACCESSORY" || s === "SPECIAL").map(layer)}
      </g>
    </svg>
  );
}
