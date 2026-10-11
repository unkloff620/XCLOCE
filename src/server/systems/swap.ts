import { GameError, type Queryable } from "../db.ts";
import { addItem, moscowDay, takeItem, type Ctx } from "../core.ts";
import { STASH_IDS } from "../../content/stashes.ts";
import { itemById } from "../../content/items.ts";
import { schedule } from "./notify.ts";

/*
 * Нычки между игроками. A player asks for up to STASH_WISH_MAX stashes he still needs («Попросить нычки» at home);
 * anyone who opens his profile sees them and may send one of his own copies of a stash from that list. A sender gives
 * at most STASH_GIFTS_PER_DAY stashes per Moscow day (to anyone, in total). The stash leaves the sender's inventory at
 * once and waits in the receiver's «Сообщения» (stash_gifts, accepted_at NULL) until he accepts it; then it lands in
 * his inventory. Both moves go to the ledger. The receiver also gets a Telegram reminder.
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
  await takeItem(ctx, itemId, 1, `gift-to:${to}`);
  await ctx.q.query("INSERT INTO stash_gifts (from_id, to_id, item_id, day, at) VALUES ($1,$2,$3,$4,$5)", [ctx.pid, to, itemId, moscowDay(ctx.now), new Date(ctx.now)]);
  await schedule(ctx.q, to, "stash_gift", ctx.now);
  return { to, itemId, name: p.display_name, left: await giftsLeft(ctx.q, ctx.pid, ctx.now) };
}

/** for the receiver: accepted gifts (pending = false: the latest ones) or the ones waiting in «Сообщения» */
export async function giftsReceived(q: Queryable, pid: number, pending = false, limit = 10) {
  const rows = await q.query<{ id: number; from_id: number; display_name: string; item_id: string; at: Date }>(
    `SELECT g.id, g.from_id, p.display_name, g.item_id, g.at FROM stash_gifts g JOIN players p ON p.id=g.from_id
     WHERE g.to_id=$1 AND (g.accepted_at IS NULL) = $2 ORDER BY g.id DESC LIMIT $3`,
    [pid, pending, pending ? 100 : limit],
  );
  return rows.map((r) => ({ id: Number(r.id), fromId: r.from_id, from: r.display_name, itemId: r.item_id, at: new Date(r.at).getTime() }));
}

/** Accepts one waiting gift (`id`) or all of them: the stashes go to the inventory. */
export async function acceptGifts(ctx: Ctx, id: number | null) {
  const rows = await ctx.q.query<{ id: number; from_id: number; item_id: string }>(
    "SELECT id, from_id, item_id FROM stash_gifts WHERE to_id=$1 AND accepted_at IS NULL AND ($2::bigint IS NULL OR id=$2) ORDER BY id FOR UPDATE",
    [ctx.pid, id],
  );
  if (!rows.length) throw new GameError("no_gift", id ? "Этот подарок уже принят" : "Новых подарков нет");
  const got: string[] = [];
  for (const g of rows) {
    if (!itemById(g.item_id)) continue;
    await addItem(ctx, g.item_id, 1, `gift-from:${g.from_id}`);
    got.push(g.item_id);
  }
  await ctx.q.query("UPDATE stash_gifts SET accepted_at=$2 WHERE id = ANY($1::bigint[])", [rows.map((r) => r.id), new Date(ctx.now)]);
  return { accepted: got };
}
