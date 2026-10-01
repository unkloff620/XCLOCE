import { randomInt } from "node:crypto";
import { GameError, type Queryable } from "./db.ts";
import { addXp } from "./xp.ts";
import { log } from "./log.ts";
import type { TelegramUser } from "./auth.ts";
import {
  ATTACKS_PER_DAY, CURRENCIES, ENERGY_BASE_MAX, ENERGY_REGEN_MS, IDLE_CAP_MS, KEYS_TO_UNLOCK, RENAME_COOLDOWN_MS, START_BALANCES, WORKPLACE,
  computePower, dayKey, exchangeQuote, nextDayStart, roundCur, usdRates, workplace, xpForNextLevel,
  type Currency, type Price,
} from "../shared/economy.ts";
import { DEFAULT_THEME, FISTS, ITEMS, SLOTS, itemById, keyItem, weaponHit, type Loadout, type Slot } from "../shared/items.ts";
import {
  BOSSES, CHEST_LOOT, DAILY_COOLDOWN_MS, DAILY_REWARDS, DAILY_STREAK_RESET_MS, HIT_XP_SHARE, MISSIONS, CLAN_CREATE_PRICE, CLAN_MAX_MEMBERS,
  LOCATIONS, bossByIndex, isWeekend, locationById, locationTask, missionById, type Metric,
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
  display_name: string | null;
  name_changed_at: Date | null;
}

export function displayName(p: Pick<PlayerRow, "username" | "first_name"> & { display_name?: string | null }): string {
  return p.display_name || p.username || p.first_name || "Degen";
}
/** SQL expression for a player's shown name (alias p). */
const NAME_SQL = (a: string) => `COALESCE(${a}.display_name, ${a}.username, ${a}.first_name)`;
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

// ---------------- Market: locations ----------------
async function locationProgress(tx: Queryable, pid: number) {
  const progress: Record<string, number> = {};
  for (const r of await tx.query<{ task_id: string; progress: number }>("SELECT task_id, progress FROM location_progress WHERE player_id=$1", [pid])) progress[r.task_id] = r.progress;
  const clears: Record<string, number> = {};
  for (const r of await tx.query<{ location_id: string; clears: number }>("SELECT location_id, clears FROM location_clears WHERE player_id=$1", [pid])) clears[r.location_id] = r.clears;
  return { progress, clears };
}
/** A location is open when it is the first one or the previous one was completed at least once. */
export function locationUnlocked(index: number, clears: Record<string, number>): boolean {
  if (index <= 1) return true;
  const prev = LOCATIONS.find((l) => l.index === index - 1);
  return !!prev && (clears[prev.id] ?? 0) > 0;
}

/** One step of a location task: spends energy, pays the step reward, advances progress N/target. */
export async function doTask(tx: Queryable, pid: number, taskId: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  rateLimit(p, 250, now);
  const lt = locationTask(taskId);
  if (!lt) throw new GameError("no_task", "Задание не найдено", 404);
  const { loc, task } = lt;
  const { progress, clears } = await locationProgress(tx, pid);
  if (!locationUnlocked(loc.index, clears)) throw new GameError("locked", "Сначала пройди предыдущую локацию", 400);
  const cur = progress[task.id] ?? 0;
  if (cur >= task.target) throw new GameError("task_done", "Задание уже выполнено", 400);
  if (p.energy < task.energy) throw new GameError("no_energy", "Не хватает энергии", 400);
  await tx.query("UPDATE players SET energy = energy - $2 WHERE id=$1", [pid, task.energy]);
  const mult = isWeekend(now) ? 2 : 1;
  await credit(tx, pid, task.reward, mult);
  const next = cur + 1;
  await tx.query(
    `INSERT INTO location_progress (player_id, task_id, progress) VALUES ($1,$2,1)
     ON CONFLICT (player_id, task_id) DO UPDATE SET progress = location_progress.progress + 1`, [pid, task.id]);
  const done = next >= task.target;
  await gainXpPower(tx, pid, task.xp, done ? task.power : 0);
  await bump(tx, pid, "tasks", 1, now);
  await bump(tx, pid, "energy", task.energy, now);
  await touch(tx, p, now);
  progress[task.id] = next;
  const locationComplete = loc.tasks.every((t) => (progress[t.id] ?? 0) >= t.target);
  return {
    taskId: task.id, locationId: loc.id, progress: next, target: task.target, done, locationComplete,
    reward: { currency: task.reward.currency, amount: roundCur(task.reward.amount * mult, task.reward.currency) }, xp: task.xp, power: done ? task.power : 0, weekend: mult > 1,
  };
}

/** Pays the location reward once all 5 tasks are done; progress resets so the location can be replayed. */
export async function claimLocation(tx: Queryable, pid: number, locationId: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  const loc = locationById(locationId);
  if (!loc) throw new GameError("no_location", "Локация не найдена", 404);
  const { progress } = await locationProgress(tx, pid);
  if (!loc.tasks.every((t) => (progress[t.id] ?? 0) >= t.target)) throw new GameError("not_complete", "Выполни все задания локации", 400);
  await credit(tx, pid, loc.reward.price);
  for (const it of loc.reward.items) await addItem(tx, pid, it);
  await gainXpPower(tx, pid, loc.reward.xp, loc.reward.power);
  await tx.query("DELETE FROM location_progress WHERE player_id=$1 AND task_id = ANY($2::text[])", [pid, loc.tasks.map((t) => t.id)]);
  const [c] = await tx.query<{ clears: number }>(
    `INSERT INTO location_clears (player_id, location_id, clears) VALUES ($1,$2,1)
     ON CONFLICT (player_id, location_id) DO UPDATE SET clears = location_clears.clears + 1 RETURNING clears`, [pid, loc.id]);
  if (c.clears === 1) await feed(tx, "system", `🗺 ${displayName(p)} прошёл локацию «${loc.name}»`, pid);
  await touch(tx, p, now);
  return { locationId: loc.id, name: loc.name, reward: loc.reward.price, items: loc.reward.items, xp: loc.reward.xp, power: loc.reward.power, clears: c.clears };
}

// ---------------- Bosses ----------------
async function bossRows(tx: Queryable, pid: number) {
  return tx.query<{ boss_index: number; unlocked: boolean; wins: number; losses: number; attempts: number; attempts_day: string }>(
    "SELECT boss_index, unlocked, wins, losses, attempts, attempts_day FROM player_bosses WHERE player_id=$1", [pid]);
}

interface FightRow { id: number; boss_index: number; hp_max: number; start_hit_id: number; cooldowns: Record<string, number>; started_at: Date }

async function activeFight(tx: Queryable, pid: number, lock = false): Promise<FightRow | null> {
  const [f] = await tx.query<FightRow>(
    `SELECT id, boss_index, hp_max::float8 AS hp_max, start_hit_id::float8 AS start_hit_id, cooldowns, started_at
     FROM player_fights WHERE player_id=$1 AND status='active'${lock ? " FOR UPDATE" : ""}`, [pid]);
  if (!f) return null;
  f.cooldowns = (typeof f.cooldowns === "string" ? JSON.parse(f.cooldowns) : f.cooldowns) ?? {};
  return f;
}
/** Global damage dealt by all players since a fight started — it all hits that fight's boss. */
async function damageSince(tx: Queryable, startHitId: number): Promise<number> {
  const [r] = await tx.query<{ d: number }>("SELECT COALESCE(SUM(damage), 0)::float8 AS d FROM global_hits WHERE id > $1", [startHitId]);
  return r.d;
}
async function fightHp(tx: Queryable, f: FightRow) {
  const total = await damageSince(tx, f.start_hit_id);
  return { total, hp: Math.max(0, f.hp_max - total) };
}

/** Starts a personal fight. One fight at a time; ATTACKS_PER_DAY fights per boss per day. */
export async function startFight(tx: Queryable, pid: number, bossIndex: number, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  const boss = bossByIndex(bossIndex);
  if (!boss) throw new GameError("no_boss", "Босс не найден", 404);
  const cur = await activeFight(tx, pid, true);
  if (cur) {
    if (cur.boss_index === bossIndex) return { fightId: cur.id, bossIndex, already: true };
    throw new GameError("in_fight", `Сначала закончи бой с боссом #${cur.boss_index}`, 400);
  }
  const [row] = await tx.query<{ unlocked: boolean; attempts: number; attempts_day: string }>(
    "SELECT unlocked, attempts, attempts_day FROM player_bosses WHERE player_id=$1 AND boss_index=$2 FOR UPDATE", [pid, bossIndex]);
  if (!row?.unlocked) throw new GameError("boss_locked", `Нужно ${KEYS_TO_UNLOCK} ключа с босса #${bossIndex - 1}`, 400);
  const today = dayKey(now);
  const used = row.attempts_day === today ? row.attempts : 0;
  if (used >= ATTACKS_PER_DAY) throw new GameError("no_attempts", "Нападения на этого босса закончились. Новые — завтра", 400);
  const [{ last }] = await tx.query<{ last: number }>("SELECT COALESCE(MAX(id), 0)::float8 AS last FROM global_hits");
  const [f] = await tx.query<{ id: number }>(
    "INSERT INTO player_fights (player_id, boss_index, hp_max, start_hit_id, started_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [pid, bossIndex, boss.hp, last, new Date(now)]);
  await tx.query("UPDATE player_bosses SET attempts=$3, attempts_day=$4 WHERE player_id=$1 AND boss_index=$2", [pid, bossIndex, used + 1, today]);
  await touch(tx, p, now);
  return { fightId: f.id, bossIndex, already: false };
}

/** One hit with a weapon. Each weapon has its own cooldown inside the fight; cooldowns reset when the fight ends. */
export async function hitFight(tx: Queryable, pid: number, weaponId: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  rateLimit(p, 250, now);
  const f = await activeFight(tx, pid, true);
  if (!f) throw new GameError("no_fight", "Сначала нападай на босса", 400);
  const before = await fightHp(tx, f);
  if (before.hp <= 0) throw new GameError("boss_dead", "Босс уже повержен — забери награду", 400);
  const w = weaponHit(weaponId);
  if (!w) throw new GameError("bad_weapon", "Это не оружие", 400);
  if (weaponId !== FISTS.id && (await itemCount(tx, pid, weaponId)) < 1) throw new GameError("no_item", "Этого оружия нет в инвентаре", 400);
  const readyAt = f.cooldowns[weaponId] ?? 0;
  if (now < readyAt) throw new GameError("cooldown", "Оружие перезаряжается", 400);
  const boss = bossByIndex(f.boss_index)!;
  await tx.query("INSERT INTO global_hits (player_id, boss_index, weapon, damage, created_at) VALUES ($1,$2,$3,$4,$5)", [pid, f.boss_index, weaponId, w.dmg, new Date(now)]);
  const cooldowns = { ...f.cooldowns, [weaponId]: now + w.cooldownMin * 60_000 };
  await tx.query("UPDATE player_fights SET cooldowns=$2 WHERE id=$1", [f.id, JSON.stringify(cooldowns)]);
  await tx.query("UPDATE player_stats SET lifetime_damage = lifetime_damage + $2 WHERE player_id=$1", [pid, w.dmg]);
  const xp = Math.max(1, Math.round(boss.xp * HIT_XP_SHARE));
  await gainXpPower(tx, pid, xp, 0);
  await bump(tx, pid, "fights", 1, now);
  await touch(tx, p, now);
  const after = await fightHp(tx, f);
  log.info("boss.hit", { player: pid, boss: f.boss_index, weapon: weaponId, dmg: w.dmg });
  return { bossIndex: f.boss_index, weapon: weaponId, dmg: w.dmg, hp: after.hp, hpMax: f.hp_max, won: after.hp <= 0, readyAt: cooldowns[weaponId], xp };
}

/** Collects the victory reward once the boss HP reached 0 (from anyone's damage) and ends the fight. */
export async function claimFight(tx: Queryable, pid: number, now = Date.now(), rng: () => number = rand) {
  const p = await lockPlayer(tx, pid, now);
  const f = await activeFight(tx, pid, true);
  if (!f) throw new GameError("no_fight", "Нет активного боя", 400);
  const { hp, total } = await fightHp(tx, f);
  if (hp > 0) throw new GameError("not_won", "Босс ещё жив", 400);
  const boss = bossByIndex(f.boss_index)!;
  const [pb] = await tx.query<{ wins: number }>(
    `UPDATE player_bosses SET wins = wins + 1, first_win_at = COALESCE(first_win_at, now()) WHERE player_id=$1 AND boss_index=$2 RETURNING wins`, [pid, f.boss_index]);
  await credit(tx, pid, boss.reward);
  const key = keyItem(f.boss_index).id;
  await addItem(tx, pid, key);
  const items: string[] = [];
  if (boss.firstWinItem && pb?.wins === 1) items.push(boss.firstWinItem);
  if (rng() < boss.chestChance) items.push("x-chest");
  for (const it of items) await addItem(tx, pid, it);
  await gainXpPower(tx, pid, boss.xp, boss.power);
  await tx.query("UPDATE player_stats SET bosses_defeated = bosses_defeated + 1 WHERE player_id=$1", [pid]);
  await bump(tx, pid, "wins", 1, now);
  const [mine] = await tx.query<{ d: number }>("SELECT COALESCE(SUM(damage),0)::float8 AS d FROM global_hits WHERE id > $1 AND player_id=$2", [f.start_hit_id, pid]);
  const result = { bossIndex: f.boss_index, bossName: boss.name, reward: boss.reward, key, xp: boss.xp, power: boss.power, items, myDamage: mine.d, totalDamage: Math.min(total, f.hp_max) };
  await tx.query("UPDATE player_fights SET status='won', ended_at=$2, reward=$3 WHERE id=$1", [f.id, new Date(now), JSON.stringify(result)]);
  if (pb?.wins === 1) await feed(tx, "boss", `👑 ${displayName(p)} впервые победил ${boss.name}`, pid);
  await touch(tx, p, now);
  return result;
}

/** Leaves the fight without a reward (counts as a loss). */
export async function fleeFight(tx: Queryable, pid: number, now = Date.now()) {
  await lockPlayer(tx, pid, now);
  const f = await activeFight(tx, pid, true);
  if (!f) throw new GameError("no_fight", "Нет активного боя", 400);
  if ((await fightHp(tx, f)).hp <= 0) throw new GameError("already_won", "Босс уже повержен — забери награду", 400);
  await tx.query("UPDATE player_fights SET status='fled', ended_at=$2 WHERE id=$1", [f.id, new Date(now)]);
  await tx.query("UPDATE player_bosses SET losses = losses + 1 WHERE player_id=$1 AND boss_index=$2", [pid, f.boss_index]);
  return { bossIndex: f.boss_index };
}

/** Live fight view: my boss HP after global damage, cooldowns and who dealt damage since my fight began. */
export async function fightView(tx: Queryable, pid: number, now = Date.now()) {
  const f = await activeFight(tx, pid);
  if (!f) return null;
  const { hp, total } = await fightHp(tx, f);
  const damage = await tx.query<{ id: number; name: string; photo_url: string | null; damage: number; hits: number; boss_index: number }>(
    `SELECT h.player_id AS id, ${NAME_SQL("p")} AS name, p.photo_url, SUM(h.damage)::float8 AS damage, COUNT(*)::int AS hits,
            (array_agg(h.boss_index ORDER BY h.id DESC))[1] AS boss_index
     FROM global_hits h JOIN players p ON p.id = h.player_id WHERE h.id > $1
     GROUP BY h.player_id, p.display_name, p.username, p.first_name, p.photo_url ORDER BY damage DESC LIMIT 30`, [f.start_hit_id]);
  return { fightId: f.id, bossIndex: f.boss_index, hp, hpMax: f.hp_max, won: hp <= 0, total, startedAt: new Date(f.started_at).getTime(), cooldowns: f.cooldowns, damage, serverTime: now };
}
export type FightView = NonNullable<Awaited<ReturnType<typeof fightView>>>;

/** Weapons the player can hit with: fists + owned weapons, strongest first. */
export function weaponOptions(owned: string[]) {
  const list = [{ id: FISTS.id, name: FISTS.name, ...FISTS.hit }];
  for (const i of ITEMS) if (i.kind === "weapon" && i.hit && owned.includes(i.id)) list.push({ id: i.id, name: i.name, ...i.hit });
  return list.sort((a, b) => b.dmg - a.dmg);
}

// ---------------- Profile ----------------
const NICK = /^[\p{L}\p{N}_. -]{3,16}$/u;
export async function renamePlayer(tx: Queryable, pid: number, raw: string, now = Date.now()) {
  const p = await lockPlayer(tx, pid, now);
  const name = raw.replace(/\s+/g, " ").trim();
  if (!NICK.test(name)) throw new GameError("bad_name", "Ник: 3–16 символов — буквы, цифры, пробел, _ . -", 400);
  if (p.name_changed_at && now - new Date(p.name_changed_at).getTime() < RENAME_COOLDOWN_MS) throw new GameError("rename_cooldown", "Сменить ник можно раз в 24 часа", 400);
  const taken = await tx.query("SELECT 1 FROM players WHERE lower(display_name) = lower($1) AND id <> $2", [name, pid]);
  if (taken.length) throw new GameError("name_taken", "Этот ник уже занят", 400);
  await tx.query("UPDATE players SET display_name=$2, name_changed_at=$3 WHERE id=$1", [pid, name, new Date(now)]);
  return { name };
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
            (SELECT ${NAME_SQL("o")} FROM players o WHERE o.id = c.owner_id) AS owner
       FROM clans c LEFT JOIN clan_members m ON m.clan_id = c.id LEFT JOIN players p ON p.id = m.player_id
      WHERE $1 = '' OR lower(c.name) LIKE '%' || lower($1) || '%' OR lower(c.tag) LIKE '%' || lower($1) || '%'
      GROUP BY c.id ORDER BY power DESC, c.id ASC LIMIT 50`, [search.slice(0, 30)]);
}

export async function clanDetails(tx: Queryable, clanId: number, viewerId: number) {
  const [c] = await tx.query<{ id: number; name: string; tag: string; description: string; owner_id: number; created_at: string }>("SELECT * FROM clans WHERE id=$1", [clanId]);
  if (!c) return null;
  const members = await tx.query<{ id: number; name: string; photo_url: string | null; level: number; power: number; role: string }>(
    `SELECT p.id, ${NAME_SQL("p")} AS name, p.photo_url, p.level, p.power_cached AS power, m.role
       FROM clan_members m JOIN players p ON p.id = m.player_id WHERE m.clan_id=$1 ORDER BY (m.role='leader') DESC, p.power_cached DESC`, [clanId]);
  const isLeader = c.owner_id === viewerId;
  const requests = isLeader
    ? await tx.query<{ id: number; name: string; photo_url: string | null; level: number; power: number }>(
        `SELECT p.id, ${NAME_SQL("p")} AS name, p.photo_url, p.level, p.power_cached AS power
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
  const fightRow = await activeFight(tx, pid);
  const fight = fightRow ? { bossIndex: fightRow.boss_index, hpMax: fightRow.hp_max, cooldowns: fightRow.cooldowns, ...(await fightHp(tx, fightRow)) } : null;
  const bosses = BOSSES.map((b) => {
    const r = rows.find((x) => x.boss_index === b.index);
    const unlocked = !!r?.unlocked;
    const prevKeys = keys.get(b.index - 1) ?? 0;
    const prevUnlocked = b.index === 1 || !!rows.find((x) => x.boss_index === b.index - 1)?.unlocked;
    return {
      index: b.index, slug: b.slug, name: b.name, title: b.title, hp: fight?.bossIndex === b.index ? fight.hp : b.hp, hpMax: b.hp, reward: b.reward, xp: b.xp, power: b.power,
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
      id: p.id, name: displayName(p), renameAt: p.name_changed_at ? new Date(p.name_changed_at).getTime() + RENAME_COOLDOWN_MS : 0, photoUrl: p.photo_url, isGuest: p.is_guest, level: p.level, xp: p.xp, xpNext: xpForNextLevel(p.level),
      energy: p.energy, maxEnergy: max, energyUpdatedAt: new Date(p.energy_updated_at).getTime(), energyRegenMs: ENERGY_REGEN_MS,
      power, powerBonus: p.power_bonus, workplaceTier: p.equipment_tier, loadout: (p.loadout ?? {}) as Loadout, theme: p.theme || DEFAULT_THEME,
    },
    balances,
    rates: usdRates(now),
    idle: { ...idleAccrued(p, now), perHour: workplace(p.equipment_tier).idlePerHour, capMs: IDLE_CAP_MS },
    inventory: inv.map((i) => ({ id: i.item_id, qty: i.quantity })),
    weapons: weaponOptions(inv.map((i) => i.item_id)),
    fight: fight ? { ...fight, won: fight.hp <= 0 } : null,
    locations: await locationProgress(tx, pid),
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
