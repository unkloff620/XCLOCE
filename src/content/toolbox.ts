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
