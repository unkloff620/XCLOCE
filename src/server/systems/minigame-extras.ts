import type { Queryable } from "../db.ts";
import { grantReward, moscowDay, weekKey, weekStart, type Ctx } from "../core.ts";
import { bump, countersOf, setTo } from "./counters.ts";
import { GAME_BOARDS, GAME_WEEK_PRIZES, POKER_HANDS, ROACH_RULES, ZONK_DAY_PRIZE, type GameBoard } from "../../content/games.ts";

/*
 * Around the mini-games:
 *  - weekly ratings of the mini-games (game_weekly): poker xp, zonk xp and blackjack winnings of the Moscow week;
 *    the first request after Monday 00:00 settles the week once and puts the prizes of places 1–3 aside (prizes table);
 *  - the daily zonk record: the first request of a new Moscow day gives yesterday's best player ZONK_DAY_PRIZE;
 *  - the cockroach of the zonk room: a tap squashes it for a few roubles (cooldown and a daily cap).
 */

const DAY_MS = 24 * 3600_000;
const WEEK_MS = 7 * DAY_MS;

/** adds to this week's mini-game score of the player (blackjack can go below zero) */
export async function addGameWeekly(ctx: Ctx, board: GameBoard, delta: number) {
  if (!Number.isFinite(delta) || delta === 0) return;
  await ctx.q.query(
    `INSERT INTO game_weekly (week, player_id, ${board}) VALUES ($1,$2,$3)
     ON CONFLICT (week, player_id) DO UPDATE SET ${board} = game_weekly.${board} + EXCLUDED.${board}`,
    [weekKey(ctx.now), ctx.pid, Math.round(delta * 100) / 100],
  );
}

/** keeps the best of the week for a "best" board (the best zonk score, the best poker hand) */
export async function setGameBest(ctx: Ctx, col: "zonk_best" | "poker_best", value: number) {
  if (!Number.isFinite(value) || value <= 0) return;
  await ctx.q.query(
    `INSERT INTO game_weekly (week, player_id, ${col}) VALUES ($1,$2,$3)
     ON CONFLICT (week, player_id) DO UPDATE SET ${col} = GREATEST(game_weekly.${col}, EXCLUDED.${col})`,
    [weekKey(ctx.now), ctx.pid, Math.round(value)],
  );
}

/** Closes last week's mini-game ratings once: places 1–3 of each game get their prizes. */
export async function settleGameWeeks(q: Queryable, now: number) {
  const prev = weekKey(weekStart(now) - WEEK_MS);
  const [done] = await q.query("SELECT 1 FROM game_weeks_settled WHERE week=$1", [prev]);
  if (done) return;
  const claimed = await q.query("INSERT INTO game_weeks_settled (week, at) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING week", [prev, new Date(now)]);
  if (!claimed.length) return;
  for (const b of GAME_BOARDS) {
    const top = await q.query<{ player_id: number }>(
      `SELECT player_id FROM game_weekly WHERE week=$1 AND ${b.col} > 0 ORDER BY ${b.col} DESC, player_id LIMIT ${GAME_WEEK_PRIZES.length}`,
      [prev],
    );
    for (const [i, t] of top.entries()) {
      await q.query("INSERT INTO prizes (player_id, title, reward, created_at) VALUES ($1,$2,$3,$4)", [
        t.player_id, `${b.name}: ${i + 1} место недели`, JSON.stringify(GAME_WEEK_PRIZES[i]), new Date(now),
      ]);
    }
  }
}

/** Yesterday's best zonk game gets its prize once (whoever comes first on the new day settles it). */
export async function settleZonkDay(q: Queryable, now: number) {
  const day = moscowDay(now - DAY_MS);
  const [done] = await q.query("SELECT 1 FROM zonk_days WHERE day=$1", [day]);
  if (done) return;
  const [best] = await q.query<{ player_id: number; points: number }>(
    `SELECT player_id, (result->>'points')::int AS points FROM games
     WHERE kind='zonk' AND day=$1 AND status='done' AND result->>'points' IS NOT NULL AND (result->>'points')::int > 0 AND result->>'duel' IS NULL
     ORDER BY (result->>'points')::int DESC, updated_at ASC LIMIT 1`,
    [day],
  );
  const claimed = await q.query("INSERT INTO zonk_days (day, player_id, points, at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING day",
    [day, best?.player_id ?? null, best ? Number(best.points) : null, new Date(now)]);
  if (!claimed.length || !best) return;
  await q.query("INSERT INTO prizes (player_id, title, reward, created_at) VALUES ($1,$2,$3,$4)", [
    best.player_id, `Рекорд дня в зонке: ${Number(best.points)} очков`, JSON.stringify(ZONK_DAY_PRIZE), new Date(now),
  ]);
}

interface BoardRow { id: number; display_name: string; photo_url: string | null; value: number }
/** this week's top 50 of each mini-game, my own place, last week's medalists and the prizes */
export async function gameRatingView(q: Queryable, pid: number, now: number) {
  await settleGameWeeks(q, now);
  const week = weekKey(now);
  const prev = weekKey(weekStart(now) - WEEK_MS);
  const boards: Record<string, unknown> = {};
  for (const b of GAME_BOARDS) {
    const rows = await q.query<BoardRow>(
      `SELECT p.id, p.display_name, p.photo_url, g.${b.col} AS value FROM game_weekly g JOIN players p ON p.id = g.player_id
       WHERE g.week=$1 AND g.${b.col} > 0 ORDER BY g.${b.col} DESC, p.id LIMIT 50`,
      [week],
    );
    const [me] = await q.query<{ value: number; place: number }>(
      `SELECT g.${b.col} AS value, (SELECT COUNT(*)::int FROM game_weekly o WHERE o.week=$1 AND o.${b.col} > g.${b.col}) + 1 AS place
       FROM game_weekly g WHERE g.week=$1 AND g.player_id=$2 AND g.${b.col} > 0`,
      [week, pid],
    );
    const last = await q.query<{ id: number; display_name: string }>(
      `SELECT p.id, p.display_name FROM game_weekly g JOIN players p ON p.id = g.player_id
       WHERE g.week=$1 AND g.${b.col} > 0 ORDER BY g.${b.col} DESC, p.id LIMIT 3`,
      [prev],
    );
    boards[b.id] = {
      rows: rows.map((r) => ({ id: r.id, name: r.display_name, photo: r.photo_url, value: Number(r.value) })),
      me: me ? { value: Number(me.value), place: me.place } : null,
      last: last.map((r, i) => ({ id: r.id, name: r.display_name, place: i + 1 })),
    };
  }
  return { boards, prizes: GAME_WEEK_PRIZES };
}

/** A squashed cockroach in the zonk room: a few roubles, now and then a «Фишка»; at most once per cooldown, perDay a day. */
export async function squashRoach(ctx: Ctx) {
  const [p] = await ctx.q.query<{ roach_day: string | null; roach_n: number; roach_at: Date | null }>(
    "SELECT roach_day, roach_n, roach_at FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  const day = moscowDay(ctx.now);
  const n = p?.roach_day === day ? Number(p.roach_n) : 0;
  const at = p?.roach_at ? new Date(p.roach_at).getTime() : 0;
  // too soon or too many: the roach still dies, it just pays nothing
  if (n >= ROACH_RULES.perDay || ctx.now - at < ROACH_RULES.cooldownMs) return { reward: null, left: Math.max(0, ROACH_RULES.perDay - n) };
  await ctx.q.query("UPDATE players SET roach_day=$2, roach_n=$3, roach_at=$4 WHERE id=$1", [ctx.pid, day, n + 1, new Date(ctx.now)]);
  const chip = ctx.rng() < ROACH_RULES.chipChance;
  const reward = await grantReward(ctx, chip ? { ...ROACH_RULES.reward, items: [{ id: "poker-chip", qty: 1 }] } : ROACH_RULES.reward, "roach");
  return { reward, left: ROACH_RULES.perDay - n - 1 };
}


/* ---------------- the daily tops: blackjack by the day's winnings, poker by the day's best combination ---------------- */

/** adds the round's winnings (paid out minus staked, may be below zero) to today's blackjack score */
export async function addBjDaily(ctx: Ctx, delta: number) {
  if (!Number.isFinite(delta) || delta === 0) return;
  await ctx.q.query(
    `INSERT INTO game_daily (day, player_id, bj) VALUES ($1,$2,$3)
     ON CONFLICT (day, player_id) DO UPDATE SET bj = game_daily.bj + EXCLUDED.bj`,
    [moscowDay(ctx.now), ctx.pid, Math.round(delta * 100) / 100],
  );
}

/** poker combinations from the best (royal flush) down, as an SQL CASE over result->>'outcome' */
const POKER_RANK_SQL = `CASE g.result->>'outcome' ${POKER_HANDS.map((h, i) => `WHEN '${h.id}' THEN ${i}`).join(" ")} ELSE 99 END`;

export interface DayTopRow { id: number; name: string; photo: string | null; place: number; value: number; hand?: string }

/** The top 10 of a Moscow day (today or yesterday) and my own place: blackjack — the most won, poker — the best hand. */
export interface DayTopView { game: "bj" | "poker"; day: "today" | "yesterday"; top: DayTopRow[]; me: { place: number | null; value: number; hand?: string } | null }

export async function dayTop(q: Queryable, pid: number, game: "bj" | "poker", which: "today" | "yesterday", now: number): Promise<DayTopView> {
  const day = moscowDay(which === "today" ? now : now - DAY_MS);
  if (game === "bj") {
    const rows = await q.query<{ id: number; name: string; photo: string | null; value: number }>(
      `SELECT p.id, p.display_name AS name, p.photo_url AS photo, d.bj AS value FROM game_daily d JOIN players p ON p.id = d.player_id
       WHERE d.day=$1 AND d.bj > 0 AND p.banned_at IS NULL ORDER BY d.bj DESC, p.id LIMIT 10`, [day]);
    const [me] = await q.query<{ value: number; place: number }>(
      `SELECT d.bj AS value, (SELECT COUNT(*)::int FROM game_daily o WHERE o.day=$1 AND o.bj > d.bj) + 1 AS place
       FROM game_daily d WHERE d.day=$1 AND d.player_id=$2`, [day, pid]);
    return {
      game, day: which,
      top: rows.map((r, i) => ({ id: r.id, name: r.name, photo: r.photo, place: i + 1, value: Number(r.value) })),
      me: me ? { place: Number(me.value) > 0 ? Number(me.place) : null, value: Number(me.value) } : null,
    };
  }
  // poker: each player's best hand of the day; equal hands — whoever got it first
  const best = `SELECT DISTINCT ON (g.player_id) g.player_id, ${POKER_RANK_SQL} AS rank, g.result->>'outcome' AS hand, g.updated_at
     FROM games g WHERE g.kind='poker' AND g.day=$1 AND g.status='done' AND g.result->>'outcome' IS NOT NULL
     ORDER BY g.player_id, rank, g.updated_at`;
  const rows = await q.query<{ id: number; name: string; photo: string | null; rank: number; hand: string }>(
    `SELECT p.id, p.display_name AS name, p.photo_url AS photo, b.rank, b.hand FROM (${best}) b JOIN players p ON p.id = b.player_id
     WHERE p.banned_at IS NULL ORDER BY b.rank, b.updated_at, p.id LIMIT 10`, [day]);
  const [me] = await q.query<{ rank: number; hand: string; place: number }>(
    `WITH b AS (${best}) SELECT m.rank, m.hand, (SELECT COUNT(*)::int FROM b o WHERE o.rank < m.rank OR (o.rank = m.rank AND o.updated_at < m.updated_at)) + 1 AS place
     FROM b m WHERE m.player_id=$2`, [day, pid]);
  return {
    game, day: which,
    top: rows.map((r, i) => ({ id: r.id, name: r.name, photo: r.photo, place: i + 1, value: Number(r.rank), hand: r.hand })),
    me: me ? { place: Number(me.place), value: Number(me.rank), hand: me.hand } : null,
  };
}

/** A pigeon in the yard scared off: 1–5 roubles (one every 2 seconds at most, 300 a Moscow day), counted for «Прогнать голубя». */
export const PIGEON_RULES = { min: 1, max: 5, cooldownMs: 2_000, perDay: 300 };
export async function scarePigeon(ctx: Ctx) {
  const c = await countersOf(ctx.q, ctx.pid);
  const day = Number(moscowDay(ctx.now).replace(/-/g, ""));
  const n = c.pigeonDay === day ? c.pigeonDayN ?? 0 : 0;
  if (n >= PIGEON_RULES.perDay || ctx.now - (c.pigeonAt ?? 0) < PIGEON_RULES.cooldownMs) return { reward: null };
  await setTo(ctx.q, ctx.pid, "pigeonAt", ctx.now);
  await setTo(ctx.q, ctx.pid, "pigeonDay", day);
  await setTo(ctx.q, ctx.pid, "pigeonDayN", n + 1);
  await bump(ctx.q, ctx.pid, "pigeons", 1);
  const rub = PIGEON_RULES.min + Math.floor(ctx.rng() * (PIGEON_RULES.max - PIGEON_RULES.min + 1));
  return { reward: await grantReward(ctx, { currencies: { RUB: rub } }, "pigeon") };
}
