import { randomInt } from "node:crypto";
import { GameError, type Queryable } from "./db.ts";
import { addXp } from "./xp.ts";
import { log } from "./log.ts";
import type { TelegramUser } from "./auth.ts";
import {
  ATTACKS_PER_DAY, CURRENCIES, ENERGY_BASE_MAX, ENERGY_REGEN_MS, IDLE_CAP_MS, KEYS_TO_UNLOCK, START_BALANCES, WORKPLACE,
  KEY_SHARE, avgHit, computePower, dayKey, exchangeQuote, nextDayStart, rollHit, roundCur, usdRates, workplace, xpForNextLevel,
  type Currency, type Price,
} from "../shared/economy.ts";
import { DEFAULT_THEME, ITEMS, SLOTS, itemById, keyItem, type Loadout, type Slot } from "../shared/items.ts";
import {
  BOSSES, CHEST_LOOT, DAILY_COOLDOWN_MS, DAILY_REWARDS, DAILY_STREAK_RESET_MS, HIT_XP_SHARE, MISSIONS, CLAN_CREATE_PRICE, CLAN_MAX_MEMBERS,
  bossByIndex, isWeekend, missionById, taskById, type Metric,
} from "../shared/content.ts";

export interface PlayerRow {
  id: number;
  tg_id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  is_guest: boolean;
  level: number;
  xp: number;
  energy: number;
  energy_updated_at: Date;
  equipment_tier: number;
  last_action_at: Date | null;
  power_bonus: number;
  loadout: Loadout;
  theme: string;
  idle_claimed_at: Date;
  clan_id: number | null;
  power_cached: number;
  v2_initialized: boolean;
}

export function displayName(p: Pick<PlayerRow, "username" | "first_name">): string {
  return p.username ? p.username : p.first_name || "Degen";
}
const rand = () => randomInt(0, 2 ** 31) / 2 ** 31;

// ---------------- players ----------------
export async function upsertTelegramPlayer(tx: Queryable, u: TelegramUser): Promise<number> {
  const firstName = (u.first_name || "Degen").slice(0, 64);
  const existing = await tx.query<{ id: number }>(
    "UPDATE players SET username=$2, first_name=$3, photo_url=$4, last_seen_at=now() WHERE tg_id=$1 RETURNING id",
    [String(u.id), u.username ?? null, firstName, u.photo_url ?? null],
  );
  if (existing.length) return existing[0].id;
  return createPlayer(tx, String(u.id), u.username ?? null, firstName, u.photo_url ?? null, false);
}

export async function upsertGuestPlayer(tx: Queryable, guestId: string): Promise<number> {
  const tgId = "guest:" + guestId;
  const existing = await tx.query<{ id: number }>("UPDATE players SET last_seen_at=now() WHERE tg_id=$1 RETURNING id", [tgId]);
  if (existing.length) return existing[0].id;
  return createPlayer(tx, tgId, null, "Guest" + guestId.slice(0, 4).toUpperCase(), null, true);
}

async function createPlayer(tx: Queryable, tgId: string, username: string | null, firstName: string, photo: string | null, guest: boolean): Promise<number> {
  const ins = await tx.query<{ id: number }>(
    `INSERT INTO players (tg_id, username, first_name, photo_url, is_guest, energy, v2_initialized) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
     ON CONFLICT (tg_id) DO NOTHING RETURNING id`,
    [tgId, username, firstName, photo, guest, ENERGY_BASE_MAX],
  );
  if (!ins.length) return (await tx.query<{ id: number }>("SELECT id FROM players WHERE tg_id=$1", [tgId]))[0].id;
  const id = ins[0].id;
  for (const c of CURRENCIES) await tx.query("INSERT INTO balances (player_id, currency, amount) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, c, START_BALANCES[c]]);
  await tx.query("INSERT INTO player_bosses (player_id, boss_index, unlocked) VALUES ($1, 1, TRUE) ON CONFLICT DO NOTHING", [id]);
  await tx.query("INSERT INTO player_stats (player_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
  log.info("player.created", { id, guest });
  return id;
}

export function maxEnergy(tier: number): number {
  return ENERGY_BASE_MAX + workplace(tier).maxEnergyBonus;
}

/** Locks the player row for this transaction and applies energy regeneration. */
export async function lockPlayer(tx: Queryable, playerId: number, now = Date.now()): Promise<PlayerRow> {
  const [p] = await tx.query<PlayerRow>("SELECT * FROM players WHERE id = $1 FOR UPDATE", [playerId]);
  if (!p) throw new GameError("player_missing", "Игрок не найден, перезапустите игру", 401);
  if (!p.v2_initialized) {
    // Players from v1 get a fresh v2 start (balances kept).
    await tx.query("INSERT INTO player_bosses (player_id, boss_index, unlocked) VALUES ($1, 1, TRUE) ON CONFLICT DO NOTHING", [p.id]);
    await tx.query("INSERT INTO player_stats (player_id) VALUES ($1) ON CONFLICT DO NOTHING", [p.id]);
    await tx.query("UPDATE players SET v2_initialized = TRUE, energy = $2, energy_updated_at = $3, idle_claimed_at = $3, equipment_tier = LEAST(equipment_tier, 6) WHERE id = $1", [p.id, ENERGY_BASE_MAX, new Date(now)]);
    p.energy = ENERGY_BASE_MAX;
    p.energy_updated_at = new Date(now);
    p.equipment_tier = Math.min(p.equipment_tier, WORKPLACE.length);
    p.v2_initialized = true;
  }
  const max = maxEnergy(p.equipment_tier);
  const elapsed = Math.max(0, now - new Date(p.energy_updated_at).getTime());
  const gained = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (p.energy < max && gained > 0) {
    p.energy = Math.min(max, p.energy + gained);
    const carry = p.energy >= max ? now : new Date(p.energy_updated_at).getTime() + gained * ENERGY_REGEN_MS;
    await tx.query("UPDATE players SET energy=$2, energy_updated_at=$3 WHERE id=$1", [p.id, p.energy, new Date(carry)]);
    p.energy_updated_at = new Date(carry);
  } else if (p.energy >= max) {
    await tx.query("UPDATE players SET energy_updated_at=$2 WHERE id=$1", [p.id, new Date(now)]);
    p.energy_updated_at = new Date(now);
  }
  p.loadout = (p.loadout ?? {}) as Loadout;
  await settleBossRewards(tx, p.id, now);
  return p;
}

function rateLimit(p: PlayerRow, minMs: number, now: number) {
  if (p.last_action_at && now - new Date(p.last_action_at).getTime() < minMs) throw new GameError("too_fast", "Слишком быстро", 429);
}
async function touch(tx: Queryable, p: PlayerRow, now: number) {
  await tx.query("UPDATE players SET last_action_at=$2, last_seen_at=$2 WHERE id=$1", [p.id, new Date(now)]);
}

// ---------------- balances & inventory ----------------
export async function credit(tx: Queryable, pid: number, p: Price, mult = 1) {
  await tx.query("UPDATE balances SET amount = amount + $3 WHERE player_id=$1 AND currency=$2", [pid, p.currency, roundCur(p.amount * mult, p.currency)]);
}
export async function debit(tx: Queryable, pid: number, p: Price) {
  const r = await tx.query("UPDATE balances SET amount = amount - $3 WHERE player_id=$1 AND currency=$2 AND amount >= $3 RETURNING amount", [pid, p.currency, p.amount]);
  if (!r.length) throw new GameError("insufficient_funds", `Не хватает ${p.currency}`, 400);
}
export async function addItem(tx: Queryable, pid: number, itemId: string, qty = 1) {
  await tx.query(
    `INSERT INTO inventory (player_id, item_type, item_id, quantity) VALUES ($1,'item',$2,$3)
     ON CONFLICT (player_id, item_type, item_id) DO UPDATE SET quantity = inventory.quantity + $3`,
    [pid, itemId, qty],
  );
}
async function removeItem(tx: Queryable, pid: number, itemId: string, qty = 1) {
  const r = await tx.query<{ quantity: number }>(
    "UPDATE inventory SET quantity = quantity - $3 WHERE player_id=$1 AND item_type='item' AND item_id=$2 AND quantity >= $3 RETURNING quantity",
    [pid, itemId, qty],
  );
  if (!r.length) throw new GameError("no_item", "Предмета нет в инвентаре", 400);
  if (r[0].quantity === 0) await tx.query("DELETE FROM inventory WHERE player_id=$1 AND item_type='item' AND item_id=$2", [pid, itemId]);
}
async function itemCount(tx: Queryable, pid: number, itemId: string): Promise<number> {
  const r = await tx.query<{ quantity: number }>("SELECT quantity FROM inventory WHERE player_id=$1 AND item_type='item' AND item_id=$2", [pid, itemId]);
  return r[0]?.quantity ?? 0;
}

/** Recomputes power from level, equipped gear, workplace and permanent bonuses. */
export async function recalcPower(tx: Queryable, pid: number): Promise<number> {
  const [p] = await tx.query<{ level: number; loadout: Loadout; equipment_tier: number; power_bonus: number }>(
    "SELECT level, loadout, equipment_tier, power_bonus FROM players WHERE id=$1", [pid]);
  const itemPower = SLOTS.reduce((s, slot) => s + (itemById(p.loadout?.[slot] ?? "")?.power ?? 0), 0);
  const power = computePower(p.level, itemPower, p.equipment_tier, p.power_bonus);
  await tx.query("UPDATE players SET power_cached=$2 WHERE id=$1", [pid, power]);
  return power;
}

async function gainXpPower(tx: Queryable, pid: number, xp: number, power: number) {
  if (power) await tx.query("UPDATE players SET power_bonus = power_bonus + $2 WHERE id=$1", [pid, power]);
  if (xp) await addXp(tx, pid, xp);
  await recalcPower(tx, pid);
}

// ---------------- metrics (daily missions) ----------------
export async function bump(tx: Queryable, pid: number, metric: Metric, amount: number, now = Date.now()) {
  if (!(amount > 0)) return;
  await tx.query(
    `INSERT INTO quest_metrics (player_id, period, metric, value) VALUES ($1,$2,$3,$4)
     ON CONFLICT (player_id, period, metric) DO UPDATE SET value = quest_metrics.value + $4`,
    [pid, "d:" + dayKey(now), metric, amount],
  );
}

async function feed(tx: Queryable, kind: string, text: string, pid?: number) {
  await tx.query("INSERT INTO feed (kind, text, player_id) VALUES ($1,$2,$3)", [kind, text, pid ?? null]);
}

/** Idempotency wrapper for purchases: replays the stored result for a repeated key. */
async function idempotent<T>(tx: Queryable, pid: number, key: string | undefined, kind: string, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const prev = await tx.query<{ result: T }>("SELECT result FROM actions WHERE player_id=$1 AND idem_key=$2", [pid, key]);
  if (prev.length) return prev[0].result;
  const result = await fn();
  await tx.query("INSERT INTO actions (player_id, idem_key, kind, result) VALUES ($1,$2,$3,$4)", [pid, key, kind, JSON.stringify(result ?? null)]);
  return result;
}

// ---------------- Market tasks ----------------
export async function doTask(tx: Queryable, pid: number, taskId: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  rateLimit(p, 250, now);
  const t = taskById(taskId);
  if (!t) throw new GameError("no_task", "Задание не найдено", 404);
  if (p.level < t.unlockLevel) throw new GameError("locked", `Откроется на уровне ${t.unlockLevel}`, 400);
  if (p.energy < t.energy) throw new GameError("no_energy", "Не хватает энергии", 400);
  await tx.query("UPDATE players SET energy = energy - $2 WHERE id=$1", [pid, t.energy]);
  const mult = isWeekend(now) ? 2 : 1;
  await credit(tx, pid, t.reward, mult);
  let drop: string | null = null;
  if (t.drop && rand() < t.drop.chance) {
    drop = t.drop.item;
    await addItem(tx, pid, drop);
  }
  await gainXpPower(tx, pid, t.xp, t.power);
  await bump(tx, pid, "tasks", 1, now);
  await bump(tx, pid, "energy", t.energy, now);
  await touch(tx, p, now);
  return { taskId: t.id, reward: { currency: t.reward.currency, amount: roundCur(t.reward.amount * mult, t.reward.currency) }, xp: t.xp, power: t.power, drop, weekend: mult > 1 };
}

// ---------------- Bosses ----------------
async function bossRows(tx: Queryable, pid: number) {
  return tx.query<{ boss_index: number; unlocked: boolean; wins: number; losses: number; attempts: number; attempts_day: string }>(
    "SELECT boss_index, unlocked, wins, losses, attempts, attempts_day FROM player_bosses WHERE player_id=$1", [pid]);
}

export const FISTS = "fists";

interface KillReward {
  bossIndex: number; bossName: string; currency: Currency; amount: number; key: boolean; killer: boolean;
  damage: number; share: number; xp: number; power: number; items: string[];
}

/** Returns the alive instance of a boss, creating one if needed. With lock=true the row is locked FOR UPDATE. */
async function bossInstance(tx: Queryable, bossIndex: number, lock: boolean) {
  const boss = bossByIndex(bossIndex)!;
  await tx.query(
    `INSERT INTO boss_instances (boss_index, hp_max, hp) VALUES ($1,$2,$2)
     ON CONFLICT (boss_index) WHERE status = 'alive' DO NOTHING`, [bossIndex, boss.hp]);
  const [inst] = await tx.query<{ id: number; hp: number; hp_max: number }>(
    `SELECT id, hp::float8 AS hp, hp_max::float8 AS hp_max FROM boss_instances WHERE boss_index=$1 AND status='alive'${lock ? " FOR UPDATE" : ""}`, [bossIndex]);
  return inst;
}

/** Power of the player if they hit with the given weapon instead of the equipped one. */
function powerWith(power: number, loadout: Loadout, weaponId: string): number {
  const equipped = itemById(loadout.weapon ?? "")?.power ?? 0;
  const chosen = weaponId === FISTS ? 0 : itemById(weaponId)?.power ?? 0;
  return Math.max(1, power - equipped + chosen);
}

/**
 * One hit on the shared boss. Lock order: boss instance → player (every hit uses the same order).
 * When HP reaches 0 the boss dies, every participant gets a reward share recorded on their damage row
 * (settled on their next action), and a fresh instance spawns on the next hit.
 */
export async function doHit(tx: Queryable, pid: number, bossIndex: number, weaponId: string, now = Date.now(), rng: () => number = rand) {
  const boss = bossByIndex(bossIndex);
  if (!boss) throw new GameError("no_boss", "Босс не найден", 404);
  const inst = await bossInstance(tx, bossIndex, true);
  const p = await lockPlayer(tx, pid, now);
  rateLimit(p, 250, now);
  const [row] = await tx.query<{ unlocked: boolean; attempts: number; attempts_day: string }>(
    "SELECT unlocked, attempts, attempts_day FROM player_bosses WHERE player_id=$1 AND boss_index=$2 FOR UPDATE", [pid, bossIndex]);
  if (!row?.unlocked) throw new GameError("boss_locked", `Нужно ${KEYS_TO_UNLOCK} ключа с босса #${bossIndex - 1}`, 400);
  const today = dayKey(now);
  const used = row.attempts_day === today ? row.attempts : 0;
  if (used >= ATTACKS_PER_DAY) throw new GameError("no_attempts", "Удары по этому боссу закончились. Новые — завтра", 400);
  const weapon = weaponId || FISTS;
  if (weapon !== FISTS) {
    if (itemById(weapon)?.kind !== "weapon") throw new GameError("bad_weapon", "Это не оружие", 400);
    if ((await itemCount(tx, pid, weapon)) < 1) throw new GameError("no_item", "Этого оружия нет в инвентаре", 400);
  }
  const power = powerWith(await recalcPower(tx, pid), p.loadout, weapon);
  const hit = rollHit(power, rng);
  const dmg = Math.min(hit.dmg, inst.hp);
  const hpLeft = inst.hp - dmg;
  await tx.query(
    `INSERT INTO boss_damage (instance_id, player_id, damage, hits, last_hit_at) VALUES ($1,$2,$3,1,$4)
     ON CONFLICT (instance_id, player_id) DO UPDATE SET damage = boss_damage.damage + $3, hits = boss_damage.hits + 1, last_hit_at = $4`,
    [inst.id, pid, dmg, new Date(now)]);
  await tx.query("UPDATE boss_instances SET hp=$2 WHERE id=$1", [inst.id, hpLeft]);
  await tx.query("UPDATE player_bosses SET attempts=$3, attempts_day=$4 WHERE player_id=$1 AND boss_index=$2", [pid, bossIndex, used + 1, today]);
  await tx.query("INSERT INTO battles (player_id, boss_index, power, win, damage) VALUES ($1,$2,$3,$4,$5)", [pid, bossIndex, power, hpLeft <= 0, dmg]);
  await tx.query("UPDATE player_stats SET lifetime_damage = lifetime_damage + $2 WHERE player_id=$1", [pid, dmg]);
  const hitXp = Math.max(1, Math.round(boss.xp * HIT_XP_SHARE));
  await gainXpPower(tx, pid, hitXp, 0);
  await bump(tx, pid, "fights", 1, now);
  let killReward: KillReward | null = null;
  if (hpLeft <= 0) {
    await tx.query("UPDATE boss_instances SET status='dead', killer_id=$2, killed_at=$3 WHERE id=$1", [inst.id, pid, new Date(now)]);
    const parts = await tx.query<{ player_id: number; damage: number }>("SELECT player_id, damage::float8 AS damage FROM boss_damage WHERE instance_id=$1", [inst.id]);
    for (const part of parts) {
      const killer = part.player_id === pid;
      const share = Math.min(1, part.damage / inst.hp_max);
      const key = killer || share >= KEY_SHARE;
      const items: string[] = [];
      if (killer && rng() < boss.chestChance) items.push("x-chest");
      const reward: KillReward = {
        bossIndex, bossName: boss.name, currency: boss.reward.currency, amount: Math.max(roundCur(boss.reward.amount * share, boss.reward.currency), 0),
        key, killer, damage: part.damage, share, xp: key ? boss.xp : Math.round(boss.xp * share), power: key ? boss.power : 0, items,
      };
      await tx.query("UPDATE boss_damage SET reward=$3 WHERE instance_id=$1 AND player_id=$2", [inst.id, part.player_id, JSON.stringify(reward)]);
    }
    await feed(tx, "boss", `💀 ${displayName(p)} добил ${boss.name}. Участников: ${parts.length}`, pid);
    killReward = (await settleBossRewards(tx, pid, now)).find((r) => r.bossIndex === bossIndex && r.killer) ?? null;
  }
  await touch(tx, p, now);
  log.info("boss.hit", { player: pid, boss: bossIndex, dmg, killed: hpLeft <= 0 });
  return { bossIndex, weapon, power, dmg, crit: hit.crit, hp: hpLeft, hpMax: inst.hp_max, killed: hpLeft <= 0, xp: hitXp, attemptsLeft: ATTACKS_PER_DAY - used - 1, kill: killReward };
}

/** Applies boss-kill rewards recorded for this player. Caller must hold the player's row lock. */
export async function settleBossRewards(tx: Queryable, pid: number, now = Date.now()): Promise<KillReward[]> {
  const pending = await tx.query<{ instance_id: number; reward: KillReward }>(
    "SELECT instance_id, reward FROM boss_damage WHERE player_id=$1 AND reward IS NOT NULL AND claimed_at IS NULL FOR UPDATE", [pid]);
  const out: KillReward[] = [];
  for (const { instance_id, reward } of pending) {
    const r = typeof reward === "string" ? (JSON.parse(reward) as KillReward) : reward;
    if (r.amount > 0) await credit(tx, pid, { currency: r.currency, amount: r.amount });
    if (r.key) {
      const [pb] = await tx.query<{ wins: number }>(
        `INSERT INTO player_bosses (player_id, boss_index, unlocked, wins, first_win_at) VALUES ($1,$2,TRUE,1,now())
         ON CONFLICT (player_id, boss_index) DO UPDATE SET wins = player_bosses.wins + 1, first_win_at = COALESCE(player_bosses.first_win_at, now())
         RETURNING wins`, [pid, r.bossIndex]);
      await addItem(tx, pid, keyItem(r.bossIndex).id);
      const first = bossByIndex(r.bossIndex)?.firstWinItem;
      if (first && pb.wins === 1) r.items.push(first);
      await tx.query("UPDATE player_stats SET bosses_defeated = bosses_defeated + 1 WHERE player_id=$1", [pid]);
      await bump(tx, pid, "wins", 1, now);
    }
    for (const it of r.items) await addItem(tx, pid, it);
    await gainXpPower(tx, pid, r.xp, r.power);
    await tx.query("UPDATE boss_damage SET claimed_at=$3, reward=$4 WHERE instance_id=$1 AND player_id=$2", [instance_id, pid, new Date(now), JSON.stringify(r)]);
    out.push(r);
  }
  return out;
}

/** Live view of a boss fight: shared HP, damage leaderboard, the last kill and my reward from it. */
export async function bossFight(tx: Queryable, pid: number, bossIndex: number, now = Date.now()) {
  const boss = bossByIndex(bossIndex);
  if (!boss) throw new GameError("no_boss", "Босс не найден", 404);
  const inst = await bossInstance(tx, bossIndex, false);
  const damage = await tx.query<{ id: number; name: string; photo_url: string | null; level: number; damage: number; hits: number }>(
    `SELECT p.id, COALESCE(p.username, p.first_name) AS name, p.photo_url, p.level, d.damage::float8 AS damage, d.hits
     FROM boss_damage d JOIN players p ON p.id = d.player_id WHERE d.instance_id=$1 ORDER BY d.damage DESC LIMIT 30`, [inst.id]);
  const [mine] = await tx.query<{ damage: number; hits: number }>("SELECT damage::float8 AS damage, hits FROM boss_damage WHERE instance_id=$1 AND player_id=$2", [inst.id, pid]);
  const [participants] = await tx.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM boss_damage WHERE instance_id=$1", [inst.id]);
  const [last] = await tx.query<{ id: number; killed_at: Date; killer: string | null; killer_id: number | null }>(
    `SELECT i.id, i.killed_at, COALESCE(p.username, p.first_name) AS killer, i.killer_id FROM boss_instances i LEFT JOIN players p ON p.id = i.killer_id
     WHERE i.boss_index=$1 AND i.status='dead' ORDER BY i.killed_at DESC LIMIT 1`, [bossIndex]);
  let lastKill = null;
  if (last) {
    const [my] = await tx.query<{ reward: KillReward | string | null }>("SELECT reward FROM boss_damage WHERE instance_id=$1 AND player_id=$2", [last.id, pid]);
    const reward = my?.reward ? (typeof my.reward === "string" ? (JSON.parse(my.reward) as KillReward) : my.reward) : null;
    lastKill = { instanceId: last.id, killer: last.killer ?? "Игрок", killerId: last.killer_id, at: new Date(last.killed_at).getTime(), myReward: reward };
  }
  const [row] = await tx.query<{ attempts: number; attempts_day: string; unlocked: boolean }>(
    "SELECT attempts, attempts_day, unlocked FROM player_bosses WHERE player_id=$1 AND boss_index=$2", [pid, bossIndex]);
  return {
    bossIndex, instanceId: inst.id, hp: inst.hp, hpMax: inst.hp_max, participants: participants.n,
    damage, my: { damage: mine?.damage ?? 0, hits: mine?.hits ?? 0 },
    attemptsLeft: row?.unlocked ? ATTACKS_PER_DAY - (row.attempts_day === dayKey(now) ? row.attempts : 0) : 0,
    lastKill, serverTime: now,
  };
}
export type BossFight = Awaited<ReturnType<typeof bossFight>>;

/** Damage estimate for each weapon the player can hit with (fists + owned weapons). */
export function weaponOptions(power: number, loadout: Loadout, owned: string[]) {
  const ids = [FISTS, ...ITEMS.filter((i) => i.kind === "weapon" && owned.includes(i.id)).map((i) => i.id)];
  return ids.map((id) => ({ id, avg: avgHit(powerWith(power, loadout, id)) }));
}

export async function unlockBoss(tx: Queryable, pid: number, bossIndex: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const boss = bossByIndex(bossIndex);
  if (!boss || bossIndex < 2) throw new GameError("no_boss", "Босс не найден", 404);
  const rows = await bossRows(tx, pid);
  if (rows.find((r) => r.boss_index === bossIndex)?.unlocked) return { bossIndex, already: true };
  if (!rows.find((r) => r.boss_index === bossIndex - 1)?.unlocked) throw new GameError("boss_locked", "Сначала откройте предыдущего босса", 400);
  await removeItem(tx, pid, keyItem(bossIndex - 1).id, KEYS_TO_UNLOCK).catch(() => {
    throw new GameError("no_keys", `Нужно ${KEYS_TO_UNLOCK} ключа с босса #${bossIndex - 1}`, 400);
  });
  await tx.query(
    `INSERT INTO player_bosses (player_id, boss_index, unlocked) VALUES ($1,$2,TRUE)
     ON CONFLICT (player_id, boss_index) DO UPDATE SET unlocked = TRUE`, [pid, bossIndex]);
  return { bossIndex, already: false };
}

// ---------------- Home: idle, workplace, theme ----------------
export function idleAccrued(p: Pick<PlayerRow, "equipment_tier" | "idle_claimed_at">, now: number) {
  const ms = Math.min(IDLE_CAP_MS, Math.max(0, now - new Date(p.idle_claimed_at).getTime()));
  const rate = workplace(p.equipment_tier).idlePerHour;
  return { ms, amount: roundCur((rate.amount * ms) / 3_600_000, rate.currency), currency: rate.currency, full: ms >= IDLE_CAP_MS };
}
export async function claimIdle(tx: Queryable, pid: number, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  const a = idleAccrued(p, now);
  if (a.amount < 1) throw new GameError("idle_empty", "Пока нечего забирать", 400);
  await credit(tx, pid, { currency: a.currency, amount: a.amount });
  await tx.query("UPDATE players SET idle_claimed_at=$2 WHERE id=$1", [pid, new Date(now)]);
  return { amount: a.amount, currency: a.currency };
}
export async function buyWorkplace(tx: Queryable, pid: number, tier: number, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  const w = WORKPLACE[tier - 1];
  if (!w || tier !== p.equipment_tier + 1 || !w.price) throw new GameError("bad_tier", "Сначала купите предыдущий уровень", 400);
  if (p.level < w.unlockLevel) throw new GameError("locked", `Откроется на уровне ${w.unlockLevel}`, 400);
  // collect idle at the old rate first
  const a = idleAccrued(p, now);
  if (a.amount > 0) await credit(tx, pid, { currency: a.currency, amount: a.amount });
  await debit(tx, pid, w.price);
  await tx.query("UPDATE players SET equipment_tier=$2, idle_claimed_at=$3 WHERE id=$1", [pid, tier, new Date(now)]);
  await recalcPower(tx, pid);
  await bump(tx, pid, "shop", 1, now);
  return { tier, name: w.name };
}
export async function setTheme(tx: Queryable, pid: number, themeId: string, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const it = itemById(themeId);
  if (!it || it.kind !== "theme") throw new GameError("no_item", "Тема не найдена", 404);
  if (themeId !== DEFAULT_THEME && (await itemCount(tx, pid, themeId)) < 1) throw new GameError("not_owned", "Сначала купите тему в магазине", 400);
  await tx.query("UPDATE players SET theme=$2 WHERE id=$1", [pid, themeId]);
  return { theme: themeId };
}

// ---------------- Shop & inventory ----------------
export async function shopBuy(tx: Queryable, pid: number, itemId: string, idem?: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  return idempotent(tx, pid, idem, "shop", async () => {
    const it = itemById(itemId);
    if (!it || !it.price) throw new GameError("not_for_sale", "Этот предмет не продаётся", 400);
    if (p.level < (it.unlockLevel ?? 1)) throw new GameError("locked", `Откроется на уровне ${it.unlockLevel}`, 400);
    if (!it.stackable && (await itemCount(tx, pid, it.id)) > 0) throw new GameError("owned", "Уже есть в инвентаре", 400);
    await debit(tx, pid, it.price);
    await addItem(tx, pid, it.id);
    await bump(tx, pid, "shop", 1, now);
    return { itemId: it.id };
  });
}

export async function equip(tx: Queryable, pid: number, itemId: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  const it = itemById(itemId);
  if (!it || !SLOTS.includes(it.kind as Slot)) throw new GameError("not_gear", "Это нельзя надеть", 400);
  if ((await itemCount(tx, pid, it.id)) < 1) throw new GameError("not_owned", "Предмета нет в инвентаре", 400);
  const loadout = { ...p.loadout, [it.kind]: it.id };
  await tx.query("UPDATE players SET loadout=$2 WHERE id=$1", [pid, JSON.stringify(loadout)]);
  const power = await recalcPower(tx, pid);
  return { loadout, power };
}
export async function unequip(tx: Queryable, pid: number, slot: Slot, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  if (!SLOTS.includes(slot)) throw new GameError("bad_slot", "Неверный слот", 400);
  const loadout = { ...p.loadout };
  delete loadout[slot];
  await tx.query("UPDATE players SET loadout=$2 WHERE id=$1", [pid, JSON.stringify(loadout)]);
  return { loadout, power: await recalcPower(tx, pid) };
}

function rollChest(rng: () => number) {
  const total = CHEST_LOOT.reduce((s, l) => s + l.weight, 0);
  let r = rng() * total;
  for (const l of CHEST_LOOT) {
    r -= l.weight;
    if (r <= 0) return l;
  }
  return CHEST_LOOT[0];
}

export async function useItem(tx: Queryable, pid: number, itemId: string, now = Date.now(), rng: () => number = rand) {
  const p = await lockPlayer(tx, pid, now);
  const it = itemById(itemId);
  if (!it) throw new GameError("no_item", "Предмет не найден", 404);
  if (it.kind === "consumable") {
    await removeItem(tx, pid, it.id);
    const max = maxEnergy(p.equipment_tier);
    // drinks may overfill up to 2× max
    await tx.query("UPDATE players SET energy = LEAST($2::int * 2, energy + $3) WHERE id=$1", [pid, max, it.energy ?? 0]);
    return { used: it.id, energy: it.energy };
  }
  if (it.kind === "chest") {
    await removeItem(tx, pid, it.id);
    const loot = rollChest(rng);
    if (loot.reward) await credit(tx, pid, loot.reward);
    let item: string | null = null;
    if (loot.item) {
      const li = itemById(loot.item)!;
      // duplicate non-stackable gear converts to USD
      if (!li.stackable && (await itemCount(tx, pid, li.id)) > 0) {
        await credit(tx, pid, { currency: "USD", amount: 20 });
        return { used: it.id, loot: { reward: { currency: "USD" as Currency, amount: 20 }, item: null, duplicate: li.id } };
      }
      await addItem(tx, pid, loot.item);
      item = loot.item;
    }
    return { used: it.id, loot: { reward: loot.reward ?? null, item } };
  }
  throw new GameError("not_usable", "Этот предмет нельзя использовать", 400);
}

export async function exchange(tx: Queryable, pid: number, from: Currency, to: Currency, amount: number, idem?: string, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  return idempotent(tx, pid, idem, "exchange", async () => {
    if (from === to) throw new GameError("bad_pair", "Выберите разные валюты", 400);
    if (!(amount > 0)) throw new GameError("bad_amount", "Введите сумму", 400);
    const amt = roundCur(amount, from);
    const q = exchangeQuote(from, to, amt, now);
    if (q.usd < 0.5) throw new GameError("too_small", "Минимальный обмен — $0.50", 400);
    await debit(tx, pid, { currency: from, amount: amt });
    await credit(tx, pid, { currency: to, amount: q.received });
    return { from, to, spent: amt, received: q.received };
  });
}

// ---------------- Daily login & missions ----------------
export function dailyStatus(row: { streak: number; last_claim_at: Date | string | null } | undefined, now = Date.now()) {
  const last = row?.last_claim_at ? new Date(row.last_claim_at).getTime() : 0;
  const broken = !last || now - last > DAILY_STREAK_RESET_MS;
  const nextDay = broken ? 1 : (row?.streak ?? 0) + 1;
  const availableAt = last ? last + DAILY_COOLDOWN_MS : 0;
  return { streak: broken ? 0 : row?.streak ?? 0, nextDay, canClaim: now >= availableAt, availableAt, cycleDay: ((nextDay - 1) % DAILY_REWARDS.length) + 1 };
}
export async function claimDaily(tx: Queryable, pid: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  await tx.query("INSERT INTO daily_rewards (player_id) VALUES ($1) ON CONFLICT DO NOTHING", [pid]);
  const [row] = await tx.query<{ streak: number; last_claim_at: Date | null }>("SELECT streak, last_claim_at FROM daily_rewards WHERE player_id=$1 FOR UPDATE", [pid]);
  const st = dailyStatus(row, now);
  if (!st.canClaim) throw new GameError("daily_cooldown", "Награда уже получена. Возвращайтесь позже", 400);
  const r = DAILY_REWARDS[st.cycleDay - 1];
  if (r.reward) await credit(tx, pid, r.reward);
  if (r.item) await addItem(tx, pid, r.item);
  await tx.query("UPDATE daily_rewards SET streak=$2, last_claim_at=$3 WHERE player_id=$1", [pid, st.nextDay, new Date(now)]);
  return { day: st.cycleDay, label: r.label };
}

export async function missionStatus(tx: Queryable, pid: number, now = Date.now()) {
  const period = "d:" + dayKey(now);
  const metrics = await tx.query<{ metric: Metric; value: number }>("SELECT metric, value FROM quest_metrics WHERE player_id=$1 AND period=$2", [pid, period]);
  const claims = await tx.query<{ quest_id: string }>("SELECT quest_id FROM quest_claims WHERE player_id=$1 AND period=$2", [pid, period]);
  const claimed = new Set(claims.map((c) => c.quest_id));
  return MISSIONS.map((m) => {
    const v = m.metric === "login" ? 1 : metrics.find((x) => x.metric === m.metric)?.value ?? 0;
    const progress = Math.min(m.target, v);
    return { ...m, progress, done: progress >= m.target, claimed: claimed.has(m.id), resetsAt: nextDayStart(now) };
  });
}
export async function claimMission(tx: Queryable, pid: number, missionId: string, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const m = missionById(missionId);
  if (!m) throw new GameError("no_mission", "Задание не найдено", 404);
  const st = (await missionStatus(tx, pid, now)).find((x) => x.id === m.id)!;
  if (!st.done) throw new GameError("not_done", "Задание ещё не выполнено", 400);
  const ins = await tx.query("INSERT INTO quest_claims (player_id, quest_id, period) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING quest_id", [pid, m.id, "d:" + dayKey(now)]);
  if (!ins.length) throw new GameError("claimed", "Награда уже получена", 400);
  await credit(tx, pid, m.reward);
  await gainXpPower(tx, pid, m.xp, m.power);
  return { missionId: m.id, reward: m.reward };
}

// ---------------- Clans ----------------
const CLAN_NAME = /^[\p{L}\p{N} _\-.]{3,24}$/u;
const CLAN_TAG = /^[A-Za-z0-9]{2,5}$/;

async function memberOf(tx: Queryable, pid: number) {
  const r = await tx.query<{ clan_id: number; role: string }>("SELECT clan_id, role FROM clan_members WHERE player_id=$1", [pid]);
  return r[0] ?? null;
}

export async function createClan(tx: Queryable, pid: number, name: string, tag: string, description: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  if (await memberOf(tx, pid)) throw new GameError("in_clan", "Вы уже состоите в клане", 400);
  name = name.trim();
  tag = tag.trim().toUpperCase();
  if (!CLAN_NAME.test(name)) throw new GameError("bad_name", "Название: 3–24 символа (буквы, цифры, пробел, _ - .)", 400);
  if (!CLAN_TAG.test(tag)) throw new GameError("bad_tag", "Тег: 2–5 латинских букв или цифр", 400);
  const dup = await tx.query("SELECT 1 FROM clans WHERE lower(name)=lower($1) OR lower(tag)=lower($2)", [name, tag]);
  if (dup.length) throw new GameError("clan_exists", "Клан с таким названием или тегом уже есть", 400);
  await debit(tx, pid, CLAN_CREATE_PRICE);
  const [c] = await tx.query<{ id: number }>("INSERT INTO clans (name, tag, description, owner_id) VALUES ($1,$2,$3,$4) RETURNING id", [name, tag, description.slice(0, 200), pid]);
  await tx.query("INSERT INTO clan_members (player_id, clan_id, role) VALUES ($1,$2,'leader')", [pid, c.id]);
  await tx.query("DELETE FROM clan_requests WHERE player_id=$1", [pid]);
  await tx.query("UPDATE players SET clan_id=$2 WHERE id=$1", [pid, c.id]);
  await feed(tx, "clan", `🛡 ${displayName(p)} основал клан [${tag}] ${name}`, pid);
  return { clanId: c.id };
}

async function requireLeader(tx: Queryable, pid: number) {
  const m = await memberOf(tx, pid);
  if (!m || m.role !== "leader") throw new GameError("not_leader", "Только лидер клана может это сделать", 403);
  return m.clan_id;
}

export async function disbandClan(tx: Queryable, pid: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const clanId = await requireLeader(tx, pid);
  await tx.query("UPDATE players SET clan_id=NULL WHERE clan_id=$1", [clanId]);
  await tx.query("DELETE FROM clans WHERE id=$1", [clanId]);
  return { disbanded: clanId };
}

export async function requestJoin(tx: Queryable, pid: number, clanId: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  if (await memberOf(tx, pid)) throw new GameError("in_clan", "Сначала выйдите из текущего клана", 400);
  const c = await tx.query("SELECT 1 FROM clans WHERE id=$1", [clanId]);
  if (!c.length) throw new GameError("no_clan", "Клан не найден", 404);
  const n = await tx.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clan_requests WHERE player_id=$1", [pid]);
  if (n[0].n >= 5) throw new GameError("too_many_requests", "Можно подать не больше 5 заявок", 400);
  await tx.query("INSERT INTO clan_requests (player_id, clan_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [pid, clanId]);
  return { requested: clanId };
}
export async function cancelRequest(tx: Queryable, pid: number, clanId: number) {
  await tx.query("DELETE FROM clan_requests WHERE player_id=$1 AND clan_id=$2", [pid, clanId]);
  return { cancelled: clanId };
}

export async function decideRequest(tx: Queryable, pid: number, applicantId: number, accept: boolean, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const clanId = await requireLeader(tx, pid);
  const req = await tx.query("DELETE FROM clan_requests WHERE player_id=$1 AND clan_id=$2 RETURNING player_id", [applicantId, clanId]);
  if (!req.length) throw new GameError("no_request", "Заявка не найдена", 404);
  if (!accept) return { rejected: applicantId };
  await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [applicantId]);
  if (await memberOf(tx, applicantId)) throw new GameError("in_clan", "Игрок уже вступил в другой клан", 400);
  const [{ n }] = await tx.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clan_members WHERE clan_id=$1", [clanId]);
  if (n >= CLAN_MAX_MEMBERS) throw new GameError("clan_full", `В клане максимум ${CLAN_MAX_MEMBERS} игроков`, 400);
  await tx.query("INSERT INTO clan_members (player_id, clan_id, role) VALUES ($1,$2,'member')", [applicantId, clanId]);
  await tx.query("DELETE FROM clan_requests WHERE player_id=$1", [applicantId]);
  await tx.query("UPDATE players SET clan_id=$2 WHERE id=$1", [applicantId, clanId]);
  return { accepted: applicantId };
}

export async function kickMember(tx: Queryable, pid: number, memberId: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const clanId = await requireLeader(tx, pid);
  if (memberId === pid) throw new GameError("self", "Лидер не может исключить себя. Распустите клан", 400);
  const r = await tx.query("DELETE FROM clan_members WHERE player_id=$1 AND clan_id=$2 RETURNING player_id", [memberId, clanId]);
  if (!r.length) throw new GameError("not_member", "Игрок не состоит в вашем клане", 404);
  await tx.query("UPDATE players SET clan_id=NULL WHERE id=$1", [memberId]);
  return { kicked: memberId };
}

export async function leaveClan(tx: Queryable, pid: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const m = await memberOf(tx, pid);
  if (!m) throw new GameError("not_in_clan", "Вы не состоите в клане", 400);
  if (m.role === "leader") throw new GameError("leader_leave", "Лидер не может выйти. Распустите клан", 400);
  await tx.query("DELETE FROM clan_members WHERE player_id=$1", [pid]);
  await tx.query("UPDATE players SET clan_id=NULL WHERE id=$1", [pid]);
  return { left: m.clan_id };
}

export async function listClans(tx: Queryable, search = "") {
  return tx.query<{ id: number; name: string; tag: string; description: string; members: number; power: number; owner: string }>(
    `SELECT c.id, c.name, c.tag, c.description, COUNT(m.player_id)::int AS members, COALESCE(SUM(p.power_cached),0)::int AS power,
            (SELECT COALESCE(o.username, o.first_name) FROM players o WHERE o.id = c.owner_id) AS owner
       FROM clans c LEFT JOIN clan_members m ON m.clan_id = c.id LEFT JOIN players p ON p.id = m.player_id
      WHERE $1 = '' OR lower(c.name) LIKE '%' || lower($1) || '%' OR lower(c.tag) LIKE '%' || lower($1) || '%'
      GROUP BY c.id ORDER BY power DESC, c.id ASC LIMIT 50`, [search.slice(0, 30)]);
}

export async function clanDetails(tx: Queryable, clanId: number, viewerId: number) {
  const [c] = await tx.query<{ id: number; name: string; tag: string; description: string; owner_id: number; created_at: string }>("SELECT * FROM clans WHERE id=$1", [clanId]);
  if (!c) return null;
  const members = await tx.query<{ id: number; name: string; photo_url: string | null; level: number; power: number; role: string }>(
    `SELECT p.id, COALESCE(p.username, p.first_name) AS name, p.photo_url, p.level, p.power_cached AS power, m.role
       FROM clan_members m JOIN players p ON p.id = m.player_id WHERE m.clan_id=$1 ORDER BY (m.role='leader') DESC, p.power_cached DESC`, [clanId]);
  const isLeader = c.owner_id === viewerId;
  const requests = isLeader
    ? await tx.query<{ id: number; name: string; photo_url: string | null; level: number; power: number }>(
        `SELECT p.id, COALESCE(p.username, p.first_name) AS name, p.photo_url, p.level, p.power_cached AS power
           FROM clan_requests r JOIN players p ON p.id = r.player_id WHERE r.clan_id=$1 ORDER BY r.created_at`, [clanId])
    : [];
  return { ...c, members, requests, power: members.reduce((s, m) => s + m.power, 0), isLeader };
}

// ---------------- State ----------------
export async function getState(tx: Queryable, pid: number, now = Date.now()) {
  const [p] = await tx.query<PlayerRow>("SELECT * FROM players WHERE id=$1", [pid]);
  const balances = { RUB: 0, USD: 0, SOL: 0, BTC: 0 } as Record<Currency, number>;
  for (const b of await tx.query<{ currency: Currency; amount: number }>("SELECT currency, amount FROM balances WHERE player_id=$1", [pid])) balances[b.currency] = b.amount;
  const inv = await tx.query<{ item_id: string; quantity: number; acquired_at: string }>(
    "SELECT item_id, quantity, acquired_at FROM inventory WHERE player_id=$1 AND item_type='item' AND quantity > 0 ORDER BY acquired_at", [pid]);
  const rows = await bossRows(tx, pid);
  const today = dayKey(now);
  const keys = new Map(inv.filter((i) => i.item_id.startsWith("key-")).map((i) => [Number(i.item_id.slice(4)), i.quantity]));
  const power = p.power_cached;
  const alive = new Map((await tx.query<{ boss_index: number; hp: number; hp_max: number }>(
    "SELECT boss_index, hp::float8 AS hp, hp_max::float8 AS hp_max FROM boss_instances WHERE status='alive'")).map((r) => [r.boss_index, r]));
  const bosses = BOSSES.map((b) => {
    const r = rows.find((x) => x.boss_index === b.index);
    const unlocked = !!r?.unlocked;
    const prevKeys = keys.get(b.index - 1) ?? 0;
    const prevUnlocked = b.index === 1 || !!rows.find((x) => x.boss_index === b.index - 1)?.unlocked;
    return {
      index: b.index, slug: b.slug, name: b.name, title: b.title, hp: alive.get(b.index)?.hp ?? b.hp, hpMax: alive.get(b.index)?.hp_max ?? b.hp, reward: b.reward, xp: b.xp, power: b.power,
      unlocked, wins: r?.wins ?? 0, losses: r?.losses ?? 0,
      attemptsLeft: unlocked ? ATTACKS_PER_DAY - (r?.attempts_day === today ? r.attempts : 0) : 0,
      canUnlock: !unlocked && prevUnlocked && prevKeys >= KEYS_TO_UNLOCK, keysHave: prevKeys,
      firstWinItem: b.firstWinItem ?? null, chestChance: b.chestChance,
    };
  });
  const [daily] = await tx.query<{ streak: number; last_claim_at: Date | null }>("SELECT streak, last_claim_at FROM daily_rewards WHERE player_id=$1", [pid]);
  const max = maxEnergy(p.equipment_tier);
  const clan = p.clan_id ? (await tx.query<{ id: number; name: string; tag: string }>("SELECT id, name, tag FROM clans WHERE id=$1", [p.clan_id]))[0] ?? null : null;
  const myRequests = (await tx.query<{ clan_id: number }>("SELECT clan_id FROM clan_requests WHERE player_id=$1", [pid])).map((r) => r.clan_id);
  return {
    serverTime: now,
    player: {
      id: p.id, name: displayName(p), photoUrl: p.photo_url, isGuest: p.is_guest, level: p.level, xp: p.xp, xpNext: xpForNextLevel(p.level),
      energy: p.energy, maxEnergy: max, energyUpdatedAt: new Date(p.energy_updated_at).getTime(), energyRegenMs: ENERGY_REGEN_MS,
      power, powerBonus: p.power_bonus, workplaceTier: p.equipment_tier, loadout: (p.loadout ?? {}) as Loadout, theme: p.theme || DEFAULT_THEME,
    },
    balances,
    rates: usdRates(now),
    idle: { ...idleAccrued(p, now), perHour: workplace(p.equipment_tier).idlePerHour, capMs: IDLE_CAP_MS },
    inventory: inv.map((i) => ({ id: i.item_id, qty: i.quantity })),
    weapons: weaponOptions(power, (p.loadout ?? {}) as Loadout, inv.map((i) => i.item_id)),
    bosses,
    daily: dailyStatus(daily, now),
    missions: await missionStatus(tx, pid, now),
    clan,
    myRequests,
    weekend: isWeekend(now),
  };
}
export type GameState = Awaited<ReturnType<typeof getState>>;
export { ITEMS };
