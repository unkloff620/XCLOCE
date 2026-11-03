/* «Новичок» (content/newbie.ts): the newcomer's chain of tasks for his first days, with Баба Зина. */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, type Ctx } from "../core.ts";
import { NEWBIE_CHEST, NEWBIE_MS, NEWBIE_TASKS, newbieTask } from "../../content/newbie.ts";

/** how many times the player made each task's actions since he came (hits are counted from boss_hits) */
async function progress(q: Queryable, pid: number, since: Date): Promise<Record<string, number>> {
  const types = [...new Set(NEWBIE_TASKS.flatMap((t) => t.types))].filter((t) => t !== "attack");
  const rows = await q.query<{ type: string; n: number }>(
    "SELECT type, COUNT(*)::int AS n FROM action_log WHERE player_id=$1 AND ok AND at >= $2 AND type = ANY($3) GROUP BY type",
    [pid, since, types],
  );
  const by: Record<string, number> = Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
  const [h] = await q.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM fights f JOIN boss_hits h ON h.fight_id = f.id AND h.player_id = $1 WHERE f.player_id = $1 AND h.created_at >= $2",
    [pid, since],
  );
  by.attack = Number(h?.n ?? 0);
  return by;
}

/** the event for this player: null when it is over (or he came long ago) */
export async function newbieView(q: Queryable, pid: number, now: number) {
  const [p] = await q.query<{ created_at: Date }>("SELECT created_at FROM players WHERE id=$1", [pid]);
  if (!p) return null;
  const since = new Date(p.created_at);
  const endsAt = since.getTime() + NEWBIE_MS;
  const claimed = new Set((await q.query<{ task_id: string }>("SELECT task_id FROM newbie_claims WHERE player_id=$1", [pid])).map((r) => r.task_id));
  if (now >= endsAt || claimed.has("chest")) return null;
  const by = await progress(q, pid, since);
  const tasks = NEWBIE_TASKS.map((t) => ({ id: t.id, have: Math.min(t.n, t.types.reduce((s, ty) => s + (by[ty] ?? 0), 0)), n: t.n, claimed: claimed.has(t.id) }));
  return { endsAt, tasks, chest: false };
}

/** a task's reward (the chain goes in order: the previous ones claimed first), or the final chest (id "chest") */
export async function newbieClaim(ctx: Ctx, id: string) {
  const v = await newbieView(ctx.q, ctx.pid, ctx.now);
  if (!v) throw new GameError("newbie_over", "Ивент новичка закончился");
  if (id === "chest") {
    if (v.tasks.some((t) => !t.claimed)) throw new GameError("newbie_not_done", "Сначала все задания");
  } else {
    const def = newbieTask(id);
    const i = v.tasks.findIndex((t) => t.id === id);
    if (!def || i < 0) throw new GameError("bad_request", "Нет такого задания", 400);
    if (v.tasks[i].claimed) throw new GameError("newbie_claimed", "Уже забрано");
    if (v.tasks.slice(0, i).some((t) => !t.claimed)) throw new GameError("newbie_order", "Сначала предыдущее задание");
    if (v.tasks[i].have < def.n) throw new GameError("newbie_not_done", "Задание ещё не выполнено");
  }
  await ctx.q.query("INSERT INTO newbie_claims (player_id, task_id, at) VALUES ($1,$2,$3)", [ctx.pid, id, new Date(ctx.now)]);
  const reward = await grantReward(ctx, id === "chest" ? NEWBIE_CHEST : newbieTask(id)!.reward, `newbie:${id}`);
  return { id, reward };
}
