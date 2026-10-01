"use client";
/**
 * The player's hero: a front-facing shiba in comic style. Every equipped item is drawn as a layer,
 * so the wardrobe / weapons from the inventory show up on the character.
 */
import { memo } from "react";
import { itemById, type Loadout } from "../../shared/items.ts";

const K = { stroke: "#0b0b0f", strokeWidth: 4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const K3 = { stroke: "#0b0b0f", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export function WeaponArt({ art, color = "#22e58b" }: { art: string; color?: string }) {
  // drawn in a 0..100 box, handle bottom-right → head top-left
  switch (art) {
    case "fan":
      return (
        <g>
          <path d="M70 90 L40 40" {...K} stroke="#8a5a1a" strokeWidth={6} />
          <path d="M40 40 L10 22 Q30 0 58 12 Z" fill={color} {...K3} />
          <path d="M40 40 L18 18 M40 40 L30 10 M40 40 L44 9" stroke="#bbb" strokeWidth={2} />
        </g>
      );
    case "club":
      return (
        <g>
          <path d="M78 92 L46 44" {...K} stroke="#6b4a2a" strokeWidth={9} />
          <path d="M46 44 L22 6 Q10 18 18 40 Q30 56 46 44 Z" fill="#8a5a2a" {...K3} />
          <rect x="14" y="16" width="26" height="14" rx="3" fill={color} transform="rotate(-35 27 23)" {...K3} />
          <text x="27" y="27" fontSize="8" fontWeight="900" fill="#fff" textAnchor="middle" transform="rotate(-35 27 23)">SELL</text>
        </g>
      );
    case "hammer":
    case "banhammer": {
      const ban = art === "banhammer";
      return (
        <g>
          <path d="M84 96 L44 40" {...K} stroke="#2a2a30" strokeWidth={9} />
          <path d="M84 96 L44 40" stroke="#4a4a55" strokeWidth={3} />
          <g transform="rotate(-35 36 30)">
            <rect x="4" y="12" width="64" height="36" rx="6" fill="#1b1d26" {...K} />
            <rect x="4" y="12" width="64" height="36" rx="6" fill="none" stroke={color} strokeWidth={2.5} opacity={0.9} />
            {ban ? (
              <text x="36" y="38" fontSize="17" fontWeight="900" fill={color} textAnchor="middle" fontFamily="Impact, sans-serif">BAN</text>
            ) : (
              <path d="M14 30 h44" stroke={color} strokeWidth={4} />
            )}
            {ban && <path d="M4 12 l-6 -6 M68 12 l6 -6 M4 48 l-6 6 M68 48 l6 6" stroke="#cfd6e6" strokeWidth={4} />}
          </g>
        </g>
      );
    }
    case "cannon":
      return (
        <g>
          <path d="M80 94 L58 66" {...K} stroke="#3a2a1a" strokeWidth={8} />
          <rect x="8" y="22" width="66" height="26" rx="10" fill={color} transform="rotate(-35 41 35)" {...K} />
          <circle cx="16" cy="44" r="9" fill="#111" transform="rotate(-35 41 35)" />
          <path d="M6 10 q10 -8 22 0 q-8 10 -22 0z" fill="#b3283c" {...K3} />
        </g>
      );
    case "harpoon":
      return (
        <g>
          <path d="M88 98 L18 18" {...K} stroke="#5a3d16" strokeWidth={7} />
          <path d="M18 18 L4 0 L10 22 L0 8 Z" fill={color} {...K3} />
          <path d="M18 18 l10 -2 M22 24 l10 -2" stroke={color} strokeWidth={3} />
        </g>
      );
    case "fist":
      return (
        <g>
          <path d="M30 20 q-16 10 -10 32 q8 22 34 18 q20 -4 20 -26 q0 -24 -22 -30 q-12 -2 -22 6z" fill={color} {...K} />
          <path d="M34 26 l10 18 M48 22 l8 20 M30 46 l26 -4" stroke="#fff" strokeWidth={2} opacity={0.8} />
        </g>
      );
    default:
      return null;
  }
}

export function HatArt({ art, color = "#e63946" }: { art: string; color?: string }) {
  if (art === "cap")
    return (
      <g>
        <path d="M98 58 q52 -52 104 0 z" fill={color} {...K} />
        <path d="M100 58 q-34 4 -42 16 q30 2 50 -8z" fill={color} {...K3} />
        <circle cx="150" cy="22" r="5" fill={color} {...K3} />
      </g>
    );
  if (art === "beanie")
    return (
      <g>
        <path d="M94 64 q56 -70 112 0 z" fill={color} {...K} />
        <rect x="92" y="56" width="116" height="16" rx="7" fill={color} {...K3} />
        <text x="150" y="68.5" fontSize="11" fontWeight="900" textAnchor="middle" fill="#e8fff2">HODL</text>
        <circle cx="150" cy="10" r="9" fill={color} {...K3} />
      </g>
    );
  if (art === "crown")
    return (
      <g>
        <path d="M104 56 l6 -40 22 22 18 -34 18 34 22 -22 6 40z" fill={color} {...K} />
        <circle cx="132" cy="44" r="5" fill="#ff3d81" /><circle cx="150" cy="38" r="6" fill="#3fa7ff" /><circle cx="168" cy="44" r="5" fill="#22e58b" />
      </g>
    );
  return null;
}

export function GlassesArt({ art, color = "#111" }: { art: string; color?: string }) {
  if (art === "shades")
    return (
      <g>
        <path d="M104 98 h92 v6 l-6 18 h-28 l-8 -14 h-8 l-8 14 h-28 l-6 -18z" fill={color} {...K3} />
        <path d="M114 104 l10 0" stroke="#fff" strokeWidth={3} opacity={0.7} />
      </g>
    );
  if (art === "neon")
    return (
      <g>
        <rect x="104" y="96" width="40" height="24" rx="10" fill="rgba(34,229,139,.35)" stroke={color} strokeWidth={4} />
        <rect x="156" y="96" width="40" height="24" rx="10" fill="rgba(34,229,139,.35)" stroke={color} strokeWidth={4} />
        <path d="M144 106 h12" stroke={color} strokeWidth={4} />
      </g>
    );
  if (art === "laser")
    return (
      <g>
        <rect x="100" y="96" width="100" height="22" rx="8" fill="#2a0008" {...K3} />
        <rect x="104" y="100" width="92" height="14" rx="6" fill={color} className="laser-glow" />
      </g>
    );
  return null;
}

function ChainArt({ color }: { color: string }) {
  return (
    <g>
      <path d="M118 178 q32 52 64 0" fill="none" stroke="#0b0b0f" strokeWidth={8} />
      <path d="M118 178 q32 52 64 0" fill="none" stroke={color} strokeWidth={5} strokeDasharray="5 3" />
      <path d="M140 214 l4 -10 6 6 6 -6 4 10z" fill={color} {...K3} />
    </g>
  );
}

function HeroImpl({ loadout, size = 300, pose = "idle" }: { loadout: Loadout; size?: number; pose?: "idle" | "attack" }) {
  const weapon = loadout.weapon ? itemById(loadout.weapon) : undefined;
  const hat = loadout.hat ? itemById(loadout.hat) : undefined;
  const glasses = loadout.glasses ? itemById(loadout.glasses) : undefined;
  const jacket = loadout.jacket ? itemById(loadout.jacket) : undefined;
  const chain = loadout.chain ? itemById(loadout.chain) : undefined;
  const jc = jacket?.color ?? null;
  const isHoodie = jacket?.art === "hoodie";
  const fur = "#e8a54b";
  const furD = "#c98632";
  const cream = "#fbe8c8";
  return (
    <svg className={`hero pose-${pose}`} width={size} height={size * 1.47} viewBox="0 0 300 440" aria-label="Персонаж">
      {/* ground shadow */}
      <ellipse cx="150" cy="430" rx="100" ry="10" fill="#000" opacity=".45" />
      {/* weapon behind (on the shoulder) */}
      {weapon && weapon.art !== "fist" && (
        <g className="weapon" transform="translate(29 39) scale(2.2)">
          <WeaponArt art={weapon.art} color={weapon.color} />
        </g>
      )}
      {/* legs */}
      <path d="M108 290 l-6 120 h40 l6 -96 h4 l6 96 h40 l-6 -120z" fill="#15161c" {...K} />
      <path d="M108 330 h40 M152 330 h40" stroke="#22e58b" strokeWidth={4} opacity={0.8} />
      <rect x="112" y="352" width="22" height="20" rx="3" fill="#23252f" {...K3} />
      {/* shoes */}
      <path d="M96 404 h50 q6 0 6 10 v8 h-62 q-2 -18 6 -18z" fill="#f2f2f2" {...K} />
      <path d="M154 404 h50 q8 0 6 18 h-62 v-8 q0 -10 6 -10z" fill="#f2f2f2" {...K} />
      <path d="M92 416 h58 M150 416 h60" stroke="#22e58b" strokeWidth={3} />
      {/* belt */}
      <rect x="104" y="284" width="92" height="14" rx="3" fill="#2a1d12" {...K3} />
      <rect x="140" y="282" width="20" height="18" rx="3" fill="#ffd23f" {...K3} />
      {/* torso: t-shirt */}
      <path d="M100 176 q50 -22 100 0 l-2 112 h-96z" fill="#f4f4f6" {...K} />
      <circle cx="150" cy="238" r="20" fill="#0b0b0f" opacity=".85" />
      <path d="M140 232 l4 -10 6 8 6 -8 4 10 q-10 14 -20 0z" fill="#f4f4f6" />
      {/* jacket */}
      {jc && (
        <g>
          <path d={isHoodie ? "M100 176 q50 -22 100 0 l6 116 h-46 l-10 -100 l-10 100 h-46z" : "M98 176 q52 -24 104 0 l8 118 h-48 l-12 -104 l-12 104 h-48z"} fill={jc} {...K} />
          {!isHoodie && <path d="M138 190 l12 -14 12 14" fill="none" stroke="#0b0b0f" strokeWidth={3} />}
          {!isHoodie && <path d="M106 220 l14 14 M194 220 l-14 14" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={4} />}
        </g>
      )}
      {chain && <ChainArt color={chain.color ?? "#ffd23f"} />}
      {/* left arm (down, fist) */}
      <path d="M100 180 q-26 30 -24 96" fill="none" stroke={jc ?? fur} strokeWidth={28} strokeLinecap="round" />
      <path d="M100 180 q-26 30 -24 96" fill="none" stroke="#0b0b0f" strokeWidth={32} strokeLinecap="round" opacity={0.0} />
      <circle cx="76" cy="282" r="17" fill={weapon?.art === "fist" ? weapon.color : "#1b1b22"} {...K} />
      {weapon?.art === "fist" && (
        <g transform="translate(36 248) scale(.8)"><WeaponArt art="fist" color={weapon.color} /></g>
      )}
      {/* right arm (raised to shoulder, holding the weapon) */}
      <path d="M200 182 q34 10 36 48 q-2 18 -22 26" fill="none" stroke={jc ?? fur} strokeWidth={28} strokeLinecap="round" />
      <circle cx="214" cy="250" r="16" fill="#1b1b22" {...K} />
      {/* outlines for arms */}
      <path d="M100 180 q-26 30 -24 96" fill="none" stroke="#0b0b0f" strokeWidth={3} opacity={0.6} transform="translate(-13 0)" />
      {/* head */}
      <g className="head">
        <path d="M92 74 l10 -64 44 40z" fill={fur} {...K} />
        <path d="M208 74 l-10 -64 -44 40z" fill={fur} {...K} />
        <path d="M100 66 l6 -38 24 26z M200 66 l-6 -38 -24 26z" fill="#f6c7a4" />
        <ellipse cx="150" cy="112" rx="66" ry="60" fill={fur} {...K} />
        <path d="M96 132 q12 40 54 42 q42 -2 54 -42 q-20 18 -54 18 q-34 0 -54 -18z" fill={cream} />
        <ellipse cx="150" cy="138" rx="26" ry="18" fill={cream} {...K3} />
        <ellipse cx="150" cy="128" rx="10" ry="7" fill="#0b0b0f" />
        <path d="M136 146 q14 10 30 -2" fill="none" stroke="#0b0b0f" strokeWidth={3.5} strokeLinecap="round" />
        <path d="M118 84 q10 -6 18 0 M164 84 q10 -6 18 0" stroke={furD} strokeWidth={4} fill="none" strokeLinecap="round" />
        {!glasses && (
          <g>
            <path d="M114 106 q12 -8 24 0" fill="none" stroke="#0b0b0f" strokeWidth={5} strokeLinecap="round" />
            <path d="M162 106 q12 -8 24 0" fill="none" stroke="#0b0b0f" strokeWidth={5} strokeLinecap="round" />
          </g>
        )}
        {glasses && <GlassesArt art={glasses.art} color={glasses.color} />}
        {hat && <HatArt art={hat.art} color={hat.color} />}
      </g>
    </svg>
  );
}

export const Hero = memo(HeroImpl);
