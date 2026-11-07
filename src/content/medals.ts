/*
 * Fight modes, and the tiers of the boss coins (his face on a coin for 10 / 50 / 100 wins — «Дела», boss cards).
 * Every boss can be fought in three modes (the HP × mult): «Пацанский» ×1, «Блатной» ×3, «Авторитетный» ×6.
 * (The «blasts» — a medal for every win adding weapon damage — were taken out of the game.)
 * The boss's own things (his clothes, rooms, first-win things) drop only in «Блатной»; money, passes and the usual
 * consumable drops come in every mode.
 */

export type FightMode = "pacan" | "blat" | "avtor";
export type MedalTier = "bronze" | "silver" | "gold";

/** `reward`: the money and authority of a win × this (the harder mode pays more) */
export interface FightModeDef { id: FightMode; name: string; hp: number; medal: MedalTier; things: boolean; reward: number }

export const FIGHT_MODES: FightModeDef[] = [
  { id: "pacan", name: "Пацанский", hp: 1, medal: "bronze", things: false, reward: 1 },
  { id: "blat", name: "Блатной", hp: 3, medal: "silver", things: true, reward: 2 },
  { id: "avtor", name: "Авторитетный", hp: 6, medal: "gold", things: false, reward: 4 },
];
export const fightMode = (id: string | null | undefined): FightModeDef => FIGHT_MODES.find((m) => m.id === id) ?? FIGHT_MODES[0];
export const MEDAL_TIERS: MedalTier[] = ["bronze", "silver", "gold"];
export const MEDAL_NAMES: Record<MedalTier, string> = { bronze: "Бронза", silver: "Серебро", gold: "Золото" };
