/**
 * GLOBAL DAMAGE BUS
 *
 * Personal bosses + global damage:
 *  - every damage event increments GLOBAL_DAMAGE_TOTAL (global_state.damage_total) atomically;
 *  - each player stores `global_checkpoint` = last total already applied to their own boss chain;
 *  - syncBoss() applies (total - checkpoint) to the player's current boss, overkill flows to the next bosses.
 * This applies every event to every player (online or offline) without fan-out writes:
 * O(1) per event, O(bosses defeated) per player sync.
 *
 * All damage values are computed on the server; the client never reports damage.
 */
import type { Queryable } from "./db.ts";
import { applyChain, type ChainDefeat } from "./bossChain.ts";
import { bossRewardUsd, bossRewardXp, BOSS_TOOL_DROPS, MAX_BOSS_CHAIN_STEPS, roundTo, toolById } from "../shared/economy.ts";
import { addXp } from "./xp.ts";
import { bumpMetric } from "./retention.ts";

export { addXp };
import { bossInfo } from "../shared/bosses.ts";
import { log } from "./log.ts";

export type DamageSource = "sell" | "tutorial" | "system";

export interface DamageEventInput {
  sourcePlayerId: number;
  amount: number;
  sourceType: DamageSource;
  sourceEntity?: string;
  crit?: boolean;
  combo?: number;
  playerName?: string;
}

/**
 * Publishes a damage event. Must be called inside the caller's transaction AFTER locking the source player row
 * (lock order: player -> global_state) to avoid deadlocks.
 */
export async function emitDamage(tx: Queryable, e: DamageEventInput) {
  if (!(e.amount > 0) || !Number.isFinite(e.amount)) throw new Error("emitDamage: invalid amount");
  const amount = roundTo(e.amount, 2);
  const [g] = await tx.query<{ damage_total: number }>(
    "UPDATE global_state SET damage_total = damage_total + $1, updated_at = now() WHERE id = 1 RETURNING damage_total",
    [amount],
  );
  const [ev] = await tx.query<{ id: number }>(
    `INSERT INTO damage_events (source_player_id, amount, source_type, source_entity, crit, combo, global_total_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [e.sourcePlayerId, amount, e.sourceType, e.sourceEntity ?? null, !!e.crit, e.combo ?? 0, g.damage_total],
  );
  // Personal contribution bookkeeping.
  await tx.query("UPDATE boss_progress SET pending_personal = pending_personal + $2 WHERE player_id = $1", [e.sourcePlayerId, amount]);
  await tx.query(
    `UPDATE player_stats SET
       lifetime_damage = lifetime_damage + $2,
       damage_today = CASE WHEN damage_day = CURRENT_DATE THEN damage_today + $2 ELSE $2 END,
       damage_day = CURRENT_DATE,
       biggest_dump = GREATEST(biggest_dump, $2)
     WHERE player_id = $1`,
    [e.sourcePlayerId, amount],
  );
  if (amount >= 10 || e.crit) {
    const who = e.playerName ? e.playerName : "Деген";
    const text = e.crit
      ? `💥 CRITICAL DUMP: ${who} нанёс $${fmt(amount)}`
      : amount >= 1000
        ? `🐋 ${who} обрушил $${fmt(amount)} урона`
        : `🔥 ${who} слил на $${fmt(amount)}`;
    await tx.query("INSERT INTO feed (kind, text, amount, player_id, token_id) VALUES ($1,$2,$3,$4,$5)", [
      e.crit ? "crit" : "damage", text, amount, e.sourcePlayerId, e.sourceEntity ?? null,
    ]);
  }
  log.info("damage.emit", { eventId: ev.id, player: e.sourcePlayerId, amount, source: e.sourceType, total: g.damage_total });
  return { eventId: ev.id, amount, globalTotal: g.damage_total };
}

export interface BossDefeatResult extends ChainDefeat {
  name: string;
  rewardUsd: number;
  rewardXp: number;
  rewardItem: string | null;
}

export interface SyncResult {
  bossIndex: number;
  damageTaken: number;
  personalOnBoss: number;
  checkpoint: number;
  globalTotal: number;
  applied: number;
  defeats: BossDefeatResult[];
}

/**
 * Applies all global damage accumulated since the player's checkpoint to their personal boss chain.
 * Caller must hold the player's row lock (SELECT ... FOR UPDATE on players) inside `tx`.
 * Rewards are granted exactly once per (player, boss) thanks to UNIQUE(player_id, boss_index).
 */
export async function syncBoss(tx: Queryable, playerId: number, playerName?: string): Promise<SyncResult> {
  const [bp] = await tx.query<{
    boss_index: number; damage_taken: number; personal_on_boss: number; pending_personal: number; global_checkpoint: number;
  }>("SELECT boss_index, damage_taken, personal_on_boss, pending_personal, global_checkpoint FROM boss_progress WHERE player_id = $1 FOR UPDATE", [playerId]);
  const [g] = await tx.query<{ damage_total: number }>("SELECT damage_total FROM global_state WHERE id = 1");
  const delta = roundTo(g.damage_total - bp.global_checkpoint, 6);
  if (delta <= 0) {
    return {
      bossIndex: bp.boss_index, damageTaken: bp.damage_taken, personalOnBoss: bp.personal_on_boss,
      checkpoint: bp.global_checkpoint, globalTotal: g.damage_total, applied: 0, defeats: [],
    };
  }
  const res = applyChain(
    { bossIndex: bp.boss_index, damageTaken: bp.damage_taken, personalOnBoss: bp.personal_on_boss },
    delta,
    bp.pending_personal,
    MAX_BOSS_CHAIN_STEPS,
  );
  const checkpoint = roundTo(bp.global_checkpoint + res.applied, 6);
  await tx.query(
    `UPDATE boss_progress SET boss_index=$2, damage_taken=$3, personal_on_boss=$4, pending_personal=$5, global_checkpoint=$6,
       boss_started_at = CASE WHEN $2 <> boss_index THEN now() ELSE boss_started_at END
     WHERE player_id=$1`,
    [playerId, res.state.bossIndex, res.state.damageTaken, res.state.personalOnBoss,
      Math.max(0, roundTo(bp.pending_personal - res.personalApplied, 6)), checkpoint],
  );

  const defeats: BossDefeatResult[] = [];
  for (const d of res.defeats) {
    const info = bossInfo(d.index);
    const rewardUsd = bossRewardUsd(d.index, d.personalDamage);
    const rewardXp = bossRewardXp(d.index);
    const dropId = BOSS_TOOL_DROPS[d.index] ?? null;
    const inserted = await tx.query<{ id: number }>(
      `INSERT INTO boss_defeats (player_id, boss_index, market_cap, personal_damage, reward_usd, reward_xp, reward_item)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (player_id, boss_index) DO NOTHING RETURNING id`,
      [playerId, d.index, d.marketCap, d.personalDamage, rewardUsd, rewardXp, dropId],
    );
    if (!inserted.length) {
      log.warn("boss.duplicate_defeat", { player: playerId, boss: d.index });
      continue; // already rewarded — never pay twice
    }
    await tx.query("UPDATE balances SET amount = amount + $2 WHERE player_id = $1 AND currency = 'USD'", [playerId, rewardUsd]);
    await tx.query("UPDATE player_stats SET bosses_defeated = bosses_defeated + 1 WHERE player_id = $1", [playerId]);
    await bumpMetric(tx, playerId, "bosses", 1);
    await addXp(tx, playerId, rewardXp);
    let rewardItem: string | null = null;
    if (dropId && toolById(dropId)) {
      const got = await tx.query(
        "INSERT INTO inventory (player_id, item_type, item_id) VALUES ($1,'tool',$2) ON CONFLICT DO NOTHING RETURNING item_id",
        [playerId, dropId],
      );
      if (got.length) rewardItem = dropId;
    }
    if (d.personalDamage > 0) {
      await tx.query("INSERT INTO feed (kind, text, player_id) VALUES ('boss', $1, $2)", [
        `👑 ${playerName ?? "Деген"} победил ${info.name} (#${d.index})`, playerId,
      ]);
    }
    log.info("boss.defeated", { player: playerId, boss: d.index, personal: d.personalDamage, rewardUsd });
    defeats.push({ ...d, name: info.name, rewardUsd, rewardXp, rewardItem });
  }
  return {
    bossIndex: res.state.bossIndex, damageTaken: res.state.damageTaken, personalOnBoss: res.state.personalOnBoss,
    checkpoint, globalTotal: g.damage_total, applied: res.applied, defeats,
  };
}

function fmt(n: number): string {
  return n >= 1000 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2);
}
