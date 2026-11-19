import { BOSSES } from "./bosses.ts";
import type { Reward } from "./rewards.ts";

/*
 * «Сходняк» — the clans' weekly meeting. Each player of a clan takes tasks from the list (3 slots free, the 4th–6th
 * bought with SOL for this week), does them, and their points go to the clan. On Monday the clans are ranked by the
 * week's points; every member of the top-10 clans gets the prize of their clan's place. Tasks reset each week.
 */

export type ShodTaskKind = "damage" | "kill" | "authority" | "rub" | "location";
export interface ShodTask {
  id: string;
  kind: ShodTaskKind;
  /** damage to deal / wins over this boss / authority to get / roubles to earn / locations to pass */
  goal: number;
  boss?: string;
  /** a win only in this fight mode counts (none — any mode) */
  mode?: "blat" | "avtor";
  points: number;
}

const DAMAGE_TIERS: [number, number][] = [
  [10_000, 1], [50_000, 3], [100_000, 5], [250_000, 10], [500_000, 18], [1_000_000, 30],
];
const AUTHORITY_TIERS: [number, number][] = [
  [5_000, 1], [25_000, 3], [100_000, 6], [250_000, 12], [500_000, 20], [1_000_000, 35],
];
const RUB_TIERS: [number, number][] = [
  [5_000, 1], [25_000, 3], [50_000, 5], [100_000, 8], [250_000, 14], [500_000, 25],
];
/** a location passed (its five tasks done and the reward taken), any location, day or night */
const LOCATION_TIERS: [number, number][] = [[5, 3], [10, 6], [15, 10], [25, 18]];
/** by the boss's order: the later the boss, the more points; «Блатной» ×1.5, «Авторитетный» ×2 */
const KILL_POINTS = [0, 2, 3, 4, 6, 8, 10, 13, 16, 20, 24, 30, 36, 45];
const MODE_K = { blat: 1.5, avtor: 2 } as const;

const CHAIN = BOSSES.filter((b) => !b.event && b.order <= 13);
export const SHOD_TASKS: ShodTask[] = [
  ...DAMAGE_TIERS.map(([goal, points]) => ({ id: `dmg-${goal}`, kind: "damage" as const, goal, points })),
  ...CHAIN.map((b) => ({ id: `kill-${b.id}`, kind: "kill" as const, goal: 1, boss: b.id, points: KILL_POINTS[b.order] ?? 2 })),
  ...(["blat", "avtor"] as const).flatMap((mode) => CHAIN.map((b) => ({
    id: `kill-${b.id}-${mode}`, kind: "kill" as const, goal: 1, boss: b.id, mode, points: Math.round((KILL_POINTS[b.order] ?? 2) * MODE_K[mode]),
  }))),
  ...AUTHORITY_TIERS.map(([goal, points]) => ({ id: `xp-${goal}`, kind: "authority" as const, goal, points })),
  ...RUB_TIERS.map(([goal, points]) => ({ id: `rub-${goal}`, kind: "rub" as const, goal, points })),
  ...LOCATION_TIERS.map(([goal, points]) => ({ id: `loc-${goal}`, kind: "location" as const, goal, points })),
];
export const shodTaskById = (id: string) => SHOD_TASKS.find((t) => t.id === id);

/** free task slots a week; the 4th, 5th and 6th are bought with SOL (for this week) */
export const SHOD_FREE_SLOTS = 3;
export const SHOD_SLOT_PRICES = [4, 5, 6];
export const SHOD_MAX_SLOTS = SHOD_FREE_SLOTS + SHOD_SLOT_PRICES.length;

/** the «Сходняк» tattoo sets (prizes of the top 3 clans): the pieces go to the set one has most of first */
export const SHOD_SETS = ["shod-domes", "shod-bear", "shod-raven"];
/** tattoos for places 1–3 (when one has the whole set — rubles instead of each) */
export const SHOD_TATTOOS = [3, 2, 1];
export const SHOD_TATTOO_RUB = 15_000;

/** every member of the top-10 clans, by the clan's place (index 0 = 1st) */
export const SHOD_PRIZES: Reward[] = [
  { xp: 300_000, currencies: { RUB: 50_000 } },
  { xp: 200_000, currencies: { RUB: 30_000 } },
  { xp: 120_000, currencies: { RUB: 20_000 } },
  ...Array.from({ length: 7 }, () => ({ xp: 50_000, currencies: { RUB: 8_000 } }) as Reward),
];

/** the 1st place also picks a week-long boost of one weapon */
export const SHOD_BOOST_WEAPONS = ["rug-pull-gun", "gpu"] as const;
export const SHOD_BOOST = 0.2;
export const SHOD_BOOST_DAYS = 7;
