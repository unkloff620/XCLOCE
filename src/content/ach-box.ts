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
