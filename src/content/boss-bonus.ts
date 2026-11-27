import type { Reward } from "./rewards.ts";
import { tattooSetsOfBoss } from "./tattoos.ts";

/*
 * «Дополнительная награда» — the rewards for damage (the user 2026-11-27): the box by the boss in a fight. Deal the boss
 * BONUS_SHARES of his HP in this fight (5 %, then 10 % of the fight's HP) and, if the fight is won, every reached stage
 * pays on top of the usual reward:
 *  - the first bosses (KEY_BONUS_BOSSES — their passes open the next one): 1 more pass of this boss for each stage;
 *  - every other boss: 1 more tattoo of his set of this mode for each stage (a piece the player does not have yet) — with
 *    the win's own tattoo, up to 3 a fight (a mode with no tattoo set of his — «Блатной» — has no tattoo stages);
 *  - a boss's own further stages (EXTRA_STAGES), in any mode.
 */
export interface BossBonusStage {
  /** the damage to deal in this fight */
  damage: number;
  /** what it pays (a tattoo stage: one piece of `set` — shown by the set's first piece, the server picks a missing one) */
  reward: Reward;
  set?: string;
}

export const BONUS_SHARES = [0.05, 0.1] as const;
/** a boss's own further stages, in any mode (the user 2026-11-27: Солнце — 3 % for 1 000 roubles) */
export const EXTRA_STAGES: Record<string, { share: number; reward: Reward }[]> = {
  solntse: [{ share: 0.03, reward: { currencies: { RUB: 1000 } } }],
};
export const KEY_BONUS_BOSSES = ["datsik", "kedr", "mugo", "garkusha"] as const;

/**
 * the stages of this boss's box in a fight with this HP and mode; `owned` (the player's pieces, on the client): only as
 * many tattoo stages as there are pieces left after the win's own one — a complete set shows none
 */
export function bossBonus(bossId: string, hpMax: number, mode: string, owned?: (id: string) => boolean): BossBonusStage[] {
  if (!(hpMax > 0)) return [];
  const at = (k: number) => Math.max(1, Math.ceil(hpMax * k));
  if ((KEY_BONUS_BOSSES as readonly string[]).includes(bossId)) {
    return BONUS_SHARES.map((k) => ({ damage: at(k), reward: { items: [{ id: `key-${bossId}`, qty: 1 }] } }));
  }
  const set = tattooSetsOfBoss(bossId).find((s) => s.mode === mode);
  const extra = (EXTRA_STAGES[bossId] ?? []).map((x) => ({ damage: at(x.share), reward: x.reward }));
  const left = set ? (owned ? set.pieces.filter((p) => !owned(p.id)).length - 1 : BONUS_SHARES.length) : 0;
  const sets = set ? BONUS_SHARES.slice(0, Math.max(0, left)).map((k) => ({ damage: at(k), reward: { items: [{ id: set.pieces[0].id, qty: 1 }] }, set: set.id })) : [];
  return [...sets, ...extra].sort((a, b) => a.damage - b.damage);
}

/** the stages reached with this damage */
export const bonusReached = (bossId: string, hpMax: number, mode: string, damage: number) => bossBonus(bossId, hpMax, mode).filter((s) => damage >= s.damage);
