/*
 * «Ходки» (content/raids.ts): each player fights a building on his own (weapons, like a boss; the building's HP), every
 * win counts for his clan; the clan takes a building with enough wins, then the next one; with all of a yard's
 * buildings — the yard (its reward to every member who won a fight there, the clan's experience), and the next yard opens.
 * A taken yard rests 2 hours, then the clan can take it again from the bottom (its count grows, the rewards come again).
 * No raid while a boss fight runs (and no boss fight while a raid fight runs).
 */
import { GameError, type Queryable } from "../db.ts";
import { gain, grantReward, itemQty, ledger, moscowDay, takeItem, takeMoney, type Ctx, type Granted } from "../core.ts";
import { clanLevelInfo } from "../../content/clans.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";
import { autoSpendTalents } from "./home.ts";
import { talentsForDamage } from "../../content/talents.ts";
import type { Config } from "../config.ts";
import { strike } from "./combat.ts";
import { isAdminPlayer } from "./fortune.ts";
import { weaponById } from "../../content/items.ts";
import { talentExtras } from "../../content/talents.ts";
import { weaponTalents } from "./home.ts";
import { craftBonus } from "./craft.ts";
import { yardReady } from "../../content/raids.ts";
import { ARMBANDS, CAMP_DEF_MAX, CAMP_JOIN_WAIT_MS, CAMP_LEVEL, CAMP_LOSS, CAMP_PROTECT_MS, CUT_HP_K, CUT_REWARD_K, FORTS, REBAR_FOR_LOSS, fortById, type RaidMode } from "../../content/raids.ts";
import { FLAG_IDS, RAID_BAG_PRICES, RAID_BAG_RUB, RAID_BAG_SETS, RAID_YARDS, buildingById, buildingHp, buildingReward, buildingTake, buildingWins, yardReward, type RaidYard } from "../../content/raids.ts";

export async function raidsOn(q: Queryable, pid: number, cfg: Config) {
  return cfg.raids.on || (await isAdminPlayer(q, pid, cfg));
}

async function myClan(q: Queryable, pid: number): Promise<number | null> {
  const [m] = await q.query<{ clan_id: number }>("SELECT clan_id FROM clan_members WHERE player_id=$1", [pid]);
  return m ? Number(m.clan_id) : null;
}

interface Hold { building_id: string; yard_id: string; clan_id: number; taken_at: Date; defense: number; protect_until: Date | null }
/** who holds each building (all the camps) */
async function holdsOf(q: Queryable) {
  const rows = await q.query<Hold>("SELECT building_id, yard_id, clan_id, taken_at, defense, protect_until FROM raid_holds");
  return new Map(rows.map((r) => [r.building_id, { ...r, clan_id: Number(r.clan_id), defense: Number(r.defense) }]));
}
type Holds = Awaited<ReturnType<typeof holdsOf>>;
/** the clan's wins over the buildings it is taking now */
async function winsOf(q: Queryable, clanId: number) {
  const rows = await q.query<{ building_id: string; wins: number; wins_cut: number; started_at: Date }>("SELECT building_id, wins, wins_cut, started_at FROM raid_progress WHERE clan_id=$1", [clanId]);
  return new Map(rows.map((r) => [r.building_id, { wins: Number(r.wins), cut: Number(r.wins_cut), from: new Date(r.started_at) }]));
}
/** the КПП (the first point) is every clan's own from the start */
const isGate = (y: RaidYard, buildingId: string) => y.buildings[0]?.id === buildingId;
const mine = (y: RaidYard, h: Holds, clanId: number | null, buildingId: string) => isGate(y, buildingId) || (!!clanId && h.get(buildingId)?.clan_id === clanId);
/** a building another clan holds can be attacked unless it is still protected or fully fortified */
const shielded = (hold: Hold | undefined, clanId: number | null, now: number) =>
  !!hold && hold.clan_id !== clanId && (hold.defense >= CAMP_DEF_MAX || (!!hold.protect_until && new Date(hold.protect_until).getTime() > now));
/** the building to attack in a camp now: the first one up the route the clan does not hold and can attack */
const targetOf = (y: RaidYard, h: Holds, clanId: number | null, now: number) =>
  y.buildings.find((b) => !mine(y, h, clanId, b.id) && !shielded(h.get(b.id), clanId, now)) ?? null;
const campDone = (y: RaidYard, h: Holds, clanId: number | null) => !!clanId && y.buildings.every((b) => mine(y, h, clanId, b.id));

/** a raid fight whose time is over is lost (like a boss fight: the damage done is gone) */
async function expireRaid(q: Queryable, pid: number, now: number) {
  await q.query("UPDATE raid_fights SET status='lost', ended_at=ends_at WHERE player_id=$1 AND status='active' AND ends_at <= $2", [pid, new Date(now)]);
}

export async function raidsView(q: Queryable, pid: number, now = Date.now()) {
  await expireRaid(q, pid, now);
  const clanId = await myClan(q, pid);
  const h = await holdsOf(q);
  const wins = clanId ? await winsOf(q, clanId) : new Map<string, { wins: number; cut: number; from: Date }>();
  const [me] = await q.query<{ role: string }>("SELECT role FROM clan_members WHERE player_id=$1", [pid]);
  const [f] = await q.query<{ id: number; building_id: string; hp_max: number; damage: number; hits: number; ends_at: Date | null; mode: string }>(
    "SELECT id, building_id, hp_max, damage, hits, ends_at, mode FROM raid_fights WHERE player_id=$1 AND status='active'", [pid]);
  const fl = await q.query<{ item_id: string; qty: number }>("SELECT item_id, qty FROM inventory WHERE player_id=$1 AND item_id = ANY($2)", [pid, FLAG_IDS]);
  const flags = FLAG_IDS.map((id) => Number(fl.find((r) => r.item_id === id)?.qty ?? 0));
  const setIds = RAID_BAG_SETS.map((sid) => TATTOO_SETS.find((x) => x.id === sid)!.pieces.map((p) => p.id));
  const ownT = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, setIds.flat()])).map((r) => r.item_id));
  const bags = setIds.map((ids) => ({ have: ids.filter((x) => ownT.has(x)).length, of: ids.length }));
  // the rating of every camp: the clans by their influence there
  const rating = await q.query<{ yard_id: string; clan_id: number; influence: number; name: string; tag: string; emblem: string; color: string }>(
    `SELECT i.yard_id, i.clan_id, i.influence, c.name, c.tag, c.emblem, c.color FROM raid_influence i JOIN clans c ON c.id = i.clan_id
     WHERE i.influence > 0 ORDER BY i.yard_id, i.influence DESC, i.clan_id`);
  const clans = await q.query<{ id: number; name: string; tag: string; emblem: string; color: string }>(
    "SELECT id, name, tag, emblem, color FROM clans WHERE id = ANY($1)", [[...new Set([...h.values()].map((x) => x.clan_id))]]);
  const clanOf = (id: number) => { const c = clans.find((x) => Number(x.id) === id); return c ? { id, name: c.name, tag: c.tag, emblem: c.emblem, color: c.color } : null; };
  const [c] = clanId ? await q.query<{ emblem: string; color: string; raid_xp: number; raid_camp: string | null; rebar: number }>("SELECT emblem, color, raid_xp, raid_camp, rebar FROM clans WHERE id=$1", [clanId]) : [];
  const level = c ? clanLevelInfo(Number(c.raid_xp)).level : 0;
  const claims = clanId ? await q.query<{ id: number; building_id: string; yard_id: string; whole: boolean; clan_xp: number; influence: number; flag: string; flags: number }>(
    "SELECT id, building_id, yard_id, whole, clan_xp, influence, flag, flags FROM raid_claims WHERE clan_id=$1 AND claimed_at IS NULL ORDER BY id", [clanId]) : [];
  return {
    clanId,
    leader: me?.role === "leader",
    level,
    /** the camp the clan is taking now (the leader's pick) */
    camp: c?.raid_camp ?? null,
    rebar: Number(c?.rebar ?? 0),
    flags,
    bags,
    clan: c ? { emblem: c.emblem, color: c.color } : null,
    claims: claims.map((x) => ({ id: Number(x.id), building: x.building_id, yard: x.yard_id, whole: x.whole, clanXp: Number(x.clan_xp), influence: Number(x.influence), flag: x.flag, flags: Number(x.flags) })),
    yards: RAID_YARDS.map((y) => {
      const t = targetOf(y, h, clanId, now);
      const rate = rating.filter((r) => r.yard_id === y.id);
      return {
        id: y.id,
        /** the clan's level opens it */
        open: yardReady(y) && level >= (CAMP_LEVEL[y.n - 1] ?? 99),
        needLevel: CAMP_LEVEL[y.n - 1] ?? 99,
        done: campDone(y, h, clanId),
        target: c?.raid_camp === y.id ? t?.id ?? null : null,
        influence: Number(rate.find((r) => Number(r.clan_id) === clanId)?.influence ?? 0),
        leader: rate[0] ? { id: Number(rate[0].clan_id), name: rate[0].name, tag: rate[0].tag, emblem: rate[0].emblem, color: rate[0].color, influence: Number(rate[0].influence) } : null,
        rating: rate.slice(0, 10).map((r) => ({ id: Number(r.clan_id), name: r.name, tag: r.tag, emblem: r.emblem, color: r.color, influence: Number(r.influence) })),
        buildings: y.buildings.map((b) => {
          const hd = h.get(b.id);
          const own = mine(y, h, clanId, b.id);
          return {
            id: b.id, wins: wins.get(b.id)?.wins ?? 0, need: buildingWins(y), taken: own,
            /** the clan that holds it (null: nobody, or the КПП) */
            holder: hd && !isGate(y, b.id) ? clanOf(hd.clan_id) : null,
            defense: hd ? hd.defense : 0,
            protectUntil: hd?.protect_until ? new Date(hd.protect_until).getTime() : 0,
            shielded: shielded(hd, clanId, now),
            claim: claims.find((x) => x.building_id === b.id)?.id ?? null,
          };
        }),
      };
    }),
    fight: f ? { id: Number(f.id), building: f.building_id, mode: f.mode as RaidMode, hp: Math.max(0, Number(f.hp_max) - Number(f.damage)), hpMax: Number(f.hp_max), hits: Number(f.hits),
      top: clanId ? (await q.query<{ player_id: number; name: string; damage: number }>(
        `SELECT r.player_id, p.display_name AS name, SUM(r.damage)::bigint AS damage FROM raid_fights r JOIN players p ON p.id = r.player_id
         WHERE r.clan_id=$1 AND r.building_id=$2 AND r.started_at > $3 GROUP BY r.player_id, p.display_name ORDER BY SUM(r.damage) DESC LIMIT 30`,
        [clanId, f.building_id, wins.get(f.building_id)?.from ?? new Date(0)],
      )).map((r) => ({ playerId: Number(r.player_id), name: r.name, damage: Number(r.damage) })) : [],
      endsAt: f.ends_at ? new Date(f.ends_at).getTime() : null } : null,
  };
}

async function guard(ctx: Ctx) {
  if (!(await raidsOn(ctx.q, ctx.pid, ctx.cfg))) throw new GameError("raids_off", "Лагеря пока закрыты");
  const clanId = await myClan(ctx.q, ctx.pid);
  if (!clanId) throw new GameError("no_clan", "Лагеря — только для бригады. Вступи в бригаду или создай свою");
  const [boss] = await ctx.q.query("SELECT 1 FROM fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (boss) throw new GameError("fight_running", "Сначала закончи бой с боссом");
  return clanId;
}
async function leaderOf(ctx: Ctx) {
  const [m] = await ctx.q.query<{ clan_id: number; role: string }>("SELECT clan_id, role FROM clan_members WHERE player_id=$1", [ctx.pid]);
  if (!m) throw new GameError("no_clan", "Ты не в бригаде");
  if (m.role !== "leader") throw new GameError("not_leader", "Это делает только бригадир");
  return Number(m.clan_id);
}

/** «Захватить» (the leader): the camp the clan takes now — one at a time */
export async function raidCamp(ctx: Ctx, yardId: string) {
  const clanId = await leaderOf(ctx);
  const y = RAID_YARDS.find((x) => x.id === yardId);
  if (!y || !yardReady(y)) throw new GameError("yard_closed", "Этот лагерь пока закрыт");
  const [c] = await ctx.q.query<{ raid_xp: number; raid_camp: string | null }>("SELECT raid_xp, raid_camp FROM clans WHERE id=$1", [clanId]);
  if (clanLevelInfo(Number(c.raid_xp)).level < (CAMP_LEVEL[y.n - 1] ?? 99)) throw new GameError("yard_closed", `Лагерь откроется с ${CAMP_LEVEL[y.n - 1]} уровня бригады`);
  if (c.raid_camp && c.raid_camp !== y.id) {
    const cur = RAID_YARDS.find((x) => x.id === c.raid_camp);
    if (cur && !campDone(cur, await holdsOf(ctx.q), clanId)) throw new GameError("camp_busy", `Бригада уже захватывает «${cur.name}»`);
  }
  await ctx.q.query("UPDATE clans SET raid_camp=$2 WHERE id=$1", [clanId, y.id]);
  return raidsView(ctx.q, ctx.pid, ctx.now);
}

/** «Атаковать актив» / «Вырезать всех»: a fight with the clan's current building of its camp */
export async function raidStart(ctx: Ctx, buildingId: string, mode: RaidMode = "active") {
  const clanId = await guard(ctx);
  const found = buildingById(buildingId);
  if (!found) throw new GameError("bad_request", "Нет такого здания", 400);
  const { yard: y, b } = found;
  await expireRaid(ctx.q, ctx.pid, ctx.now);
  const [active] = await ctx.q.query<{ building_id: string }>("SELECT building_id FROM raid_fights WHERE player_id=$1 AND status='active'", [ctx.pid]);
  if (active) {
    if (active.building_id === b.id) return { building: b.id, already: true, ...(await raidsView(ctx.q, ctx.pid, ctx.now)) };
    throw new GameError("raid_running", "Сначала закончи бой за другое здание");
  }
  const [c] = await ctx.q.query<{ raid_camp: string | null }>("SELECT raid_camp FROM clans WHERE id=$1", [clanId]);
  if (c?.raid_camp !== y.id) throw new GameError("not_camp", "Бригада сейчас захватывает другой лагерь — его выбирает бригадир");
  const h = await holdsOf(ctx.q);
  if (targetOf(y, h, clanId, ctx.now)?.id !== b.id) throw new GameError("not_target", "Сначала захватите здания пониже");
  const holder = h.get(b.id);
  if (mode === "cut" && (!holder || holder.clan_id === clanId)) throw new GameError("bad_mode", "Вырезать некого — здание ничьё");
  const clockMin = talentExtras(await weaponTalents(ctx.q, ctx.pid)).clockMin + (await craftBonus(ctx.q, ctx.pid)).clock;
  await ctx.q.query(
    "INSERT INTO raid_fights (player_id, clan_id, yard_id, building_id, hp_max, started_at, ends_at, mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [ctx.pid, clanId, y.id, b.id, buildingHp(b) * (mode === "cut" ? CUT_HP_K : 1), new Date(ctx.now), new Date(ctx.now + ctx.cfg.fight.hours * 3600_000 + clockMin * 60_000), mode]);
  return { building: b.id, ...(await raidsView(ctx.q, ctx.pid, ctx.now)) };
}

/** a hit with a weapon in the raid fight; the building falls — the win, the clan's count, maybe the building and the camp */
export async function raidAttack(ctx: Ctx, weaponId: string, want = 1, rush = false) {
  const clanId = await guard(ctx);
  await expireRaid(ctx.q, ctx.pid, ctx.now);
  const w = weaponById(weaponId);
  if (!w) throw new GameError("bad_weapon", "Этим не повоюешь");
  if (!Number.isInteger(want) || want < 1 || want > 1000) throw new GameError("bad_count", "Можно бить по 1, 10, 100 или 1000");
  const [f] = await ctx.q.query<{ id: number; yard_id: string; building_id: string; hp_max: number; damage: number; mode: string }>(
    "SELECT id, yard_id, building_id, hp_max, damage, mode FROM raid_fights WHERE player_id=$1 AND status='active' FOR UPDATE", [ctx.pid]);
  if (!f) throw new GameError("no_fight", "Время боя вышло или бой не начат — нажми «Атаковать»");
  const hit = await strike(ctx, w, w.weapon.kind === "consumable" ? want : 1, `raid:${f.building_id}`, rush);
  const damage = Number(f.damage) + hit.damage;
  await ctx.q.query("UPDATE raid_fights SET damage=$2, hits = hits + $3 WHERE id=$1", [f.id, damage, hit.count]);
  const [st] = await ctx.q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [ctx.pid]);
  const before = Number(st?.total_damage ?? 0);
  const talentDamage = before + hit.damage;
  const talentsGained = talentsForDamage(talentDamage) - talentsForDamage(before);
  await ctx.q.query("UPDATE player_stats SET total_damage = total_damage + $2 WHERE player_id=$1", [ctx.pid, hit.damage]);
  await gain(ctx, "damage", hit.damage);
  if (talentsGained > 0) {
    await ctx.q.query("UPDATE players SET talents = talents + $2 WHERE id=$1", [ctx.pid, talentsGained]);
    await ledger(ctx, "talent", "talent", talentsGained, `raid:${f.building_id}`);
    await autoSpendTalents(ctx);
  }
  const base = { weapon: w.id, damage: hit.damage, crit: hit.crit, crits: hit.crits, count: hit.count, left: hit.left, readyAt: hit.readyAt, phrase: hit.phrases[hit.phraseIdx] ?? "", talentDamage, talentsGained, fightDamage: damage };
  if (damage < Number(f.hp_max)) return { ...base, status: "active" as const, hp: Number(f.hp_max) - damage, hpMax: Number(f.hp_max) };

  // the building is down: the player's reward, the clan's win
  const { yard: y, b } = buildingById(f.building_id)!;
  const cut = f.mode === "cut";
  await ctx.q.query("UPDATE raid_fights SET status='won', ended_at=$2 WHERE id=$1", [f.id, new Date(ctx.now)]);
  const per = buildingReward(y.n, b);
  const k = cut ? CUT_REWARD_K : 1;
  const reward = await grantReward(ctx, { xp: Math.round(per.xp * k), currencies: { PAP: Math.round(per.pap * k) } }, `raid_win:${b.id}`);
  let buildingTaken = false, yardTaken = false;
  const h0 = await holdsOf(ctx.q);
  const won = () => ({ ...base, status: "won" as const, hp: 0, hpMax: Number(f.hp_max), reward, buildingTaken, yardTaken });
  // taken by the clan meanwhile, or shielded since: the win's own reward only
  if (mine(y, h0, clanId, b.id) || shielded(h0.get(b.id), clanId, ctx.now)) return { ...won(), view: await raidsView(ctx.q, ctx.pid, ctx.now) };
  const [pr] = await ctx.q.query<{ wins: number; wins_cut: number; started_at: Date }>(
    `INSERT INTO raid_progress (clan_id, building_id, wins, wins_cut, started_at) VALUES ($1,$2,1,$3,$4)
     ON CONFLICT (clan_id, building_id) DO UPDATE SET wins = raid_progress.wins + 1, wins_cut = raid_progress.wins_cut + EXCLUDED.wins_cut
     RETURNING wins, wins_cut, started_at`, [clanId, b.id, cut ? 1 : 0, new Date(ctx.now)]);
  if (Number(pr.wins) >= buildingWins(y)) {
    buildingTaken = true;
    const cutMost = Number(pr.wins_cut) * 2 > Number(pr.wins);
    const prev = h0.get(b.id);
    await ctx.q.query(
      `INSERT INTO raid_holds (building_id, yard_id, clan_id, taken_at, defense, protect_until) VALUES ($1,$2,$3,$4,0,$5)
       ON CONFLICT (building_id) DO UPDATE SET clan_id=EXCLUDED.clan_id, taken_at=EXCLUDED.taken_at, defense=0, protect_until=EXCLUDED.protect_until`,
      [b.id, y.id, clanId, new Date(ctx.now), new Date(ctx.now + CAMP_PROTECT_MS)]);
    await ctx.q.query("DELETE FROM raid_progress WHERE building_id=$1", [b.id]);
    // the clan it was taken from: 2% of its influence there, rebar when it was taken by «Атаковать актив», the news
    if (prev && prev.clan_id !== clanId) {
      await ctx.q.query("UPDATE raid_influence SET influence = influence - FLOOR(influence * $3::float8)::bigint WHERE clan_id=$1 AND yard_id=$2", [prev.clan_id, y.id, CAMP_LOSS]);
      if (!cutMost) await ctx.q.query("UPDATE clans SET rebar = rebar + $2 WHERE id=$1", [prev.clan_id, REBAR_FOR_LOSS]);
      await ctx.q.query("INSERT INTO clan_events (clan_id, at, kind, other_clan, yard_id, building_id) VALUES ($1,$2,'lost',$3,$4,$5)",
        [prev.clan_id, new Date(ctx.now), clanId, y.id, b.id]);
      if (prev.clan_id && cutMost) { /* «Вырезать всех»: no rebar for the losers */ }
    }
    // the reward waits for the leader (the medal on the building): everyone who won over it, a member for an hour at least
    const t = buildingTake(y.n, b);
    const players = await winners(ctx, clanId, y.id, b.id, new Date(pr.started_at));
    await ctx.q.query(
      "INSERT INTO raid_claims (clan_id, yard_id, building_id, at, whole, clan_xp, influence, flag, flags, players) VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,$9)",
      [clanId, y.id, b.id, new Date(ctx.now), Math.round(t.clanXp * (cutMost ? CUT_REWARD_K : 1)), Math.round(t.influence * (cutMost ? CUT_REWARD_K : 1)), t.flag, t.flags, players]);
    const h1 = await holdsOf(ctx.q);
    if (campDone(y, h1, clanId)) {
      // the main building: the whole camp — its bonus on top, and the leader may pick the next camp
      yardTaken = true;
      const yr = yardReward(y.n);
      const all = await winners(ctx, clanId, y.id, null, new Date(0));
      await ctx.q.query(
        "INSERT INTO raid_claims (clan_id, yard_id, building_id, at, whole, clan_xp, influence, flag, flags, players) VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9)",
        [clanId, y.id, b.id, new Date(ctx.now), yr.clanXp, yr.influence, yr.flag, yr.flags, all]);
      await ctx.q.query(
        `INSERT INTO raid_yards (clan_id, yard_id, taken_at, times) VALUES ($1,$2,$3,1)
         ON CONFLICT (clan_id, yard_id) DO UPDATE SET taken_at = EXCLUDED.taken_at, times = raid_yards.times + 1`, [clanId, y.id, new Date(ctx.now)]);
    }
  }
  return { ...won(), view: await raidsView(ctx.q, ctx.pid, ctx.now) };
}

/** the members who won a fight over this building (null: any of the camp) since `from`, in the clan an hour at least by now */
async function winners(ctx: Ctx, clanId: number, yardId: string, buildingId: string | null, from: Date) {
  const rows = await ctx.q.query<{ player_id: number }>(
    `SELECT DISTINCT f.player_id FROM raid_fights f JOIN clan_members m ON m.player_id = f.player_id AND m.clan_id = f.clan_id
     WHERE f.clan_id=$1 AND f.yard_id=$2 AND f.status='won' AND f.ended_at >= $3 AND ($4::text IS NULL OR f.building_id = $4) AND m.joined_at <= $5`,
    [clanId, yardId, from, buildingId, new Date(ctx.now - CAMP_JOIN_WAIT_MS)]);
  return rows.map((r) => Number(r.player_id));
}

/** the medal on a taken building (the leader): the clan's experience, the influence, the armbands to the winners */
export async function raidClaim(ctx: Ctx, claimId: number) {
  const clanId = await leaderOf(ctx);
  const [c] = await ctx.q.query<{ id: number; yard_id: string; building_id: string; whole: boolean; clan_xp: number; influence: number; flag: string; flags: number; players: number[] }>(
    "UPDATE raid_claims SET claimed_at=$3 WHERE id=$1 AND clan_id=$2 AND claimed_at IS NULL RETURNING id, yard_id, building_id, whole, clan_xp, influence, flag, flags, players",
    [claimId, clanId, new Date(ctx.now)]);
  if (!c) throw new GameError("claim_none", "Награда уже собрана");
  await ctx.q.query("UPDATE clans SET raid_xp = raid_xp + $2 WHERE id=$1", [clanId, Number(c.clan_xp)]);
  await addInfluence(ctx, clanId, c.yard_id, c.whole ? null : c.building_id, Number(c.influence), c.whole ? "yard" : "take");
  const members = new Set((await ctx.q.query<{ player_id: number }>("SELECT player_id FROM clan_members WHERE clan_id=$1", [clanId])).map((r) => Number(r.player_id)));
  let mineGot: Granted | null = null;
  for (const pid of (c.players ?? []).map(Number)) {
    if (!members.has(pid)) continue;
    const g = await grantReward({ ...ctx, pid }, { items: [{ id: c.flag, qty: Number(c.flags) }] }, `raid_claim:${c.id}`);
    if (pid === ctx.pid) mineGot = g;
  }
  return { ...(await raidsView(ctx.q, ctx.pid, ctx.now)), claim: Number(c.id), building: c.building_id, yard: c.yard_id, whole: c.whole, clanXp: Number(c.clan_xp), influence: Number(c.influence), flag: c.flag, armbands: Number(c.flags), players: (c.players ?? []).length, got: mineGot };
}

/** a barricade on the clan's building: defense points (to CAMP_DEF_MAX — then it cannot be taken) and the clan's experience */
export async function raidFort(ctx: Ctx, buildingId: string, kind: string) {
  const clanId = await myClan(ctx.q, ctx.pid);
  if (!clanId) throw new GameError("no_clan", "Ты не в бригаде");
  const fort = fortById(kind);
  if (!fort) throw new GameError("bad_request", "Нет такого", 400);
  const [hd] = await ctx.q.query<{ clan_id: number; defense: number }>("SELECT clan_id, defense FROM raid_holds WHERE building_id=$1 FOR UPDATE", [buildingId]);
  if (!hd || Number(hd.clan_id) !== clanId) throw new GameError("not_ours", "Укреплять можно только здание своей бригады");
  if (Number(hd.defense) >= CAMP_DEF_MAX) throw new GameError("fort_full", "Здание укреплено полностью");
  if (fort.perDay) {
    const day = moscowDay(ctx.now);
    const [r] = await ctx.q.query<{ n: number }>(
      `INSERT INTO raid_fort (player_id, day, kind, n) VALUES ($1,$2,$3,1) ON CONFLICT (player_id, day, kind) DO UPDATE SET n = raid_fort.n + 1 RETURNING n`, [ctx.pid, day, fort.id]);
    if (Number(r.n) > fort.perDay) throw new GameError("fort_limit", `${fort.name}: на сегодня всё (${fort.perDay} в день)`);
  }
  if (fort.rub) await takeMoney(ctx, "RUB", fort.rub, `raid_fort:${fort.id}`);
  if (fort.clan) {
    const [ok] = await ctx.q.query("UPDATE clans SET rebar = rebar - 1 WHERE id=$1 AND rebar > 0 RETURNING rebar", [clanId]);
    if (!ok) throw new GameError("no_rebar", "Арматуры нет — её дают, когда враг отбивает ваше здание «Атакой актива»");
  }
  const add = Math.min(fort.def, CAMP_DEF_MAX - Number(hd.defense));
  await ctx.q.query("UPDATE raid_holds SET defense = defense + $2 WHERE building_id=$1", [buildingId, add]);
  await ctx.q.query("UPDATE clans SET raid_xp = raid_xp + $2 WHERE id=$1", [clanId, add * 2]);
  return { building: buildingId, kind: fort.id, defense: Number(hd.defense) + add, clanXp: add * 2, ...(await raidsView(ctx.q, ctx.pid, ctx.now)) };
}

/** the barricade's day: how many free steps of each kind I have left today */
export async function fortLeft(q: Queryable, pid: number, now: number) {
  const rows = await q.query<{ kind: string; n: number }>("SELECT kind, n FROM raid_fort WHERE player_id=$1 AND day=$2", [pid, moscowDay(now)]);
  return Object.fromEntries(FORTS.filter((f) => f.perDay).map((f) => [f.id, Math.max(0, f.perDay! - Number(rows.find((r) => r.kind === f.id)?.n ?? 0))]));
}

/**
 * The clan's influence in a yard grows; the event goes to its «События». If another clan leads that yard, it hears
 * that an enemy crew threatens it (once a building: «Вражеская бригада угрожает захватом нашего двора»).
 */
async function addInfluence(ctx: Ctx, clanId: number, yardId: string, buildingId: string | null, amount: number, kind: "take" | "yard") {
  const [lead] = await ctx.q.query<{ clan_id: number }>(
    "SELECT clan_id FROM raid_influence WHERE yard_id=$1 AND influence > 0 ORDER BY influence DESC, clan_id LIMIT 1", [yardId]);
  await ctx.q.query(
    `INSERT INTO raid_influence (clan_id, yard_id, influence) VALUES ($1,$2,$3)
     ON CONFLICT (clan_id, yard_id) DO UPDATE SET influence = raid_influence.influence + EXCLUDED.influence`, [clanId, yardId, amount]);
  await ctx.q.query("INSERT INTO clan_events (clan_id, at, kind, player_id, yard_id, building_id, amount) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [clanId, new Date(ctx.now), kind, ctx.pid, yardId, buildingId, amount]);
  if (lead && Number(lead.clan_id) !== clanId) {
    await ctx.q.query("INSERT INTO clan_events (clan_id, at, kind, other_clan, yard_id, building_id) VALUES ($1,$2,'threat',$3,$4,$5)",
      [Number(lead.clan_id), new Date(ctx.now), clanId, yardId, buildingId]);
  }
}

/** «События» of a clan: its influence in every yard and the latest events (members only) */
export async function clanEvents(q: Queryable, clanId: number) {
  const inf = await q.query<{ yard_id: string; influence: number }>("SELECT yard_id, influence FROM raid_influence WHERE clan_id=$1", [clanId]);
  const ev = await q.query<{ id: number; at: Date; kind: string; player: string | null; other: string | null; yard_id: string | null; building_id: string | null; amount: number }>(
    `SELECT e.id, e.at, e.kind, p.display_name AS player, oc.name AS other, e.yard_id, e.building_id, e.amount
     FROM clan_events e LEFT JOIN players p ON p.id = e.player_id LEFT JOIN clans oc ON oc.id = e.other_clan
     WHERE e.clan_id=$1 ORDER BY e.at DESC, e.id DESC LIMIT 60`, [clanId]);
  return {
    influence: RAID_YARDS.map((y) => ({ yard: y.id, name: y.name, influence: Number(inf.find((r) => r.yard_id === y.id)?.influence ?? 0) })),
    events: ev.map((e) => ({ id: Number(e.id), at: new Date(e.at).getTime(), kind: e.kind, player: e.player, other: e.other, yard: e.yard_id, building: e.building_id, amount: Number(e.amount) })),
  };
}

/** «Сумки за флаги»: the bag of yard n for RAID_BAG_PRICES[n-1] of its flags — a piece of its set not owned yet (or roubles) */
export async function raidBagOpen(ctx: Ctx, n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new GameError("bad_request", "Нет такой сумки", 400);
  const flag = FLAG_IDS[n - 1];
  const price = RAID_BAG_PRICES[n - 1];
  if ((await itemQty(ctx.q, ctx.pid, flag)) < price) throw new GameError("raid_no_flags", `Нужно ${price} повязок «${ARMBANDS[n - 1]}»`);
  await takeItem(ctx, flag, price, `raid_bag:${n}`);
  const set = TATTOO_SETS.find((s) => s.id === RAID_BAG_SETS[n - 1])!;
  const all = set.pieces.map((p) => p.id);
  const own = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, all])).map((x) => x.item_id));
  const left = all.filter((x) => !own.has(x));
  const tattoo = left.length ? left[Math.floor(ctx.rng() * left.length) % left.length] : null;
  const reward = await grantReward(ctx, tattoo ? { items: [{ id: tattoo, qty: 1 }] } : { currencies: { RUB: RAID_BAG_RUB * n } }, `raid_bag:${n}`);
  return { bag: n, tattoo, reward, ...(await raidsView(ctx.q, ctx.pid, ctx.now)) };
}

/** leave the raid fight (the damage done is lost) */
export async function raidFlee(ctx: Ctx) {
  await ctx.q.query("UPDATE raid_fights SET status='fled', ended_at=$2 WHERE player_id=$1 AND status='active'", [ctx.pid, new Date(ctx.now)]);
  return raidsView(ctx.q, ctx.pid, ctx.now);
}

