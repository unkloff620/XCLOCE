import type { Reward } from "./rewards.ts";

/*
 * «Ящик ништяков» on the shop shelf by the energy drinks. Achievement points (the sun) are never spent: every
 * ACH_BOX_COST points earned give one opening; the boxes already opened are counted (players.ach_boxes_opened).
 * So 730 points = 14 boxes, and the 15th comes at 750 (the box shows 30/50 meanwhile).
 */
export const ACH_BOX_COST = 50;

/** how many boxes are waiting, and the way to the next one */
export function achBoxState(points: number, opened: number) {
  const earned = Math.floor(Math.max(0, points) / ACH_BOX_COST);
  return { points, opened, ready: Math.max(0, earned - opened), progress: Math.max(0, points) % ACH_BOX_COST, cost: ACH_BOX_COST };
}

/** things for the mouth (slot «Рот»): each opened box with this chance gives one the player does not have yet */
export const MOUTH_ITEMS = ["cigarette", "toothpick"] as const;
export const MOUTH_ITEM_CHANCE = 0.1;
/** things that drop only from the case (the mouth things, the teeth, the face things, the hats, the chain): each with its own
 * chance (CASE_THING_CHANCE), only while the player has none of it; they land in the case's «Вещь» frame */
export const CASE_THINGS = [...MOUTH_ITEMS, "shades-gold", "chain-cuban", "mask-anon", "monocle-whale", "bruise-liq", "crown-cash", "ushanka-star", "helmet-miner", "bandana-hodl", "cigar", "teeth-grin", "grillz-diamond"] as const;
/** each case thing's chance per opened box; at most ONE thing a box (the chances of the ones the player lacks add up) */
export const CASE_THING_CHANCE: Record<(typeof CASE_THINGS)[number], number> = {
  cigarette: 0.005, toothpick: 0.008, cigar: 0.004, "teeth-grin": 0.003, "grillz-diamond": 0.0015, "shades-gold": 0.009, "mask-anon": 0.01, "monocle-whale": 0.01,
  "bruise-liq": 0.013, "crown-cash": 0.015, "ushanka-star": 0.02, "helmet-miner": 0.024, "bandana-hodl": 0.018, "chain-cuban": 0.014,
};
/** this many boxes in a row without a thing — the next one gives a thing (a random missing one) for sure */
export const CASE_THING_PITY = 20;
/** what is inside (the user's table): папиросы, жетоны, рубли, зубы and нычки (that many random stash pieces, picked by
 * the server); the tattoo and the thing are rolled by the server (BOX_TATTOO_CHANCE, CASE_THING_CHANCE / CASE_THING_PITY) */
export const ACH_BOX_LOOT = { PAP: [700, 3500], TOKEN: [6, 12], RUB: [7, 13], TOOTH: [500, 3000], stash: [5, 14] } as const;

export function rollAchBox(rng: () => number): Reward & { stash: number } {
  const r = ([a, b]: readonly [number, number], step = 1) => a + Math.floor(rng() * ((b - a) / step + 1)) * step;
  const L = ACH_BOX_LOOT;
  return { currencies: { PAP: r(L.PAP, 50), TOKEN: r(L.TOKEN), RUB: r(L.RUB), TOOTH: r(L.TOOTH, 50) }, stash: r(L.stash) };
}
