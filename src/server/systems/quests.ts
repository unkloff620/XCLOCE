import { loadConfig } from "../config.ts";
import { GameError, type Queryable } from "../db.ts";
import { grantReward, moscowDay, nextMoscowMidnight, type Ctx, type Granted } from "../core.ts";
import { questsForDay, rollQuestChest, type QuestKind } from "../../content/quests.ts";
import { monthTick } from "./monthly.ts";
import { zarubTick } from "./zarub.ts";
import type { MonthKind } from "../../content/monthly.ts";

/*
 * «Задания дня»: five a day (content/quests.ts), progress counted by the actions themselves (game.ts → questTick /
 * questOnly, combat.ts — a boss won, zarub.ts — a race task done). A finished quest pays when claimed; all seven claimed —
 * the chest of the day. Resets at 00:00 MSK.
 */

interface Row { progress: Record<string, number>; claimed: string[]; chest: Granted | null }

async function row(q: Queryable, pid: number, day: string, lock = false): Promise<Row> {
  const [r] = await q.query<Row>(`SELECT progress, claimed, chest FROM daily_quests WHERE player_id=$1 AND day=$2${lock ? " FOR UPDATE" : ""}`, [pid, day]);
  return r ?? { progress: {}, claimed: [], chest: null };
}

/** Adds progress to today's quests of that kind (a no-op when none of today's quests counts it); «Календарь» and the
 *  «Зарубы» race count the same actions */
export async function questTick(ctx: Ctx, kind: QuestKind, amount = 1) {
  if (!(amount > 0)) return;
  // «Календарь» counts the same actions (the social ones by their kind: game.ts)
  if (kind !== "social") await monthTick(ctx, kind as MonthKind, amount);
  // «Зарубы»: the race's tasks of this kind
  if (ZARUB_KINDS.has(kind)) await zarubTick(ctx, kind as Parameters<typeof zarubTick>[1], amount);
  await questOnly(ctx, kind, amount);
}

/** the kinds the «Зарубы» race has tasks of */
const ZARUB_KINDS = new Set<QuestKind>(["damage", "hits", "steps", "energy", "yard", "social", "poker", "slots", "zonk", "bj", "upgrader", "buy"]);

/** only the day's quests (what «Календарь» and «Зарубы» already count elsewhere, or do not count at all) */
export async function questOnly(ctx: Ctx, kind: QuestKind, amount = 1) {
  if (!(amount > 0)) return;
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

/** the chest of the day: all seven claimed → once a day (content/quests.ts rollQuestChest) */
export async function openQuestChest(ctx: Ctx) {
  const day = moscowDay(ctx.now);
  const defs = questsForDay(ctx.pid, day, ctx.cfg.exchange.schedule);
  const r = await row(ctx.q, ctx.pid, day, true);
  if (r.chest) throw new GameError("chest_taken", "Сундук уже открыт");
  if (!defs.every((x) => r.claimed.includes(x.id))) throw new GameError("chest_locked", "Сначала выполни все задания дня");
  const reward = await grantReward(ctx, rollQuestChest(ctx.rng), "quest:chest");
  await ctx.q.query("UPDATE daily_quests SET chest=$3 WHERE player_id=$1 AND day=$2", [ctx.pid, day, JSON.stringify(reward)]);
  return { reward };
}
