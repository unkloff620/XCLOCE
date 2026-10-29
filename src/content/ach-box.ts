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

/** what is inside: roubles and dollars at random, and a weapon (keyboards mostly, a GPU now and then, rarely a Rug Pull Gun) */
export const ACH_BOX_WEAPONS = [
  { id: "keyboard", min: 1, max: 3, weight: 55 },
  { id: "gpu", min: 1, max: 1, weight: 35 },
  { id: "rug-pull-gun", min: 1, max: 1, weight: 10 },
] as const;
export const ACH_BOX_RUB = { min: 300, max: 2_000, step: 50 };
export const ACH_BOX_USD = { min: 3, max: 25 };

export function rollAchBox(rng: () => number): Reward {
  const rub = ACH_BOX_RUB.min + Math.floor(rng() * ((ACH_BOX_RUB.max - ACH_BOX_RUB.min) / ACH_BOX_RUB.step + 1)) * ACH_BOX_RUB.step;
  const usd = ACH_BOX_USD.min + Math.floor(rng() * (ACH_BOX_USD.max - ACH_BOX_USD.min + 1));
  const total = ACH_BOX_WEAPONS.reduce((t, w) => t + w.weight, 0);
  let r = rng() * total;
  const w = ACH_BOX_WEAPONS.find((x) => (r -= x.weight) < 0) ?? ACH_BOX_WEAPONS[0];
  const qty = w.min + Math.floor(rng() * (w.max - w.min + 1));
  return { currencies: { RUB: Math.min(ACH_BOX_RUB.max, rub), USD: Math.min(ACH_BOX_USD.max, usd) }, items: [{ id: w.id, qty }] };
}
