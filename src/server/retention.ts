import { GameError, type Queryable } from "./db.ts";
import { addXp } from "./xp.ts";
import { log } from "./log.ts";
import { equipmentByTier, roundCur } from "../shared/economy.ts";
import {
  COSMETICS, DAILY_COOLDOWN_MS, DAILY_STREAK_RESET_MS, DEFAULT_OUTFIT, QUESTS, cosmeticById, dailyRewardForStreakDay,
  periodEnds, periodKey, questById, type Metric, type Outfit, type Reward,
} from "../shared/retention.ts";

/** Increments a quest metric for the current daily and weekly periods. Called inside action transactions. */
export async function bumpMetric(tx: Queryable, playerId: number, metric: Metric, amount: number, now = Date.now()) {
  if (!(amount > 0)) return;
  for (const period of [periodKey("daily", now), periodKey("weekly", now)]) {
    await tx.query(
      `INSERT INTO quest_metrics (player_id, period, metric, value) VALUES ($1,$2,$3,$4)
       ON CONFLICT (player_id, period, metric) DO UPDATE SET value = quest_metrics.value + $4`,
      [playerId, period, metric, amount],
    );
  }
}

/** Grants a reward bundle. Energy may exceed max only up to max (no overflow banking). */
export async function grantReward(tx: Queryable, playerId: number, r: Reward) {
  if (r.currency && r.amount) {
    await tx.query("UPDATE balances SET amount = amount + $3 WHERE player_id = $1 AND currency = $2", [playerId, r.currency, roundCur(r.amount, r.currency)]);
  }
  if (r.energy) {
    const [p] = await tx.query<{ equipment_tier: number }>("SELECT equipment_tier FROM players WHERE id = $1", [playerId]);
    const max = equipmentByTier(p.equipment_tier).maxEnergy;
    await tx.query("UPDATE players SET energy = LEAST($2::float8, energy + $3) WHERE id = $1", [playerId, max, r.energy]);
  }
  if (r.xp) await addXp(tx, playerId, r.xp);
}

// ---------------- Daily reward ----------------
export function dailyStatus(row: { streak: number; last_claim_at: Date | string | null } | undefined, now = Date.now()) {
  const last = row?.last_claim_at ? new Date(row.last_claim_at).getTime() : 0;
  const broken = !last || now - last > DAILY_STREAK_RESET_MS;
  const nextDay = broken ? 1 : (row?.streak ?? 0) + 1;
  const availableAt = last ? last + DAILY_COOLDOWN_MS : 0;
  return {
    streak: broken ? 0 : row?.streak ?? 0,
    nextDay,
    canClaim: now >= availableAt,
    availableAt,
    reward: dailyRewardForStreakDay(nextDay),
  };
}

/** Caller must hold the player row lock. */
export async function claimDaily(tx: Queryable, playerId: number, now = Date.now()) {
  await tx.query("INSERT INTO daily_rewards (player_id) VALUES ($1) ON CONFLICT DO NOTHING", [playerId]);
  const [row] = await tx.query<{ streak: number; last_claim_at: Date | null }>("SELECT streak, last_claim_at FROM daily_rewards WHERE player_id = $1 FOR UPDATE", [playerId]);
  const st = dailyStatus(row, now);
  if (!st.canClaim) throw new GameError("daily_cooldown", "Награда уже получена. Возвращайтесь позже", 400);
  await tx.query("UPDATE daily_rewards SET streak = $2, last_claim_at = $3 WHERE player_id = $1", [playerId, st.nextDay, new Date(now)]);
  await grantReward(tx, playerId, st.reward);
  log.info("daily.claim", { player: playerId, day: st.nextDay });
  return { day: st.nextDay, reward: st.reward };
}

// ---------------- Quests ----------------
export async function questStatus(tx: Queryable, playerId: number, now = Date.now()) {
  const daily = periodKey("daily", now);
  const weekly = periodKey("weekly", now);
  const metrics = await tx.query<{ period: string; metric: Metric; value: number }>(
    "SELECT period, metric, value FROM quest_metrics WHERE player_id = $1 AND period = ANY($2)", [playerId, [daily, weekly]]);
  const claims = await tx.query<{ quest_id: string; period: string }>(
    "SELECT quest_id, period FROM quest_claims WHERE player_id = $1 AND period = ANY($2)", [playerId, [daily, weekly]]);
  const val = (period: string, m: Metric) => metrics.find((x) => x.period === period && x.metric === m)?.value ?? 0;
  const claimed = new Set(claims.map((c) => `${c.quest_id}|${c.period}`));
  return QUESTS.map((q) => {
    const period = q.period === "daily" ? daily : weekly;
    const progress = Math.min(q.target, val(period, q.metric));
    return {
      ...q, progress, done: progress >= q.target, claimed: claimed.has(`${q.id}|${period}`), endsAt: periodEnds(q.period, now),
    };
  });
}

export async function claimQuest(tx: Queryable, playerId: number, questId: string, now = Date.now()) {
  const q = questById(questId);
  if (!q) throw new GameError("no_quest", "Задание не найдено", 404);
  const status = (await questStatus(tx, playerId, now)).find((x) => x.id === q.id)!;
  if (!status.done) throw new GameError("quest_not_done", "Задание ещё не выполнено", 400);
  const inserted = await tx.query(
    "INSERT INTO quest_claims (player_id, quest_id, period) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING quest_id",
    [playerId, q.id, periodKey(q.period, now)]);
  if (!inserted.length) throw new GameError("quest_claimed", "Награда за задание уже получена", 400);
  await grantReward(tx, playerId, q.reward);
  return { questId: q.id, reward: q.reward };
}

// ---------------- Cosmetics ----------------
export function normalizeOutfit(raw: unknown): Outfit {
  const o = { ...DEFAULT_OUTFIT, ...(raw && typeof raw === "object" ? (raw as Partial<Outfit>) : {}) };
  for (const slot of Object.keys(DEFAULT_OUTFIT) as (keyof Outfit)[]) {
    const c = cosmeticById(o[slot]);
    if (!c || c.slot !== slot) o[slot] = DEFAULT_OUTFIT[slot];
  }
  return o;
}

export async function ownedCosmetics(tx: Queryable, playerId: number): Promise<string[]> {
  const rows = await tx.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id = $1 AND item_type = 'cosmetic'", [playerId]);
  return [...COSMETICS.filter((c) => c.price === 0).map((c) => c.id), ...rows.map((r) => r.item_id)];
}

/** Buys (if needed) and wears a cosmetic. Caller must hold the player row lock. */
export async function wearCosmetic(tx: Queryable, playerId: number, level: number, cosmeticId: string) {
  const c = cosmeticById(cosmeticId);
  if (!c) throw new GameError("no_item", "Предмет не найден", 404);
  const owned = await ownedCosmetics(tx, playerId);
  let bought = false;
  if (!owned.includes(c.id)) {
    if (level < c.unlockLevel) throw new GameError("locked", `Откроется на уровне ${c.unlockLevel}`, 400);
    const r = await tx.query("UPDATE balances SET amount = amount - $3 WHERE player_id = $1 AND currency = $2 AND amount >= $3 RETURNING amount", [playerId, c.currency, c.price]);
    if (!r.length) throw new GameError("insufficient_funds", `Недостаточно ${c.currency}`, 400);
    await tx.query("INSERT INTO inventory (player_id, item_type, item_id) VALUES ($1,'cosmetic',$2) ON CONFLICT DO NOTHING", [playerId, c.id]);
    bought = true;
  }
  const [p] = await tx.query<{ outfit: unknown }>("SELECT outfit FROM players WHERE id = $1", [playerId]);
  const outfit = normalizeOutfit(p.outfit);
  outfit[c.slot] = c.id;
  await tx.query("UPDATE players SET outfit = $2 WHERE id = $1", [playerId, JSON.stringify(outfit)]);
  return { cosmeticId: c.id, bought, outfit };
}
