import { GameError, type Queryable } from "../db.ts";
import { grantReward, itemQty, moscowDay, nextMoscowMidnight, takeMoney, type Ctx } from "../core.ts";
import { OBSHAK, OBSHAK_DAYS, OBSHAK_KEYS, obshakById, type ObshakLevel } from "../../content/obshak.ts";
import type { Reward } from "../../content/rewards.ts";

/*
 * «Общак» (content/obshak.ts): one row a player — the level, till when, the Moscow day last collected and what is left
 * of that day's damage. A day's damage counts only on its own day (an older `day` reads as nothing left).
 */
interface Row { level: string; until: Date; day: string | null; pool: number }
const DAY_MS = 24 * 3_600_000;

async function rowOf(q: Queryable, pid: number, lock = false): Promise<Row | null> {
  const [r] = await q.query<Row>(`SELECT level, until, day, pool FROM obshak WHERE player_id=$1${lock ? " FOR UPDATE" : ""}`, [pid]);
  return r ? { ...r, pool: Number(r.pool) } : null;
}

export interface ObshakView {
  /** the active level (null: none or run out) */
  level: ObshakLevel | null;
  until: number | null;
  /** today's collecting is still to do */
  ready: boolean;
  /** today's damage left */
  pool: number;
  /** the next collecting (the next Moscow midnight) */
  nextAt: number;
}

export async function obshakView(q: Queryable, pid: number, now: number): Promise<ObshakView> {
  const r = await rowOf(q, pid);
  const active = !!r && new Date(r.until).getTime() > now && !!obshakById(r.level);
  const today = moscowDay(now);
  return {
    level: active ? (r!.level as ObshakLevel) : null,
    until: active ? new Date(r!.until).getTime() : null,
    ready: active && r!.day !== today,
    pool: active && r!.day === today ? r!.pool : 0,
    nextAt: nextMoscowMidnight(now),
  };
}

/** buy a level: another one (or none active) starts 30 days now and is collected at once; the same one adds 30 days */
export async function obshakBuy(ctx: Ctx, levelId: string) {
  const def = obshakById(levelId);
  if (!def) throw new GameError("bad_level", "Нет такого общака");
  const r = await rowOf(ctx.q, ctx.pid, true);
  const active = !!r && new Date(r.until).getTime() > ctx.now;
  await takeMoney(ctx, "GOLD", def.price, `obshak:${def.id}`);
  if (active && r!.level === def.id) {
    await ctx.q.query("UPDATE obshak SET until = until + make_interval(days => $2) WHERE player_id=$1", [ctx.pid, OBSHAK_DAYS]);
  } else {
    // a new level: the timer starts over, today's collecting opens at the new level (today's old stock is replaced then)
    await ctx.q.query(
      `INSERT INTO obshak (player_id, level, until, day, pool) VALUES ($1,$2,$3,NULL,0)
       ON CONFLICT (player_id) DO UPDATE SET level=EXCLUDED.level, until=EXCLUDED.until, day=NULL, pool=0`,
      [ctx.pid, def.id, new Date(ctx.now + OBSHAK_DAYS * DAY_MS)],
    );
  }
  return { bought: def.id, ...(await obshakView(ctx.q, ctx.pid, ctx.now)) };
}

/** today's collecting: the day's damage stock and the level's bonuses (once a Moscow day) */
export async function obshakClaim(ctx: Ctx) {
  const r = await rowOf(ctx.q, ctx.pid, true);
  const def = r ? obshakById(r.level) : undefined;
  if (!r || !def || new Date(r.until).getTime() <= ctx.now) throw new GameError("no_obshak", "Общак не оплачен");
  const today = moscowDay(ctx.now);
  if (r.day === today) throw new GameError("obshak_taken", "Сегодня уже забрано — следующий сбор в 00:00 МСК");
  const items = [...(def.bonus.items ?? [])];
  let keys = false;
  if (def.keysChance && ctx.rng() < def.keysChance && (await itemQty(ctx.q, ctx.pid, OBSHAK_KEYS)) < 1) {
    items.push({ id: OBSHAK_KEYS, qty: 1 });
    keys = true;
  }
  const reward: Reward = { ...def.bonus, items };
  await ctx.q.query("UPDATE obshak SET day=$2, pool=$3 WHERE player_id=$1", [ctx.pid, today, def.damage]);
  const got = await grantReward(ctx, reward, `obshak:${def.id}`);
  return { claimed: def.id, reward: got, damage: def.damage, keys, ...(await obshakView(ctx.q, ctx.pid, ctx.now)) };
}

/** take up to `want` of today's damage stock (the fight's needle hit); returns what was taken */
export async function obshakSpend(ctx: Ctx, want: number): Promise<{ taken: number; left: number }> {
  const r = await rowOf(ctx.q, ctx.pid, true);
  if (!r || new Date(r.until).getTime() <= ctx.now || r.day !== moscowDay(ctx.now) || r.pool <= 0) {
    throw new GameError("no_needle", "В общаке нет урона на сегодня");
  }
  const taken = Math.max(0, Math.min(r.pool, Math.floor(want)));
  if (taken < 1) throw new GameError("no_needle", "Босс уже повержен");
  await ctx.q.query("UPDATE obshak SET pool = pool - $2 WHERE player_id=$1", [ctx.pid, taken]);
  return { taken, left: r.pool - taken };
}

export { OBSHAK };
