/**
 * «Строительный ящик» in the shop (the user 2026-11-24): a CS2-style roulette — every craft part (level 0, no level-2/3
 * things) is in it; one spin costs TOOLBOX_PRICE tokens and gives one part, by rarity.
 */
import { CRAFT_PARTS } from "./craft.ts";

export const TOOLBOX_PRICE = 8;
/** the chance of each rarity per spin; inside a rarity every part is equally likely */
export const TOOLBOX_ODDS = { common: 0.75, rare: 0.21, epic: 0.04 } as const;
export const TOOLBOX_PARTS = CRAFT_PARTS.filter((p) => p.level === 0);

export function rollToolbox(rng: () => number): string {
  const r = rng();
  const tier = r < TOOLBOX_ODDS.epic ? "epic" : r < TOOLBOX_ODDS.epic + TOOLBOX_ODDS.rare ? "rare" : "common";
  const list = TOOLBOX_PARTS.filter((p) => p.rarity === tier);
  return list[Math.floor(rng() * list.length) % list.length].id;
}

/**
 * The discount roulette (the user 2026-11-24): after every spin a second strip rolls a discount on the NEXT spin; it lasts
 * TOOLBOX_DISC_MS (+ the time the two strips take to stop), and burns if the box is not spun by then. 100% — a free spin.
 */
export const TOOLBOX_DISCOUNTS = [25, 50, 75, 100] as const;
export const TOOLBOX_DISC_WEIGHTS = [50, 30, 15, 5];
export const TOOLBOX_DISC_MS = 60_000;
/** the strips' time to stop (main 5.2 s, then the discount's) — not taken from the player's minute */
export const TOOLBOX_DISC_GRACE = 9_000;
export const toolboxPrice = (disc: number) => Math.max(0, Math.ceil(TOOLBOX_PRICE * (1 - disc / 100) - 1e-9));
export function rollToolboxDiscount(rng: () => number): number {
  const total = TOOLBOX_DISC_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [i, w] of TOOLBOX_DISC_WEIGHTS.entries()) { if ((r -= w) < 0) return TOOLBOX_DISCOUNTS[i]; }
  return TOOLBOX_DISCOUNTS[0];
}
