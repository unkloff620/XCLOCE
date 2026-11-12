/*
 * «Ходки» (content/raids.ts): each player fights a building on his own (weapons, like a boss; the building's HP), every
 * win counts for his clan; the clan takes a building with enough wins, then the next one; with all of a yard's
 * buildings — the yard (its reward to every member who won a fight there, the clan's experience), and the next yard opens.
 * A taken yard rests 2 hours, then the clan can take it again from the bottom (its count grows, the rewards come again).
 * No raid while a boss fight runs (and no boss fight while a raid fight runs).
 */
import { GameError, type Queryable } from "../db.ts";
import { grantReward, ledger, type Ctx, type Granted } from "../core.ts";
import { autoSpendTalents } from "./home.ts";
import { talentsForDamage } from "../../content/talents.ts";
import type { Config } from "../config.ts";
import { strike } from "./combat.ts";
import { isAdminPlayer } from "./fortune.ts";
import { weaponById } from "../../content/items.ts";
import { RAID_YARDS, RAID_YARD_COOLDOWN_MS, buildingById, buildingHp, buildingReward, buildingTake, buildingWins, yardReward, type RaidYard } from "../../content/raids.ts";

export async function raidsOn(q: Queryable, pid: number, cfg: Config) {
  return cfg.raids.on || (await isAdminPlayer(q, pid, cfg));
}

async function myClan(q: Queryable, pid: number): Promise<number | null> {
  const [m] = await q.query<{ clan_id: number }>("SELECT clan_id FROM clan_members WHERE player_id=$1", [pid]);
  return m ? Number(m.clan_id) : null;
}

/** the clan's progress: wins by building (this capture), the buildings taken, the yards taken (when last, how many times) */
async function progressOf(q: Queryable, clanId: number) {
  const rows = await q.query<{ building_id: string; wins: number; taken_at: Date | null }>("SELECT building_id, wins, taken_at FROM raid_progress WHERE clan_id=$1", [clanId]);
  const yards = await q.query<{ yard_id: string; taken_at: Date; times: number }>("SELECT yard_id, taken_at, times FROM raid_yards WHERE clan_id=$1", [clanId]);
  return {
    wins: new Map(rows.map((r) => [r.building_id, Number(r.wins)])),
    taken: new Set(rows.filter((r) => r.taken_at).map((r) => r.building_id)),
    yards: new Set(yards.map((r) => r.yard_id)),
    last: new Map(yards.map((r) => [r.yard_id, { at: new Date(r.taken_at).getTime(), times: Number(r.times) }])),
  };
}
type Progress = Awaited<ReturnType<typeof progressOf>>;

/** the building to attack in a yard now: the first one (from the bottom up) the clan has not taken; null — all taken */
const targetOf = (y: RaidYard, taken: Set<string>) => y.buildings.find((b) => !taken.has(b.id)) ?? null;
/** a yard is open when it is the first one or the one before it has been taken (once is enough) */
const yardOpen = (y: RaidYard, yards: Set<string>) => y.n === 1 || yards.has(RAID_YARDS[y.n - 2].id);
/** a just-taken yard rests: until when (ms), or 0 — it can be taken now */
const restUntil = (y: RaidYard, p: Progress, now: number) => {
  const l = p.last.get(y.id);
  return l && l.at + RAID_YARD_COOLDOWN_MS > now ? l.at + RAID_YARD_COOLDOWN_MS : 0;
};
/** the current capture of a yard started when it was last taken (fights before that were for the last capture) */
const captureFrom = (y: RaidYard, p: Progress) => new Date(p.last.get(y.id)?.at ?? 0);

export async function raidsView(q: Queryable, pid: number, now = Date.now()) {
  const clanId = await myClan(q, pid);
  const p: Progress = clanId ? await progressOf(q, clanId) : { wins: new Map(), taken: new Set(), yards: new Set(), last: new Map() };
  const [f] = await q.query<{ id: number; building_id: string; hp_max: number; damage: number; hits: number }>(
    "SELECT id, building_id, hp_max, damage, hits FROM raid_fights WHERE player_id=$1 AND status='active'", [pid]);
  // the clan's logo: it stands over every building the clan has taken
  const [c] = clanId ? await q.query<{ emblem: string; color: string }>("SELECT emblem, color FROM clans WHERE id=$1", [clanId]) : [];
  return {
    clanId,
    clan: c ? { emblem: c.emblem, color: c.color } : null,
    yards: RAID_YARDS.map((y) => ({
      id: y.id,
      open: yardOpen(y, p.yards),
      /** resting after a capture: until when (ms) — all its buildings stand the clan's; 0 — it can be taken */
      rest: restUntil(y, p, now),
      /** how many times the clan has taken it */
      times: p.last.get(y.id)?.times ?? 0,
      taken: !!restUntil(y, p, now),
      target: restUntil(y, p, now) ? null : targetOf(y, p.taken)?.id ?? null,
      buildings: y.buildings.map((b) => ({ id: b.id, wins: p.wins.get(b.id) ?? 0, need: buildingWins(y), taken: !!restUntil(y, p, now) || p.taken.has(b.id) })),
    })),
    fight: f ? { id: Number(f.id), building: f.building_id, hp: Math.max(0, Number(f.hp_max) - Number(f.damage)), hpMax: Number(f.hp_max), hits: Number(f.hits) } : null,
  };
}

async function guard(ctx: Ctx) {
  if (!(await raidsOn(ctx.q, ctx.pid, ctx.cfg))) throw new GameError("raids_off", "Захват пока закрыт");
  const clanId = await myClan(ctx.q, ctx.pid);
  if (!clanId) throw new GameError("no_clan", "Захват — только для клана. Вступи в клан или создай свой");
  const [boss] = await ctx.q.query("SELECT 1 FROM fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (boss) throw new GameError("fight_running", "Сначала закончи бой с боссом");
  return clanId;
}

/** «Атаковать»: a fight with the clan's current building of this yard */
export async function raidStart(ctx: Ctx, buildingId: string) {
  const clanId = await guard(ctx);
  const found = buildingById(buildingId);
  if (!found) throw new GameError("bad_request", "Нет такого здания", 400);
  const { yard: y, b } = found;
  const [active] = await ctx.q.query<{ building_id: string }>("SELECT building_id FROM raid_fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (active) {
    if (active.building_id === b.id) return { building: b.id, already: true, ...(await raidsView(ctx.q, ctx.pid, ctx.now)) };
    throw new GameError("raid_running", "Сначала закончи бой за другое здание");
  }
  const p = await progressOf(ctx.q, clanId);
  if (!yardOpen(y, p.yards)) throw new GameError("yard_closed", `Сначала клан должен захватить двор «${RAID_YARDS[y.n - 2].name}»`);
  const rest = restUntil(y, p, ctx.now);
  if (rest) throw new GameError("yard_taken", `Двор ваш. Снова захватить можно через ${Math.ceil((rest - ctx.now) / 60_000)} мин`);
  if (targetOf(y, p.taken)?.id !== b.id) throw new GameError("not_target", "Сначала захватите здания пониже");
  await ctx.q.query(
    "INSERT INTO raid_fights (player_id, clan_id, yard_id, building_id, hp_max, started_at) VALUES ($1,$2,$3,$4,$5,$6)",
    [ctx.pid, clanId, y.id, b.id, buildingHp(b), new Date(ctx.now)]);
  return { building: b.id, ...(await raidsView(ctx.q, ctx.pid, ctx.now)) };
}

/** a hit with a weapon in the raid fight; the building falls — the win, the clan's count, maybe the building and the yard */
export async function raidAttack(ctx: Ctx, weaponId: string, want = 1, rush = false) {
  const clanId = await guard(ctx);
  const w = weaponById(weaponId);
  if (!w) throw new GameError("bad_weapon", "Этим не повоюешь");
  if (!Number.isInteger(want) || want < 1 || want > 1000) throw new GameError("bad_count", "Можно бить по 1, 10, 100 или 1000");
  const [f] = await ctx.q.query<{ id: number; yard_id: string; building_id: string; hp_max: number; damage: number }>(
    "SELECT id, yard_id, building_id, hp_max, damage FROM raid_fights WHERE player_id=$1 AND status='active' FOR UPDATE", [ctx.pid]);
  if (!f) throw new GameError("no_fight", "Сначала нажми «Атаковать»");
  const hit = await strike(ctx, w, w.weapon.kind === "consumable" ? want : 1, `raid:${f.building_id}`, rush);
  const damage = Number(f.damage) + hit.damage;
  await ctx.q.query("UPDATE raid_fights SET damage=$2, hits = hits + $3 WHERE id=$1", [f.id, damage, hit.count]);
  // the damage counts for the talents like any boss damage (the counter of all time)
  const [st] = await ctx.q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [ctx.pid]);
  const before = Number(st?.total_damage ?? 0);
  const talentDamage = before + hit.damage;
  const talentsGained = talentsForDamage(talentDamage) - talentsForDamage(before);
  await ctx.q.query("UPDATE player_stats SET total_damage = total_damage + $2 WHERE player_id=$1", [ctx.pid, hit.damage]);
  if (talentsGained > 0) {
    await ctx.q.query("UPDATE players SET talents = talents + $2 WHERE id=$1", [ctx.pid, talentsGained]);
    await ledger(ctx, "talent", "talent", talentsGained, `raid:${f.building_id}`);
    await autoSpendTalents(ctx);
  }
  const base = { weapon: w.id, damage: hit.damage, crit: hit.crit, crits: hit.crits, count: hit.count, left: hit.left, readyAt: hit.readyAt, phrase: hit.phrases[hit.phraseIdx] ?? "", talentDamage, talentsGained, fightDamage: damage };
  if (damage < Number(f.hp_max)) return { ...base, status: "active" as const, hp: Number(f.hp_max) - damage, hpMax: Number(f.hp_max) };

  // the building is down: the player's reward, the clan's win
  const { yard: y, b } = buildingById(f.building_id)!;
  await ctx.q.query("UPDATE raid_fights SET status='won', ended_at=$2 WHERE id=$1", [f.id, new Date(ctx.now)]);
  const per = buildingReward(y.n, b);
  const reward = await grantReward(ctx, { xp: per.xp, currencies: { RUB: per.rub } }, `raid_win:${b.id}`);
  let buildingTaken = false, yardTaken = false, clanXp = 0;
  let takeGot: Granted | null = null, yardGot: Granted | null = null;
  const p0 = await progressOf(ctx.q, clanId);
  // the yard was taken (by the others) while this fight ran: the win's own reward only
  if (restUntil(y, p0, ctx.now)) return { ...base, status: "won" as const, hp: 0, hpMax: Number(f.hp_max), reward, buildingTaken, yardTaken, takeGot, yardGot, clanXp, view: await raidsView(ctx.q, ctx.pid, ctx.now) };
  const from = captureFrom(y, p0);
  const [pr] = await ctx.q.query<{ wins: number; taken_at: Date | null }>(
    `INSERT INTO raid_progress (clan_id, building_id, wins) VALUES ($1,$2,1)
     ON CONFLICT (clan_id, building_id) DO UPDATE SET wins = raid_progress.wins + 1 RETURNING wins, taken_at`, [clanId, b.id]);
  // the members who won a fight in this capture: over this building, over any building of the yard
  const winners = (building: string | null) => ctx.q.query<{ player_id: number }>(
    `SELECT DISTINCT f.player_id FROM raid_fights f JOIN clan_members m ON m.player_id = f.player_id AND m.clan_id = f.clan_id
     WHERE f.clan_id=$1 AND f.yard_id=$2 AND f.status='won' AND f.ended_at > $3 AND ($4::text IS NULL OR f.building_id = $4)`, [clanId, y.id, from, building]);
  if (!pr.taken_at && Number(pr.wins) >= buildingWins(y)) {
    await ctx.q.query("UPDATE raid_progress SET taken_at=$3 WHERE clan_id=$1 AND building_id=$2", [clanId, b.id, new Date(ctx.now)]);
    buildingTaken = true;
    // the building: the clan's experience; everyone who won over it — authority and the yard's flags
    const t = buildingTake(y.n, b);
    clanXp += t.clanXp;
    await ctx.q.query("UPDATE clans SET raid_xp = raid_xp + $2 WHERE id=$1", [clanId, t.clanXp]);
    for (const r of await winners(b.id)) {
      const g = await grantReward({ ...ctx, pid: Number(r.player_id) }, { xp: t.xp, items: [{ id: t.flag, qty: t.flags }] }, `raid_take:${b.id}`);
      if (Number(r.player_id) === ctx.pid) takeGot = g;
    }
    const p = await progressOf(ctx.q, clanId);
    if (y.buildings.every((x) => p.taken.has(x.id))) {
      // the whole yard: its bonus; it rests 2 hours, then the capture starts again from the bottom
      yardTaken = true;
      const yr = yardReward(y.n);
      clanXp += yr.clanXp;
      await ctx.q.query("UPDATE clans SET raid_xp = raid_xp + $2 WHERE id=$1", [clanId, yr.clanXp]);
      for (const r of await winners(null)) {
        const g = await grantReward({ ...ctx, pid: Number(r.player_id) }, { xp: yr.xp, items: [{ id: yr.flag, qty: yr.flags }] }, `raid_yard:${y.id}`);
        if (Number(r.player_id) === ctx.pid) yardGot = g;
      }
      await ctx.q.query(
        `INSERT INTO raid_yards (clan_id, yard_id, taken_at, times) VALUES ($1,$2,$3,1)
         ON CONFLICT (clan_id, yard_id) DO UPDATE SET taken_at = EXCLUDED.taken_at, times = raid_yards.times + 1`, [clanId, y.id, new Date(ctx.now)]);
      await ctx.q.query("DELETE FROM raid_progress WHERE clan_id=$1 AND building_id = ANY($2::text[])", [clanId, y.buildings.map((x) => x.id)]);
    }
  }
  return { ...base, status: "won" as const, hp: 0, hpMax: Number(f.hp_max), reward, buildingTaken, yardTaken, takeGot, yardGot, clanXp, view: await raidsView(ctx.q, ctx.pid, ctx.now) };
}

/** leave the raid fight (the damage done is lost) */
export async function raidFlee(ctx: Ctx) {
  await ctx.q.query("UPDATE raid_fights SET status='fled', ended_at=$2 WHERE player_id=$1 AND status='active'", [ctx.pid, new Date(ctx.now)]);
  return raidsView(ctx.q, ctx.pid, ctx.now);
}

