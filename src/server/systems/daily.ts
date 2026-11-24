import { GameError, type Queryable } from "../db.ts";
import { moscowDay, nextMoscowMidnight, type Ctx } from "../core.ts";
import type { Config } from "../config.ts";
import { nextStreakBonus } from "../../content/daily.ts";

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
  // the daily login reward is gone (the user 2026-11-24)
  throw new GameError("no_daily", "Награды за вход больше нет");
}
