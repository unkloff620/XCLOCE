import type { Reward } from "./rewards.ts";
import type { Currency } from "./currencies.ts";
import { ACH_BOX_COST } from "./ach-box.ts";

/*
 * «Барыга на газели»: every Friday a van stands in the yard till the end of Sunday (Moscow time). Its back doors open:
 *  - «Меняла» (the left door): the week's saved-up currency for roubles or метро tokens. Every other week it takes
 *    папиросы, then зубы (VAN_TAKES by the week's number); the rate of the visit is fixed somewhere in its range.
 *  - «Акции» (the right door): one free pack and three packs for roubles (Пацанский, Блатной, Авторитетный), each once
 *    a visit; what lies inside is rolled in the ranges below.
 * The user's table (2026-11-20).
 */

/** Moscow days of the week the van stands (0 — Monday): Friday, Saturday, Sunday */
export const VAN_DAYS = [4, 5, 6] as const;

/** what the van takes this week: папиросы and зубы, by turns */
export const VAN_TAKES: Currency[] = ["PAP", "TOOTH"];
/** how much of the week's currency one rouble / one token costs: a range, the visit's rate somewhere in it */
export const VAN_RATES: Record<string, { RUB: [number, number]; TOKEN: [number, number] }> = {
  PAP: { RUB: [8200, 9900], TOKEN: [1800, 2400] },
  TOOTH: { RUB: [7200, 8900], TOKEN: [1400, 2000] },
};
/** what the van gives for it */
export const VAN_GIVES = ["RUB", "TOKEN"] as const;
export type VanGive = (typeof VAN_GIVES)[number];

const DAY = 86_400_000;
const MSK = 3 * 3_600_000;
/** the Monday (Moscow) of the week of `now`, ms */
const weekMonday = (now: number) => {
  const msk = new Date(now + MSK);
  const dow = (msk.getUTCDay() + 6) % 7;
  return Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() - dow) - MSK;
};
/** a number for the week (weeks since 1970), the same all week */
export const vanWeekNo = (now: number) => Math.round(weekMonday(now) / (7 * DAY));
/** the visit's key: its Friday, "2026-11-20" */
export const vanVisit = (now: number) => new Date(weekMonday(now) + 4 * DAY + MSK).toISOString().slice(0, 10);

/** the van is in the yard: Friday 00:00 … Sunday 24:00 (Moscow); `until` — when it leaves, or when it comes next */
export function vanWindow(now: number): { open: boolean; until: number } {
  const mon = weekMonday(now);
  const from = mon + VAN_DAYS[0] * DAY, to = mon + (VAN_DAYS[VAN_DAYS.length - 1] + 1) * DAY;
  if (now >= from && now < to) return { open: true, until: to };
  return { open: false, until: now < from ? from : from + 7 * DAY };
}

/** a stable pseudo-random number 0…1 for a string (the visit's rates: the same for every player all weekend) */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100_000) / 100_000;
}
/** this visit: the currency the van takes and the price of one rouble and one token in it */
export function vanDeal(now: number): { takes: Currency; rates: Record<VanGive, number> } {
  const takes = VAN_TAKES[((vanWeekNo(now) % VAN_TAKES.length) + VAN_TAKES.length) % VAN_TAKES.length];
  const r = VAN_RATES[takes];
  const v = vanVisit(now);
  const at = ([a, b]: [number, number], k: string) => Math.round((a + (b - a) * hash01(`${v}:${k}`)) / 10) * 10;
  return { takes, rates: { RUB: at(r.RUB, "RUB"), TOKEN: at(r.TOKEN, "TOKEN") } };
}

/* ---------------- «Акции»: the packs ---------------- */
type Range = [number, number];
export interface VanPack {
  id: string;
  name: string;
  /** null — free (one a visit) */
  price: { currency: Currency; amount: number } | null;
  /** currencies and items: each a range; "case" — openings of «Ящик ништяков» */
  currencies: Partial<Record<Currency, Range>>;
  items: Partial<Record<string, Range>>;
}
export const VAN_CASE = "case";
export const VAN_PACKS: VanPack[] = [
  { id: "free", name: "Бесплатно", price: null,
    currencies: { RUB: [5, 8], TOOTH: [1123, 1425], PAP: [1825, 2262], GOLD: [2, 3], TOKEN: [8, 13] },
    items: { "rug-pull-gun": [2, 4], gpu: [4, 6], keyboard: [1, 4] } },
  { id: "pacan", name: "Пацанский подгон", price: { currency: "RUB", amount: 79 },
    currencies: { RUB: [6, 9], TOOTH: [2123, 3425], PAP: [3825, 4262], GOLD: [2, 5], TOKEN: [13, 19] },
    items: { "rug-pull-gun": [2, 4], gpu: [5, 9], keyboard: [1, 5] } },
  { id: "blat", name: "Блатной подгон", price: { currency: "RUB", amount: 250 },
    currencies: { RUB: [10, 15], TOOTH: [3123, 4425], PAP: [5825, 7262], GOLD: [5, 8], TOKEN: [25, 35] },
    items: { "rug-pull-gun": [4, 7], gpu: [7, 10], keyboard: [2, 6] } },
  { id: "avtor", name: "Авторитетный подгон", price: { currency: "RUB", amount: 350 },
    currencies: { RUB: [15, 20], TOOTH: [4123, 5425], PAP: [7825, 8262], GOLD: [6, 9], TOKEN: [29, 40] },
    items: { "energy-drink": [1, 2], "poker-chip": [1, 3], [VAN_CASE]: [1, 2], "rug-pull-gun": [6, 9], gpu: [8, 12], keyboard: [3, 7] } },
];
export const vanPackById = (id: string) => VAN_PACKS.find((p) => p.id === id);

/** a seeded 0…1 sequence (mulberry32) */
function seeded(seed: string): () => number {
  let a = Math.floor(hash01(seed) * 0xffffffff) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** what a pack holds on this visit: rolled in its ranges ONCE a visit — the same for every player all weekend */
export const vanPackOf = (p: VanPack, visit: string): Reward => rollVanPack(p, seeded(`${visit}:${p.id}`));

/** what a pack gives: every line an amount in its range (the cases as achievement points) */
export function rollVanPack(p: VanPack, rng: () => number): Reward {
  const r = ([a, b]: Range) => a + Math.floor(rng() * (b - a + 1));
  const currencies = Object.fromEntries(Object.entries(p.currencies).map(([c, x]) => [c, r(x!)])) as Partial<Record<Currency, number>>;
  const items: { id: string; qty: number }[] = [];
  let achPoints = 0;
  for (const [id, x] of Object.entries(p.items)) {
    const n = r(x!);
    if (id === VAN_CASE) achPoints += n * ACH_BOX_COST;
    else items.push({ id, qty: n });
  }
  return { currencies, items, ...(achPoints ? { achPoints } : {}) };
}
