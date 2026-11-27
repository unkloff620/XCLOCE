/* «Взлом» (content/heist.ts): boxes from boss wins into the player's cells, padlocks picked one by one, opened boxes. */
import { GameError, type Queryable } from "../db.ts";
import { balances, grantReward, takeMoney, type Ctx, type Granted } from "../core.ts";
import type { Config } from "../config.ts";
import { HEIST_SET_BOSS, HEIST_SLOTS, LOCK_AUTO, LOCK_MS, LOCK_RUSH, LOCK_RUSH_GOLD, heistBox, heistLoot, heistPay, heistStrength, rollHeistKind, rollHeistLoot, rushPrice, type HeistKind, type HeistPay } from "../../content/heist.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";

interface Row { slot: number; kind: string; locks_done: number; pick_ends: Date | null; boss_id: string | null; rushed?: number; gold_paid?: number; auto?: boolean }
const COLS = "slot, kind, locks_done, pick_ends, boss_id, rushed, gold_paid, auto";

/** a lock whose time ran out is off — counted in the row (a player who comes back finds it opened).
 * «Автовзлом» boxes go on by themselves: every LOCK_MS the next padlock is off, until all are. */
async function settle(q: Queryable, pid: number, now: number) {
  const autos = await q.query<{ slot: number; kind: string; locks_done: number; pick_ends: Date }>(
    "SELECT slot, kind, locks_done, pick_ends FROM heist_boxes WHERE player_id=$1 AND auto AND pick_ends IS NOT NULL AND pick_ends <= $2", [pid, new Date(now)]);
  for (const a of autos) {
    const locks = heistBox(a.kind).locks;
    const ends = new Date(a.pick_ends).getTime();
    const n = 1 + Math.floor((now - ends) / LOCK_MS);
    const doneNow = Math.min(locks, Number(a.locks_done) + n);
    await q.query("UPDATE heist_boxes SET locks_done=$3, pick_ends=$4 WHERE player_id=$1 AND slot=$2",
      [pid, a.slot, doneNow, doneNow < locks ? new Date(ends + n * LOCK_MS) : null]);
  }
  await q.query("UPDATE heist_boxes SET locks_done = locks_done + 1, pick_ends = NULL WHERE player_id=$1 AND pick_ends IS NOT NULL AND pick_ends <= $2", [pid, new Date(now)]);
}

export interface HeistBoxView { slot: number; kind: HeistKind; locks: number; done: number; pickEnds: number | null; boss: string | null; rushed: number; goldPaid: number; auto: boolean }
export interface HeistView { on: boolean; endsAt: number | null; slots: number; boxes: HeistBoxView[]; lockMs: number; rush: number; rushGold: number; auto: number }

/** what the player sees: null while the event is off and his cells are empty (he sees nothing of it then) */
export async function heistView(q: Queryable, pid: number, cfg: Config, now: number): Promise<HeistView | null> {
  await settle(q, pid, now);
  const rows = await q.query<Row>(`SELECT ${COLS} FROM heist_boxes WHERE player_id=$1 ORDER BY slot`, [pid]);
  const on = !!cfg.heist && cfg.heist.endsAt > now;
  if (!on && !rows.length) return null;
  return {
    on, endsAt: on ? cfg.heist!.endsAt : null, slots: HEIST_SLOTS, lockMs: LOCK_MS, rush: LOCK_RUSH, rushGold: LOCK_RUSH_GOLD, auto: LOCK_AUTO,
    boxes: rows.map((r) => {
      const d = heistBox(r.kind);
      return { slot: Number(r.slot), kind: d.id, locks: d.locks, done: Math.min(d.locks, Number(r.locks_done)), pickEnds: r.pick_ends ? new Date(r.pick_ends).getTime() : null, boss: r.boss_id, rushed: Number(r.rushed ?? 0), goldPaid: Number(r.gold_paid ?? 0), auto: !!r.auto };
    }),
  };
}

/** a boss win while the event is on: a box into the first free cell (the stronger the boss, the better the odds) */
export async function heistDrop(ctx: Ctx, boss: { id: string; order: number; event?: boolean }, granted: Granted) {
  if (!ctx.cfg.heist || ctx.cfg.heist.endsAt <= ctx.now) return;
  const taken = new Set((await ctx.q.query<{ slot: number }>("SELECT slot FROM heist_boxes WHERE player_id=$1", [ctx.pid])).map((r) => Number(r.slot)));
  let slot = -1;
  for (let i = 0; i < HEIST_SLOTS; i++) if (!taken.has(i)) { slot = i; break; }
  if (slot < 0) { granted.heistBox = "full"; return; }
  const kind = rollHeistKind(ctx.rng, heistStrength(boss.order, !!boss.event));
  await ctx.q.query("INSERT INTO heist_boxes (player_id, slot, kind, boss_id, got_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [ctx.pid, slot, kind, boss.id, new Date(ctx.now)]);
  granted.heistBox = kind;
}

async function boxRow(ctx: Ctx, slot: number): Promise<Row> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= HEIST_SLOTS) throw new GameError("bad_request", "Нет такой ячейки", 400);
  await settle(ctx.q, ctx.pid, ctx.now);
  const [r] = await ctx.q.query<Row>(`SELECT ${COLS} FROM heist_boxes WHERE player_id=$1 AND slot=$2 FOR UPDATE`, [ctx.pid, slot]);
  if (!r) throw new GameError("heist_empty", "Ячейка пустая");
  return r;
}

/** only one box is being picked at a time (the user 2026-11-27): another one with a padlock under the picks stops it */
async function oneAtATime(ctx: Ctx, slot: number) {
  const [o] = await ctx.q.query<{ slot: number }>("SELECT slot FROM heist_boxes WHERE player_id=$1 AND slot<>$2 AND pick_ends IS NOT NULL LIMIT 1", [ctx.pid, slot]);
  if (o) throw new GameError("heist_one", "Взламывать можно только один ящик за раз");
}

/** start picking the next padlock (one at a time; the player comes back for each) */
export async function heistPick(ctx: Ctx, slot: number) {
  const r = await boxRow(ctx, slot);
  const d = heistBox(r.kind);
  if (r.pick_ends) throw new GameError("heist_busy", "Этот замок уже взламывается");
  if (Number(r.locks_done) >= d.locks) throw new GameError("heist_done", "Все замки сняты — открывай");
  await oneAtATime(ctx, slot);
  const ends = ctx.now + LOCK_MS;
  await ctx.q.query("UPDATE heist_boxes SET pick_ends=$3 WHERE player_id=$1 AND slot=$2", [ctx.pid, slot, new Date(ends)]);
  return { slot, pickEnds: ends };
}

/** the current padlock (being picked or not started) off at once: LOCK_RUSH teeth, or LOCK_RUSH_GOLD bars when the
 * teeth run short (a box with every padlock paid in bars holds the richer loot) */
export async function heistRush(ctx: Ctx, slot: number) {
  const r = await boxRow(ctx, slot);
  const d = heistBox(r.kind);
  if (Number(r.locks_done) >= d.locks) throw new GameError("heist_done", "Все замки сняты — открывай");
  if (r.auto) throw new GameError("heist_auto", "Этот ящик ломается автовзломом");
  const price = rushPrice((await balances(ctx.q, ctx.pid)).TOOTH);
  await takeMoney(ctx, price.currency, price.amount, `heist_rush:${slot}`);
  const gold = price.currency === "GOLD" ? 1 : 0;
  await ctx.q.query("UPDATE heist_boxes SET locks_done = locks_done + 1, pick_ends = NULL, rushed = rushed + 1, gold_paid = gold_paid + $3 WHERE player_id=$1 AND slot=$2", [ctx.pid, slot, gold]);
  return { slot, done: Number(r.locks_done) + 1, paid: price };
}

/** «Автовзлом» is gone (the user 2026-11-27): a box already on it finishes by itself (settle), no new one */
export async function heistAuto(_ctx: Ctx, _slot: number): Promise<never> {
  throw new GameError("heist_auto_gone", "Автовзлома больше нет");
}

/** every padlock is off: the box opens — its loot, maybe a piece of the event's tattoos; the cell is free again */
export async function heistOpen(ctx: Ctx, slot: number) {
  const r = await boxRow(ctx, slot);
  const d = heistBox(r.kind);
  if (Number(r.locks_done) < d.locks) throw new GameError("heist_locked", "Сначала сними все замки");
  // every padlock paid in gold bars: the «bars» loot; any other way — the «teeth» one
  const rushed = Number(r.rushed ?? 0) > 0;
  const pay: HeistPay = heistPay(d.locks, Number(r.gold_paid ?? 0));
  const loot = rollHeistLoot(d.id, ctx.rng, pay);
  let tattoo: string | null = null;
  if (ctx.rng() < heistLoot(d.id, pay).tattoo) {
    const all = TATTOO_SETS.filter((s) => s.boss === HEIST_SET_BOSS).flatMap((s) => s.pieces.map((p) => p.id));
    const have = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, all])).map((x) => x.item_id));
    const left = all.filter((id) => !have.has(id));
    if (left.length) { tattoo = left[Math.floor(ctx.rng() * left.length) % left.length]; loot.items = [...(loot.items ?? []), { id: tattoo, qty: 1 }]; }
  }
  await ctx.q.query("DELETE FROM heist_boxes WHERE player_id=$1 AND slot=$2", [ctx.pid, slot]);
  const reward = await grantReward(ctx, loot, `heist_open:${d.id}`);
  return { slot, kind: d.id, reward, tattoo, rushed, pay };
}
