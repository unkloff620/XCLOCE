import { GameError, type Queryable } from "../db.ts";
import { addItem, moscowDay, takeItem, type Ctx } from "../core.ts";
import { STASH_IDS } from "../../content/stashes.ts";
import { itemById } from "../../content/items.ts";

/*
 * Нычки между игроками. A player asks for up to STASH_WISH_MAX stashes he still needs («Попросить нычки» at home);
 * anyone who opens his profile sees them and may send one of his own copies of a stash from that list. A sender gives
 * at most STASH_GIFTS_PER_DAY stashes per Moscow day (to anyone, in total). The stash leaves the sender's inventory
 * and lands in the receiver's; both moves go to the ledger, the gift itself to stash_gifts.
 */
export const STASH_WISH_MAX = 6;
export const STASH_GIFTS_PER_DAY = 6;

export async function setStashWish(ctx: Ctx, raw: unknown) {
  if (!Array.isArray(raw)) throw new GameError("bad_request", "Нужен список нычек");
  const items = [...new Set(raw.map(String))];
  if (items.length > STASH_WISH_MAX) throw new GameError("too_many", `Можно попросить не больше ${STASH_WISH_MAX} нычек`);
  if (items.some((id) => !STASH_IDS.includes(id))) throw new GameError("bad_item", "Это не нычка");
  await ctx.q.query(
    "INSERT INTO stash_wishes (player_id, items, updated_at) VALUES ($1,$2,$3) ON CONFLICT (player_id) DO UPDATE SET items=EXCLUDED.items, updated_at=EXCLUDED.updated_at",
    [ctx.pid, JSON.stringify(items), new Date(ctx.now)],
  );
  return { items };
}

export async function stashWish(q: Queryable, pid: number): Promise<string[]> {
  const [r] = await q.query<{ items: string[] }>("SELECT items FROM stash_wishes WHERE player_id=$1", [pid]);
  return (r?.items ?? []).filter((id) => STASH_IDS.includes(id));
}

export async function giftsLeft(q: Queryable, pid: number, now: number): Promise<number> {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM stash_gifts WHERE from_id=$1 AND day=$2", [pid, moscowDay(now)]);
  return Math.max(0, STASH_GIFTS_PER_DAY - Number(r?.n ?? 0));
}

export async function giftStash(ctx: Ctx, to: number, itemId: string) {
  if (to === ctx.pid) throw new GameError("bad_request", "Себе отправить нельзя");
  const [p] = await ctx.q.query<{ id: number; display_name: string }>("SELECT id, display_name FROM players WHERE id=$1", [to]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  if (!(await stashWish(ctx.q, to)).includes(itemId)) throw new GameError("not_wished", "Игрок не просит эту нычку");
  if ((await giftsLeft(ctx.q, ctx.pid, ctx.now)) <= 0) throw new GameError("gift_limit", `Сегодня ты уже отправил ${STASH_GIFTS_PER_DAY} нычек — новые завтра`);
  const def = itemById(itemId)!;
  await takeItem(ctx, itemId, 1, `gift-to:${to}`);
  const got = await addItem({ ...ctx, pid: to }, itemId, 1, `gift-from:${ctx.pid}`);
  if (got < 1) throw new GameError("stack_full", `У игрока уже максимум «${def.name}»`);
  await ctx.q.query("INSERT INTO stash_gifts (from_id, to_id, item_id, day, at) VALUES ($1,$2,$3,$4,$5)", [ctx.pid, to, itemId, moscowDay(ctx.now), new Date(ctx.now)]);
  return { to, itemId, name: p.display_name, left: await giftsLeft(ctx.q, ctx.pid, ctx.now) };
}

/** for the receiver: who sent what lately */
export async function giftsReceived(q: Queryable, pid: number, limit = 10) {
  const rows = await q.query<{ from_id: number; display_name: string; item_id: string; at: Date }>(
    "SELECT g.from_id, p.display_name, g.item_id, g.at FROM stash_gifts g JOIN players p ON p.id=g.from_id WHERE g.to_id=$1 ORDER BY g.id DESC LIMIT $2",
    [pid, limit],
  );
  return rows.map((r) => ({ fromId: r.from_id, from: r.display_name, itemId: r.item_id, at: new Date(r.at).getTime() }));
}
