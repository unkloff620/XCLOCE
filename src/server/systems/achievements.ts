import { GameError, type Queryable } from "../db.ts";
import { grantReward, type Ctx } from "../core.ts";
import { ACHIEVEMENTS, achievementById, type AchStat } from "../../content/achievements.ts";
import type { Config } from "../config.ts";
import { bossById, bossOpen } from "../../content/bosses.ts";
import { slotLevel } from "../../content/slots.ts";
import { pokerLevel } from "../../content/games.ts";
import { countersOf } from "./counters.ts";
import { talentsForDamage } from "../../content/talents.ts";

/** per-boss badges count only while the boss is in the game */
const live = (cfg: Config) => ACHIEVEMENTS.filter((a) => !a.boss || (bossById(a.boss) && bossOpen(bossById(a.boss)!, cfg.bossOpen)));

/** Everything the badges measure, read from what the game already stores. */
export async function statsFor(q: Queryable, pid: number, _cfg?: Config): Promise<Record<AchStat, number>> {
  const [r] = await q.query<Record<string, number | null>>(
    `SELECT
       (SELECT COALESCE(SUM(hits), 0) FROM boss_damage WHERE player_id=$1)::bigint AS hits,
       (SELECT COALESCE(total_damage, 0) FROM player_stats WHERE player_id=$1)::bigint AS damage,
       (SELECT COUNT(*) FROM fights WHERE player_id=$1 AND status='won' AND my_damage > 0)::int AS wins,
       (SELECT COUNT(*) FROM fights WHERE player_id=$1 AND status='won' AND solo)::int AS solo_wins,
       (SELECT COUNT(*) FROM fights WHERE killer_id=$1 AND player_id=$1)::int AS kills,
       (SELECT COUNT(*) FROM location_claims WHERE player_id=$1)::int AS locations,
       (SELECT COALESCE(tasks_done, 0) FROM player_stats WHERE player_id=$1)::int AS tasks,
       (SELECT COALESCE(yard_found, 0) FROM player_stats WHERE player_id=$1)::int AS yard,
       (SELECT COALESCE(best_streak, 0) FROM daily_login WHERE player_id=$1)::int AS best_streak,
       (SELECT xp FROM players WHERE id=$1)::bigint AS xp,
       (SELECT COUNT(*) FROM daily_quests WHERE player_id=$1 AND chest IS NOT NULL)::int AS chests,
       (SELECT COUNT(*) FROM week_results WHERE player_id=$1)::int AS weekly_top`,
    [pid],
  );
  const n = (k: string) => Number(r?.[k] ?? 0);
  // solo wins over each boss ("solo:<boss id>")
  const solo = await q.query<{ boss_id: string; n: number }>(
    "SELECT boss_id, COUNT(*)::int AS n FROM fights WHERE player_id=$1 AND status='won' AND solo GROUP BY boss_id",
    [pid],
  );
  // wins over each boss where I dealt damage ("win:<boss id>")
  const wins = await q.query<{ boss_id: string; n: number }>(
    "SELECT boss_id, COUNT(*)::int AS n FROM fights WHERE player_id=$1 AND status='won' AND my_damage > 0 GROUP BY boss_id",
    [pid],
  );
  // sets of stashes collected ("stashsets:<n>")
  const sets = await q.query<{ set_n: number; count: number }>("SELECT set_n, count FROM stash_sets WHERE player_id=$1", [pid]);
  const stash = Object.fromEntries(sets.map((r) => [`stashsets:${r.set_n}`, Number(r.count)]));
  // boss medals of each kind ("medal:<boss id>:<tier>")
  const medals = await q.query<{ boss_id: string; tier: string; n: number }>("SELECT boss_id, tier, n FROM boss_medals WHERE player_id=$1", [pid]);
  // the second set: modes, money, mini games, clans, the social side (what is not stored elsewhere: player_counters)
  const [x] = await q.query<Record<string, number | null>>(
    `SELECT
       (SELECT COALESCE(MAX(my_damage), 0) FROM fights WHERE player_id=$1)::bigint AS best_fight,
       (SELECT COUNT(*) FROM fights WHERE player_id=$1 AND status='won' AND my_damage > 0 AND mode='blat')::int AS wins_blat,
       (SELECT COUNT(*) FROM fights WHERE player_id=$1 AND status='won' AND my_damage > 0 AND mode='avtor')::int AS wins_avtor,
       (SELECT COUNT(DISTINCT boss_id) FROM fights WHERE player_id=$1 AND status='won' AND my_damage > 0)::int AS bosses,
       (SELECT COALESCE(SUM(amount) FILTER (WHERE currency='RUB'), 0) FROM wallets WHERE player_id=$1)::bigint AS have_rub,
       (SELECT COALESCE(SUM(amount) FILTER (WHERE currency='USD'), 0) FROM wallets WHERE player_id=$1)::bigint AS have_usd,
       (SELECT COALESCE(SUM(amount) FILTER (WHERE currency='SOL'), 0) FROM wallets WHERE player_id=$1)::bigint AS have_sol,
       (SELECT COALESCE(SUM(amount) FILTER (WHERE currency='BTC'), 0) FROM wallets WHERE player_id=$1)::bigint AS have_btc,
       (SELECT COUNT(*) FROM slot_spins WHERE player_id=$1)::int AS slot_spins,
       (SELECT COUNT(*) FROM slot_spins WHERE player_id=$1 AND outcome='jackpot')::int AS slot_777,
       (SELECT COALESCE(slot_xp, 0) FROM players WHERE id=$1)::int AS slot_xp,
       (SELECT COALESCE(poker_xp, 0) FROM players WHERE id=$1)::int AS poker_xp,
       (SELECT COUNT(*) FROM games WHERE player_id=$1 AND kind='zonk' AND status='done')::int AS zonk_games,
       (SELECT COALESCE(MAX((result->>'points')::int), 0) FROM games WHERE player_id=$1 AND kind='zonk' AND status='done' AND result->>'outcome' IS DISTINCT FROM 'gave_up' AND result->>'points' ~ '^[0-9]+$')::int AS zonk_best,
       (SELECT COUNT(*) FROM duels WHERE winner_id=$1)::int AS zonk_duels,
       (SELECT COUNT(DISTINCT result->>'outcome') FROM games WHERE player_id=$1 AND kind='poker' AND status='done' AND result->>'outcome' IS NOT NULL AND result->>'outcome' <> 'high')::int AS poker_hands,
       (SELECT FLOOR(EXTRACT(EPOCH FROM (now() - joined_at)) / 86400) FROM clan_members WHERE player_id=$1)::int AS clan_days,
       (SELECT COUNT(*) FROM clan_boss_hits h JOIN clan_boss b ON b.clan_id = h.clan_id AND b.week = h.week WHERE h.player_id=$1 AND h.damage > 0 AND b.killed_at IS NOT NULL)::int AS clan_bosses,
       (SELECT COUNT(*) FROM social_log WHERE from_id=$1 AND kind='spit')::int AS spits,
       (SELECT COUNT(*) FROM social_log WHERE from_id=$1 AND kind='fight')::int AS raids,
       (SELECT COALESCE((SELECT n FROM player_biceps WHERE player_id=$1), 0))::int AS nishtyaks`,
    [pid],
  );
  const m = (k: string) => Math.max(0, Number(x?.[k] ?? 0));
  const c = await countersOf(q, pid);
  // the third set: things collected (the ledger keeps every gain), fast kills, locations by day and night, business,
  // poker hands, zonk combinations (counters), the talents the damage gave
  const got = await q.query<{ key: string; n: number }>(
    "SELECT key, SUM(delta)::bigint AS n FROM ledger WHERE player_id=$1 AND kind='item' AND delta > 0 AND key = ANY($2) GROUP BY key",
    [pid, ["rug-pull-gun", "gpu", "keyboard", "poker-chip", "sticker-hodl"]],
  );
  const fast = await q.query<{ boss_id: string; n: number }>(
    `SELECT boss_id, COUNT(*)::int AS n FROM fights WHERE player_id=$1 AND status='won' AND my_damage > 0 AND ended_at IS NOT NULL
       AND ended_at - started_at <= interval '1 hour' GROUP BY boss_id`,
    [pid],
  );
  const locs = await q.query<{ location_id: string; n: number }>("SELECT location_id, COUNT(*)::int AS n FROM location_claims WHERE player_id=$1 GROUP BY location_id", [pid]);
  const biz = await q.query<{ location_id: string }>("SELECT location_id FROM location_business WHERE player_id=$1 AND (since IS NOT NULL OR lv_rep > 0 OR lv_rub > 0)", [pid]);
  const hands = await q.query<{ hand: string; n: number }>(
    "SELECT result->>'outcome' AS hand, COUNT(*)::int AS n FROM games WHERE player_id=$1 AND kind='poker' AND status='done' AND result->>'outcome' IS NOT NULL GROUP BY 1",
    [pid],
  );
  const third: Record<string, number> = {
    ...Object.fromEntries(got.map((r) => [`got:${r.key}`, Number(r.n)])),
    ...Object.fromEntries(fast.map((r) => [`fast:${r.boss_id}`, Number(r.n)])),
    ...Object.fromEntries(locs.map((r) => [r.location_id.startsWith("night:") ? `locn:${r.location_id.slice(6)}` : `loc:${r.location_id}`, Number(r.n)])),
    ...Object.fromEntries(biz.map((r) => [`biz:${r.location_id}`, 1])),
    ...Object.fromEntries(hands.map((r) => [`poker:${r.hand}`, Number(r.n)])),
    ...Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith("zonk:")).map(([k, v]) => [k, v])),
    talents: talentsForDamage(Number(r?.damage ?? 0)),
    bjBestBet: c.bjBestBet ?? 0,
  };
  const second = {
    bestFight: m("best_fight"), winsBlat: m("wins_blat"), winsAvtor: m("wins_avtor"), bossesBeaten: m("bosses"),
    exchanges: c.exchanges ?? 0, spentRUB: c.spentRUB ?? 0, spentUSD: c.spentUSD ?? 0,
    haveRUB: m("have_rub"), haveUSD: m("have_usd"), haveSOL: m("have_sol"), haveBTC: m("have_btc"),
    slotSpins: m("slot_spins"), slot777: m("slot_777"), slotLevel: slotLevel(m("slot_xp")).level,
    upgWins: c.upgWins ?? 0, upgLowWins: c.upgLowWins ?? 0, upgStreak: c.upgStreak ?? 0,
    zonkGames: m("zonk_games"), zonkBest: m("zonk_best"), zonkDuels: m("zonk_duels"),
    pokerHands: m("poker_hands"), pokerLevel: pokerLevel(m("poker_xp")).level,
    bjBlackjacks: c.bjBlackjacks ?? 0, bjWins: c.bjWins ?? 0,
    clanDays: m("clan_days"), clanBosses: m("clan_bosses"), clanCreated: Math.min(1, c.clanCreated ?? 0),
    spits: m("spits"), raids: m("raids"), nishtyaks: m("nishtyaks"),
  };
  return {
    ...third,
    ...second,
    ...stash,
    ...Object.fromEntries(medals.map((m) => [`medal:${m.boss_id}:${m.tier}`, Number(m.n)])),
    ...Object.fromEntries(solo.map((x) => [`solo:${x.boss_id}`, Number(x.n)])),
    ...Object.fromEntries(wins.map((x) => [`win:${x.boss_id}`, Number(x.n)])),
    authority: n("xp"), hits: n("hits"), damage: n("damage"), wins: n("wins"), soloWins: n("solo_wins"), kills: n("kills"), locations: n("locations"), tasks: n("tasks"),
    yard: n("yard"), bestStreak: n("best_streak"), chests: n("chests"), weeklyTop: n("weekly_top"),
  };
}

export async function achievementsView(q: Queryable, pid: number, cfg: Config) {
  const stats = await statsFor(q, pid, cfg);
  const got = new Map(
    (await q.query<{ id: string; claimed_at: Date }>("SELECT id, claimed_at FROM achievements WHERE player_id=$1", [pid])).map((x) => [x.id, new Date(x.claimed_at).getTime()]),
  );
  return live(cfg).map((a) => {
    const progress = Math.min(a.target, stats[a.stat] ?? 0);
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
  if ((stats[def.stat] ?? 0) < def.target) throw new GameError("achievement_not_done", "Достижение ещё не получено");
  const ins = await ctx.q.query("INSERT INTO achievements (player_id, id, claimed_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id", [ctx.pid, id, new Date(ctx.now)]);
  if (!ins.length) throw new GameError("achievement_taken", "Награда за достижение уже получена");
  return { id, reward: await grantReward(ctx, def.reward, `ach:${id}`) };
}
