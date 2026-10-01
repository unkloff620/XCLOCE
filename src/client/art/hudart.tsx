"use client";
/**
 * Drawn comic-style art for the HUD panels and the bottom navigation buttons.
 * Panels are stretched backgrounds (non-scaling outlines); nav buttons are full illustrated badges without text.
 */
import type { ReactNode } from "react";
import type { Tab } from "../store.tsx";

const NS = { vectorEffect: "non-scaling-stroke" as const };

type PanelVariant = "profile" | "power" | "money";
const PANEL: Record<PanelVariant, { a: string; b: string; edge: string; glow: string }> = {
  profile: { a: "#1d2a52", b: "#0b1024", edge: "#9dff3a", glow: "#9dff3a" },
  power: { a: "#5a1022", b: "#16050b", edge: "#ff3b5c", glow: "#ffd23f" },
  money: { a: "#3a2c08", b: "#120d03", edge: "#ffd23f", glow: "#ffb02e" },
};

/** Background frame of a HUD panel (fills its parent). */
export function PanelArt({ variant }: { variant: PanelVariant }) {
  const c = PANEL[variant];
  const id = `pa-${variant}`;
  return (
    <svg className="panel-art" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.a} />
          <stop offset="1" stopColor={c.b} />
        </linearGradient>
        <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="0.9" fill="#fff" opacity="0.13" />
        </pattern>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M8 2H196L198 10V68L186 78H4L2 70V12Z" fill="#000" transform="translate(1.5 2)" />
      <path d="M8 2H196L198 10V68L186 78H4L2 70V12Z" fill={`url(#${id}-g)`} stroke="#000" strokeWidth="3" {...NS} />
      <path d="M120 2H196L198 10V68L186 78H150Z" fill={`url(#${id}-dots)`} />
      {variant === "profile" && (
        <g opacity="0.5">
          <path d="M150 2h14l-30 76h-14z" fill={c.glow} opacity="0.18" />
          <path d="M172 2h8l-30 76h-8z" fill={c.glow} opacity="0.22" />
        </g>
      )}
      {variant === "power" && (
        <g opacity="0.35">
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <path key={i} d={`M100 40L${100 + Math.cos(a) * 140} ${40 + Math.sin(a) * 140}L${100 + Math.cos(a + 0.18) * 140} ${40 + Math.sin(a + 0.18) * 140}Z`} fill={c.glow} opacity="0.35" />;
          })}
        </g>
      )}
      {variant === "money" && (
        <g opacity="0.25" fill="none" stroke={c.glow} strokeWidth="1.5" {...NS}>
          <circle cx="182" cy="16" r="12" />
          <circle cx="166" cy="64" r="9" />
          <circle cx="16" cy="66" r="7" />
        </g>
      )}
      <path d="M8 2H196L198 10V30H2V12Z" fill={`url(#${id}-shine)`} />
      <path d="M10 6H193L195 12" fill="none" stroke={c.edge} strokeWidth="1.5" opacity="0.9" {...NS} />
      <path d="M6 72L4 66" fill="none" stroke={c.edge} strokeWidth="1.5" opacity="0.9" {...NS} />
      <path d="M186 74L194 66V58" fill="none" stroke={c.edge} strokeWidth="2" opacity="0.8" {...NS} />
    </svg>
  );
}

const CUR_EDGE: Record<string, string> = { RUB: "#3b82f6", USD: "#22c55e", SOL: "#14f195", BTC: "#f7931a" };
/** Small plate behind one currency in the HUD. */
export function CellArt({ cur }: { cur: string }) {
  const e = CUR_EDGE[cur] ?? "#9dff3a";
  return (
    <svg className="panel-art" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path d="M5 1H97L99 6V24L93 29H3L1 24V6Z" fill="#06070a" stroke="#000" strokeWidth="2" {...NS} />
      <path d="M5 1H97L99 6V12H1V6Z" fill="#fff" opacity="0.08" />
      <path d="M3 29V6" stroke={e} strokeWidth="3" {...NS} />
      <path d="M93 29L99 24" stroke={e} strokeWidth="1.5" opacity="0.8" {...NS} />
    </svg>
  );
}

const NAV_THEME: Record<Tab, { a: string; b: string; rim: string }> = {
  boss: { a: "#ff4d6d", b: "#7a0d22", rim: "#ffb3c0" },
  market: { a: "#3fa7ff", b: "#0d3a7a", rim: "#b8e0ff" },
  home: { a: "#b6ff5a", b: "#2f7a0d", rim: "#efffd0" },
  inventory: { a: "#ffb02e", b: "#7a4a06", rim: "#ffe3a8" },
  social: { a: "#b45cff", b: "#3c0d7a", rim: "#e6c8ff" },
};

/** Illustrated nav button (icon art inside a comic badge). */
export function NavArt({ id }: { id: Tab }) {
  const t = NAV_THEME[id];
  const g = `nav-${id}`;
  const home = id === "home";
  return (
    <svg className="nav-art" viewBox={home ? "0 0 100 100" : "0 0 100 84"} aria-hidden="true">
      <defs>
        <radialGradient id={`${g}-bg`} cx="50%" cy="30%" r="80%">
          <stop offset="0" stopColor={t.a} />
          <stop offset="1" stopColor={t.b} />
        </radialGradient>
        <pattern id={`${g}-ht`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.2" fill="#000" opacity="0.18" />
        </pattern>
      </defs>
      {home ? (
        <>
          <circle cx="50" cy="53" r="45" fill="#000" />
          <circle cx="50" cy="50" r="45" fill={`url(#${g}-bg)`} stroke="#000" strokeWidth="4" />
          <circle cx="50" cy="50" r="45" fill={`url(#${g}-ht)`} />
          <path d="M14 38A40 40 0 0 1 86 38" fill="none" stroke={t.rim} strokeWidth="3" opacity="0.8" strokeLinecap="round" />
          {/* burst behind the house */}
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return <path key={i} d={`M50 52L${50 + Math.cos(a) * 40} ${52 + Math.sin(a) * 40}L${50 + Math.cos(a + 0.25) * 40} ${52 + Math.sin(a + 0.25) * 40}Z`} fill="#fff" opacity="0.13" />;
          })}
          {/* house */}
          <path d="M22 50L50 26L78 50" fill="none" stroke="#000" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M30 46V76H70V46L50 30Z" fill="#fff4dc" stroke="#000" strokeWidth="4" strokeLinejoin="round" />
          <path d="M22 50L50 26L78 50" fill="none" stroke="#ff3b5c" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
          <rect x="42" y="56" width="16" height="20" rx="2" fill="#7a4a1e" stroke="#000" strokeWidth="3" />
          <circle cx="54" cy="66" r="1.6" fill="#ffd23f" />
          <rect x="34" y="50" width="8" height="8" fill="#3fa7ff" stroke="#000" strokeWidth="2.5" />
          <rect x="60" y="50" width="8" height="8" fill="#3fa7ff" stroke="#000" strokeWidth="2.5" />
          <rect x="62" y="30" width="7" height="12" fill="#c0392b" stroke="#000" strokeWidth="2.5" />
        </>
      ) : (
        <>
          <path d="M10 6H92L96 12V70L86 80H8L4 74V14Z" fill="#000" transform="translate(0 3)" />
          <path d="M10 6H92L96 12V70L86 80H8L4 74V14Z" fill={`url(#${g}-bg)`} stroke="#000" strokeWidth="4" strokeLinejoin="round" />
          <path d="M10 6H92L96 12V70L86 80H8L4 74V14Z" fill={`url(#${g}-ht)`} />
          <path d="M12 11H90" stroke={t.rim} strokeWidth="3" opacity="0.75" strokeLinecap="round" />
          <g transform="translate(50 44)">{ICON[id as Exclude<Tab, "home">]}</g>
        </>
      )}
    </svg>
  );
}

const K = { stroke: "#000", strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const ICON: Record<Exclude<Tab, "home">, ReactNode> = {
  // horned demon skull with glowing eyes
  boss: (
    <g>
      <path d="M-22 -16Q-30 -30 -20 -34Q-18 -24 -12 -20M22 -16Q30 -30 20 -34Q18 -24 12 -20" fill="#f4e7c8" {...K} />
      <path d="M-20 -6Q-20 -26 0 -26Q20 -26 20 -6Q20 6 12 10V20H-12V10Q-20 6 -20 -6Z" fill="#f4f1e8" {...K} />
      <path d="M-13 -8L-3 -4L-12 2ZM13 -8L3 -4L12 2Z" fill="#ff1f3d" stroke="#000" strokeWidth="2" />
      <path d="M-13 -8L-3 -4L-12 2ZM13 -8L3 -4L12 2Z" fill="#ffd23f" opacity="0.5" transform="scale(.55)" />
      <path d="M-2 4L0 8L2 4Z" fill="#000" />
      <path d="M-8 20V14M-3 20V13M3 20V13M8 20V14" stroke="#000" strokeWidth="2.5" />
      <path d="M-16 -18Q-10 -24 -2 -24" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.8" strokeLinecap="round" />
    </g>
  ),
  // market stall with striped awning, coins and an up arrow
  market: (
    <g>
      <path d="M-26 -10L-20 -24H20L26 -10Z" fill="#fff" {...K} />
      <path d="M-14 -24L-17 -10M-5 -24L-6 -10M5 -24L6 -10M14 -24L17 -10" stroke="#ff3b5c" strokeWidth="5" />
      <path d="M-26 -10Q-21 -3 -16 -10Q-11 -3 -6 -10Q0 -3 5 -10Q10 -3 15 -10Q21 -3 26 -10" fill="#ff3b5c" {...K} />
      <rect x="-22" y="-6" width="44" height="28" fill="#fff4dc" {...K} />
      <circle cx="-10" cy="12" r="7" fill="#ffd23f" {...K} />
      <circle cx="2" cy="14" r="6" fill="#ffd23f" {...K} />
      <path d="M8 16L14 6L18 10L24 -2" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16L14 6L18 10L24 -2" fill="none" stroke="#22e58b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 -3L25 -3L25 3" fill="none" stroke="#22e58b" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  // backpack with a sword hilt sticking out
  inventory: (
    <g>
      <path d="M8 -30L14 -14" stroke="#000" strokeWidth="8" strokeLinecap="round" />
      <path d="M8 -30L14 -14" stroke="#c9d0dc" strokeWidth="4" strokeLinecap="round" />
      <path d="M4 -22L16 -26" stroke="#ffd23f" strokeWidth="5" strokeLinecap="round" />
      <path d="M-12 -16V-20Q-12 -28 0 -28Q12 -28 12 -20V-16" fill="none" stroke="#000" strokeWidth="5" />
      <path d="M-20 -14Q-22 -18 -16 -18H16Q22 -18 20 -14L22 20Q22 24 18 24H-18Q-22 24 -22 20Z" fill="#c8722b" {...K} />
      <path d="M-20 -6H20" stroke="#000" strokeWidth="3" />
      <rect x="-12" y="2" width="24" height="16" rx="3" fill="#e0913e" {...K} />
      <rect x="-4" y="-2" width="8" height="8" rx="1.5" fill="#ffd23f" stroke="#000" strokeWidth="2.5" />
      <path d="M-16 -14Q-12 -16 -6 -16" stroke="#fff" strokeWidth="2.5" opacity="0.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  // three fighters with a clan flag
  social: (
    <g>
      <path d="M18 -30V0" stroke="#000" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 -30H32L28 -24L32 -18H18Z" fill="#ffd23f" {...K} strokeWidth="2.5" />
      <circle cx="-16" cy="-6" r="8" fill="#f3b33d" {...K} />
      <circle cx="16" cy="-6" r="8" fill="#f3b33d" {...K} />
      <path d="M-30 24Q-30 4 -16 4Q-2 4 -2 24Z" fill="#3fa7ff" {...K} />
      <path d="M2 24Q2 4 16 4Q30 4 30 24Z" fill="#ff3b5c" {...K} />
      <circle cx="0" cy="-12" r="10" fill="#ffd27a" {...K} />
      <path d="M-8 -16Q0 -26 8 -16" fill="#000" />
      <path d="M-16 26Q-16 0 0 0Q16 0 16 26Z" fill="#9dff3a" {...K} />
      <path d="M-4 -12h2M2 -12h2" stroke="#000" strokeWidth="2.5" />
    </g>
  ),
};
