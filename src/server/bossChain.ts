import { bossMarketCap, MAX_BOSS_CHAIN_STEPS, roundTo } from "../shared/economy.ts";

export interface ChainState {
  bossIndex: number;
  damageTaken: number; // damage already absorbed by the current boss
  personalOnBoss: number; // part of damageTaken dealt by the player personally
}

export interface ChainDefeat {
  index: number;
  marketCap: number;
  personalDamage: number;
}

export interface ChainResult {
  state: ChainState;
  defeats: ChainDefeat[];
  applied: number; // total damage consumed (may be < amount if MAX steps reached)
  personalApplied: number;
}

const EPS = 1e-6;

/**
 * Pushes `amount` of damage through a player's personal boss chain.
 * Overkill flows into the next boss. `personal` (<= amount) is the share dealt by the player
 * themselves; it is attributed first so the contribution factor is deterministic.
 * Stops after `maxSteps` defeats; the unapplied rest is reported so the caller keeps it for the next sync.
 */
export function applyChain(
  start: ChainState,
  amount: number,
  personal = 0,
  maxSteps = MAX_BOSS_CHAIN_STEPS,
  marketCapOf: (n: number) => number = bossMarketCap,
): ChainResult {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { state: { ...start }, defeats: [], applied: 0, personalApplied: 0 };
  }
  let personalLeft = Math.max(0, Math.min(personal, amount));
  let left = amount;
  const state = { ...start };
  const defeats: ChainDefeat[] = [];

  while (left > EPS) {
    const mcap = marketCapOf(state.bossIndex);
    const remaining = Math.max(0, mcap - state.damageTaken);
    const hit = Math.min(left, remaining);
    const personalHit = Math.min(personalLeft, hit);
    state.damageTaken += hit;
    state.personalOnBoss += personalHit;
    personalLeft -= personalHit;
    left -= hit;

    if (state.damageTaken >= mcap - EPS) {
      if (defeats.length >= maxSteps) {
        // Leave the boss at exactly 0 market cap is not allowed: undo the hit and stop.
        state.damageTaken -= hit;
        state.personalOnBoss -= personalHit;
        personalLeft += personalHit;
        left += hit;
        break;
      }
      defeats.push({ index: state.bossIndex, marketCap: mcap, personalDamage: roundTo(state.personalOnBoss, 2) });
      state.bossIndex += 1;
      state.damageTaken = 0;
      state.personalOnBoss = 0;
    }
  }
  state.damageTaken = roundTo(state.damageTaken, 4);
  state.personalOnBoss = roundTo(state.personalOnBoss, 4);
  return {
    state,
    defeats,
    applied: roundTo(amount - left, 6),
    personalApplied: roundTo(Math.min(personal, amount) - personalLeft, 6),
  };
}
