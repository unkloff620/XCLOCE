/* «Взлом» (content/heist.ts): boxes from boss wins into the player's cells, padlocks picked one by one, opened boxes. */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, takeMoney, type Ctx, type Granted } from "../core.ts";
import type { Config } from "../config.ts";
import { HEIST_SET_BOSS, HEIST_SLOTS, LOCK_MS, LOCK_RUSH, heistBox, heistStrength, rollHeistKind, rollHeistLoot, type HeistKind } from "../../content/heist.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";

interface Row { slot: number; kind: string; locks_done: number; pick_ends: Date | null; boss_id: string | null }

/** a lock whose time ran out is off — counted in the row (a player who comes back finds it opened) */
async function settle(q: Queryable, pid: number, now: number) {
  await q.query("UPDATE heist_boxes SET locks_done = locks_done + 1, pick_ends = NULL WHERE player_id=$1 AND pick_ends IS NOT NULL AND pick_ends <= $2", [pid, new Date(now)]);
}

export interface HeistBoxView { slot: number; kind: HeistKind; locks: number; done: number; pickEnds: number | null; boss: string | null }
export interface HeistView { on: boolean; endsAt: number | null; slots: number; boxes: HeistBoxView[]; lockMs: number; rush: number }

/** what the player sees: null while the event is off and his cells are empty (he sees nothing of it then) */
export async function heistView(q: Queryable, pid: number, cfg: Config, now: number): Promise<HeistView | null> {
  await settle(q, pid, now);
  const rows = await q.query<Row>("SELECT slot, kind, locks_done, pick_ends, boss_id FROM heist_boxes WHERE player_id=$1 ORDER BY slot", [pid]);
  const on = !!cfg.heist && cfg.heist.endsAt > now;
  if (!on && !rows.length) return null;
  return {
    on, endsAt: on ? cfg.heist!.endsAt : null, slots: HEIST_SLOTS, lockMs: LOCK_MS, rush: LOCK_RUSH,
    boxes: rows.map((r) => {
      const d = heistBox(r.kind);
      return { slot: Number(r.slot), kind: d.id, locks: d.locks, done: Math.min(d.locks, Number(r.locks_done)), pickEnds: r.pick_ends ? new Date(r.pick_ends).getTime() : null, boss: r.boss_id };
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
  const [r] = await ctx.q.query<Row>("SELECT slot, kind, locks_done, pick_ends, boss_id FROM heist_boxes WHERE player_id=$1 AND slot=$2 FOR UPDATE", [ctx.pid, slot]);
  if (!r) throw new GameError("heist_empty", "Ячейка пустая");
  return r;
}

/** start picking the next padlock (one at a time; the player comes back for each) */
export async function heistPick(ctx: Ctx, slot: number) {
  const r = await boxRow(ctx, slot);
  const d = heistBox(r.kind);
  if (r.pick_ends) throw new GameError("heist_busy", "Этот замок уже взламывается");
  if (Number(r.locks_done) >= d.locks) throw new GameError("heist_done", "Все замки сняты — открывай");
  const ends = ctx.now + LOCK_MS;
  await ctx.q.query("UPDATE heist_boxes SET pick_ends=$3 WHERE player_id=$1 AND slot=$2", [ctx.pid, slot, new Date(ends)]);
  return { slot, pickEnds: ends };
}

/** the current padlock (being picked or not started) off at once for LOCK_RUSH dollars */
export async function heistRush(ctx: Ctx, slot: number) {
  const r = await boxRow(ctx, slot);
  const d = heistBox(r.kind);
  if (Number(r.locks_done) >= d.locks) throw new GameError("heist_done", "Все замки сняты — открывай");
  await takeMoney(ctx, "USD", LOCK_RUSH, `heist_rush:${slot}`);
  await ctx.q.query("UPDATE heist_boxes SET locks_done = locks_done + 1, pick_ends = NULL WHERE player_id=$1 AND slot=$2", [ctx.pid, slot]);
  return { slot, done: Number(r.locks_done) + 1 };
}

/** every padlock is off: the box opens — its loot, maybe a piece of the event's tattoos; the cell is free again */
export async function heistOpen(ctx: Ctx, slot: number) {
  const r = await boxRow(ctx, slot);
  const d = heistBox(r.kind);
  if (Number(r.locks_done) < d.locks) throw new GameError("heist_locked", "Сначала сними все замки");
  const loot = rollHeistLoot(d.id, ctx.rng);
  let tattoo: string | null = null;
  if (ctx.rng() < d.tattoo) {
    const all = TATTOO_SETS.filter((s) => s.boss === HEIST_SET_BOSS).flatMap((s) => s.pieces.map((p) => p.id));
    const have = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, all])).map((x) => x.item_id));
    const left = all.filter((id) => !have.has(id));
    if (left.length) { tattoo = left[Math.floor(ctx.rng() * left.length) % left.length]; loot.items = [...(loot.items ?? []), { id: tattoo, qty: 1 }]; }
  }
  await ctx.q.query("DELETE FROM heist_boxes WHERE player_id=$1 AND slot=$2", [ctx.pid, slot]);
  const reward = await grantReward(ctx, loot, `heist_open:${d.id}`);
  return { slot, kind: d.id, reward, tattoo };
}
