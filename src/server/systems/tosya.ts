/* «Тося» and his pies (content/tosya.ts): the visit, the player's tray, a pie bought. */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, takeMoney, type Ctx } from "../core.ts";
import type { Config } from "../config.ts";
import { rollPie, tosyaPies, tosyaPrice, tosyaValue, tosyaVisit } from "../../content/tosya.ts";

const bits = (n: number) => { let c = 0; for (let x = n; x; x &= x - 1) c++; return c; };

/** what the player sees: the visit (null — he is not here), his pies, the ones taken, the next price */
export async function tosyaView(q: Queryable, pid: number, cfg: Config, now: number) {
  const v = tosyaVisit(now, cfg.tosya);
  if (!v) return null;
  const pies = tosyaPies(pid, v.id);
  const [r] = await q.query<{ taken: number }>("SELECT taken FROM tosya_pies WHERE player_id=$1 AND visit=$2", [pid, v.id]);
  const taken = Number(r?.taken ?? 0);
  return { visit: v.id, endsAt: v.endsAt, pies, taken, next: bits(taken) < pies ? tosyaPrice(bits(taken), pies) : null };
}

/** a pie off the tray (slot 0…pies-1): paid in dollars, the next one twice as dear; its contents are granted */
export async function tosyaBuy(ctx: Ctx, slot: number) {
  const v = tosyaVisit(ctx.now, ctx.cfg.tosya);
  if (!v) throw new GameError("tosya_gone", "Тося уже уехал");
  const pies = tosyaPies(ctx.pid, v.id);
  if (!Number.isInteger(slot) || slot < 0 || slot >= pies) throw new GameError("bad_request", "Нет такого пирожка", 400);
  await ctx.q.query("INSERT INTO tosya_pies (player_id, visit) VALUES ($1,$2) ON CONFLICT DO NOTHING", [ctx.pid, v.id]);
  const [r] = await ctx.q.query<{ taken: number }>("SELECT taken FROM tosya_pies WHERE player_id=$1 AND visit=$2 FOR UPDATE", [ctx.pid, v.id]);
  const taken = Number(r?.taken ?? 0);
  if (taken & (1 << slot)) throw new GameError("tosya_taken", "Этот пирожок уже твой");
  const price = tosyaPrice(bits(taken), pies);
  if (price > 0) await takeMoney(ctx, "USD", price, `tosya:${v.id}:${slot}`);
  const reward = await grantReward(ctx, rollPie(ctx.rng, tosyaValue(price)), `tosya:${v.id}:${slot}`);
  await ctx.q.query("UPDATE tosya_pies SET taken = taken | $3 WHERE player_id=$1 AND visit=$2", [ctx.pid, v.id, 1 << slot]);
  return { slot, price, reward };
}
