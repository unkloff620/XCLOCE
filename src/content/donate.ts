/**
 * «Донат» (the user 2026-11-24): every currency is bought for Telegram Stars in the shop (the goods on the shelves).
 * Each currency has 9 packs from 3 to 2500 stars; the bigger the pack the better (DONATE_TABS).
 */
import type { Currency } from "./currencies.ts";

/**
 * The tabs in their order. `at`: the user's fixed packs [stars, amount] (2026-11-24); between them the amount per star
 * grows evenly on the log scale of the price (the bigger the pack, the better). Without `at`: from the 3-star rate up
 * to +10% at 2500 stars.
 */
export const DONATE_TABS: { cur: Currency; name: string; per3: number; at?: [number, number][] }[] = [
  { cur: "RUB", name: "Рубли", per3: 12, at: [[3, 12], [250, 2000], [2500, 25000]] },
  { cur: "GOLD", name: "Слитки", per3: 4, at: [[3, 4], [250, 500], [2500, 6000]] },
  { cur: "TOKEN", name: "Жетоны", per3: 8, at: [[3, 8], [2500, 8500]] },
  { cur: "TOOTH", name: "Зубы", per3: 720 },
  { cur: "PAP", name: "Папиросы", per3: 2400 },
];
/** the prices of the 9 packs, in stars */
export const STAR_PRICES = [3, 10, 25, 50, 100, 250, 500, 1000, 2500] as const;
export const DONATE_EXTRA_MAX = 0.1;

export interface DonatePack { id: string; cur: Currency; stars: number; amount: number; idx: number }

const nice = (v: number) => (v >= 10_000 ? Math.round(v / 100) * 100 : v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v));
/** the amount per star at a price: between the fixed packs, evenly on log(stars) */
function perStar(at: [number, number][], stars: number): number {
  for (let i = 0; i < at.length - 1; i++) {
    const [s0, a0] = at[i], [s1, a1] = at[i + 1];
    if (stars <= s1) {
      const t = Math.log(stars / s0) / Math.log(s1 / s0);
      return a0 / s0 + t * (a1 / s1 - a0 / s0);
    }
  }
  const [s, a] = at[at.length - 1];
  return a / s;
}
const amountOf = (t: (typeof DONATE_TABS)[number], stars: number, idx: number) => {
  const fixed = t.at?.find(([s]) => s === stars);
  if (fixed) return fixed[1];
  if (t.at) return nice(perStar(t.at, stars) * stars);
  return nice((t.per3 / 3) * stars * (1 + (DONATE_EXTRA_MAX * idx) / (STAR_PRICES.length - 1)));
};
export const DONATE_PACKS: DonatePack[] = DONATE_TABS.flatMap((t) =>
  STAR_PRICES.map((stars, idx) => ({ id: `${t.cur}-${idx}`, cur: t.cur, stars, idx, amount: amountOf(t, stars, idx) })),
);
export const donatePack = (id: string) => DONATE_PACKS.find((p) => p.id === id);
