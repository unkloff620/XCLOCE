import { BOSSES } from "./bosses.ts";
import type { Reward } from "./rewards.ts";

/*
 * «Сходняк» — the clans' weekly meeting. Each player of a clan takes tasks from the list (3 slots free, the 4th–6th
 * bought with SOL for this week), does them, and their points go to the clan. On Monday the clans are ranked by the
 * week's points; every member of the top-10 clans gets the prize of their clan's place. Tasks reset each week.
 */

export type ShodTaskKind = "damage" | "kill";
export interface ShodTask {
  id: string;
  kind: ShodTaskKind;
  /** damage to deal / wins over this boss */
  goal: number;
  boss?: string;
  points: number;
}

const DAMAGE_TIERS: [number, number][] = [
  [10_000, 1], [50_000, 3], [100_000, 5], [250_000, 10], [500_000, 18], [1_000_000, 30],
];
/** by the boss's order: the later the boss, the more points */
const KILL_POINTS = [0, 2, 3, 4, 6, 8, 10, 13, 16, 20, 24, 30, 36, 45];

export const SHOD_TASKS: ShodTask[] = [
  ...DAMAGE_TIERS.map(([goal, points]) => ({ id: `dmg-${goal}`, kind: "damage" as const, goal, points })),
  // Боцман comes once a year — not in the list
  ...BOSSES.filter((b) => !b.event && b.id !== "botsman" && b.order <= 13).map((b) => ({
    id: `kill-${b.id}`, kind: "kill" as const, goal: 1, boss: b.id, points: KILL_POINTS[b.order] ?? 2,
  })),
];
export const shodTaskById = (id: string) => SHOD_TASKS.find((t) => t.id === id);

/** free task slots a week; the 4th, 5th and 6th are bought with SOL (for this week) */
export const SHOD_FREE_SLOTS = 3;
export const SHOD_SLOT_PRICES = [4, 5, 6];
export const SHOD_MAX_SLOTS = SHOD_FREE_SLOTS + SHOD_SLOT_PRICES.length;

/** the set of the «Сходняк» tattoos (prizes of the top 3 clans) */
export const SHOD_SET = "shodnyak";
/** tattoos for places 1–3 (when one has the whole set — rubles instead of each) */
export const SHOD_TATTOOS = [3, 2, 1];
export const SHOD_TATTOO_RUB = 15_000;

/** every member of the top-10 clans, by the clan's place (index 0 = 1st) */
export const SHOD_PRIZES: Reward[] = [
  { xp: 300_000, currencies: { RUB: 50_000, USD: 25 } },
  { xp: 200_000, currencies: { RUB: 30_000, USD: 15 } },
  { xp: 120_000, currencies: { RUB: 20_000, USD: 10 } },
  ...Array.from({ length: 7 }, () => ({ xp: 50_000, currencies: { RUB: 8_000, USD: 4 } }) as Reward),
];

/** the 1st place also picks a week-long boost of one weapon */
export const SHOD_BOOST_WEAPONS = ["rug-pull-gun", "gpu"] as const;
export const SHOD_BOOST = 0.2;
export const SHOD_BOOST_DAYS = 7;
