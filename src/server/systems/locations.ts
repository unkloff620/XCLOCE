import { GameError, type Queryable } from "../db.ts";
import { grantReward, spendEnergy, type Ctx } from "../core.ts";
import { LOCATIONS, locationById, taskById, type LocationDef } from "../../content/locations.ts";
import type { Reward } from "../../content/rewards.ts";

/*
 * 5 locations × 5 tasks. Energy is spent only here. A task has N steps; every step costs energy and pays a little,
 * the last step pays the task reward. All five done → the location reward (much bigger) and the next location opens.
 * After the first clear a location can be replayed: tasks reset, the repeat reward is half the currencies and XP, no items.
 */

export async function progress(q: Queryable, pid: number) {
  const steps = await q.query<{ task_id: string; steps: number }>("SELECT task_id, steps FROM task_progress WHERE player_id=$1", [pid]);
  const claims = await q.query<{ location_id: string; n: number }>("SELECT location_id, COUNT(*)::int AS n FROM location_claims WHERE player_id=$1 GROUP BY location_id", [pid]);
  return { steps: new Map(steps.map((s) => [s.task_id, s.steps])), clears: new Map(claims.map((c) => [c.location_id, c.n])) };
}

function unlocked(loc: LocationDef, clears: Map<string, number>): boolean {
  if (loc.order === 1) return true;
  const prev = LOCATIONS.find((l) => l.order === loc.order - 1);
  return !!prev && (clears.get(prev.id) ?? 0) > 0;
}

export function repeatReward(r: Reward): Reward {
  const cur: Reward["currencies"] = {};
  for (const [c, v] of Object.entries(r.currencies ?? {})) cur[c as keyof typeof cur] = (v ?? 0) / 2;
  return { currencies: cur, xp: Math.round((r.xp ?? 0) / 2) };
}

export async function locationsView(q: Queryable, pid: number) {
  const { steps, clears } = await progress(q, pid);
  return LOCATIONS.map((l) => {
    const tasks = l.tasks.map((t) => ({ id: t.id, steps: Math.min(t.steps, steps.get(t.id) ?? 0), need: t.steps }));
    const done = tasks.filter((t) => t.steps >= t.need).length;
    const n = clears.get(l.id) ?? 0;
    return { id: l.id, unlocked: unlocked(l, clears), done, total: l.tasks.length, clears: n, tasks, nextReward: n > 0 ? repeatReward(l.reward) : l.reward };
  });
}

export async function doTask(ctx: Ctx, taskId: string) {
  const found = taskById(taskId);
  if (!found) throw new GameError("bad_task", "Такого задания нет");
  const { loc, task } = found;
  const { steps, clears } = await progress(ctx.q, ctx.pid);
  if (!unlocked(loc, clears)) throw new GameError("location_locked", "Сначала закрой предыдущую локацию");
  const have = steps.get(task.id) ?? 0;
  if (have >= task.steps) throw new GameError("task_done", "Задание уже выполнено");
  const energyLeft = await spendEnergy(ctx, task.energy);
  await ctx.q.query(
    "INSERT INTO task_progress (player_id, task_id, steps) VALUES ($1,$2,1) ON CONFLICT (player_id, task_id) DO UPDATE SET steps = task_progress.steps + 1",
    [ctx.pid, task.id],
  );
  const stepNow = have + 1;
  const stepGot = await grantReward(ctx, task.stepReward, `task:${task.id}`);
  let doneGot = null;
  if (stepNow >= task.steps) {
    await ctx.q.query("UPDATE task_progress SET done_at=$3 WHERE player_id=$1 AND task_id=$2", [ctx.pid, task.id, new Date(ctx.now)]);
    doneGot = await grantReward(ctx, task.doneReward, `task-done:${task.id}`);
    await ctx.q.query("UPDATE player_stats SET tasks_done = tasks_done + 1 WHERE player_id=$1", [ctx.pid]);
  }
  await ctx.q.query("UPDATE player_stats SET task_steps = task_steps + 1 WHERE player_id=$1", [ctx.pid]);
  const doneCount = loc.tasks.filter((t) => (t.id === task.id ? stepNow : steps.get(t.id) ?? 0) >= t.steps).length;
  return { taskId: task.id, steps: stepNow, need: task.steps, energyLeft, step: stepGot, done: doneGot, locationComplete: doneCount === loc.tasks.length };
}

export async function claimLocation(ctx: Ctx, locationId: string) {
  const loc = locationById(locationId);
  if (!loc) throw new GameError("bad_location", "Такой локации нет");
  const { steps, clears } = await progress(ctx.q, ctx.pid);
  if (!unlocked(loc, clears)) throw new GameError("location_locked", "Локация закрыта");
  if (!loc.tasks.every((t) => (steps.get(t.id) ?? 0) >= t.steps)) throw new GameError("not_done", "Выполни все 5 заданий");
  const first = (clears.get(loc.id) ?? 0) === 0;
  const got = await grantReward(ctx, first ? loc.reward : repeatReward(loc.reward), `location:${loc.id}`);
  await ctx.q.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,$2,$3)", [ctx.pid, loc.id, new Date(ctx.now)]);
  if (first) await ctx.q.query("UPDATE player_stats SET locations_done = locations_done + 1 WHERE player_id=$1", [ctx.pid]);
  // reset the tasks for the next round
  await ctx.q.query("UPDATE task_progress SET steps=0, done_at=NULL WHERE player_id=$1 AND task_id = ANY($2::text[])", [ctx.pid, loc.tasks.map((t) => t.id)]);
  const next = LOCATIONS.find((l) => l.order === loc.order + 1);
  return { locationId: loc.id, first, reward: got, opened: first && next ? next.id : null };
}
