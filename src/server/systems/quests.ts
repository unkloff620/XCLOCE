import { loadConfig } from "../config.ts";
import { GameError, type Queryable } from "../db.ts";
import { grantReward, moscowDay, nextMoscowMidnight, type Ctx, type Granted } from "../core.ts";
import { questsForDay, type QuestKind } from "../../content/quests.ts";
import { monthTick } from "./monthly.ts";
import { zarubTick } from "./zarub.ts";
import type { MonthKind } from "../../content/monthly.ts";

/*
 * Daily quests: three a day (content/quests.ts), progress counted by the actions themselves (game.ts → questTick).
 * A finished quest pays when claimed; all three claimed → the chest. Everything resets at 00:00 MSK.
 */

interface Row { progress: Record<string, number>; claimed: string[]; chest: Granted | null }

async function row(q: Queryable, pid: number, day: string, lock = false): Promise<Row> {
  const [r] = await q.query<Row>(`SELECT progress, claimed, chest FROM daily_quests WHERE player_id=$1 AND day=$2${lock ? " FOR UPDATE" : ""}`, [pid, day]);
  return r ?? { progress: {}, claimed: [], chest: null };
}

/** Adds progress to today's quests of that kind (a no-op when none of today's quests counts it). */
export async function questTick(ctx: Ctx, kind: QuestKind, amount = 1) {
  if (!(amount > 0)) return;
  // «Календарь» counts the same actions (the social ones by their kind: game.ts)
  if (kind !== "social") await monthTick(ctx, kind as MonthKind, amount);
  // «Зарубы»: the race's tasks of this kind
  if (kind !== "exchange" && kind !== "roach") await zarubTick(ctx, kind, amount);
  const day = moscowDay(ctx.now);
  const quests = questsForDay(ctx.pid, day, ctx.cfg.exchange.schedule).filter((x) => x.kind === kind);
  if (!quests.length) return;
  const r = await row(ctx.q, ctx.pid, day, true);
  const progress = { ...r.progress };
  for (const x of quests) progress[x.id] = Math.min(x.target, (progress[x.id] ?? 0) + amount);
  await ctx.q.query(
    `INSERT INTO daily_quests (player_id, day, progress) VALUES ($1,$2,$3)
     ON CONFLICT (player_id, day) DO UPDATE SET progress = EXCLUDED.progress`,
    [ctx.pid, day, JSON.stringify(progress)],
  );
}

export async function questsView(q: Queryable, pid: number, now: number) {
  const day = moscowDay(now);
  const r = await row(q, pid, day);
  const defs = questsForDay(pid, day, (await loadConfig(q, now)).exchange.schedule);
  const list = defs.map((x) => {
    const progress = Math.min(x.target, r.progress[x.id] ?? 0);
    return { id: x.id, progress, target: x.target, done: progress >= x.target, claimed: r.claimed.includes(x.id) };
  });
  const allClaimed = list.every((x) => x.claimed);
  return {
    list,
    chest: { ready: allClaimed && !r.chest, opened: !!r.chest, reward: r.chest },
    /** something waits to be collected → the button glows */
    claimable: list.some((x) => x.done && !x.claimed) || (allClaimed && !r.chest),
    resetAt: nextMoscowMidnight(now),
  };
}

export async function claimQuest(ctx: Ctx, id: string) {
  const day = moscowDay(ctx.now);
  const def = questsForDay(ctx.pid, day, ctx.cfg.exchange.schedule).find((x) => x.id === id);
  if (!def) throw new GameError("bad_quest", "Сегодня такого задания нет");
  const r = await row(ctx.q, ctx.pid, day, true);
  if (r.claimed.includes(id)) throw new GameError("quest_taken", "Награда уже получена");
  if ((r.progress[id] ?? 0) < def.target) throw new GameError("quest_not_done", "Задание ещё не выполнено");
  await ctx.q.query("UPDATE daily_quests SET claimed = claimed || $3::jsonb WHERE player_id=$1 AND day=$2", [ctx.pid, day, JSON.stringify([id])]);
  return { id, reward: await grantReward(ctx, def.reward, `quest:${id}`) };
}

export async function openQuestChest(ctx: Ctx) {
  // «Сундук дня» is gone (the user 2026-11-24)
  throw new GameError("no_chest", "Сундука дня больше нет");
}
