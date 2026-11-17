import { GameError, type Queryable } from "../db.ts";
import { moneyHooks, rewardHooks, takeMoney, weekKey, weekStart, nextWeekAt, type Ctx } from "../core.ts";
import { OPEN_BOSSES } from "../../content/bosses.ts";
import {
  SHOD_BOOST, SHOD_BOOST_DAYS, SHOD_BOOST_WEAPONS, SHOD_FREE_SLOTS, SHOD_MAX_SLOTS, SHOD_PRIZES, SHOD_SETS, SHOD_SLOT_PRICES,
  SHOD_TASKS, SHOD_TATTOOS, SHOD_TATTOO_RUB, shodTaskById, type ShodTask, type ShodTaskKind,
} from "../../content/shodnyak.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import type { Reward } from "../../content/rewards.ts";

/*
 * «Сходняк» (content/shodnyak.ts): the player takes tasks for the week, their points go to their clan; on Monday the
 * clans are ranked by the points of the week before and the top 10 get prizes (rating.ts settleWeeks calls settleShod).
 */

const WEEK_MS = 7 * 24 * 3600_000;

const tasksFor = (bossOpen?: Record<string, boolean>): ShodTask[] => {
  const open = new Set(OPEN_BOSSES(bossOpen).map((b) => b.id));
  return SHOD_TASKS.filter((t) => t.kind !== "kill" || open.has(t.boss!));
};

async function clanOf(q: Queryable, pid: number) {
  const [r] = await q.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [pid]);
  return r?.clan_id ? Number(r.clan_id) : null;
}

/** the page: the list, my tasks and slots, the clans' table of this week, my boost */
export async function shodView(q: Queryable, pid: number, now: number, bossOpen?: Record<string, boolean>) {
  const week = weekKey(now);
  const clan = await clanOf(q, pid);
  const mine = await q.query<{ task_id: string; progress: number; done_at: Date | null }>(
    "SELECT task_id, progress, done_at FROM shod_tasks WHERE week=$1 AND player_id=$2 ORDER BY taken_at, task_id",
    [week, pid],
  );
  const [s] = await q.query<{ bought: number }>("SELECT bought FROM shod_slots WHERE week=$1 AND player_id=$2", [week, pid]);
  const table = await q.query<{ clan_id: number; name: string; tag: string; emblem: string; color: string; points: number }>(
    `SELECT t.clan_id, c.name, c.tag, c.emblem, c.color, SUM(t.points)::int AS points
     FROM shod_tasks t JOIN clans c ON c.id = t.clan_id
     WHERE t.week=$1 AND t.done_at IS NOT NULL GROUP BY t.clan_id, c.name, c.tag, c.emblem, c.color
     ORDER BY SUM(t.points) DESC, t.clan_id LIMIT 10`,
    [week],
  );
  const [my] = clan
    ? await q.query<{ points: number }>("SELECT COALESCE(SUM(points),0)::int AS points FROM shod_tasks WHERE week=$1 AND clan_id=$2 AND done_at IS NOT NULL", [week, clan])
    : [];
  // my clan's place among all the clans with points (it can be below the top 10)
  const [above] = clan && Number(my?.points ?? 0) > 0
    ? await q.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM (SELECT clan_id, SUM(points) AS p FROM shod_tasks WHERE week=$1 AND done_at IS NOT NULL GROUP BY clan_id) x
       WHERE x.p > $2 OR (x.p = $2 AND x.clan_id < $3)`, [week, Number(my!.points), clan])
    : [];
  const [me] = clan ? await q.query<{ name: string; tag: string; emblem: string; color: string }>("SELECT name, tag, emblem, color FROM clans WHERE id=$1", [clan]) : [];
  const [b] = await q.query<{ weapon: string | null; until: Date | null }>("SELECT weapon, until FROM shod_boost WHERE player_id=$1", [pid]);
  const boost = b && (b.weapon === null || (b.until && new Date(b.until).getTime() > now))
    ? { weapon: b.weapon, until: b.until ? new Date(b.until).getTime() : null }
    : null;
  return {
    week,
    endsAt: nextWeekAt(now),
    tasks: tasksFor(bossOpen),
    mine: mine.map((m) => ({ id: m.task_id, progress: Number(m.progress), done: !!m.done_at })),
    slots: SHOD_FREE_SLOTS + Number(s?.bought ?? 0),
    maxSlots: SHOD_MAX_SLOTS,
    slotPrices: SHOD_SLOT_PRICES,
    clan: clan ? { id: clan, points: Number(my?.points ?? 0), place: above ? Number(above.n) + 1 : null, name: me?.name ?? "", tag: me?.tag ?? "", emblem: me?.emblem ?? "", color: me?.color ?? "" } : null,
    table: table.map((t) => ({ ...t, clan_id: Number(t.clan_id), points: Number(t.points) })),
    prizes: SHOD_PRIZES,
    tattoos: SHOD_TATTOOS,
    boost,
    boostWeapons: SHOD_BOOST_WEAPONS,
    boostPct: Math.round(SHOD_BOOST * 100),
  };
}

/** take a task of the list into a free slot (for the whole week — it can't be dropped) */
export async function shodTake(ctx: Ctx, id: string) {
  const t = tasksFor(ctx.cfg.bossOpen).find((x) => x.id === id);
  if (!t) throw new GameError("bad_request", "Нет такого задания", 400);
  const clan = await clanOf(ctx.q, ctx.pid);
  if (!clan) throw new GameError("no_clan", "Сходняк — только для бойцов клана");
  const week = weekKey(ctx.now);
  const [s] = await ctx.q.query<{ bought: number }>("SELECT bought FROM shod_slots WHERE week=$1 AND player_id=$2", [week, ctx.pid]);
  const [n] = await ctx.q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM shod_tasks WHERE week=$1 AND player_id=$2", [week, ctx.pid]);
  if (Number(n.n) >= SHOD_FREE_SLOTS + Number(s?.bought ?? 0)) throw new GameError("shod_full", "Все ячейки заняты — новые задания в понедельник");
  const r = await ctx.q.query(
    "INSERT INTO shod_tasks (week, player_id, task_id, clan_id, points, goal, taken_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING task_id",
    [week, ctx.pid, t.id, clan, t.points, t.goal, new Date(ctx.now)],
  );
  if (!r.length) throw new GameError("shod_taken", "Это задание уже взято");
  return shodView(ctx.q, ctx.pid, ctx.now, ctx.cfg.bossOpen);
}

/** buy the next slot for this week (4th — 4 SOL, 5th — 5, 6th — 6) */
export async function shodSlot(ctx: Ctx) {
  const week = weekKey(ctx.now);
  const [s] = await ctx.q.query<{ bought: number }>("SELECT bought FROM shod_slots WHERE week=$1 AND player_id=$2", [week, ctx.pid]);
  const bought = Number(s?.bought ?? 0);
  if (bought >= SHOD_SLOT_PRICES.length) throw new GameError("shod_slots_max", "Больше ячеек не бывает");
  await takeMoney(ctx, "SOL", SHOD_SLOT_PRICES[bought], `shod_slot:${bought + 1}`);
  await ctx.q.query(
    "INSERT INTO shod_slots (week, player_id, bought) VALUES ($1,$2,1) ON CONFLICT (week, player_id) DO UPDATE SET bought = shod_slots.bought + 1",
    [week, ctx.pid],
  );
  return shodView(ctx.q, ctx.pid, ctx.now, ctx.cfg.bossOpen);
}

/** the 1st place's prize: pick the weapon of the boost — it runs for a week from now */
export async function shodBoost(ctx: Ctx, weapon: string) {
  if (!(SHOD_BOOST_WEAPONS as readonly string[]).includes(weapon)) throw new GameError("bad_request", "Нет такого усиления", 400);
  const r = await ctx.q.query(
    "UPDATE shod_boost SET weapon=$2, until=$3 WHERE player_id=$1 AND weapon IS NULL RETURNING player_id",
    [ctx.pid, weapon, new Date(ctx.now + SHOD_BOOST_DAYS * 24 * 3600_000)],
  );
  if (!r.length) throw new GameError("shod_no_boost", "Усиление уже выбрано");
  return shodView(ctx.q, ctx.pid, ctx.now, ctx.cfg.bossOpen);
}

/** the damage multiplier of the boost for this weapon (1 when there is none) */
export async function shodBoostMult(q: Queryable, pid: number, weapon: string, now: number) {
  const [b] = await q.query<{ weapon: string | null; until: Date | null }>("SELECT weapon, until FROM shod_boost WHERE player_id=$1", [pid]);
  return b?.weapon === weapon && b.until && new Date(b.until).getTime() > now ? 1 + SHOD_BOOST : 1;
}

/** progress of my taken tasks: damage dealt to bosses, a boss beaten (in a mode), authority got, roubles earned, a location passed */
export async function shodTick(ctx: Ctx, kind: ShodTaskKind, amount: number, meta: { boss?: string; mode?: string } = {}) {
  if (!(amount > 0)) return;
  const week = weekKey(ctx.now);
  const ids = SHOD_TASKS.filter((t) => t.kind === kind && (kind !== "kill" || (t.boss === meta.boss && (!t.mode || t.mode === meta.mode)))).map((t) => t.id);
  if (!ids.length) return;
  await ctx.q.query(
    `UPDATE shod_tasks SET progress = LEAST(goal, progress + $4::bigint), done_at = CASE WHEN progress + $4::bigint >= goal THEN $5::timestamptz ELSE NULL END
     WHERE week=$1 AND player_id=$2 AND task_id = ANY($3) AND done_at IS NULL`,
    [week, ctx.pid, ids, amount, new Date(ctx.now)],
  );
}

/** Monday: the clans of the week before by points; the top 10's members get the prizes (rating.ts settleWeeks) */
export async function settleShod(q: Queryable, now: number) {
  const prev = weekKey(weekStart(now) - WEEK_MS);
  const clans = await q.query<{ clan_id: number; name: string }>(
    `SELECT t.clan_id, c.name FROM shod_tasks t JOIN clans c ON c.id = t.clan_id
     WHERE t.week=$1 AND t.done_at IS NOT NULL GROUP BY t.clan_id, c.name HAVING SUM(t.points) > 0
     ORDER BY SUM(t.points) DESC, t.clan_id LIMIT ${SHOD_PRIZES.length}`,
    [prev],
  );
  const sets = SHOD_SETS.map((id) => TATTOO_SETS.find((s) => s.id === id)!.pieces.map((p) => p.id));
  for (const [i, c] of clans.entries()) {
    const members = await q.query<{ id: number }>("SELECT id FROM players WHERE clan_id=$1", [c.clan_id]);
    for (const m of members) {
      const reward: Reward = { ...SHOD_PRIZES[i], currencies: { ...SHOD_PRIZES[i].currencies }, items: [] };
      const want = SHOD_TATTOOS[i] ?? 0;
      if (want) {
        const all = sets.flat();
        const own = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [m.id, all])).map((x) => x.item_id));
        // the set one has most pieces of comes first (to finish it), then the next; inside a set — a fair shuffle by
        // the player and the week (the same pick if this is ever run twice)
        const order = sets.map((s, k) => ({ k, n: s.filter((x) => own.has(x)).length })).sort((a, b) => b.n - a.n || a.k - b.k);
        const left = order.flatMap(({ k }) => sets[k].filter((x) => !own.has(x)).sort((a, b) => hash(`${prev}:${m.id}:${a}`) - hash(`${prev}:${m.id}:${b}`)));
        const got = left.slice(0, want);
        reward.items = got.map((id) => ({ id, qty: 1 }));
        const rub = (want - got.length) * SHOD_TATTOO_RUB;
        if (rub) reward.currencies!.RUB = (reward.currencies!.RUB ?? 0) + rub;
      }
      if (!reward.items?.length) delete reward.items;
      await q.query("INSERT INTO prizes (player_id, title, reward, created_at) VALUES ($1,$2,$3,$4)", [
        m.id, `Сходняк: клан «${c.name}» — ${i + 1} место недели`, JSON.stringify(reward), new Date(now),
      ]);
      if (i === 0) {
        await q.query(
          "INSERT INTO shod_boost (player_id, weapon, until, week) VALUES ($1,NULL,NULL,$2) ON CONFLICT (player_id) DO UPDATE SET weapon=NULL, until=NULL, week=EXCLUDED.week",
          [m.id, prev],
        );
      }
    }
  }
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export { shodTaskById };

// authority and roubles: every reward counts — but not a currency exchange (not «earning») and not the weekly prizes
// (the clans' own prizes would fill the next week's tasks)
const notEarned = (reason: string) => reason.startsWith("exchange") || reason.startsWith("prize:");
rewardHooks.push(async (ctx, got, reason) => {
  if (got.xp > 0 && !notEarned(reason)) await shodTick(ctx, "authority", got.xp);
});
// roubles: rewards, the business, things sold — every rouble coming in
moneyHooks.push(async (ctx, c, amount, reason) => {
  if (c === "RUB" && !notEarned(reason)) await shodTick(ctx, "rub", amount);
});
