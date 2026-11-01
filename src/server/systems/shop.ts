import { GameError, type Queryable } from "../db.ts";
import { addEnergy, addItem, addMoney, idempotent, itemQty, moscowDay, takeItem, takeMoney, type Ctx } from "../core.ts";
import { TALK_BONUS, TALK_BONUS_MS, talkChance, talkOfDay, talkScore } from "../../content/dealer-talk.ts";
import { OFFERS, bulkOf, bulkPrice, offerById } from "../../content/shop.ts";
import { CURRENCY_DEFS, exchangeScheduleText, exchangeWindow, floorTo, type Currency } from "../../content/currencies.ts";
import { itemById, WEARABLE_SLOTS, type Slot } from "../../content/items.ts";
import { unlockBossOf } from "../../content/bosses.ts";
import type { Config } from "../config.ts";

export function shopView(cfg: Config) {
  return OFFERS.map((o) => ({ ...o, price: { currency: o.price.currency, amount: cfg.prices[o.id] ?? o.price.amount } }));
}

/** `batch`: how many at once (1, 10, 100, 1000) for offers sold in batches — bigger batches get a discount */
export async function buy(ctx: Ctx, offerId: string, idem?: string, batch = 1) {
  return idempotent(ctx, idem ? `buy:${idem}` : undefined, async () => {
    const o = offerById(offerId);
    if (!o) throw new GameError("bad_offer", "Такого товара нет");
    if (batch !== 1 && !(o.bulk && bulkOf(batch))) throw new GameError("bad_qty", "Некорректное количество");
    const unit = ctx.cfg.prices[o.id] ?? o.price.amount;
    const price = batch === 1 ? unit : bulkPrice(o.price.currency, unit, batch);
    const qty = o.give.qty * batch;
    if (o.give.item) {
      const def = itemById(o.give.item)!;
      const have = await itemQty(ctx.q, ctx.pid, def.id);
      if (have + qty > def.maxStack) {
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
    if (o.give.item) await addItem(ctx, o.give.item, qty, "shop");
    if (o.give.energy) await addEnergy(ctx, o.give.energy, `buy:${o.id}`);
    return { offerId: o.id, qty, paid: { currency: o.price.currency, amount: price } };
  });
}

/** Rate is taken on the server; the client only says from, to and how much. */
export function quote(cfg: Config, from: Currency, to: Currency, amount: number, bonus = 0) {
  const gross = (amount * cfg.exchange.rub[from]) / cfg.exchange.rub[to];
  return floorTo(to, gross * (1 - cfg.exchange.fee) * (1 + bonus));
}

/** the better rate the dealer gave after a good talk (0 when none or it's over) */
export async function dealerBonus(q: Queryable, pid: number, now: number) {
  const [r] = await q.query<{ dealer_bonus_until: Date | null }>("SELECT dealer_bonus_until FROM players WHERE id=$1", [pid]);
  const until = r?.dealer_bonus_until ? new Date(r.dealer_bonus_until).getTime() : 0;
  return until > now ? { bonus: TALK_BONUS, until } : { bonus: 0, until: null };
}

/** the talk with the dealer: once a Moscow day, while the exchange works; the answers decide the chance of a better rate */
export async function dealerTalk(ctx: Ctx, answers: number[]) {
  if (!exchangeWindow(ctx.now, ctx.cfg.exchange.schedule).open) throw new GameError("exchange_closed", "Обменник закрыт — поговорить о курсе можно, когда он работает");
  const day = moscowDay(ctx.now);
  const [p] = await ctx.q.query<{ dealer_talk_day: string | null }>("SELECT dealer_talk_day FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  if (p?.dealer_talk_day === day) throw new GameError("talked", "Сегодня уже поговорили — приходи завтра");
  const talk = talkOfDay(day, ctx.pid);
  if (answers.length !== talk.steps.length || answers.some((x) => !Number.isInteger(x) || x < 0 || x > 2)) throw new GameError("bad_answers", "Некорректные ответы");
  const score = talkScore(talk, answers);
  const won = ctx.rng() < talkChance(score);
  const until = won ? ctx.now + TALK_BONUS_MS : null;
  await ctx.q.query("UPDATE players SET dealer_talk_day=$2, dealer_bonus_until=COALESCE($3, dealer_bonus_until) WHERE id=$1", [ctx.pid, day, until ? new Date(until) : null]);
  return { talk: talk.id, score, bonus: won ? TALK_BONUS : 0, until };
}

export async function exchange(ctx: Ctx, from: Currency, to: Currency, amount: number, idem?: string) {
  return idempotent(ctx, idem ? `ex:${idem}` : undefined, async () => {
    if (from === to) throw new GameError("bad_exchange", "Выбери разные валюты");
    // an event: open one Moscow day out of three
    if (!exchangeWindow(ctx.now, ctx.cfg.exchange.schedule).open) throw new GameError("exchange_closed", `Обменник закрыт — он ${exchangeScheduleText(ctx.cfg.exchange.schedule)}`);
    const a = floorTo(from, amount);
    if (!(a > 0) || a !== Math.round(amount * 10 ** CURRENCY_DEFS[from].decimals) / 10 ** CURRENCY_DEFS[from].decimals) {
      throw new GameError("bad_amount", "Некорректная сумма");
    }
    const out = quote(ctx.cfg, from, to, a, (await dealerBonus(ctx.q, ctx.pid, ctx.now)).bonus);
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
