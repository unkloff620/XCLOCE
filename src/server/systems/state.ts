import { GameError, type Queryable } from "../db.ts";
import { balances, energyNow, moscowDay, type Ctx, type PlayerRow } from "../core.ts";
import { fightHp, settleMyFight, unlockedItems } from "./combat.ts";
import { inventoryView } from "./shop.ts";
import { yardSync } from "./yard.ts";
import { levelFromXp } from "../../content/levels.ts";
import { BOSSES } from "../../content/bosses.ts";
import { LOCATIONS } from "../../content/locations.ts";
import { normalizeLook } from "../../content/home.ts";
import { touchActivity } from "../players.ts";
import { dailyView } from "./daily.ts";
import { renameView, slotsView } from "./extras.ts";
import { homeView } from "./home.ts";
import { tasksHint } from "./locations.ts";
import { questsView } from "./quests.ts";
import { notifyView, scheduleEnergy } from "./notify.ts";
import { framesFor, prizesView, settleWeeks } from "./rating.ts";
import { achievementsReady, achievementsView } from "./achievements.ts";

/** Everything the HUD and the always-visible parts of the game need. Runs inside the player's transaction. */
export async function gameState(ctx: Ctx) {
  await settleMyFight(ctx);
  const [p] = await ctx.q.query<PlayerRow>("SELECT * FROM players WHERE id=$1", [ctx.pid]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  await touchActivity(ctx.q, ctx.pid, moscowDay(ctx.now), ctx.now);
  const e = energyNow(p.energy, new Date(p.energy_at).getTime(), ctx.now, ctx.cfg.energy);
  await scheduleEnergy(ctx, e.energy, e.at);
  const lv = levelFromXp(p.xp, ctx.cfg.levels);
  const [app] = await ctx.q.query<{ equipped: Record<string, string> }>("SELECT equipped FROM appearance WHERE player_id=$1", [ctx.pid]);
  const home = await homeView(ctx.q, ctx.pid);
  const yard = await yardSync(ctx);
  const [fightRow] = await ctx.q.query<{ id: number; boss_id: string; hp_max: number; start_total: number; end_total: number | null; ends_at: Date; damage_total: number; my_damage: number; solo: boolean }>(
    "SELECT f.id, f.boss_id, f.hp_max, f.start_total, f.end_total, f.ends_at, f.my_damage, f.solo, b.damage_total FROM fights f JOIN bosses b ON b.id=f.boss_id WHERE f.player_id=$1 AND f.status='active'",
    [ctx.pid],
  );
  // finished fights the player has not looked at yet → victory / defeat window on any screen
  const pending = await ctx.q.query<{ id: number; boss_id: string; status: string }>(
    "SELECT id, boss_id, status FROM fights WHERE player_id=$1 AND status <> 'active' AND seen = false ORDER BY id LIMIT 3",
    [ctx.pid],
  );
  const [clan] = p.clan_id ? await ctx.q.query<{ id: number; name: string; tag: string; emblem: string; color: string }>("SELECT id, name, tag, emblem, color FROM clans WHERE id=$1", [p.clan_id]) : [];
  return {
    now: ctx.now,
    player: {
      id: p.id, name: p.display_name, username: p.username, photo: p.photo_url, telegram: p.telegram_id !== null,
      xp: Number(p.xp), level: lv.level, levelXp: lv.into, levelNeed: lv.need,
      energy: e.energy, energyMax: ctx.cfg.energy.max, energyNextIn: e.nextIn, energyPeriodMs: ctx.cfg.energy.regenMin * 60_000,
      talents: Number((p as PlayerRow & { talents?: number }).talents ?? 0),
    },
    wallet: await balances(ctx.q, ctx.pid),
    inventory: await inventoryView(ctx.q, ctx.pid),
    cooldowns: Object.fromEntries(
      (await ctx.q.query<{ item_id: string; ready_at: Date }>("SELECT item_id, ready_at FROM cooldowns WHERE player_id=$1", [ctx.pid]))
        .map((c) => [c.item_id, new Date(c.ready_at).getTime()])
        .filter(([, t]) => (t as number) > ctx.now),
    ) as Record<string, number>,
    look: { equipped: app?.equipped ?? {}, room: home.room, body: home.body },
    home: { levels: home.levels, rooms: home.rooms, bonus: home.bonus, decor: home.decor, trophies: home.trophies },
    helpSeen: (p as PlayerRow & { help_seen?: string[] }).help_seen ?? [],
    unlocks: await unlockedItems(ctx.q, ctx.pid),
    yard: { count: yard.items.length, max: yard.max, nextAt: yard.nextAt },
    tasks: await tasksHint(ctx.q, ctx.pid),
    fight: fightRow
      ? { id: fightRow.id, bossId: fightRow.boss_id, hp: fightHp(fightRow, fightRow.damage_total), hpMax: fightRow.hp_max, endsAt: new Date(fightRow.ends_at).getTime(), myDamage: Number(fightRow.my_damage), solo: !!fightRow.solo }
      : null,
    pending: pending.map((f) => ({ fightId: f.id, bossId: f.boss_id, status: f.status })),
    clan: clan ?? null,
    daily: await dailyView(ctx.q, ctx.pid, ctx.now, ctx.cfg),
    quests: await questsView(ctx.q, ctx.pid, ctx.now),
    notify: await notifyView(ctx.q, ctx.pid),
    prizes: await (async () => {
      await settleWeeks(ctx.q, ctx.now);
      return prizesView(ctx.q, ctx.pid);
    })(),
    achievementsReady: await achievementsReady(ctx.q, ctx.pid, ctx.cfg),
    slots: await slotsView(ctx.q, ctx.pid, ctx.now, ctx.cfg),
    rename: await renameView(ctx.q, ctx.pid, ctx.now, ctx.cfg),
    sell: ctx.cfg.sell,
  };
}

export async function profileView(q: Queryable, viewer: number, pid: number, cfg: Ctx["cfg"], now = Date.now()) {
  const [p] = await q.query<PlayerRow & { last_day: string | null }>("SELECT * FROM players WHERE id=$1", [pid]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  const [s] = await q.query<{ total_damage: number; weapons: Record<string, number>; task_steps: number; tasks_done: number; locations_done: number; yard_found: number; rewards_got: number }>(
    "SELECT * FROM player_stats WHERE player_id=$1",
    [pid],
  );
  const perBoss = await q.query<{ boss_id: string; damage: number; hits: number; wins: number }>("SELECT boss_id, damage, hits, wins FROM boss_damage WHERE player_id=$1", [pid]);
  const [fw] = await q.query<{ won: number; lost: number }>(
    "SELECT COUNT(*) FILTER (WHERE status='won')::int AS won, COUNT(*) FILTER (WHERE status='lost')::int AS lost FROM fights WHERE player_id=$1",
    [pid],
  );
  const [clears] = await q.query<{ n: number }>("SELECT COUNT(DISTINCT location_id)::int AS n FROM location_claims WHERE player_id=$1", [pid]);
  const [clan] = p.clan_id ? await q.query<{ id: number; name: string; tag: string; emblem: string; color: string }>("SELECT id, name, tag, emblem, color FROM clans WHERE id=$1", [p.clan_id]) : [];
  const [app] = await q.query<{ equipped: Record<string, string>; body: unknown }>("SELECT equipped, body FROM appearance WHERE player_id=$1", [pid]);
  const lv = levelFromXp(p.xp, cfg.levels);
  const self = viewer === pid;
  const e = energyNow(p.energy, new Date(p.energy_at).getTime(), Date.now(), cfg.energy);
  return {
    id: p.id, self, name: p.display_name, username: p.username, photo: p.photo_url,
    level: lv.level, xp: Number(p.xp), levelXp: lv.into, levelNeed: lv.need,
    firstSeen: new Date(p.created_at).getTime(), lastSeen: new Date(p.last_seen_at).getTime(), activeDays: p.active_days,
    wallet: self ? await balances(q, pid) : null,
    energy: self ? e.energy : null,
    stats: {
      totalDamage: Number(s?.total_damage ?? 0), weapons: s?.weapons ?? {}, taskSteps: s?.task_steps ?? 0, tasksDone: s?.tasks_done ?? 0,
      locationsDone: clears.n, locationsTotal: LOCATIONS.length, yardFound: s?.yard_found ?? 0, rewardsGot: s?.rewards_got ?? 0,
      fightsWon: fw.won, fightsLost: fw.lost,
    },
    bosses: BOSSES.map((b) => {
      const r = perBoss.find((x) => x.boss_id === b.id);
      return { id: b.id, damage: Number(r?.damage ?? 0), hits: r?.hits ?? 0, wins: r?.wins ?? 0 };
    }),
    clan: clan ?? null,
    equipped: app?.equipped ?? {},
    body: normalizeLook(app?.body),
    frame: (await framesFor(q, [pid], now)).get(pid) ?? null,
    achievements: await achievementsView(q, pid, cfg),
    room: await (async () => {
      const h = await homeView(q, pid);
      return { id: h.room, levels: h.levels, decor: h.decor, trophies: h.trophies };
    })(),
  };
}
