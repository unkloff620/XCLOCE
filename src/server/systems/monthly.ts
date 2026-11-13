import type { Config } from "../config.ts";
import { GameError, type Queryable } from "../db.ts";
import { grantReward, moscowDay, nextMoscowMidnight, takeMoney, type Ctx, type Granted } from "../core.ts";
import {
  CASE_POINTS, MONTHLY_CHEST, MONTHLY_SKIP_PRICE, MONTHLY_TATTOO_SET, MONTHLY_TIERS, daysInMonth, monthKey, monthTaskOf, tierNeed,
  type MonthKind,
} from "../../content/monthly.ts";
import { between, rollParts } from "../../content/craft-drops.ts";
import { STASH_IDS } from "../../content/stashes.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import type { Reward } from "../../content/rewards.ts";
import { isAdminPlayer } from "./fortune.ts";

/*
 * «От звонка до звонка» (content/monthly.ts): today's task is the same for all; the actions feed it (game.ts → monthTick).
 * A day reaching its target is closed; a past day can be bought out for SOL; closed days open the month's rewards.
 * Everything belongs to its month: on the 1st (00:00 MSK) a new month starts empty.
 */

/** day number → "done" (closed by the task) or "bought" (bought out) */
type Closed = Record<string, "done" | "bought">;
interface Row { progress: Record<string, number>; closed: Closed; claimed: Record<string, Granted> }

/** the players see it once the admin turns it on; the admins always (to check it before) */
export async function monthlyOn(q: Queryable, pid: number, cfg: Config) {
  return cfg.monthly.on || (await isAdminPlayer(q, pid, cfg));
}

async function row(q: Queryable, pid: number, month: string, lock = false): Promise<Row> {
  const [r] = await q.query<Row>(`SELECT progress, closed, claimed FROM monthly_tasks WHERE player_id=$1 AND month=$2${lock ? " FOR UPDATE" : ""}`, [pid, month]);
  return r ?? { progress: {}, closed: {}, claimed: {} };
}
async function save(q: Queryable, pid: number, month: string, r: Row) {
  await q.query(
    `INSERT INTO monthly_tasks (player_id, month, progress, closed, claimed) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (player_id, month) DO UPDATE SET progress=EXCLUDED.progress, closed=EXCLUDED.closed, claimed=EXCLUDED.claimed`,
    [pid, month, JSON.stringify(r.progress), JSON.stringify(r.closed), JSON.stringify(r.claimed)],
  );
}

const SOCIAL: MonthKind[] = ["spit", "pump", "fight"];

/**
 * Adds to the task of the day the action happened (`at`, default now) when it counts it. `boss`/`mode`: a won fight.
 */
export async function monthTick(ctx: Ctx, kind: MonthKind, amount = 1, meta: { boss?: string; mode?: string; at?: number } = {}) {
  if (!(amount > 0)) return;
  const day = moscowDay(meta.at ?? ctx.now);
  const d = Number(day.slice(8, 10));
  const task = monthTaskOf(d);
  if (!task) return;
  const counts = task.kind === kind || (task.kind === "social" && SOCIAL.includes(kind));
  if (!counts) return;
  if (task.kind === "kill" && ((task.boss && task.boss !== meta.boss) || (task.mode && task.mode !== meta.mode))) return;
  if (!(await monthlyOn(ctx.q, ctx.pid, ctx.cfg))) return;
  const month = monthKey(day);
  const r = await row(ctx.q, ctx.pid, month, true);
  if (r.closed[d]) return;
  const now = Math.min(task.target, (r.progress[d] ?? 0) + amount);
  r.progress[d] = now;
  if (now >= task.target) r.closed[d] = "done";
  await save(ctx.q, ctx.pid, month, r);
}

export async function monthlyView(q: Queryable, pid: number, now: number, cfg: Config) {
  if (!(await monthlyOn(q, pid, cfg))) return null;
  const day = moscowDay(now);
  const month = monthKey(day);
  const days = daysInMonth(month);
  const today = Number(day.slice(8, 10));
  const r = await row(q, pid, month);
  const closedN = Object.keys(r.closed).length;
  const tiers = MONTHLY_TIERS.map((t) => {
    const need = tierNeed(t, days);
    const got = r.claimed[t.id] ?? null;
    return { id: t.id, need, ready: !got && closedN >= need, got };
  });
  return {
    month,
    /** the weekday of the 1st: 0 = Monday */
    firstDow: (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7,
    days,
    today,
    progress: r.progress[today] ?? 0,
    closed: r.closed,
    closedN,
    tiers,
    skipPrice: MONTHLY_SKIP_PRICE,
    resetAt: nextMoscowMidnight(now),
    /** something waits: a reward to take */
    claimable: tiers.some((t) => t.ready),
    /** today's task is still open */
    todayOpen: !r.closed[today],
  };
}

/** A past day not closed — bought out for SOL. */
export async function buyMonthDay(ctx: Ctx, d: number) {
  if (!(await monthlyOn(ctx.q, ctx.pid, ctx.cfg))) throw new GameError("monthly_off", "Делюги ещё не начались");
  const day = moscowDay(ctx.now);
  const today = Number(day.slice(8, 10));
  if (!Number.isInteger(d) || d < 1 || d > daysInMonth(monthKey(day))) throw new GameError("bad_day", "Такого дня нет");
  if (d >= today) throw new GameError("day_not_past", d === today ? "Сегодняшнюю делюгу надо сделать самому" : "Этот день ещё не наступил");
  const month = monthKey(day);
  const r = await row(ctx.q, ctx.pid, month, true);
  if (r.closed[d]) throw new GameError("day_closed", "Этот день уже закрыт");
  await takeMoney(ctx, "SOL", MONTHLY_SKIP_PRICE, `monthly-skip:${month}-${d}`);
  r.closed[d] = "bought";
  await save(ctx.q, ctx.pid, month, r);
  return { day: d, paid: MONTHLY_SKIP_PRICE };
}

/** the chest for every day: each line a random amount from its range */
async function rollChest(ctx: Ctx): Promise<Reward> {
  const c = MONTHLY_CHEST;
  const rnd = (x: readonly [number, number]) => between(x[0], x[1], ctx.rng);
  const items: { id: string; qty: number }[] = [{ id: "rug-pull-gun", qty: rnd(c.rugPull) }];
  items.push(...rollParts(ctx.rng, rnd(c.parts), { rare: 0.3, epic: 0.05 }));
  const stashes = new Map<string, number>();
  for (let i = rnd(c.stashes); i > 0; i--) {
    const id = STASH_IDS[Math.floor(ctx.rng() * STASH_IDS.length)];
    stashes.set(id, (stashes.get(id) ?? 0) + 1);
  }
  items.push(...[...stashes].map(([id, qty]) => ({ id, qty })));
  // one tattoo of the month's set the player does not have yet
  const set = MONTHLY_TATTOO_SET ? TATTOO_SETS.find((s) => s.id === MONTHLY_TATTOO_SET) : undefined;
  if (set) {
    const ids = set.pieces.map((x) => x.id);
    const have = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, ids])).map((x) => x.item_id));
    const left = ids.filter((id) => !have.has(id));
    if (left.length) items.push({ id: left[Math.floor(ctx.rng() * left.length)], qty: 1 });
  }
  return {
    currencies: { USD: rnd(c.USD), RUB: rnd(c.RUB), SOL: rnd(c.SOL) },
    xp: rnd(c.xp),
    achPoints: rnd(c.cases) * CASE_POINTS,
    items,
  };
}

/** A reward of the month once enough days are closed; the last one is the chest. */
export async function claimMonthTier(ctx: Ctx, id: string) {
  if (!(await monthlyOn(ctx.q, ctx.pid, ctx.cfg))) throw new GameError("monthly_off", "Делюги ещё не начались");
  const t = MONTHLY_TIERS.find((x) => x.id === id);
  if (!t) throw new GameError("bad_tier", "Такой награды нет");
  const day = moscowDay(ctx.now);
  const month = monthKey(day);
  const r = await row(ctx.q, ctx.pid, month, true);
  if (r.claimed[t.id]) throw new GameError("tier_taken", "Награда уже получена");
  const need = tierNeed(t, daysInMonth(month));
  if (Object.keys(r.closed).length < need) throw new GameError("tier_locked", `Закрой ${need} делюг`);
  const reward = await grantReward(ctx, t.chest ? await rollChest(ctx) : t.reward, `monthly:${month}:${t.id}`);
  r.claimed[t.id] = reward;
  await save(ctx.q, ctx.pid, month, r);
  return { id: t.id, reward, chest: !!t.chest };
}
