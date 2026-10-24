import { GameError, type Queryable } from "../db.ts";
import { grantReward, moscowDay, nextMoscowMidnight, type Ctx } from "../core.ts";
import type { Config } from "../config.ts";
import { nextStreakBonus, streakBonus } from "../../content/daily.ts";

/*
 * Награда за вход: раз в московские сутки. Серия растёт, если вчера тоже забирал; пропуск — снова день 1.
 * Цикл длиной cfg.daily.length (7 дней), после последнего дня — заново с первого.
 */

interface Row { last_day: string; streak: number; total: number }

function status(row: Row | undefined, now: number, cfg: Config) {
  const today = moscowDay(now);
  const yesterday = moscowDay(now - 24 * 3600_000);
  const len = cfg.daily.length;
  const claimedToday = row?.last_day === today;
  const alive = !!row && (claimedToday || row.last_day === yesterday);
  const streak = alive ? row!.streak : 0;
  const nextStreak = claimedToday ? streak : streak + 1;
  // day in the cycle: the one claimed today, or the one that can be claimed now
  const day = ((nextStreak - 1) % len) + 1;
  return { available: !claimedToday, streak, nextStreak, day, cycle: len, nextAt: claimedToday ? nextMoscowMidnight(now) : null, total: row?.total ?? 0 };
}

export async function dailyView(q: Queryable, pid: number, now: number, cfg: Config) {
  const [row] = await q.query<Row>("SELECT last_day, streak, total FROM daily_login WHERE player_id=$1", [pid]);
  const s = status(row, now, cfg);
  // the next streak bonus (7, 14, 30 days in a row…): counted from the streak the next claim makes
  const bonus = nextStreakBonus(s.available ? s.nextStreak - 1 : s.streak);
  return { available: s.available, day: s.day, streak: s.streak, cycle: s.cycle, nextAt: s.nextAt, rewards: cfg.daily, bonus };
}

export async function claimDaily(ctx: Ctx) {
  const [row] = await ctx.q.query<Row>("SELECT last_day, streak, total FROM daily_login WHERE player_id=$1 FOR UPDATE", [ctx.pid]);
  const s = status(row, ctx.now, ctx.cfg);
  if (!s.available) throw new GameError("daily_taken", "Сегодняшняя награда уже получена — приходи завтра");
  const reward = ctx.cfg.daily[s.day - 1];
  await ctx.q.query(
    `INSERT INTO daily_login (player_id, last_day, streak, total, best_streak) VALUES ($1,$2,$3,1,$3)
     ON CONFLICT (player_id) DO UPDATE SET last_day=EXCLUDED.last_day, streak=EXCLUDED.streak, total=daily_login.total+1,
       best_streak=GREATEST(daily_login.best_streak, EXCLUDED.streak)`,
    [ctx.pid, moscowDay(ctx.now), s.nextStreak],
  );
  const got = await grantReward(ctx, reward, `daily:${s.day}`);
  // the streak bonus on top: 7, 14, 30 days in a row (then every 30)
  const extra = streakBonus(s.nextStreak);
  const bonus = extra ? await grantReward(ctx, extra, `daily-streak:${s.nextStreak}`) : null;
  return { day: s.day, streak: s.nextStreak, reward: got, bonus };
}
