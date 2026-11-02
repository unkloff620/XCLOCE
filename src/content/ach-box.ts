import type { Reward } from "./rewards.ts";

/*
 * «Ящик ништяков» on the shop shelf by the energy drinks. Achievement points (the sun) are never spent: every
 * ACH_BOX_COST points earned give one opening; the boxes already opened are counted (players.ach_boxes_opened).
 * So 73 points = 14 boxes, and the 15th comes at 75 (the box shows 3/5 meanwhile).
 */
export const ACH_BOX_COST = 5;

/** how many boxes are waiting, and the way to the next one */
export function achBoxState(points: number, opened: number) {
  const earned = Math.floor(Math.max(0, points) / ACH_BOX_COST);
  return { points, opened, ready: Math.max(0, earned - opened), progress: Math.max(0, points) % ACH_BOX_COST, cost: ACH_BOX_COST };
}

/** what is inside: roubles and dollars at random, and every weapon on its own — 1–3 keyboards, a GPU (now and then two)
 * and often a Rug Pull Gun: on average 2 keyboards, 1,25 GPU and 0,77 Rug Pull Gun a box (169 boxes ≈ 340 / 210 / 130) */
export const ACH_BOX_WEAPONS = [
  { id: "keyboard", min: 1, max: 3, chance: 1, extra: 0 },
  { id: "gpu", min: 1, max: 1, chance: 1, extra: 0.25 },
  { id: "rug-pull-gun", min: 1, max: 1, chance: 0.77, extra: 0 },
] as const;
/** things for the mouth (slot «Рот»): each opened box with this chance gives one the player does not have yet */
export const MOUTH_ITEMS = ["cigarette", "toothpick"] as const;
export const MOUTH_ITEM_CHANCE = 0.1;
/** things that drop only from the case (the mouth things, the teeth, the face things, the hats, the chain): each with its own
 * chance (CASE_THING_CHANCE), only while the player has none of it; they land in the case's «Вещь» frame */
export const CASE_THINGS = [...MOUTH_ITEMS, "shades-gold", "chain-cuban", "mask-anon", "monocle-whale", "bruise-liq", "crown-cash", "ushanka-star", "helmet-miner", "bandana-hodl", "cigar", "teeth-grin", "grillz-diamond"] as const;
/** each case thing drops on its own with this chance per opened box (only one the player does not have yet) */
export const CASE_THING_CHANCE: Record<(typeof CASE_THINGS)[number], number> = {
  cigarette: 0.05, toothpick: 0.08, cigar: 0.04, "teeth-grin": 0.03, "grillz-diamond": 0.02, "shades-gold": 0.09, "mask-anon": 0.1, "monocle-whale": 0.1,
  "bruise-liq": 0.13, "crown-cash": 0.15, "ushanka-star": 0.2, "helmet-miner": 0.24, "bandana-hodl": 0.18, "chain-cuban": 0.14,
};
export const ACH_BOX_RUB = { min: 300, max: 2_000, step: 50 };
export const ACH_BOX_USD = { min: 3, max: 25 };

export function rollAchBox(rng: () => number): Reward {
  const rub = ACH_BOX_RUB.min + Math.floor(rng() * ((ACH_BOX_RUB.max - ACH_BOX_RUB.min) / ACH_BOX_RUB.step + 1)) * ACH_BOX_RUB.step;
  const usd = ACH_BOX_USD.min + Math.floor(rng() * (ACH_BOX_USD.max - ACH_BOX_USD.min + 1));
  const items: { id: string; qty: number }[] = [];
  for (const w of ACH_BOX_WEAPONS) {
    if (rng() >= w.chance) continue;
    const qty = w.min + Math.floor(rng() * (w.max - w.min + 1)) + (rng() < w.extra ? 1 : 0);
    items.push({ id: w.id, qty });
  }
  return { currencies: { RUB: Math.min(ACH_BOX_RUB.max, rub), USD: Math.min(ACH_BOX_USD.max, usd) }, items };
}
