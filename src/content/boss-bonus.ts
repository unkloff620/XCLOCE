import type { Reward } from "./rewards.ts";

/*
 * «Дополнительная награда» (the user 2026-11-21): a box by the boss in a fight. Deal a boss this much damage in one
 * fight and, if the fight is won, every reached stage pays on top of the usual reward (all the stages reached add up).
 * Not every boss has it; it starts with Дацкоу.
 */
export interface BossBonusStage { damage: number; reward: Reward }

export const BOSS_BONUS: Record<string, BossBonusStage[]> = {
  // Дацкоу: his pass (opens Кедр) — 1 for 300 damage, 2 more for 700
  datsik: [
    { damage: 300, reward: { items: [{ id: "key-datsik", qty: 1 }] } },
    { damage: 700, reward: { items: [{ id: "key-datsik", qty: 2 }] } },
  ],
};

export const bossBonus = (bossId: string): BossBonusStage[] => BOSS_BONUS[bossId] ?? [];
/** the stages reached with this damage */
export const bonusReached = (bossId: string, damage: number) => bossBonus(bossId).filter((s) => damage >= s.damage);
