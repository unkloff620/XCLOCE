"use client";
/** Comic-style colourful UI icons (64×64). */
export type UiIcon =
  | "gift" | "scroll" | "trophy" | "shop" | "chest" | "swords" | "energy" | "crown" | "palette" | "muscle" | "cards"
  | "home" | "market" | "boss" | "bag" | "people" | "lock" | "key" | "coin" | "rub" | "usd" | "sol" | "btc" | "calendar" | "exchange";

const P: Record<UiIcon, string> = {
  gift: `<rect x="10" y="26" width="44" height="30" rx="4" fill="#e8e8f0" stroke="#111" stroke-width="3"/><rect x="8" y="18" width="48" height="10" rx="3" fill="#fff" stroke="#111" stroke-width="3"/><rect x="28" y="18" width="8" height="38" fill="#9aa4b8"/><path d="M32 18q-14-14-16-2t16 2q14-14 16-2t-16 2" fill="none" stroke="#111" stroke-width="3"/>`,
  scroll: `<rect x="12" y="10" width="40" height="44" rx="4" fill="#f4e7c8" stroke="#111" stroke-width="3"/><path d="M22 22h20M22 30h20M22 38h14" stroke="#8a6a3a" stroke-width="3.5" stroke-linecap="round"/><circle cx="46" cy="50" r="9" fill="#9dff3a" stroke="#111" stroke-width="3"/><path d="M42 50l3 3 5-6" stroke="#111" stroke-width="3" fill="none"/>`,
  trophy: `<path d="M18 8h28v14a14 14 0 0 1-28 0z" fill="#ffd23f" stroke="#111" stroke-width="3"/><path d="M18 12H8q0 14 12 16M46 12h10q0 14-12 16" stroke="#111" stroke-width="3" fill="none"/><rect x="28" y="34" width="8" height="10" fill="#e0a800" stroke="#111" stroke-width="2"/><rect x="18" y="44" width="28" height="10" rx="3" fill="#8a5a1a" stroke="#111" stroke-width="3"/>`,
  shop: `<path d="M8 26l6-16h36l6 16z" fill="#b45cff" stroke="#111" stroke-width="3"/><path d="M8 26q6 8 12 0q6 8 12 0q6 8 12 0q6 8 12 0" fill="#ff3d81" stroke="#111" stroke-width="3"/><rect x="12" y="30" width="40" height="24" fill="#e8e8f0" stroke="#111" stroke-width="3"/><rect x="26" y="38" width="12" height="16" fill="#3fa7ff" stroke="#111" stroke-width="2.5"/>`,
  chest: `<path d="M8 28h48v24a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#b8742b" stroke="#111" stroke-width="3"/><path d="M8 28q0-16 24-16t24 16z" fill="#d98f3a" stroke="#111" stroke-width="3"/><path d="M14 14v42M50 14v42" stroke="#ffd23f" stroke-width="4"/><rect x="26" y="26" width="12" height="12" rx="2" fill="#ffd23f" stroke="#111" stroke-width="2.5"/><circle cx="20" cy="22" r="3" fill="#fff8"/>`,
  swords: `<path d="M10 54L46 18l8-8 2 8-8 8-36 36z" fill="#d6dce8" stroke="#111" stroke-width="3"/><path d="M54 54L18 18l-8-8-2 8 8 8 36 36z" fill="#d6dce8" stroke="#111" stroke-width="3"/><path d="M14 42l8 8M50 42l-8 8" stroke="#ffd23f" stroke-width="6" stroke-linecap="round"/>`,
  energy: `<path d="M36 4L12 36h16l-6 24 30-36H36z" fill="#9dff3a" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`,
  crown: `<path d="M8 46l4-28 12 12 8-18 8 18 12-12 4 28z" fill="#ffd23f" stroke="#111" stroke-width="3" stroke-linejoin="round"/><rect x="8" y="46" width="48" height="8" fill="#e0a800" stroke="#111" stroke-width="3"/>`,
  palette: `<path d="M32 6C16 6 6 18 6 32s10 26 24 26c6 0 6-6 3-9s-2-9 5-9h8c10 0 12-8 12-12C58 16 46 6 32 6z" fill="#f4e7c8" stroke="#111" stroke-width="3"/><circle cx="20" cy="26" r="5" fill="#ff3d81"/><circle cx="32" cy="18" r="5" fill="#9dff3a"/><circle cx="44" cy="24" r="5" fill="#3fa7ff"/>`,
  muscle: `<path d="M14 50q-6-20 8-30l6-10 10 2-4 10q14-6 20 6t-6 22z" fill="#f3b33d" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M30 36q8-4 14 2" stroke="#111" stroke-width="3" fill="none"/>`,
  cards: `<rect x="10" y="12" width="30" height="40" rx="4" fill="#5b2fa8" stroke="#111" stroke-width="3" transform="rotate(-12 25 32)"/><rect x="24" y="12" width="30" height="40" rx="4" fill="#ff3d81" stroke="#111" stroke-width="3" transform="rotate(10 39 32)"/><path d="M36 26l4 8 8 1-6 6 2 8-8-4-7 4 1-8-6-6 9-1z" fill="#fff" transform="rotate(10 39 32)"/>`,
  home: `<path d="M8 30L32 10l24 20v24H40V38H24v16H8z" fill="currentColor"/>`,
  market: `<path d="M10 54V36h10v18zM27 54V22h10v32zM44 54V10h10v44z" fill="currentColor"/>`,
  boss: `<path d="M10 14l8 8q14-6 28 0l8-8 2 18q0 22-24 26Q8 54 8 32z" fill="currentColor"/><path d="M20 32l8 4-8 4zM44 32l-8 4 8 4z" fill="#0b0d14"/><path d="M26 48h12" stroke="#0b0d14" stroke-width="3"/>`,
  bag: `<path d="M14 22h36l4 34H10z" fill="currentColor"/><path d="M22 22v-4a10 10 0 0 1 20 0v4" stroke="currentColor" stroke-width="5" fill="none"/><rect x="24" y="32" width="16" height="10" rx="2" fill="#0b0d14"/>`,
  people: `<circle cx="22" cy="22" r="8" fill="currentColor"/><circle cx="42" cy="22" r="8" fill="currentColor"/><path d="M8 50q2-16 14-16t14 16zM28 50q2-16 14-16t14 16z" fill="currentColor"/>`,
  lock: `<rect x="14" y="28" width="36" height="28" rx="4" fill="#9aa4b8" stroke="#111" stroke-width="3"/><path d="M22 28v-6a10 10 0 0 1 20 0v6" stroke="#111" stroke-width="5" fill="none"/>`,
  key: `<circle cx="20" cy="32" r="10" fill="none" stroke="#111" stroke-width="9"/><circle cx="20" cy="32" r="10" fill="none" stroke="#ffd23f" stroke-width="5"/><path d="M30 32h26M48 32v10M40 32v7" stroke="#111" stroke-width="9" stroke-linecap="round"/><path d="M30 32h26M48 32v10M40 32v7" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>`,
  coin: `<circle cx="32" cy="32" r="24" fill="#ffd23f" stroke="#111" stroke-width="3"/><circle cx="32" cy="32" r="16" fill="none" stroke="#e0a800" stroke-width="3"/>`,
  rub: `<circle cx="32" cy="32" r="26" fill="#3b82f6" stroke="#111" stroke-width="3"/><text x="32" y="44" text-anchor="middle" font-size="32" font-weight="900" fill="#fff" font-family="Arial Black,sans-serif">₽</text>`,
  usd: `<circle cx="32" cy="32" r="26" fill="#16a34a" stroke="#111" stroke-width="3"/><text x="32" y="45" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" font-family="Arial Black,sans-serif">$</text>`,
  sol: `<circle cx="32" cy="32" r="26" fill="#111827" stroke="#111" stroke-width="3"/><g fill="#14f195"><path d="M20 22h26l-5 5H15z"/><path d="M15 30h26l5 5H20z"/><path d="M20 38h26l-5 5H15z"/></g>`,
  btc: `<circle cx="32" cy="32" r="26" fill="#f7931a" stroke="#111" stroke-width="3"/><text x="33" y="44" text-anchor="middle" font-size="32" font-weight="900" fill="#fff" font-family="Arial Black,sans-serif" transform="rotate(12 32 32)">₿</text>`,
  calendar: `<rect x="8" y="12" width="48" height="44" rx="6" fill="#f4f1e8" stroke="#111" stroke-width="3"/><path d="M8 18a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v8H8z" fill="#ff3b5c" stroke="#111" stroke-width="3"/><path d="M20 40l8 8 16-16" stroke="#16a34a" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  exchange: `<circle cx="32" cy="32" r="26" fill="#ffb02e" stroke="#111" stroke-width="3"/><path d="M18 26h26l-7-7M46 38H20l7 7" stroke="#111" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
};

export function UIcon({ name, size = 32, className }: { name: UiIcon; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[name] }} />;
}
export const CUR_ICON = { RUB: "rub", USD: "usd", SOL: "sol", BTC: "btc" } as const;
