/*
 * «Взлом» — the box-cracking event (an admin's event with the «Ящики со взломом» effect, content/events.ts).
 * While it is on, every boss win (any mode, a fair share of the damage) drops a box into the player's 5 cells, unless
 * they are all taken. A box has 1–4 padlocks; a lock is picked in LOCK_MS (the player starts each lock himself — he has
 * to come back; only one box is picked at a time), or opened at once for LOCK_RUSH teeth (LOCK_RUSH_GOLD bars when the
 * teeth run short). When all locks are off, the box opens: weapons, nuggets, rings… — more if every padlock was paid in
 * bars — and maybe a piece of the event's tattoo sets (boss "heist" in content/tattoos.ts).
 */
import type { Reward } from "./rewards.ts";
import { ACH_BOX_COST } from "./ach-box.ts";

export type HeistKind = "bronze" | "silver" | "gold" | "diamond";
export const HEIST_KINDS: HeistKind[] = ["bronze", "silver", "gold", "diamond"];

export interface HeistBoxDef {
  id: HeistKind;
  name: string;
  locks: number;
}

export const HEIST_BOXES: HeistBoxDef[] = [
  { id: "bronze", name: "Бронзовый ящик", locks: 1 },
  { id: "silver", name: "Серебряный ящик", locks: 2 },
  { id: "gold", name: "Золотой ящик", locks: 3 },
  { id: "diamond", name: "Бриллиантовый ящик", locks: 4 },
];
/** the padlocks hang in a row across the plain band of the chest's front (public/assets/heist/chest-<kind>.webp, all one shape):
 * centred at `y` of its height, `gap` apart and `w` wide — in parts of its width */
export const LOCK_ROW = { y: 0.47, gap: 0.22, w: 0.15 };
export const heistBox = (id: string) => HEIST_BOXES.find((b) => b.id === id) ?? HEIST_BOXES[0];

/** the player's cells for boxes */
export const HEIST_SLOTS = 5;
/** one padlock takes this long to pick (the user 2026-11-27: 6 hours) */
export const LOCK_MS = 6 * 60 * 60_000;
/** a padlock opened at once: for teeth first; with fewer teeth than that — for gold bars (the user 2026-11-27) */
export const LOCK_RUSH = 25_000;
export const LOCK_RUSH_GOLD = 8;
/** «Автовзлом»: each padlock left paid in teeth, then they come off by themselves, one after another */
export const LOCK_AUTO = 100;
/** what one padlock costs now: teeth while there are enough, else gold bars */
export const rushPrice = (teeth: number): { currency: "TOOTH" | "GOLD"; amount: number } =>
  teeth >= LOCK_RUSH ? { currency: "TOOTH", amount: LOCK_RUSH } : { currency: "GOLD", amount: LOCK_RUSH_GOLD };
/** the tattoo sets of the event */
export const HEIST_SET_BOSS = "heist";

/**
 * The odds of each box by the boss's strength: `t` 0 (Дацкоу) … 1 (Солнце). Weak bosses mostly give bronze;
 * the strongest give diamond one time in four.
 */
export function heistOdds(t: number): Record<HeistKind, number> {
  const k = Math.min(1, Math.max(0, t));
  const diamond = 0.02 + 0.23 * k, gold = 0.08 + 0.22 * k, silver = 0.25 + 0.07 * k;
  return { bronze: 1 - diamond - gold - silver, silver, gold, diamond };
}
/** the boss's strength for the odds: his place in the chain (order 1…13), an event boss counts as a strong one */
export const heistStrength = (order: number, event = false) => (event ? 0.7 : (order - 1) / 12);

export function rollHeistKind(rng: () => number, t: number): HeistKind {
  const o = heistOdds(t);
  let r = rng();
  for (const k of HEIST_KINDS) { if (r < o[k]) return k; r -= o[k]; }
  return "bronze";
}

/**
 * What a box holds (the user 2026-11-27): a box whose every padlock was opened for gold bars holds the «bars» loot;
 * any other (waited out, opened for teeth, «Автовзлом») the «teeth» one. Each line a range; "case" — openings of
 * «Ящик ништяков» (as achievement points, like the van's packs); `tattoo` — the chance of a piece of the event's sets.
 */
export type HeistPay = "teeth" | "bars";
export interface HeistLoot { tattoo: number; items: [string, number, number][] }
export const HEIST_CASE = "case";
const LOOT: Record<HeistPay, Record<HeistKind, HeistLoot>> = {
  teeth: {
    bronze: { tattoo: 0.1, items: [["keyboard", 3, 5], ["gpu", 1, 2], ["rug-pull-gun", 0, 1], ["gold-nugget", 4, 6]] },
    silver: { tattoo: 0.2, items: [["keyboard", 7, 14], ["gpu", 3, 6], ["rug-pull-gun", 2, 3], ["gold-nugget", 7, 15], ["gold-ring", 3, 3]] },
    gold: { tattoo: 0.3, items: [["keyboard", 18, 29], ["gpu", 8, 18], ["rug-pull-gun", 5, 8], ["gold-nugget", 23, 36], ["gold-ring", 6, 6], ["poker-chip", 1, 2], ["fortune-ticket", 1, 2], [HEIST_CASE, 1, 1]] },
    diamond: { tattoo: 0.4, items: [["keyboard", 40, 60], ["gpu", 28, 38], ["rug-pull-gun", 17, 25], ["gold-nugget", 55, 75], ["gold-ring", 8, 12], ["poker-chip", 2, 3], ["fortune-ticket", 3, 5], [HEIST_CASE, 1, 2], ["energy-drink", 1, 2]] },
  },
  bars: {
    bronze: { tattoo: 0.2, items: [["keyboard", 6, 10], ["gpu", 2, 3], ["rug-pull-gun", 1, 1], ["gold-nugget", 8, 12]] },
    silver: { tattoo: 0.3, items: [["keyboard", 14, 24], ["gpu", 6, 10], ["rug-pull-gun", 3, 6], ["gold-nugget", 15, 25], ["gold-ring", 6, 6], ["poker-chip", 1, 1]] },
    gold: { tattoo: 0.4, items: [["keyboard", 35, 55], ["gpu", 18, 28], ["rug-pull-gun", 10, 16], ["gold-nugget", 40, 60], ["gold-ring", 10, 10], ["poker-chip", 2, 2], ["fortune-ticket", 2, 3], [HEIST_CASE, 1, 1]] },
    diamond: { tattoo: 0.5, items: [["keyboard", 80, 120], ["gpu", 50, 75], ["rug-pull-gun", 30, 45], ["gold-nugget", 100, 140], ["gold-ring", 15, 20], ["poker-chip", 3, 3], ["fortune-ticket", 6, 8], [HEIST_CASE, 2, 2], ["energy-drink", 2, 3]] },
  },
};
export const heistLoot = (k: HeistKind, pay: HeistPay = "teeth") => LOOT[pay][k];
/** a box opened with every padlock paid in gold bars holds the «bars» loot */
export const heistPay = (locks: number, goldPaid: number): HeistPay => (goldPaid >= locks ? "bars" : "teeth");

const between = (a: number, b: number, rng: () => number) => a + Math.floor(rng() * (b - a + 1));

/** the contents of an opened box (the tattoo piece is added by the server: one the player has not got yet) */
export function rollHeistLoot(k: HeistKind, rng: () => number, pay: HeistPay = "teeth"): Reward {
  const items: { id: string; qty: number }[] = [];
  let achPoints = 0;
  for (const [id, a, b] of LOOT[pay][k].items) {
    const n = between(a, b, rng);
    if (n <= 0) continue;
    if (id === HEIST_CASE) achPoints += n * ACH_BOX_COST;
    else items.push({ id, qty: n });
  }
  return achPoints ? { items, achPoints } : { items };
}
