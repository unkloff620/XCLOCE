import { GameError, type Queryable } from "./db.ts";
import type { Config } from "./config.ts";
import { CURRENCIES, floorTo, isCurrency, type Currency } from "../content/currencies.ts";
import { itemById } from "../content/items.ts";
import { levelFromXp } from "../content/levels.ts";
import type { Reward } from "../content/rewards.ts";

/** Everything a game action needs. `now` and `rng` are injectable so tests control time and luck. */
export interface Ctx {
  q: Queryable;
  pid: number;
  now: number;
  cfg: Config;
  rng: () => number;
}

export interface PlayerRow {
  id: number;
  telegram_id: number | null;
  username: string | null;
  display_name: string;
  photo_url: string | null;
  xp: number;
  energy: number;
  energy_at: Date;
  clan_id: number | null;
  created_at: Date;
  last_seen_at: Date;
  active_days: number;
}

/** Moscow calendar day (daily limits reset at 00:00 MSK). */
export function moscowDay(now: number): string {
  return new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
}
export function nextMoscowMidnight(now: number): number {
  const d = moscowDay(now);
  return Date.parse(d + "T00:00:00Z") + 24 * 3600_000 - 3 * 3600_000;
}

// ---------------- energy ----------------
/** Current energy from the stored value. Above the regular maximum nothing regenerates and nothing is cut. */
export function energyNow(stored: number, at: number, now: number, cfg: Config["energy"]): { energy: number; at: number; nextIn: number } {
  const period = cfg.regenMin * 60_000;
  if (stored >= cfg.max) return { energy: stored, at: now, nextIn: 0 };
  const ticks = Math.max(0, Math.floor((now - at) / period));
  const energy = Math.min(cfg.max, stored + ticks);
  if (energy >= cfg.max) return { energy, at: now, nextIn: 0 };
  const at2 = at + ticks * period;
  return { energy, at: at2, nextIn: period - (now - at2) };
}

/** Locks the player row for this transaction and applies pending energy regeneration. */
export async function lockPlayer(ctx: Ctx): Promise<PlayerRow & { energyNow: number; nextEnergyIn: number }> {
  const [p] = await ctx.q.query<PlayerRow>("SELECT * FROM players WHERE id=$1 FOR NO KEY UPDATE", [ctx.pid]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  const e = energyNow(p.energy, new Date(p.energy_at).getTime(), ctx.now, ctx.cfg.energy);
  // Only regeneration below the maximum changes the stored row.
  if (p.energy < ctx.cfg.energy.max && (e.energy !== p.energy || e.at !== new Date(p.energy_at).getTime())) {
    await ctx.q.query("UPDATE players SET energy=$2, energy_at=$3 WHERE id=$1", [ctx.pid, e.energy, new Date(e.at)]);
    p.energy = e.energy;
    p.energy_at = new Date(e.at);
  }
  return { ...p, energyNow: e.energy, nextEnergyIn: e.nextIn };
}

export async function spendEnergy(ctx: Ctx, amount: number): Promise<number> {
  const p = await lockPlayer(ctx);
  if (p.energyNow < amount) throw new GameError("no_energy", `Не хватает энергии: нужно ${amount}, есть ${p.energyNow}`);
  const left = p.energyNow - amount;
  // Dropping from the maximum (or above it) below it starts the regen clock now.
  const at = p.energyNow >= ctx.cfg.energy.max ? new Date(ctx.now) : p.energy_at;
  await ctx.q.query("UPDATE players SET energy=$2, energy_at=$3 WHERE id=$1", [ctx.pid, left, at]);
  await ledger(ctx, "energy", "energy", -amount, "spend");
  return left;
}

export async function addEnergy(ctx: Ctx, amount: number, reason: string): Promise<number> {
  const p = await lockPlayer(ctx);
  const total = p.energyNow + amount;
  // Below the maximum the regen clock keeps running; at or above it, regen simply pauses.
  await ctx.q.query("UPDATE players SET energy=$2, energy_at=$3 WHERE id=$1", [ctx.pid, total, p.energyNow >= ctx.cfg.energy.max ? new Date(ctx.now) : p.energy_at]);
  await ledger(ctx, "energy", "energy", amount, reason);
  return total;
}

// ---------------- wallets ----------------
export async function balances(q: Queryable, pid: number): Promise<Record<Currency, number>> {
  const rows = await q.query<{ currency: Currency; amount: number }>("SELECT currency, amount FROM wallets WHERE player_id=$1", [pid]);
  const out = Object.fromEntries(CURRENCIES.map((c) => [c, 0])) as Record<Currency, number>;
  for (const r of rows) out[r.currency] = Number(r.amount);
  return out;
}

export async function addMoney(ctx: Ctx, c: Currency, amount: number, reason: string) {
  if (!isCurrency(c)) throw new GameError("bad_currency", "Неизвестная валюта");
  const v = floorTo(c, amount);
  if (v <= 0) return 0;
  await ctx.q.query(
    "INSERT INTO wallets (player_id, currency, amount) VALUES ($1,$2,$3) ON CONFLICT (player_id, currency) DO UPDATE SET amount = wallets.amount + EXCLUDED.amount",
    [ctx.pid, c, v],
  );
  await ledger(ctx, "currency", c, v, reason);
  return v;
}

export async function takeMoney(ctx: Ctx, c: Currency, amount: number, reason: string) {
  const v = Math.round(amount * 1e8) / 1e8;
  if (!(v > 0)) throw new GameError("bad_amount", "Некорректная сумма");
  const r = await ctx.q.query("UPDATE wallets SET amount = amount - $3 WHERE player_id=$1 AND currency=$2 AND amount >= $3 RETURNING amount", [ctx.pid, c, v]);
  if (!r.length) throw new GameError("no_money", `Не хватает ${c}`);
  await ledger(ctx, "currency", c, -v, reason);
}

// ---------------- inventory ----------------
export async function itemQty(q: Queryable, pid: number, id: string): Promise<number> {
  const [r] = await q.query<{ qty: number }>("SELECT qty FROM inventory WHERE player_id=$1 AND item_id=$2", [pid, id]);
  return r?.qty ?? 0;
}

/** Adds up to maxStack; returns how many were actually added. */
export async function addItem(ctx: Ctx, id: string, qty: number, source: string): Promise<number> {
  const def = itemById(id);
  if (!def) throw new GameError("bad_item", "Неизвестный предмет");
  const have = await itemQty(ctx.q, ctx.pid, id);
  const add = Math.max(0, Math.min(qty, def.maxStack - have));
  if (add <= 0) return 0;
  await ctx.q.query(
    "INSERT INTO inventory (player_id, item_id, qty, source, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (player_id, item_id) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty, updated_at = EXCLUDED.updated_at",
    [ctx.pid, id, add, source, new Date(ctx.now)],
  );
  await ledger(ctx, "item", id, add, source);
  return add;
}

export async function takeItem(ctx: Ctx, id: string, qty: number, reason: string): Promise<number> {
  const r = await ctx.q.query<{ qty: number }>(
    "UPDATE inventory SET qty = qty - $3, updated_at=$4 WHERE player_id=$1 AND item_id=$2 AND qty >= $3 RETURNING qty",
    [ctx.pid, id, qty, new Date(ctx.now)],
  );
  if (!r.length) throw new GameError("no_item", `Нет предмета: ${itemById(id)?.name ?? id}`);
  await ledger(ctx, "item", id, -qty, reason);
  return r[0].qty;
}

export async function ledger(ctx: Ctx, kind: string, key: string, delta: number, reason: string) {
  await ctx.q.query("INSERT INTO ledger (player_id, kind, key, delta, reason, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [ctx.pid, kind, key, delta, reason.slice(0, 60), new Date(ctx.now)]);
}

// ---------------- rewards ----------------
export interface Granted {
  xp: number;
  currencies: Partial<Record<Currency, number>>;
  items: { id: string; qty: number; lost?: number }[];
  energy: number;
  levelUp?: { from: number; to: number };
}

export async function grantReward(ctx: Ctx, r: Reward, reason: string): Promise<Granted> {
  const out: Granted = { xp: 0, currencies: {}, items: [], energy: 0 };
  for (const [c, v] of Object.entries(r.currencies ?? {})) {
    if (v && v > 0) out.currencies[c as Currency] = await addMoney(ctx, c as Currency, v, reason);
  }
  for (const it of r.items ?? []) {
    const got = await addItem(ctx, it.id, it.qty, reason);
    out.items.push(got < it.qty ? { id: it.id, qty: got, lost: it.qty - got } : { id: it.id, qty: got });
  }
  if (r.energy) {
    out.energy = r.energy;
    await addEnergy(ctx, r.energy, reason);
  }
  if (r.xp) {
    const [p] = await ctx.q.query<{ xp: number }>("UPDATE players SET xp = xp + $2 WHERE id=$1 RETURNING xp", [ctx.pid, r.xp]);
    out.xp = r.xp;
    const before = levelFromXp(p.xp - r.xp, ctx.cfg.levels).level;
    const after = levelFromXp(p.xp, ctx.cfg.levels).level;
    if (after > before) out.levelUp = { from: before, to: after };
  }
  await ctx.q.query("UPDATE player_stats SET rewards_got = rewards_got + 1 WHERE player_id=$1", [ctx.pid]);
  return out;
}

/** Picks an entry by relative weight. */
export function weighted<T>(entries: { v: T; w: number }[], rng: () => number): T {
  const total = entries.reduce((s, e) => s + Math.max(0, e.w), 0);
  let x = rng() * total;
  for (const e of entries) {
    x -= Math.max(0, e.w);
    if (x < 0) return e.v;
  }
  return entries[entries.length - 1].v;
}

/** Stores the result of an action under the client's idempotency key, or returns the stored result. */
export async function idempotent<T>(ctx: Ctx, key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const [hit] = await ctx.q.query<{ result: T }>("SELECT result FROM idempotency WHERE player_id=$1 AND key=$2", [ctx.pid, key]);
  if (hit) return hit.result;
  const result = await fn();
  await ctx.q.query("INSERT INTO idempotency (player_id, key, result) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ctx.pid, key, JSON.stringify(result ?? null)]);
  return result;
}
