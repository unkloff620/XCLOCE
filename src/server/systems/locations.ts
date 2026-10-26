import { GameError, type Queryable } from "../db.ts";
import { addItem, addMoney, grantReward, ledger, spendEnergy, takeMoney, type Ctx, type Granted } from "../core.ts";
import { STASH_MISSING_WEIGHT, STASH_PITY, STASH_SETS, stashChance, stashSetsByLocation } from "../../content/stashes.ts";
import { BUSINESS_MAX_DAYS, LOCATIONS, businessCells, businessCost, businessPerLevel, locRep, locationById, taskById, taskOpen, tasksOf, type BusinessLine, type LocMode, type LocationDef } from "../../content/locations.ts";
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

/** the stash meter: energy spent in tasks since the last find, and the sure find at STASH_PITY */
export async function stashMeter(q: Queryable, pid: number) {
  const [p] = await q.query<{ stash_energy: number }>("SELECT stash_energy FROM players WHERE id=$1", [pid]);
  return { energy: Math.min(STASH_PITY, Number(p?.stash_energy ?? 0)), pity: STASH_PITY };
}

const DAY_MS = 86_400_000;
const claimKey = (id: string, mode: LocMode) => (mode === "night" ? `night:${id}` : id);
const repTable = (mode: LocMode) => (mode === "night" ? "location_night_rep" : "location_rep");

async function repAndLeaders(q: Queryable, pid: number, mode: LocMode) {
  const t = repTable(mode);
  const mine = new Map((await q.query<{ location_id: string; rep: number }>(`SELECT location_id, rep FROM ${t} WHERE player_id=$1`, [pid])).map((r) => [r.location_id, Number(r.rep)]));
  // the leader of every location: the most authority there
  const leaders = new Map((await q.query<{ location_id: string; id: number; rep: number; name: string; photo: string | null }>(
    `SELECT DISTINCT ON (r.location_id) r.location_id, p.id, r.rep, p.display_name AS name, p.photo_url AS photo
     FROM ${t} r JOIN players p ON p.id = r.player_id WHERE p.banned_at IS NULL AND r.rep > 0
     ORDER BY r.location_id, r.rep DESC, r.player_id`,
  )).map((r) => [r.location_id, { id: r.id, name: r.name, photo: r.photo, rep: Number(r.rep) }]));
  return { mine, leaders };
}

type BizRow = { location_id: string; lv_rep: number; lv_rub: number; since: Date | null };
/** the profit waiting in a business: whole days since `since`, at most BUSINESS_MAX_DAYS */
function bizPending(l: LocationDef, b: BizRow | undefined, now: number) {
  const lvRep = Number(b?.lv_rep ?? 0), lvRub = Number(b?.lv_rub ?? 0);
  const since = b?.since ? new Date(b.since).getTime() : null;
  const elapsed = since === null ? 0 : Math.max(0, now - since);
  const days = Math.min(BUSINESS_MAX_DAYS, Math.floor(elapsed / DAY_MS));
  const perRep = lvRep * businessPerLevel(l, "rep"), perRub = lvRub * businessPerLevel(l, "rub");
  return { lvRep, lvRub, since, days, perRep, perRub, rep: days * perRep, rub: days * perRub, full: elapsed >= BUSINESS_MAX_DAYS * DAY_MS };
}

export async function locationsView(q: Queryable, pid: number, now = Date.now()) {
  const { steps, clears } = await progress(q, pid);
  const day = await repAndLeaders(q, pid, "day");
  const night = await repAndLeaders(q, pid, "night");
  const biz = new Map((await q.query<BizRow>("SELECT location_id, lv_rep, lv_rub, since FROM location_business WHERE player_id=$1", [pid])).map((r) => [r.location_id, r]));
  const side = (l: LocationDef, mode: LocMode) => {
    const tasks = tasksOf(l, mode).map((t) => ({ id: t.id, steps: Math.min(t.steps, steps.get(t.id) ?? 0), need: t.steps }));
    const n = clears.get(claimKey(l.id, mode)) ?? 0;
    // the night road always pays the repeat reward (the first-clear things come from the day road)
    return { done: tasks.filter((t) => t.steps >= t.need).length, total: tasks.length, clears: n, tasks, nextReward: n > 0 || mode === "night" ? repeatReward(l.reward) : l.reward };
  };
  return LOCATIONS.map((l) => {
    const d = side(l, "day");
    const nt = side(l, "night");
    const b = bizPending(l, biz.get(l.id), now);
    return {
      id: l.id, unlocked: unlocked(l, clears), ...d, rep: day.mine.get(l.id) ?? 0, leader: day.leaders.get(l.id) ?? null,
      night: { ...nt, rep: night.mine.get(l.id) ?? 0, leader: night.leaders.get(l.id) ?? null },
      business: {
        cells: businessCells(l), lvRep: b.lvRep, lvRub: b.lvRub,
        costRep: b.lvRep < businessCells(l) ? businessCost(l, "rep", b.lvRep) : null,
        costRub: b.lvRub < businessCells(l) ? businessCost(l, "rub", b.lvRub) : null,
        stepRep: businessPerLevel(l, "rep"), stepRub: businessPerLevel(l, "rub"), perRep: b.perRep, perRub: b.perRub,
        days: b.days, pendingRep: b.rep, pendingRub: b.rub, full: b.full,
        nextAt: b.since === null || b.full ? null : b.since + (b.days + 1) * DAY_MS,
      },
    };
  });
}

/** «Бизнес»: one more level of a line, paid in rubles; the first level starts the profit clock */
export async function businessUp(ctx: Ctx, locationId: string, line: BusinessLine) {
  const loc = locationById(locationId);
  if (!loc) throw new GameError("bad_location", "Такой локации нет");
  if (line !== "rep" && line !== "rub") throw new GameError("bad_line", "Такой прибыли нет");
  const { clears } = await progress(ctx.q, ctx.pid);
  if (!unlocked(loc, clears)) throw new GameError("location_locked", "Сначала открой эту локацию");
  const [b] = await ctx.q.query<BizRow>("SELECT location_id, lv_rep, lv_rub, since FROM location_business WHERE player_id=$1 AND location_id=$2 FOR UPDATE", [ctx.pid, loc.id]);
  const lv = Number(line === "rep" ? b?.lv_rep ?? 0 : b?.lv_rub ?? 0);
  if (lv >= businessCells(loc)) throw new GameError("max_level", "Уже прокачано до конца");
  const price = businessCost(loc, line, lv);
  await takeMoney(ctx, "RUB", price, `business:${loc.id}:${line}`);
  const col = line === "rep" ? "lv_rep" : "lv_rub";
  await ctx.q.query(
    `INSERT INTO location_business (player_id, location_id, ${col}, since) VALUES ($1,$2,1,$3)
     ON CONFLICT (player_id, location_id) DO UPDATE SET ${col} = location_business.${col} + 1, since = COALESCE(location_business.since, EXCLUDED.since)`,
    [ctx.pid, loc.id, new Date(ctx.now)],
  );
  return { locationId: loc.id, line, level: lv + 1, price };
}

/** «Бизнес»: take the profit of the whole days piled up (at most a week) */
export async function businessClaim(ctx: Ctx, locationId: string) {
  const loc = locationById(locationId);
  if (!loc) throw new GameError("bad_location", "Такой локации нет");
  const [b] = await ctx.q.query<BizRow>("SELECT location_id, lv_rep, lv_rub, since FROM location_business WHERE player_id=$1 AND location_id=$2 FOR UPDATE", [ctx.pid, loc.id]);
  const p = bizPending(loc, b, ctx.now);
  if (p.days < 1 || (p.rep <= 0 && p.rub <= 0)) throw new GameError("not_yet", "Прибыль ещё не набежала: забирать можно раз в сутки");
  if (p.rub > 0) await addMoney(ctx, "RUB", p.rub, `business:${loc.id}`);
  if (p.rep > 0) {
    await ctx.q.query(
      "INSERT INTO location_rep (player_id, location_id, rep) VALUES ($1,$2,$3) ON CONFLICT (player_id, location_id) DO UPDATE SET rep = location_rep.rep + EXCLUDED.rep",
      [ctx.pid, loc.id, p.rep],
    );
  }
  // a full week stops the clock: it starts again from now; otherwise the part of the day already gone is kept
  const since = p.full ? ctx.now : (p.since ?? ctx.now) + p.days * DAY_MS;
  await ctx.q.query("UPDATE location_business SET since=$3 WHERE player_id=$1 AND location_id=$2", [ctx.pid, loc.id, new Date(since)]);
  return { locationId: loc.id, days: p.days, rub: p.rub, rep: p.rep };
}

/** For the "you can spend energy" hint: the cheapest step left in an open location not cleared yet, and whether its first reward waits. */
export async function tasksHint(q: Queryable, pid: number) {
  const { steps, clears } = await progress(q, pid);
  let minEnergy: number | null = null;
  let claimable = false;
  for (const l of LOCATIONS) {
    // a cleared location can be replayed, but it does not call for attention: only open, not yet cleared ones do
    if (!unlocked(l, clears) || (clears.get(l.id) ?? 0) > 0) continue;
    const left = l.tasks.filter((t, i) => (steps.get(t.id) ?? 0) < t.steps && taskOpen(l, i, (id) => steps.get(id) ?? 0));
    if (l.tasks.every((t) => (steps.get(t.id) ?? 0) >= t.steps)) claimable = true;
    for (const t of left) minEnergy = minEnergy === null ? t.energy : Math.min(minEnergy, t.energy);
  }
  return { minEnergy, claimable };
}

export async function doTask(ctx: Ctx, taskId: string) {
  const found = taskById(taskId);
  if (!found) throw new GameError("bad_task", "Такого задания нет");
  const { loc, task, mode } = found;
  const list = tasksOf(loc, mode);
  const { steps, clears } = await progress(ctx.q, ctx.pid);
  if (!unlocked(loc, clears)) throw new GameError("location_locked", "Сначала закрой предыдущую локацию");
  const have = steps.get(task.id) ?? 0;
  if (have >= task.steps) throw new GameError("task_done", "Задание уже выполнено");
  if (!taskOpen(loc, list.indexOf(task), (id) => steps.get(id) ?? 0, mode)) throw new GameError("task_locked", "Сначала выполни предыдущее задание");
  const energyLeft = await spendEnergy(ctx, task.energy);
  await ctx.q.query(
    "INSERT INTO task_progress (player_id, task_id, steps) VALUES ($1,$2,1) ON CONFLICT (player_id, task_id) DO UPDATE SET steps = task_progress.steps + 1",
    [ctx.pid, task.id],
  );
  const stepNow = have + 1;
  const stepGot = await grantReward(ctx, task.stepReward, `task:${task.id}`);
  // авторитет локации (by day) or ночной авторитет (by night): a third of the step's authority, kept in this location only
  const rep = locRep(stepGot.xp);
  if (rep > 0) {
    const t = repTable(mode);
    await ctx.q.query(
      `INSERT INTO ${t} (player_id, location_id, rep) VALUES ($1,$2,$3) ON CONFLICT (player_id, location_id) DO UPDATE SET rep = ${t}.rep + EXCLUDED.rep`,
      [ctx.pid, loc.id, rep],
    );
  }
  // нычки: the energy of this step is a chance; the energy spent without a find piles up to a sure find
  const [meter] = await ctx.q.query<{ stash_energy: number }>("UPDATE players SET stash_energy = stash_energy + $2 WHERE id=$1 RETURNING stash_energy", [ctx.pid, task.energy]);
  const sure = Number(meter?.stash_energy ?? 0) >= STASH_PITY;
  const stash = sure || ctx.rng() < stashChance(task.energy) ? await findStash(ctx, loc.id, stepGot) : null;
  if (stash) await ctx.q.query("UPDATE players SET stash_energy = 0 WHERE id=$1", [ctx.pid]);
  let doneGot = null;
  if (stepNow >= task.steps) {
    // a task finished before its step count went up (done_at is set) keeps its old reward: no second one
    const [prev] = await ctx.q.query<{ done_at: Date | null }>("SELECT done_at FROM task_progress WHERE player_id=$1 AND task_id=$2", [ctx.pid, task.id]);
    if (!prev?.done_at) {
      await ctx.q.query("UPDATE task_progress SET done_at=$3 WHERE player_id=$1 AND task_id=$2", [ctx.pid, task.id, new Date(ctx.now)]);
      doneGot = await grantReward(ctx, task.doneReward, `task-done:${task.id}`);
      await ctx.q.query("UPDATE player_stats SET tasks_done = tasks_done + 1 WHERE player_id=$1", [ctx.pid]);
    }
  }
  await ctx.q.query("UPDATE player_stats SET task_steps = task_steps + 1 WHERE player_id=$1", [ctx.pid]);
  const doneCount = list.filter((t) => (t.id === task.id ? stepNow : steps.get(t.id) ?? 0) >= t.steps).length;
  return { taskId: task.id, steps: stepNow, need: task.steps, energyLeft, step: stepGot, done: doneGot, locationComplete: doneCount === list.length, stash, locRep: rep, mode };
}

/** the stashes a location gives: its own sets; a location without sets gives from all of them */
export function stashPool(locationId: string): string[] {
  const own = stashSetsByLocation(locationId).flatMap((s) => s.items.map((i) => i.id));
  return own.length ? own : STASH_SETS.flatMap((s) => s.items.map((i) => i.id));
}

/** One of the location's stashes (they drop again and pile up; the missing ones are likelier); goes to the inventory. */
async function findStash(ctx: Ctx, locationId: string, into: Granted): Promise<string | null> {
  const all = stashPool(locationId);
  if (!all.length) return null;
  const owned = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2::text[])", [ctx.pid, all])).map((r) => r.item_id));
  const w = all.map((id) => (owned.has(id) ? 1 : STASH_MISSING_WEIGHT));
  let roll = ctx.rng() * w.reduce((a, b) => a + b, 0);
  let k = 0;
  while (k < all.length - 1 && roll >= w[k]) roll -= w[k++];
  const pick = all[k];
  if ((await addItem(ctx, pick, 1, `stash:${locationId}`)) < 1) return null;
  into.items.push({ id: pick, qty: 1 });
  return pick;
}

/** Four different stashes of a set → the set's reward, one of each stash is used up, the set counter grows. */
export async function collectStashSet(ctx: Ctx, setId: string) {
  const set = STASH_SETS.find((s) => s.id === setId);
  if (!set) throw new GameError("bad_set", "Такого набора нет");
  for (const it of set.items) {
    const r = await ctx.q.query("UPDATE inventory SET qty = qty - 1, updated_at=$3 WHERE player_id=$1 AND item_id=$2 AND qty >= 1 RETURNING qty", [ctx.pid, it.id, new Date(ctx.now)]);
    if (!r.length) throw new GameError("set_incomplete", "Нужны все 4 нычки набора");
    await ledger(ctx, "item", it.id, -1, `stash-set:${set.id}`);
  }
  const [row] = await ctx.q.query<{ count: number }>(
    "INSERT INTO stash_sets (player_id, set_n, count) VALUES ($1,$2,1) ON CONFLICT (player_id, set_n) DO UPDATE SET count = stash_sets.count + 1 RETURNING count",
    [ctx.pid, set.n],
  );
  const reward = await grantReward(ctx, set.reward, `stash-set:${set.id}`);
  return { setId: set.id, count: Number(row.count), reward };
}

export async function claimLocation(ctx: Ctx, locationId: string, mode: LocMode = "day") {
  const loc = locationById(locationId);
  if (!loc) throw new GameError("bad_location", "Такой локации нет");
  const list = tasksOf(loc, mode);
  const { steps, clears } = await progress(ctx.q, ctx.pid);
  if (!unlocked(loc, clears)) throw new GameError("location_locked", "Локация закрыта");
  if (!list.every((t) => (steps.get(t.id) ?? 0) >= t.steps)) throw new GameError("not_done", "Выполни все 5 заданий");
  const key = claimKey(loc.id, mode);
  const first = (clears.get(key) ?? 0) === 0;
  // the night road always pays the repeat reward
  const got = await grantReward(ctx, first && mode === "day" ? loc.reward : repeatReward(loc.reward), `location:${key}`);
  await ctx.q.query("INSERT INTO location_claims (player_id, location_id, claimed_at) VALUES ($1,$2,$3)", [ctx.pid, key, new Date(ctx.now)]);
  if (first && mode === "day") await ctx.q.query("UPDATE player_stats SET locations_done = locations_done + 1 WHERE player_id=$1", [ctx.pid]);
  // reset the tasks for the next round
  await ctx.q.query("UPDATE task_progress SET steps=0, done_at=NULL WHERE player_id=$1 AND task_id = ANY($2::text[])", [ctx.pid, list.map((t) => t.id)]);
  const next = LOCATIONS.find((l) => l.order === loc.order + 1);
  return { locationId: loc.id, first: first && mode === "day", reward: got, opened: first && mode === "day" && next ? next.id : null, stash: null, mode };
}
