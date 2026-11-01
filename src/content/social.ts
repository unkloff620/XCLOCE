/*
 * What players do to each other from a profile (server: systems/social.ts):
 *  - «Бицуха»: a tap pumps the other player's biceps by one (each visitor once in SOCIAL_COOLDOWN_MS per player). The more
 *    biceps, the harder it is to beat him in a fist fight;
 *  - «Наехать»: a fist fight in the background — a chance by the biceps (fightChance: equal — 50%, half — 10%), the attacker who
 *    wins gets FIGHT_WIN; each player once in SOCIAL_COOLDOWN_MS (no daily limits — only the reload);
 *  - «Харкнуть»: the other player gets «В тебя харкнул …» in his messages; the same player once in SPIT_EVERY_MS.
 */
import type { Reward } from "./rewards.ts";

export const FIGHT_WIN: Reward = { currencies: { RUB: 50 } };
/** the same player again — after an hour (all three: biceps, a fight, a spit); the button refills clockwise meanwhile */
export const SOCIAL_COOLDOWN_MS = 60 * 60_000;
export const SPIT_EVERY_MS = SOCIAL_COOLDOWN_MS;
/** messages are kept this long */
export const NOTE_KEEP_MS = 7 * 24 * 3600_000;

/**
 * The chance to win a fist fight: equal biceps — 50%, and it goes down (up) smoothly the weaker (stronger) you are:
 * 99 against 100 — about 49%, 100 against 200 — 10%, 100 against 1 000 — under 1%. The weaker one always keeps a
 * little luck (FIGHT_MIN_CHANCE), the stronger one may still slip.
 */
export const FIGHT_LUCK_POWER = Math.log(0.2) / Math.log(0.5); // ≈2.32: half the biceps — 10%
export const FIGHT_MIN_CHANCE = 0.01;
export function fightChance(mine: number, theirs: number): number {
  const a = Math.max(0, mine), b = Math.max(0, theirs);
  if (a === b) return 0.5;
  const p = a < b ? 0.5 * Math.pow(a / b, FIGHT_LUCK_POWER) : 1 - 0.5 * Math.pow(b / a, FIGHT_LUCK_POWER);
  return Math.min(1 - FIGHT_MIN_CHANCE, Math.max(FIGHT_MIN_CHANCE, p));
}
