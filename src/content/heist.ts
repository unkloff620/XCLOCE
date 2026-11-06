/*
 * «Взлом» — the box-cracking event (an admin's event with the «Ящики со взломом» effect, content/events.ts).
 * While it is on, every boss win (any mode, a fair share of the damage) drops a box into the player's 5 cells, unless
 * they are all taken. A box has 1–4 padlocks; a lock is picked in LOCK_MS (the player starts each lock himself — he has
 * to come back), or opened at once for LOCK_RUSH dollars. When all locks are off, the box opens: money, weapons, parts,
 * stashes and maybe a piece of the event's tattoo sets (boss "heist" in content/tattoos.ts).
 */
import type { Reward } from "./rewards.ts";
import { PARTS_BY_RARITY } from "./craft-drops.ts";
import { STASH_IDS } from "./stashes.ts";

export type HeistKind = "bronze" | "silver" | "gold" | "diamond";
export const HEIST_KINDS: HeistKind[] = ["bronze", "silver", "gold", "diamond"];

export interface HeistBoxDef {
  id: HeistKind;
  name: string;
  locks: number;
  /** the chance that an opened box holds a piece of the event's tattoo sets */
  tattoo: number;
}

export const HEIST_BOXES: HeistBoxDef[] = [
  { id: "bronze", name: "Бронзовый ящик", locks: 1, tattoo: 0.25 },
  { id: "silver", name: "Серебряный ящик", locks: 2, tattoo: 0.5 },
  { id: "gold", name: "Золотой ящик", locks: 3, tattoo: 0.75 },
  { id: "diamond", name: "Бриллиантовый ящик", locks: 4, tattoo: 1 },
];
/** the padlocks hang in a row across the plain band of the chest's front (public/assets/heist/chest-<kind>.webp, all one shape):
 * centred at `y` of its height, `gap` apart and `w` wide — in parts of its width */
export const LOCK_ROW = { y: 0.47, gap: 0.22, w: 0.15 };
export const heistBox = (id: string) => HEIST_BOXES.find((b) => b.id === id) ?? HEIST_BOXES[0];

/** the player's cells for boxes */
export const HEIST_SLOTS = 5;
/** one padlock takes this long to pick */
export const LOCK_MS = 60 * 60_000;
/** a padlock opened at once, in dollars */
export const LOCK_RUSH = 100;
/** every padlock opened for dollars takes a share off the box's loot; all of them — HEIST_RUSH_MAX (−40%) whatever the box:
 * diamond −10% a lock, gold −13%, silver −20%, bronze −40%. Waited out — all of it */
export const HEIST_RUSH_MAX = 0.4;
export const rushCut = (locks: number) => HEIST_RUSH_MAX / Math.max(1, locks);
/** the share of the loot left after `rushed` paid padlocks */
export const rushedShare = (locks: number, rushed: number) => Math.max(0, 1 - rushCut(locks) * Math.min(rushed, locks));
/** the loot scaled (a rushed box): money rounded down to hundreds, things down but at least 1 */
export function scaleLoot(r: Reward, k: number): Reward {
  if (k >= 1) return r;
  const cur: Record<string, number> = {};
  for (const [c, v] of Object.entries(r.currencies ?? {})) cur[c] = c === "RUB" ? Math.floor((Number(v) * k) / 100) * 100 : Math.max(1, Math.floor(Number(v) * k));
  return { ...r, currencies: cur, items: (r.items ?? []).map((it) => ({ ...it, qty: Math.max(1, Math.floor(it.qty * k)) })) };
}
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

/** what a box holds: ranges per kind (the richer the box, the more of everything) */
const LOOT: Record<HeistKind, { rub: [number, number]; usd: [number, number]; weapons: [string, number, number][]; parts: [number, number]; rare: number; epic: number; stashes: [number, number] }> = {
  bronze: { rub: [3_000, 6_000], usd: [2, 4], weapons: [["keyboard", 10, 20]], parts: [2, 4], rare: 0.15, epic: 0, stashes: [0, 1] },
  silver: { rub: [8_000, 15_000], usd: [5, 10], weapons: [["keyboard", 15, 30], ["gpu", 8, 15]], parts: [3, 6], rare: 0.25, epic: 0.03, stashes: [1, 1] },
  gold: { rub: [20_000, 40_000], usd: [12, 25], weapons: [["gpu", 15, 25], ["rug-pull-gun", 5, 10]], parts: [5, 8], rare: 0.35, epic: 0.06, stashes: [1, 2] },
  diamond: { rub: [50_000, 100_000], usd: [30, 60], weapons: [["gpu", 25, 40], ["rug-pull-gun", 15, 30]], parts: [8, 12], rare: 0.45, epic: 0.12, stashes: [2, 3] },
};
export const heistLoot = (k: HeistKind) => LOOT[k];

const between = (a: number, b: number, rng: () => number) => a + Math.floor(rng() * (b - a + 1));
const pick = <T,>(a: T[], rng: () => number) => a[Math.floor(rng() * a.length) % a.length];

/** the contents of an opened box (the tattoo piece is added by the server: one the player has not got yet) */
export function rollHeistLoot(k: HeistKind, rng: () => number): Reward {
  const L = LOOT[k];
  const items = new Map<string, number>();
  const add = (id: string, n: number) => n > 0 && items.set(id, (items.get(id) ?? 0) + n);
  for (const [id, a, b] of L.weapons) add(id, between(a, b, rng));
  for (let i = between(L.parts[0], L.parts[1], rng); i > 0; i--) {
    const r = rng();
    add(pick(PARTS_BY_RARITY[r < L.epic ? "epic" : r < L.epic + L.rare ? "rare" : "common"], rng), 1);
  }
  for (let i = between(L.stashes[0], L.stashes[1], rng); i > 0; i--) add(pick(STASH_IDS, rng), 1);
  // rounded to hundreds, like the other rewards
  const rub = Math.round(between(L.rub[0], L.rub[1], rng) / 100) * 100;
  return { currencies: { RUB: rub, USD: between(L.usd[0], L.usd[1], rng) }, items: [...items].map(([id, qty]) => ({ id, qty })) };
}
