import type { Reward } from "./rewards.ts";
import { tattooSetsOfBoss } from "./tattoos.ts";

/*
 * «Дополнительная награда» — the rewards for damage (the user 2026-11-27): the box by the boss in a fight. Deal the boss
 * BONUS_SHARES of his HP in this fight (5 %, then 10 % of the fight's HP) and, if the fight is won, every reached stage
 * pays on top of the usual reward:
 *  - the first bosses (KEY_BONUS_BOSSES — their passes open the next one): 1 more pass of this boss for each stage;
 *  - every other boss: 1 more tattoo of his set of this mode for each stage (a piece the player does not have yet) — with
 *    the win's own tattoo, up to 3 a fight. A mode with no tattoo set of his («Блатной»), or a set already complete:
 *    no box.
 */
export interface BossBonusStage {
  /** the damage to deal in this fight */
  damage: number;
  /** what it pays (a tattoo stage: one piece of `set` — shown by the set's first piece, the server picks a missing one) */
  reward: Reward;
  set?: string;
}

export const BONUS_SHARES = [0.05, 0.1] as const;
export const KEY_BONUS_BOSSES = ["datsik", "kedr", "mugo", "garkusha"] as const;

/** the stages of this boss's box in a fight with this HP and mode */
export function bossBonus(bossId: string, hpMax: number, mode: string): BossBonusStage[] {
  if (!(hpMax > 0)) return [];
  const at = (k: number) => Math.max(1, Math.ceil(hpMax * k));
  if ((KEY_BONUS_BOSSES as readonly string[]).includes(bossId)) {
    return BONUS_SHARES.map((k) => ({ damage: at(k), reward: { items: [{ id: `key-${bossId}`, qty: 1 }] } }));
  }
  const set = tattooSetsOfBoss(bossId).find((s) => s.mode === mode);
  if (!set) return [];
  return BONUS_SHARES.map((k) => ({ damage: at(k), reward: { items: [{ id: set.pieces[0].id, qty: 1 }] }, set: set.id }));
}

/** the stages reached with this damage */
export const bonusReached = (bossId: string, hpMax: number, mode: string, damage: number) => bossBonus(bossId, hpMax, mode).filter((s) => damage >= s.damage);
