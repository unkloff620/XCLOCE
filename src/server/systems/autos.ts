/*
 * Automation — the game goes on for the player while he is away (the boss is shared: his free hits help the others):
 *  - a zone: the energy, as it comes back, goes into the tasks of one chosen location (day road; a cleared one is
 *    claimed and gone round again);
 *  - a boss: one mode per boss — the fights start by themselves up to the day's limit (passes spent as by hand), the
 *    free weapons (fist, mouse, candle) hit whenever they have rested, a won fight is claimed.
 * Both are switched on for the current Moscow day only: a player who does not come in for a day gives nothing.
 * Run by the reminders cron (every 15 min in the daytime) for everybody with a toggle today, and right after a toggle.
 */
import { GameError, type Db, type Queryable } from "../db.ts";
import { moscowDay, type Ctx } from "../core.ts";
import { dispatch, makeCtx, type ActionType } from "../game.ts";
import { lockPlayer } from "../core.ts";
import { BOSSES, bossById } from "../../content/bosses.ts";
import { LOCATIONS, locationById, taskOpen, tasksOf } from "../../content/locations.ts";
import { FREE_WEAPONS } from "./combat.ts";

export type AutoKind = "zone" | "boss";
const MODES = ["pacan", "blat", "avtor"] as const;

interface AutoRow { kind: AutoKind; target: string; mode: string }

/** today's toggles of the player */
export async function autosView(q: Queryable, pid: number, now: number) {
  const rows = await q.query<AutoRow>("SELECT kind, target, mode FROM autos WHERE player_id=$1 AND day=$2", [pid, moscowDay(now)]);
  return {
    zone: rows.find((r) => r.kind === "zone")?.target ?? null,
    bosses: Object.fromEntries(rows.filter((r) => r.kind === "boss").map((r) => [r.target, r.mode])) as Record<string, string>,
  };
}

/** switch a toggle on (for today) or off. One zone at all; one mode per boss. */
export async function autoSet(ctx: Ctx, kind: string, target: string, on: boolean, mode = "") {
  const day = moscowDay(ctx.now);
  if (kind === "zone") {
    if (!locationById(target)) throw new GameError("bad_location", "Такой локации нет");
    await ctx.q.query("DELETE FROM autos WHERE player_id=$1 AND kind='zone'", [ctx.pid]);
    if (on) await ctx.q.query("INSERT INTO autos (player_id, kind, target, mode, day, at) VALUES ($1,'zone',$2,'',$3,$4)", [ctx.pid, target, day, new Date(ctx.now)]);
  } else if (kind === "boss") {
    const b = bossById(target);
    if (!b || b.event) throw new GameError("bad_boss", "Автобой — только с обычными боссами");
    if (on && !(MODES as readonly string[]).includes(mode)) throw new GameError("bad_mode", "Нет такого режима");
    await ctx.q.query("DELETE FROM autos WHERE player_id=$1 AND kind='boss' AND target=$2", [ctx.pid, target]);
    if (on) await ctx.q.query("INSERT INTO autos (player_id, kind, target, mode, day, at) VALUES ($1,'boss',$2,$3,$4,$5)", [ctx.pid, target, mode, day, new Date(ctx.now)]);
  } else throw new GameError("bad_request", "Нет такой автоматики", 400);
  return { kind, target, on, mode };
}

/** one step for the player in its own transaction: an action as if he did it; false when it was refused */
async function step(db: Db, pid: number, now: number, type: ActionType, body: Record<string, unknown>): Promise<unknown | false> {
  try {
    return await db.tx(async (q) => {
      const ctx = await makeCtx(q, pid, { now });
      const p = await lockPlayer(ctx);
      if (p.banned_at) throw new GameError("banned", "banned", 403);
      return dispatch(ctx, type, body);
    });
  } catch (e) {
    if (e instanceof GameError) return false;
    throw e;
  }
}

/** the next task of the zone (day road): the first open one not yet done; null — all done (claim it) */
async function nextTask(q: Queryable, pid: number, locId: string) {
  const loc = locationById(locId)!;
  const list = tasksOf(loc, "day");
  const rows = await q.query<{ task_id: string; steps: number }>("SELECT task_id, steps FROM task_progress WHERE player_id=$1 AND task_id = ANY($2::text[])", [pid, list.map((t) => t.id)]);
  const steps = new Map(rows.map((r) => [r.task_id, Number(r.steps)]));
  const i = list.findIndex((t, k) => (steps.get(t.id) ?? 0) < t.steps && taskOpen(loc, k, (id) => steps.get(id) ?? 0, "day"));
  return i < 0 ? null : list[i];
}

/** does everything today's toggles of the player allow right now; returns what it did */
export async function runAutos(db: Db, pid: number, now = Date.now()) {
  const done = { tasks: 0, claims: 0, fights: 0, hits: 0, wins: 0 };
  const rows = await db.query<AutoRow>("SELECT kind, target, mode FROM autos WHERE player_id=$1 AND day=$2", [pid, moscowDay(now)]);
  if (!rows.length) return done;

  // the zone: spend the energy there, step by step, claim the location when its tasks are done and go round again
  const zone = rows.find((r) => r.kind === "zone");
  if (zone && locationById(zone.target)) {
    for (let guard = 0; guard < 60; guard++) {
      const t = await nextTask(db, pid, zone.target);
      if (!t) {
        if ((await step(db, pid, now, "location_claim", { locationId: zone.target, mode: "day" })) === false) break;
        done.claims++;
        continue;
      }
      if ((await step(db, pid, now, "task", { taskId: t.id })) === false) break; // out of energy (or the zone is closed)
      done.tasks++;
    }
  }

  // the bosses: one fight at a time — finish the running one (free hits; claim it once over), then start the next
  const bosses = new Map(rows.filter((r) => r.kind === "boss").map((r) => [r.target, r.mode]));
  if (bosses.size) {
    // claim what is over (won or lost) with the toggled bosses
    const over = await db.query<{ id: number }>("SELECT id FROM fights WHERE player_id=$1 AND status <> 'active' AND NOT seen AND reward IS NULL AND boss_id = ANY($2::text[])", [pid, [...bosses.keys()]]);
    for (const f of over) if ((await step(db, pid, now, "fight_claim", { fightId: f.id })) !== false) done.wins++;
    let [active] = await db.query<{ id: number; boss_id: string }>("SELECT id, boss_id FROM fights WHERE player_id=$1 AND status='active'", [pid]);
    if (!active) {
      // the next boss with a toggle, the weakest first, whose day's limit and passes allow a fight
      for (const b of BOSSES.filter((x) => bosses.has(x.id)).sort((a, b2) => a.order - b2.order)) {
        if ((await step(db, pid, now, "fight_start", { boss: b.id, mode: bosses.get(b.id) })) !== false) { done.fights++; break; }
      }
      [active] = await db.query<{ id: number; boss_id: string }>("SELECT id, boss_id FROM fights WHERE player_id=$1 AND status='active'", [pid]);
    }
    // only in a fight with a toggled boss (a fight the player started by hand with another one is left alone)
    if (active && bosses.has(active.boss_id)) {
      for (const w of FREE_WEAPONS) {
        const r = await step(db, pid, now, "attack", { weapon: w });
        if (r === false) continue;
        done.hits++;
        if ((r as { status?: string }).status === "won") {
          if ((await step(db, pid, now, "fight_claim", { fightId: active.id })) !== false) done.wins++;
          break;
        }
      }
    }
  }
  return done;
}

/** the cron: everybody with a toggle today (a few at a time, so one slow player does not hold the rest) */
export async function runAllAutos(db: Db, now = Date.now()) {
  const ids = (await db.query<{ player_id: number }>("SELECT DISTINCT player_id FROM autos WHERE day=$1", [moscowDay(now)])).map((r) => Number(r.player_id));
  let n = 0;
  for (const pid of ids) {
    try { await runAutos(db, pid, now); n++; } catch { /* one player's trouble must not stop the others */ }
  }
  return { players: n };
}

/** the location ids a zone toggle may take (only open ones would do anything, but any is accepted) */
export const AUTO_ZONES = LOCATIONS.map((l) => l.id);
