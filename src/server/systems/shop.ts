import { GameError, type Queryable } from "../db.ts";
import { addEnergy, addItem, addMoney, idempotent, itemQty, takeItem, takeMoney, type Ctx } from "../core.ts";
import { OFFERS, offerById } from "../../content/shop.ts";
import { CURRENCY_DEFS, floorTo, type Currency } from "../../content/currencies.ts";
import { itemById, WEARABLE_SLOTS, type Slot } from "../../content/items.ts";
import { unlockBossOf } from "../../content/bosses.ts";
import type { Config } from "../config.ts";

export function shopView(cfg: Config) {
  return OFFERS.map((o) => ({ ...o, price: { currency: o.price.currency, amount: cfg.prices[o.id] ?? o.price.amount } }));
}

export async function buy(ctx: Ctx, offerId: string, idem?: string) {
  return idempotent(ctx, idem ? `buy:${idem}` : undefined, async () => {
    const o = offerById(offerId);
    if (!o) throw new GameError("bad_offer", "Такого товара нет");
    const price = ctx.cfg.prices[o.id] ?? o.price.amount;
    if (o.give.item) {
      const def = itemById(o.give.item)!;
      const have = await itemQty(ctx.q, ctx.pid, def.id);
      if (have + o.give.qty > def.maxStack) {
        throw new GameError("stack_full", def.maxStack === 1 ? `${def.name} уже есть` : `${def.name}: максимум ${def.maxStack} шт.`);
      }
      // a thing from a boss: sold only after it dropped (opened) for this player
      const boss = unlockBossOf(def.id);
      if (boss) {
        const [u] = await ctx.q.query("SELECT 1 FROM player_unlocks WHERE player_id=$1 AND item_id=$2", [ctx.pid, def.id]);
        if (!u) throw new GameError("item_locked", `«${def.name}» сначала нужно выбить с босса ${boss.name}`);
      }
    }
    await takeMoney(ctx, o.price.currency, price, `buy:${o.id}`);
    if (o.give.item) await addItem(ctx, o.give.item, o.give.qty, "shop");
    if (o.give.energy) await addEnergy(ctx, o.give.energy, `buy:${o.id}`);
    return { offerId: o.id, paid: { currency: o.price.currency, amount: price } };
  });
}

/** Rate is taken on the server; the client only says from, to and how much. */
export function quote(cfg: Config, from: Currency, to: Currency, amount: number) {
  const gross = (amount * cfg.exchange.rub[from]) / cfg.exchange.rub[to];
  return floorTo(to, gross * (1 - cfg.exchange.fee));
}

export async function exchange(ctx: Ctx, from: Currency, to: Currency, amount: number, idem?: string) {
  return idempotent(ctx, idem ? `ex:${idem}` : undefined, async () => {
    if (from === to) throw new GameError("bad_exchange", "Выбери разные валюты");
    const a = floorTo(from, amount);
    if (!(a > 0) || a !== Math.round(amount * 10 ** CURRENCY_DEFS[from].decimals) / 10 ** CURRENCY_DEFS[from].decimals) {
      throw new GameError("bad_amount", "Некорректная сумма");
    }
    const out = quote(ctx.cfg, from, to, a);
    if (!(out > 0)) throw new GameError("too_small", "Слишком маленькая сумма для обмена");
    await takeMoney(ctx, from, a, `exchange:${to}`);
    await addMoney(ctx, to, out, `exchange:${from}`);
    return { from, to, paid: a, got: out };
  });
}

export async function useItem(ctx: Ctx, itemId: string) {
  const def = itemById(itemId);
  if (!def?.use) throw new GameError("not_usable", "Этот предмет нельзя использовать");
  await takeItem(ctx, def.id, 1, "use");
  let energy: number | null = null;
  if (def.use.energy) energy = await addEnergy(ctx, def.use.energy, `use:${def.id}`);
  return { itemId: def.id, energy };
}

export async function equip(ctx: Ctx, itemId: string) {
  const def = itemById(itemId);
  if (!def?.slot) throw new GameError("not_wearable", "Это нельзя надеть");
  if ((await itemQty(ctx.q, ctx.pid, def.id)) < 1) throw new GameError("no_item", "Сначала получи эту вещь");
  await ctx.q.query("UPDATE appearance SET equipped = jsonb_set(equipped, ARRAY[$2::text], to_jsonb($3::text)) WHERE player_id=$1", [ctx.pid, def.slot, def.id]);
  return { slot: def.slot, itemId: def.id };
}

export async function unequip(ctx: Ctx, slot: Slot) {
  if (!WEARABLE_SLOTS.includes(slot)) throw new GameError("bad_slot", "Неизвестный слот");
  await ctx.q.query("UPDATE appearance SET equipped = equipped - $2::text WHERE player_id=$1", [ctx.pid, slot]);
  return { slot };
}

export async function inventoryView(q: Queryable, pid: number) {
  const rows = await q.query<{ item_id: string; qty: number; source: string | null }>("SELECT item_id, qty, source FROM inventory WHERE player_id=$1 AND qty > 0 ORDER BY item_id", [pid]);
  return rows.filter((r) => itemById(r.item_id)).map((r) => ({ id: r.item_id, qty: r.qty }));
}
