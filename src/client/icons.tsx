"use client";
/** Colourful game icons (inline SVG) used by home widgets and big cards. */
export type GameIconName = "chest" | "calendar" | "megaphone" | "trophy" | "hammer" | "scroll" | "swap" | "hoodie" | "gift" | "sword";

const ICONS: Record<GameIconName, string> = {
  chest: `<path d="M8 26h48v28a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#b8742b"/><path d="M8 26q0-16 24-16t24 16z" fill="#d98f3a"/><path d="M8 26h48v6H8z" fill="#ffd23f"/><path d="M14 12v46M50 12v46" stroke="#ffd23f" stroke-width="5"/><rect x="26" y="24" width="12" height="14" rx="2" fill="#ffd23f" stroke="#a87b00" stroke-width="2"/><circle cx="32" cy="31" r="2.5" fill="#6b3a00"/><path d="M16 18q6-4 10-4" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none"/>`,
  calendar: `<rect x="8" y="12" width="48" height="44" rx="6" fill="#f4f1e8"/><path d="M8 18a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v8H8z" fill="#ff3b5c"/><rect x="18" y="6" width="5" height="12" rx="2" fill="#555"/><rect x="41" y="6" width="5" height="12" rx="2" fill="#555"/><path d="M20 40l8 8 16-16" stroke="#22c55e" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  megaphone: `<path d="M10 26h10l26-14v40L20 38H10z" fill="#3fa7ff"/><path d="M10 26h10v12H10z" fill="#1e6fd1"/><path d="M20 38l4 14h8l-4-14" fill="#1e6fd1"/><path d="M50 22q8 10 0 20" stroke="#ffd23f" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M54 14q14 18 0 36" stroke="#ffd23f" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`,
  trophy: `<path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#ffd23f"/><path d="M18 12H8q0 14 12 16M46 12h10q0 14-12 16" stroke="#ffd23f" stroke-width="4" fill="none"/><rect x="28" y="34" width="8" height="10" fill="#e0a800"/><rect x="18" y="44" width="28" height="10" rx="3" fill="#8a5a1a"/><path d="M24 14v8" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>`,
  hammer: `<rect x="28" y="22" width="8" height="38" rx="3" fill="#a0672e" transform="rotate(35 32 40)"/><path d="M14 10l26 0 6 8-6 8H14a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4z" fill="#9aa4b8" transform="rotate(35 32 18)"/><path d="M16 12h22" stroke="#fff" stroke-opacity=".5" stroke-width="3" transform="rotate(35 32 18)"/>`,
  scroll: `<rect x="12" y="10" width="40" height="44" rx="4" fill="#f4e7c8"/><path d="M12 14a6 6 0 0 1 12 0v40a6 6 0 0 1-12 0z" fill="#e3cf9e"/><path d="M30 22h16M30 30h16M30 38h12" stroke="#8a6a3a" stroke-width="3" stroke-linecap="round"/><circle cx="46" cy="50" r="8" fill="#ff3b5c"/><path d="M42 50l3 3 5-6" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  swap: `<circle cx="32" cy="32" r="26" fill="#ffb02e"/><path d="M18 26h26l-7-7M46 38H20l7 7" stroke="#3a2200" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  hoodie: `<path d="M20 14q12-8 24 0l12 10-6 10-4-3v25H18V31l-4 3-6-10z" fill="#5b2fa8"/><path d="M24 14q8 12 16 0" fill="#3d1a7a"/><path d="M30 24v10M34 24v10" stroke="#ffd23f" stroke-width="2"/><rect x="24" y="42" width="16" height="8" rx="3" fill="#3d1a7a"/>`,
  gift: `<rect x="10" y="26" width="44" height="30" rx="4" fill="#ff3d81"/><rect x="8" y="18" width="48" height="10" rx="3" fill="#ff6aa0"/><rect x="28" y="18" width="8" height="38" fill="#ffd23f"/><path d="M32 18q-14-14-16-2t16 2q14-14 16-2t-16 2" fill="none" stroke="#ffd23f" stroke-width="4"/>`,
  sword: `<path d="M44 8l12 0 0 12-26 26-12-12z" fill="#c9d1e0"/><path d="M14 38l12 12-4 4-12-12z" fill="#ffd23f"/><path d="M8 50l6 6-4 4-6-6z" fill="#8a5a1a"/>`,
};

export function GameIcon({ name, size = 40 }: { name: GameIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}
