import { GameError } from "../db.ts";
import { grantReward, itemQty, weighted, type Ctx } from "../core.ts";
import { YARD_DROPS, type YardDrop } from "../../content/yard.ts";
import { itemById } from "../../content/items.ts";

/*
 * One item appears every spawnMin minutes, at most maxItems lie on the ground at once.
 * `anchor_at` is the moment the next period started counting; NULL means the yard is full and the timer stands still.
 * Spawns are computed from timestamps on every visit, so closing the game loses nothing (but never more than maxItems).
 * Picking from a full yard restarts the timer from the moment of the pick.
 */

export function rollDrop(ctx: Ctx): YardDrop {
  const entries = YARD_DROPS.map((d) => ({ v: d, w: ctx.cfg.yard.weights[d.id] ?? d.weight }));
  return weighted(entries, ctx.rng);
}

export async function yardSync(ctx: Ctx) {
  const period = ctx.cfg.yard.spawnMin * 60_000;
  const max = ctx.cfg.yard.maxItems;
  let [y] = await ctx.q.query<{ anchor_at: Date | null }>("SELECT anchor_at FROM yard WHERE player_id=$1 FOR UPDATE", [ctx.pid]);
  if (!y) {
    await ctx.q.query("INSERT INTO yard (player_id, anchor_at) VALUES ($1,$2) ON CONFLICT DO NOTHING", [ctx.pid, new Date(ctx.now)]);
    y = { anchor_at: new Date(ctx.now) };
  }
  const items = await ctx.q.query<{ id: number; slot: number; drop_id: string; spawned_at: Date }>(
    "SELECT id, slot, drop_id, spawned_at FROM yard_items WHERE player_id=$1 ORDER BY slot",
    [ctx.pid],
  );
  let anchor = y.anchor_at ? new Date(y.anchor_at).getTime() : null;
  // a yard that is not full but has no running timer (e.g. config changed) restarts now
  if (anchor === null && items.length < max) anchor = ctx.now;
  const used = new Set(items.map((i) => i.slot));
  let changed = false;
  while (anchor !== null && items.length < max && ctx.now >= anchor + period) {
    const at = anchor + period;
    let slot = 0;
    while (used.has(slot)) slot++;
    used.add(slot);
    const drop = rollDrop(ctx);
    const [row] = await ctx.q.query<{ id: number }>(
      "INSERT INTO yard_items (player_id, slot, drop_id, spawned_at) VALUES ($1,$2,$3,$4) RETURNING id",
      [ctx.pid, slot, drop.id, new Date(at)],
    );
    items.push({ id: row.id, slot, drop_id: drop.id, spawned_at: new Date(at) });
    anchor = at;
    changed = true;
  }
  if (items.length >= max) anchor = null;
  const stored = y.anchor_at ? new Date(y.anchor_at).getTime() : null;
  if (changed || stored !== anchor) await ctx.q.query("UPDATE yard SET anchor_at=$2 WHERE player_id=$1", [ctx.pid, anchor === null ? null : new Date(anchor)]);
  return {
    items: items.sort((a, b) => a.slot - b.slot).map((i) => ({ id: i.id, slot: i.slot, drop: i.drop_id, at: new Date(i.spawned_at).getTime() })),
    max,
    nextAt: anchor === null ? null : anchor + period,
    periodMs: period,
  };
}

export async function yardPick(ctx: Ctx, itemId: number) {
  const before = await yardSync(ctx);
  const it = before.items.find((i) => i.id === itemId);
  if (!it) throw new GameError("yard_gone", "Этого предмета уже нет");
  const drop = YARD_DROPS.find((d) => d.id === it.drop) ?? YARD_DROPS[0];
  // do not lose a weapon to a full stack: it stays on the ground
  for (const ri of drop.reward.items ?? []) {
    const def = itemById(ri.id);
    if (def && (await itemQty(ctx.q, ctx.pid, ri.id)) + ri.qty > def.maxStack) throw new GameError("stack_full", `${def.name}: больше не влезает (максимум ${def.maxStack})`);
  }
  await ctx.q.query("DELETE FROM yard_items WHERE id=$1 AND player_id=$2", [it.id, ctx.pid]);
  if (before.items.length >= before.max) await ctx.q.query("UPDATE yard SET anchor_at=$2 WHERE player_id=$1", [ctx.pid, new Date(ctx.now)]);
  const got = await grantReward(ctx, drop.reward, `yard:${drop.id}`);
  await ctx.q.query("UPDATE player_stats SET yard_found = yard_found + 1 WHERE player_id=$1", [ctx.pid]);
  return { picked: drop.id, name: drop.name, reward: got, yard: await yardSync(ctx) };
}
