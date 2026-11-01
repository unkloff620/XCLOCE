/*
 * «Крафт» (content/craft.ts): the stash of CRAFT_BOXES cells (player_craft_box), putting a thing in / taking it out,
 * making a thing from its recipe. What lies in the stash gives its bonus: the energy limit and the biceps go onto the
 * players row with the talents' (home.ts syncTalentExtras), the weapon damage with the sets' (collection.ts
 * setBonuses), the minutes to a boss fight in combat.ts startFight.
 */
import { GameError, type Queryable } from "../db.ts";
import { addItem, ledger, moscowDay, takeItem, takeMoney, type Ctx } from "../core.ts";
import { DEALER_STOCK, PART_BUY, dealerParts, PART_USD } from "../../content/craft-drops.ts";
import { CRAFT_BOXES, CRAFT_BOX_PRICES, CRAFT_BOX_TALENTS, craftBonusOf, craftById, craftBoxesOpen } from "../../content/craft.ts";
import { talentsForDamage } from "../../content/talents.ts";
import { syncTalentExtras } from "./home.ts";

/** the stash: CRAFT_BOXES cells, an item id or null */
export async function craftBoxes(q: Queryable, pid: number): Promise<(string | null)[]> {
  const rows = await q.query<{ slot: number; item_id: string }>("SELECT slot, item_id FROM player_craft_box WHERE player_id=$1", [pid]);
  const out: (string | null)[] = Array.from({ length: CRAFT_BOXES }, () => null);
  for (const r of rows) if (r.slot >= 0 && r.slot < CRAFT_BOXES) out[r.slot] = r.item_id;
  return out;
}
export async function craftBonus(q: Queryable, pid: number) {
  return craftBonusOf(await craftBoxes(q, pid));
}

/** one of the thing goes from the store into a cell (the given one when empty, else the first empty) */
export async function craftPut(ctx: Ctx, itemId: string, slot?: number) {
  const def = craftById(itemId);
  if (!def) throw new GameError("bad_item", "Это нельзя заныкать");
  const boxes = await craftBoxes(ctx.q, ctx.pid);
  // the cells bought so far (they become available with the talents, then are bought in order)
  const open = await craftBoxesBought(ctx.q, ctx.pid);
  if (slot !== undefined && slot >= open) throw new GameError("box_locked", "Эта ячейка ещё закрыта");
  const at = slot !== undefined && slot >= 0 && slot < CRAFT_BOXES && !boxes[slot] ? slot : boxes.findIndex((b, i) => !b && i < open);
  if (at < 0) throw new GameError("boxes_full", open ? "Все открытые ячейки заняты — вытащи что-нибудь" : "Сначала открой ячейку");
  await takeItem(ctx, def.id, 1, "craft-put");
  await ctx.q.query("INSERT INTO player_craft_box (player_id, slot, item_id) VALUES ($1,$2,$3)", [ctx.pid, at, def.id]);
  await syncTalentExtras(ctx.q, ctx.pid);
  return { slot: at, itemId: def.id };
}

/** the thing in a cell goes back to the store */
export async function craftTake(ctx: Ctx, slot: number) {
  const [r] = await ctx.q.query<{ item_id: string }>("DELETE FROM player_craft_box WHERE player_id=$1 AND slot=$2 RETURNING item_id", [ctx.pid, slot]);
  if (!r) throw new GameError("empty_box", "Ячейка пустая");
  await addItem(ctx, r.item_id, 1, "craft-take");
  await syncTalentExtras(ctx.q, ctx.pid);
  return { slot, itemId: r.item_id };
}

/** makes one thing: every part of its recipe is taken, the thing goes to the store */
export async function craftMake(ctx: Ctx, itemId: string) {
  const def = craftById(itemId);
  if (!def?.recipe) throw new GameError("bad_recipe", "Это не собирается");
  for (const r of def.recipe) await takeItem(ctx, r.id, r.qty, `craft:${def.id}`);
  const got = await addItem(ctx, def.id, 1, "craft");
  if (!got) throw new GameError("full", "Больше не влезет");
  await ledger(ctx, "craft", def.id, 1, "craft");
  return { itemId: def.id };
}

/** how many stash cells the player has opened (bought) */
export async function craftBoxesBought(q: Queryable, pid: number): Promise<number> {
  const [r] = await q.query<{ craft_boxes: number }>("SELECT craft_boxes FROM players WHERE id=$1", [pid]);
  return Math.min(CRAFT_BOXES, Number(r?.craft_boxes ?? 0));
}

/** opens the next cell: it must be available by the talents earned; paid in roubles (CRAFT_BOX_PRICES) */
export async function craftBoxBuy(ctx: Ctx) {
  const bought = await craftBoxesBought(ctx.q, ctx.pid);
  if (bought >= CRAFT_BOXES) throw new GameError("all_open", "Все ячейки уже открыты");
  const [st] = await ctx.q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [ctx.pid]);
  if (craftBoxesOpen(talentsForDamage(Number(st?.total_damage ?? 0))) <= bought) {
    throw new GameError("need_talents", `Эта ячейка откроется, когда будет ${CRAFT_BOX_TALENTS[bought]} талантов`);
  }
  const price = CRAFT_BOX_PRICES[bought];
  await takeMoney(ctx, "RUB", price, `craft-box:${bought}`);
  const [r] = await ctx.q.query<{ craft_boxes: number }>("UPDATE players SET craft_boxes = craft_boxes + 1 WHERE id=$1 AND craft_boxes=$2 RETURNING craft_boxes", [ctx.pid, bought]);
  if (!r) throw new GameError("conflict", "Ячейка уже открыта, обнови экран");
  return { slot: bought, price, open: Number(r.craft_boxes) };
}

/** the dealer in the garage today: DEALER_OFFERS parts, DEALER_STOCK of each for every player, at PART_BUY prices */
export async function dealerView(q: Queryable, pid: number, now: number) {
  const day = moscowDay(now);
  const ids = dealerParts(day);
  const rows = await q.query<{ key: string; n: number }>("SELECT key, SUM(delta)::int AS n FROM ledger WHERE player_id=$1 AND kind='item' AND reason=$2 GROUP BY key", [pid, `dealer:${day}`]);
  const bought = new Map(rows.map((r) => [r.key, Number(r.n)]));
  return ids.map((id) => ({ id, price: PART_BUY[craftById(id)?.rarity ?? "common"] ?? 150, left: Math.max(0, DEALER_STOCK - (bought.get(id) ?? 0)) }));
}
/** «Купить» in the scheme: the missing parts of a recipe for dollars (PART_USD by rarity) */
export async function partBuy(ctx: Ctx, itemId: string, want: number) {
  const def = craftById(itemId);
  if (!def || def.level !== 0) throw new GameError("bad_item", "Купить можно только детали");
  if (!Number.isInteger(want) || want < 1 || want > 100) throw new GameError("bad_qty", "Некорректное количество");
  const price = PART_USD[def.rarity] ?? PART_USD.common;
  await takeMoney(ctx, "USD", price * want, `part-buy:${def.id}`);
  const got = await addItem(ctx, def.id, want, "part-buy");
  return { itemId: def.id, qty: got, paid: price * want };
}

export async function dealerBuy(ctx: Ctx, itemId: string, want: number) {
  const offer = (await dealerView(ctx.q, ctx.pid, ctx.now)).find((o) => o.id === itemId);
  if (!offer) throw new GameError("not_sold", "Сегодня барыга этим не торгует");
  const qty = Math.max(1, Math.min(offer.left, Math.floor(want)));
  if (offer.left < 1) throw new GameError("sold_out", "На сегодня кончилось — завтра будет другое");
  await takeMoney(ctx, "RUB", offer.price * qty, `dealer:${itemId}`);
  const got = await addItem(ctx, itemId, qty, `dealer:${moscowDay(ctx.now)}`);
  return { itemId, qty: got, paid: offer.price * qty };
}

/** takes a level-1/2 thing apart: about 40% of each ingredient comes back (at random), the thing is gone */
export async function craftSplit(ctx: Ctx, itemId: string) {
  const def = craftById(itemId);
  if (!def?.recipe || def.level > 2) throw new GameError("bad_item", "Это не разбирается");
  await takeItem(ctx, def.id, 1, "craft-split");
  const back: { id: string; qty: number }[] = [];
  for (const r of def.recipe) {
    const n = Math.floor(r.qty * 0.4 + ctx.rng());
    if (n > 0) { await addItem(ctx, r.id, n, `craft-split:${def.id}`); back.push({ id: r.id, qty: n }); }
  }
  return { itemId: def.id, back };
}
