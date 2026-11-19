/* «Барыга на газели» (content/van.ts): the weekend van in the yard — «Меняла» and «Акции». */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, takeMoney, type Ctx } from "../core.ts";
import type { Config } from "../config.ts";
import { countersOf, setTo } from "./counters.ts";
import { isAdminPlayer } from "./fortune.ts";
import { VAN_GIVES, VAN_PACKS, rollVanPack, vanDeal, vanPackById, vanVisit, vanWindow, type VanGive } from "../../content/van.ts";

/** the van is in the yard for this player: Friday–Sunday (Moscow); the admins see it any day (to try it) */
async function vanOpen(q: Queryable, pid: number, cfg: Config, now: number) {
  return vanWindow(now).open || (await isAdminPlayer(q, pid, cfg));
}

export async function vanView(q: Queryable, pid: number, cfg: Config, now: number) {
  const w = vanWindow(now);
  const open = await vanOpen(q, pid, cfg, now);
  const visit = vanVisit(now);
  const c = await countersOf(q, pid);
  const deal = vanDeal(now);
  return {
    open, until: w.until, visit,
    takes: deal.takes, rates: deal.rates,
    // the packs of this visit already taken (each once a visit)
    taken: VAN_PACKS.filter((p) => (c[`van:${visit}:${p.id}`] ?? 0) > 0).map((p) => p.id),
  };
}

async function mustBeOpen(ctx: Ctx) {
  if (!(await vanOpen(ctx.q, ctx.pid, ctx.cfg, ctx.now))) throw new GameError("van_gone", "Барыга приезжает по пятницам — до конца воскресенья");
}

/** «Меняла»: `qty` roubles or tokens for the week's currency at the visit's rate */
export async function vanExchange(ctx: Ctx, give: VanGive, qty: number) {
  await mustBeOpen(ctx);
  if (!(VAN_GIVES as readonly string[]).includes(give)) throw new GameError("bad_request", "Это барыга не меняет", 400);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) throw new GameError("bad_qty", "Неверное количество");
  const { takes, rates } = vanDeal(ctx.now);
  const cost = rates[give] * qty;
  await takeMoney(ctx, takes, cost, `van:${give}:${qty}`);
  const reward = await grantReward(ctx, { currencies: { [give]: qty } }, "van_exchange");
  return { give, qty, takes, paid: cost, reward, van: await vanView(ctx.q, ctx.pid, ctx.cfg, ctx.now) };
}

/** «Акции»: a pack, each once a visit (the free one too) */
export async function vanPack(ctx: Ctx, id: string) {
  await mustBeOpen(ctx);
  const p = vanPackById(id);
  if (!p) throw new GameError("bad_request", "Нет такой акции", 400);
  const key = `van:${vanVisit(ctx.now)}:${p.id}`;
  if (((await countersOf(ctx.q, ctx.pid))[key] ?? 0) > 0) throw new GameError("van_taken", "Эту акцию ты уже взял — барыга вернётся в следующую пятницу");
  if (p.price) await takeMoney(ctx, p.price.currency, p.price.amount, `van_pack:${p.id}`);
  await setTo(ctx.q, ctx.pid, key, 1);
  const reward = await grantReward(ctx, rollVanPack(p, ctx.rng), `van_pack:${p.id}`);
  return { id: p.id, reward, van: await vanView(ctx.q, ctx.pid, ctx.cfg, ctx.now) };
}
