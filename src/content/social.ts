/*
 * What players do to each other from a profile (server: systems/social.ts):
 *  - «Бицуха»: a tap pumps the other player's biceps by one (each visitor once a Moscow day per player). The more
 *    biceps, the harder it is to beat him in a fist fight;
 *  - «Наехать»: a fist fight in the background — more biceps wins (equal: the one attacked holds), the attacker who
 *    wins gets FIGHT_WIN; each player once a day, FIGHT_PER_DAY fights a day;
 *  - «Харкнуть»: the other player gets «В тебя харкнул …» in his messages; the same player once in SPIT_EVERY_MS.
 */
import type { Reward } from "./rewards.ts";

export const PUMP_PER_DAY = 50;
export const FIGHT_WIN: Reward = { currencies: { RUB: 50 } };
export const FIGHT_PER_DAY = 10;
export const SPIT_EVERY_MS = 60 * 60_000;
export const SPIT_PER_DAY = 30;
/** messages are kept this long */
export const NOTE_KEEP_MS = 7 * 24 * 3600_000;
