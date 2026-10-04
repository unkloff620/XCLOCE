import { GameError, type Queryable } from "../db.ts";
import { grantReward, type Ctx } from "../core.ts";
import { ACHIEVEMENTS, achievementById, type AchStat } from "../../content/achievements.ts";
import { levelFromXp } from "../../content/levels.ts";
import type { Config } from "../config.ts";

/** Everything the badges measure, read from what the game already stores. */
export async function statsFor(q: Queryable, pid: number, cfg: Config): Promise<Record<AchStat, number>> {
  const [r] = await q.query<Record<string, number | null>>(
    `SELECT
       (SELECT COALESCE(SUM(hits), 0) FROM boss_damage WHERE player_id=$1)::bigint AS hits,
       (SELECT COALESCE(total_damage, 0) FROM player_stats WHERE player_id=$1)::bigint AS damage,
       (SELECT COUNT(*) FROM fights WHERE player_id=$1 AND status='won')::int AS wins,
       (SELECT COUNT(*) FROM fights WHERE killer_id=$1 AND player_id=$1)::int AS kills,
       (SELECT COUNT(DISTINCT location_id) FROM location_claims WHERE player_id=$1)::int AS locations,
       (SELECT COALESCE(tasks_done, 0) FROM player_stats WHERE player_id=$1)::int AS tasks,
       (SELECT COALESCE(yard_found, 0) FROM player_stats WHERE player_id=$1)::int AS yard,
       (SELECT COALESCE(best_streak, 0) FROM daily_login WHERE player_id=$1)::int AS best_streak,
       (SELECT xp FROM players WHERE id=$1)::bigint AS xp,
       (SELECT CASE WHEN clan_id IS NULL THEN 0 ELSE 1 END FROM players WHERE id=$1)::int AS clan,
       (SELECT COUNT(*) FROM daily_quests WHERE player_id=$1 AND chest IS NOT NULL)::int AS chests,
       (SELECT COUNT(*) FROM week_results WHERE player_id=$1)::int AS weekly_top`,
    [pid],
  );
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    hits: n("hits"), damage: n("damage"), wins: n("wins"), kills: n("kills"), locations: n("locations"), tasks: n("tasks"),
    yard: n("yard"), bestStreak: n("best_streak"), level: levelFromXp(n("xp"), cfg.levels).level, clan: n("clan"),
    chests: n("chests"), weeklyTop: n("weekly_top"),
  };
}

export async function achievementsView(q: Queryable, pid: number, cfg: Config) {
  const stats = await statsFor(q, pid, cfg);
  const got = new Map(
    (await q.query<{ id: string; claimed_at: Date }>("SELECT id, claimed_at FROM achievements WHERE player_id=$1", [pid])).map((x) => [x.id, new Date(x.claimed_at).getTime()]),
  );
  return ACHIEVEMENTS.map((a) => {
    const progress = Math.min(a.target, stats[a.stat]);
    return { id: a.id, progress, target: a.target, done: progress >= a.target, claimed: got.has(a.id), at: got.get(a.id) ?? null };
  });
}

/** Number of badges reached but not collected yet (the dot on the profile button). */
export async function achievementsReady(q: Queryable, pid: number, cfg: Config): Promise<number> {
  return (await achievementsView(q, pid, cfg)).filter((a) => a.done && !a.claimed).length;
}

export async function claimAchievement(ctx: Ctx, id: string) {
  const def = achievementById(id);
  if (!def) throw new GameError("bad_achievement", "Такого достижения нет");
  const stats = await statsFor(ctx.q, ctx.pid, ctx.cfg);
  if (stats[def.stat] < def.target) throw new GameError("achievement_not_done", "Достижение ещё не получено");
  const ins = await ctx.q.query("INSERT INTO achievements (player_id, id, claimed_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id", [ctx.pid, id, new Date(ctx.now)]);
  if (!ins.length) throw new GameError("achievement_taken", "Награда за достижение уже получена");
  return { id, reward: await grantReward(ctx, def.reward, `ach:${id}`) };
}
