/**
 * «Донат» (the user 2026-11-24): every currency is bought for Telegram Stars in the shop (the goods on the shelves).
 * Each currency has 9 packs from 3 to 2500 stars; the base is its rate at 3 stars and the bigger the pack the better:
 * the extra grows evenly from 0 (3 stars) to +10% (2500 stars).
 */
import type { Currency } from "./currencies.ts";

/** the tabs in their order, and how much 3 stars give */
export const DONATE_TABS: { cur: Currency; name: string; per3: number }[] = [
  { cur: "RUB", name: "Рубли", per3: 12 },
  { cur: "GOLD", name: "Слитки", per3: 4 },
  { cur: "TOKEN", name: "Жетоны", per3: 8 },
  { cur: "TOOTH", name: "Зубы", per3: 720 },
  { cur: "PAP", name: "Папиросы", per3: 2400 },
];
/** the prices of the 9 packs, in stars */
export const STAR_PRICES = [3, 10, 25, 50, 100, 250, 500, 1000, 2500] as const;
export const DONATE_EXTRA_MAX = 0.1;

export interface DonatePack { id: string; cur: Currency; stars: number; amount: number; idx: number }

const nice = (v: number) => (v >= 10_000 ? Math.round(v / 100) * 100 : v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v));
export const DONATE_PACKS: DonatePack[] = DONATE_TABS.flatMap((t) =>
  STAR_PRICES.map((stars, idx) => ({
    id: `${t.cur}-${idx}`, cur: t.cur, stars, idx,
    amount: nice((t.per3 / 3) * stars * (1 + (DONATE_EXTRA_MAX * idx) / (STAR_PRICES.length - 1))),
  })),
);
export const donatePack = (id: string) => DONATE_PACKS.find((p) => p.id === id);
