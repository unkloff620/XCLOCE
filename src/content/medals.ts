/*
 * Fight modes and boss medals.
 * Every boss can be fought in three modes (the HP × mult): «Пацанский» ×1, «Блатной» ×3, «Авторитетный» ×6.
 * A won fight (from KEY_SHARE of the HP, as for the pass) gives the boss's medal of the mode for sure: bronze, silver
 * or gold — his face on a coin. MEDAL_SET medals of one kind make a full set: it adds a flat bonus to his weapon
 * (MEDAL_WEAPON) — a share of that weapon's base damage, more for silver, the most for gold.
 * The boss's own things (his clothes, rooms, first-win things) drop only in «Блатной»; money, passes and the usual
 * consumable drops come in every mode.
 */
import { BOSSES, type BossDef } from "./bosses.ts";
import { WEAPONS } from "./items.ts";

export type FightMode = "pacan" | "blat" | "avtor";
export type MedalTier = "bronze" | "silver" | "gold";

export interface FightModeDef { id: FightMode; name: string; hp: number; medal: MedalTier; things: boolean }
export const FIGHT_MODES: FightModeDef[] = [
  { id: "pacan", name: "Пацанский", hp: 1, medal: "bronze", things: false },
  { id: "blat", name: "Блатной", hp: 3, medal: "silver", things: true },
  { id: "avtor", name: "Авторитетный", hp: 6, medal: "gold", things: false },
];
export const fightMode = (id: string | null | undefined): FightModeDef => FIGHT_MODES.find((m) => m.id === id) ?? FIGHT_MODES[0];
export const MEDAL_TIERS: MedalTier[] = ["bronze", "silver", "gold"];
export const MEDAL_NAMES: Record<MedalTier, string> = { bronze: "Бронза", silver: "Серебро", gold: "Золото" };

/** medals of one kind for the full set */
export const MEDAL_SET = 33;
/** the full set's bonus: this share of the weapon's base damage, added to every hit of it */
export const MEDAL_BONUS_SHARE: Record<MedalTier, number> = { bronze: 0.25, silver: 0.5, gold: 1 };

/** the weapon each boss's medals strengthen (his own set's weapon where he has one) */
const MEDAL_WEAPON: Record<string, string> = {
  datsik: "mouse", kedr: "fist", bebyakyan: "keyboard", garkusha: "red-candle", mugo: "keyboard", babafey: "gpu", vodovoz: "fist",
  knyaz: "gpu", vadim: "red-candle", botsman: "rug-pull-gun", utilizator: "gpu", fokus: "rug-pull-gun", solntse: "rug-pull-gun",
};
export function medalWeapon(b: BossDef): string {
  return MEDAL_WEAPON[b.id] ?? b.set?.weapon ?? "fist";
}
/** the flat damage a full set of this boss's medals of this kind adds to his weapon */
export function medalBonus(b: BossDef, tier: MedalTier): number {
  const base = WEAPONS.find((w) => w.id === medalWeapon(b))?.weapon?.damage ?? 10;
  return Math.max(1, Math.round(base * MEDAL_BONUS_SHARE[tier]));
}
export const MEDAL_BOSSES = BOSSES;
