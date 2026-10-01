"use client";
import { memo } from "react";
import { itemById, type ItemDef } from "../../shared/items.ts";
import { skinUrl } from "../../shared/skin.ts";
import { GlassesArt, HatArt, WeaponArt } from "./hero.tsx";

const K = { stroke: "#0b0b0f", strokeWidth: 3.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Body({ it }: { it: ItemDef }) {
  switch (it.kind) {
    case "weapon":
      return <svg viewBox="-6 -6 112 112"><WeaponArt art={it.art} color={it.color} /></svg>;
    case "hat":
      return <svg viewBox="84 -12 132 96"><HatArt art={it.art} color={it.color} /></svg>;
    case "glasses":
      return <svg viewBox="94 70 112 76"><GlassesArt art={it.art} color={it.color} /></svg>;
    case "jacket":
      return (
        <svg viewBox="0 0 100 100">
          <path d="M20 22 q30 -14 60 0 l14 26 -12 8 -4 -8 v42 h-56 v-42 l-4 8 -12 -8z" fill={it.color} {...K} />
          {it.art === "hoodie" ? <path d="M38 18 q12 16 24 0" fill="#0003" {...K} /> : <path d="M50 20 v70 M40 22 l10 12 10 -12" fill="none" {...K} />}
        </svg>
      );
    case "chain":
      return (
        <svg viewBox="0 0 100 100">
          <path d="M20 20 q30 70 60 0" fill="none" stroke="#0b0b0f" strokeWidth={10} />
          <path d="M20 20 q30 70 60 0" fill="none" stroke={it.color} strokeWidth={6} strokeDasharray="7 4" />
          <path d="M40 62 l4 -14 6 8 6 -8 4 14z" fill={it.color} {...K} />
        </svg>
      );
    case "consumable":
      if (it.art === "beer") {
        return (
          <svg viewBox="0 0 64 64">
            <path d="M27 4h10v12q0 4 4 9 3 4 3 10v22q0 4-4 4H24q-4 0-4-4V35q0-6 3-10 4-5 4-9z" fill="#7a3d0e" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
            <rect x="26" y="2" width="12" height="6" rx="1" fill="#ffd23f" stroke="#111" strokeWidth="2.5" />
            <rect x="21" y="36" width="22" height="14" rx="2" fill="#f4e7c8" stroke="#111" strokeWidth="2" />
            <path d="M25 41h14M25 45h9" stroke="#c0392b" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        );
      }
      return (
        <svg viewBox="0 0 100 100">
          <rect x="30" y="14" width="40" height="74" rx="8" fill="#1b1d26" {...K} />
          <rect x="30" y="34" width="40" height="30" fill={it.color} />
          <path d="M54 38 l-10 14 h8 l-6 12 14 -16 h-8z" fill="#fff" />
          <rect x="36" y="8" width="28" height="8" rx="3" fill="#9aa4b8" {...K} />
        </svg>
      );
    case "chest":
      return (
        <svg viewBox="0 0 100 100">
          <path d="M12 44h76v38a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="#b8742b" {...K} />
          <path d="M12 44q0-24 38-24t38 24z" fill={it.color} {...K} />
          <path d="M22 22v64M78 22v64" stroke="#ffd23f" strokeWidth={6} />
          <rect x="42" y="38" width="16" height="18" rx="2" fill="#ffd23f" {...K} />
        </svg>
      );
    case "key": {
      const n = it.id.slice(4);
      return (
        <svg viewBox="0 0 100 100">
          <circle cx="32" cy="50" r="18" fill="none" stroke="#0b0b0f" strokeWidth={12} />
          <circle cx="32" cy="50" r="18" fill="none" stroke="#ffd23f" strokeWidth={7} />
          <path d="M50 50 h40 M78 50 v14 M66 50 v10" stroke="#0b0b0f" strokeWidth={12} strokeLinecap="round" />
          <path d="M50 50 h40 M78 50 v14 M66 50 v10" stroke="#ffd23f" strokeWidth={7} strokeLinecap="round" />
          <text x="32" y="56" fontSize="18" fontWeight="900" textAnchor="middle" fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke">{n}</text>
        </svg>
      );
    }
    case "theme": {
      const bg = { default: "#2a2440", neon: "#0e3b2a", moon: "#141a3a", penthouse: "#3a2a05" }[it.art] ?? "#222";
      return (
        <svg viewBox="0 0 100 100">
          <rect x="6" y="14" width="88" height="72" rx="8" fill={bg} {...K} />
          <circle cx="68" cy="36" r="12" fill={it.art === "neon" ? "#9dff3a" : it.art === "penthouse" ? "#ffd23f" : "#e8e3d0"} />
          <path d="M6 70 h20 v-18 h14 v18 h12 v-26 h14 v26 h28 v16 h-88z" fill="#0008" />
        </svg>
      );
    }
  }
}

function ItemIconImpl({ id, size = 56 }: { id: string; size?: number }) {
  const it = itemById(id);
  if (!it) return null;
  const up = skinUrl(`items/${id}`);
  return (
    <span className="item-icon" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {up ? <img className="skin-img" src={up} alt="" draggable={false} /> : <Body it={it} />}
    </span>
  );
}
export const ItemIcon = memo(ItemIconImpl);
