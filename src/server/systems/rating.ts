import { GameError, type Queryable } from "../db.ts";
import { grantReward, nextWeekAt, weekKey, weekStart, type Ctx } from "../core.ts";
import { CLAN_PRIZES, WEEKLY_PRIZES, frameOf, type Frame } from "../../content/achievements.ts";
import { levelFromXp } from "../../content/levels.ts";
import type { Config } from "../config.ts";

/*
 * Ratings: damage this week (Moscow week from Monday 00:00), authority (all time) and clans (members' damage this week).
 * When a week is over, the first request after it settles it once: places 1–10 are written down (→ frames on the
 * player card for the next week) and prizes are put aside for the winners and for the members of the top-10 clans.
 * Prizes are collected by the players themselves (prizes table), so nobody else's rows are touched here.
 */

const WEEK_MS = 7 * 24 * 3600_000;

/** After a hit: this week's damage of the player. */
export async function addWeeklyDamage(ctx: Ctx, damage: number) {
  if (!(damage > 0)) return;
  await ctx.q.query(
    `INSERT INTO weekly_stats (week, player_id, damage, hits) VALUES ($1,$2,$3,1)
     ON CONFLICT (week, player_id) DO UPDATE SET damage = weekly_stats.damage + EXCLUDED.damage, hits = weekly_stats.hits + 1`,
    [weekKey(ctx.now), ctx.pid, damage],
  );
}

/** Closes the previous week once (whoever comes first after Monday 00:00 MSK does it). */
export async function settleWeeks(q: Queryable, now: number) {
  const prev = weekKey(weekStart(now) - WEEK_MS);
  const [done] = await q.query("SELECT 1 FROM weeks_settled WHERE week=$1", [prev]);
  if (done) return;
  const claimed = await q.query("INSERT INTO weeks_settled (week, at) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING week", [prev, new Date(now)]);
  if (!claimed.length) return;
  const top = await q.query<{ player_id: number; damage: number }>(
    "SELECT player_id, damage FROM weekly_stats WHERE week=$1 AND damage > 0 ORDER BY damage DESC, player_id LIMIT 10",
    [prev],
  );
  for (const [i, t] of top.entries()) {
    await q.query("INSERT INTO week_results (week, player_id, place, damage) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [prev, t.player_id, i + 1, t.damage]);
    await q.query("INSERT INTO prizes (player_id, title, reward, created_at) VALUES ($1,$2,$3,$4)", [
      t.player_id, `${i + 1} место недели по урону`, JSON.stringify(WEEKLY_PRIZES[i]), new Date(now),
    ]);
  }
  const clans = await q.query<{ clan_id: number; name: string }>(
    `SELECT p.clan_id, c.name FROM weekly_stats w JOIN players p ON p.id = w.player_id JOIN clans c ON c.id = p.clan_id
     WHERE w.week=$1 GROUP BY p.clan_id, c.name HAVING SUM(w.damage) > 0 ORDER BY SUM(w.damage) DESC, p.clan_id LIMIT ${CLAN_PRIZES.length}`,
    [prev],
  );
  for (const [i, c] of clans.entries()) {
    await q.query(
      "INSERT INTO prizes (player_id, title, reward, created_at) SELECT id, $2, $3, $4 FROM players WHERE clan_id=$1",
      [c.clan_id, `Клан «${c.name}» — ${i + 1} место недели`, JSON.stringify(CLAN_PRIZES[i]), new Date(now)],
    );
  }
}

/** Frames for last week's places of these players. */
export async function framesFor(q: Queryable, ids: number[], now: number): Promise<Map<number, Frame>> {
  if (!ids.length) return new Map();
  const rows = await q.query<{ player_id: number; place: number }>(
    "SELECT player_id, place FROM week_results WHERE week=$1 AND player_id = ANY($2)",
    [weekKey(weekStart(now) - WEEK_MS), ids],
  );
  const out = new Map<number, Frame>();
  for (const r of rows) {
    const f = frameOf(r.place);
    if (f) out.set(r.player_id, f);
  }
  return out;
}

interface Row { id: number; display_name: string; photo_url: string | null; xp: number; value: number }

export async function ratingView(q: Queryable, pid: number, cfg: Config, now: number) {
  await settleWeeks(q, now);
  const week = weekKey(now);
  const dmg = await q.query<Row>(
    `SELECT p.id, p.display_name, p.photo_url, p.xp, w.damage AS value FROM weekly_stats w JOIN players p ON p.id = w.player_id
     WHERE w.week=$1 AND w.damage > 0 ORDER BY w.damage DESC, p.id LIMIT 50`,
    [week],
  );
  const auth = await q.query<Row>("SELECT id, display_name, photo_url, xp, xp AS value FROM players WHERE xp > 0 ORDER BY xp DESC, id LIMIT 50");
  const clans = await q.query<{ id: number; name: string; tag: string; emblem: string; color: string; value: number; members: number }>(
    `SELECT c.id, c.name, c.tag, c.emblem, c.color, COALESCE(SUM(w.damage), 0)::bigint AS value, COUNT(DISTINCT p.id)::int AS members
     FROM clans c JOIN players p ON p.clan_id = c.id LEFT JOIN weekly_stats w ON w.player_id = p.id AND w.week=$1
     GROUP BY c.id ORDER BY value DESC, c.id LIMIT 30`,
    [week],
  );
  // my own place even outside the top 50
  const [myDmg] = await q.query<{ value: number; place: number }>(
    `SELECT w.damage AS value, (SELECT COUNT(*)::int FROM weekly_stats o WHERE o.week=$1 AND o.damage > w.damage) + 1 AS place
     FROM weekly_stats w WHERE w.week=$1 AND w.player_id=$2 AND w.damage > 0`,
    [week, pid],
  );
  const [myAuth] = await q.query<{ value: number; place: number }>(
    "SELECT p.xp AS value, (SELECT COUNT(*)::int FROM players o WHERE o.xp > p.xp) + 1 AS place FROM players p WHERE p.id=$1",
    [pid],
  );
  const frames = await framesFor(q, [...new Set([...dmg, ...auth].map((r) => r.id))], now);
  const row = (r: Row) => ({ id: r.id, name: r.display_name, photo: r.photo_url, level: levelFromXp(Number(r.xp), cfg.levels).level, value: Number(r.value), frame: frames.get(r.id) ?? null });
  const lastWinners = await q.query<{ player_id: number; place: number; damage: number; display_name: string }>(
    `SELECT r.player_id, r.place, r.damage, p.display_name FROM week_results r JOIN players p ON p.id = r.player_id
     WHERE r.week=$1 AND r.place <= 3 ORDER BY r.place`,
    [weekKey(weekStart(now) - WEEK_MS)],
  );
  return {
    week: { start: weekStart(now), end: nextWeekAt(now) },
    prizes: { players: WEEKLY_PRIZES, clans: CLAN_PRIZES },
    damage: dmg.map(row),
    authority: auth.map(row),
    clans: clans.map((c) => ({ ...c, value: Number(c.value) })),
    me: {
      damage: myDmg ? { value: Number(myDmg.value), place: myDmg.place } : null,
      authority: myAuth ? { value: Number(myAuth.value), place: myAuth.place } : null,
    },
    lastWinners: lastWinners.map((w) => ({ id: w.player_id, place: w.place, damage: Number(w.damage), name: w.display_name })),
  };
}

/* ---------------- prizes ---------------- */

export async function prizesView(q: Queryable, pid: number) {
  const rows = await q.query<{ id: number; title: string; reward: unknown }>(
    "SELECT id, title, reward FROM prizes WHERE player_id=$1 AND claimed_at IS NULL ORDER BY id LIMIT 10",
    [pid],
  );
  return rows;
}

export async function claimPrize(ctx: Ctx, id: number) {
  const [p] = await ctx.q.query<{ title: string; reward: Parameters<typeof grantReward>[1] }>(
    "UPDATE prizes SET claimed_at=$3 WHERE id=$1 AND player_id=$2 AND claimed_at IS NULL RETURNING title, reward",
    [id, ctx.pid, new Date(ctx.now)],
  );
  if (!p) throw new GameError("prize_taken", "Награда уже получена");
  return { title: p.title, reward: await grantReward(ctx, p.reward, `prize:${id}`) };
}
