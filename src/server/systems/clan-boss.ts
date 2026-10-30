import { autoSpendTalents } from "./home.ts";
import { GameError, type Queryable } from "../db.ts";
import { ledger, nextWeekAt, weekKey, weekStart, type Ctx } from "../core.ts";
import { weaponById } from "../../content/items.ts";
import { bossById } from "../../content/bosses.ts";
import { talentsForDamage } from "../../content/talents.ts";
import {
  CLAN_BOSS_FLOOR, CLAN_BOSS_HP_PER_MEMBER, CLAN_BOSS_MIN_MEMBERS, CLAN_BOSS_POOL_PER_MEMBER, CLAN_BOSS_ROTATION,
} from "../../content/clans.ts";
import { BATCH_SIZES, strike } from "./combat.ts";
import type { Reward } from "../../content/rewards.ts";

/* The clan boss of the week (content/clans.ts): one copy per clan, hit by its members, prizes by share when it falls. */

const WEEK_MS = 7 * 24 * 3600_000;
/** which boss comes this week: the rotation goes on week after week */
export function clanBossOfWeek(now: number): string {
  const n = Math.floor(weekStart(now) / WEEK_MS);
  return CLAN_BOSS_ROTATION[((n % CLAN_BOSS_ROTATION.length) + CLAN_BOSS_ROTATION.length) % CLAN_BOSS_ROTATION.length];
}

async function myClan(q: Queryable, pid: number): Promise<number | null> {
  const [p] = await q.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [pid]);
  return p?.clan_id ?? null;
}
async function members(q: Queryable, clanId: number): Promise<number> {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM players WHERE clan_id=$1", [clanId]);
  return Number(r?.n ?? 0);
}

/** what one hitter gets: his share of the pool (the pool grows with the clan's size), at least the floor */
export function clanBossPrize(share: number, clanSize: number): Reward {
  const n = Math.max(CLAN_BOSS_MIN_MEMBERS, clanSize);
  const P = CLAN_BOSS_POOL_PER_MEMBER;
  const rub = Math.max(CLAN_BOSS_FLOOR.RUB, Math.round(P.RUB * n * share));
  const usd = Math.round(P.USD * n * share);
  const chips = Math.max(CLAN_BOSS_FLOOR.chips, Math.round(P.chips * n * share));
  const gpu = Math.floor(P.gpu * n * share);
  const items = [{ id: "poker-chip", qty: chips }, ...(gpu > 0 ? [{ id: "gpu", qty: gpu }] : [])];
  return { currencies: { RUB: rub, ...(usd > 0 ? { USD: usd } : {}) }, items };
}

export async function clanBossView(q: Queryable, pid: number, now: number) {
  const clanId = await myClan(q, pid);
  if (!clanId) return null;
  const week = weekKey(now);
  const [b] = await q.query<{ boss_id: string; hp_max: number; damage: number; killed_at: Date | null; killer_id: number | null }>(
    "SELECT boss_id, hp_max, damage, killed_at, killer_id FROM clan_boss WHERE clan_id=$1 AND week=$2", [clanId, week]);
  const size = await members(q, clanId);
  const bossId = b?.boss_id ?? clanBossOfWeek(now);
  const hpMax = b ? Number(b.hp_max) : CLAN_BOSS_HP_PER_MEMBER * Math.max(CLAN_BOSS_MIN_MEMBERS, size);
  const damage = b ? Number(b.damage) : 0;
  const top = await q.query<{ player_id: number; display_name: string; photo_url: string | null; damage: number; hits: number }>(
    `SELECT h.player_id, p.display_name, p.photo_url, h.damage, h.hits FROM clan_boss_hits h JOIN players p ON p.id = h.player_id
     WHERE h.clan_id=$1 AND h.week=$2 ORDER BY h.damage DESC, h.player_id LIMIT 30`, [clanId, week]);
  return {
    clanId, week, bossId, hpMax, hp: Math.max(0, hpMax - damage), killed: !!b?.killed_at, endsAt: nextWeekAt(now), size,
    top: top.map((r) => ({ id: r.player_id, name: r.display_name, photo: r.photo_url, damage: Number(r.damage), hits: Number(r.hits), share: damage > 0 ? Number(r.damage) / Math.max(damage, 1) : 0 })),
    pool: clanBossPrize(1, size),
  };
}

/** A hit at the clan boss with a weapon (×1/×10/… for the consumables). The killing hit hands the prizes out. */
export async function hitClanBoss(ctx: Ctx, weaponId: string, want = 1) {
  const w = weaponById(weaponId);
  if (!w) throw new GameError("bad_weapon", "Этим нельзя бить босса");
  if (!(BATCH_SIZES as readonly number[]).includes(want)) throw new GameError("bad_count", "Можно бить по 1, 10, 100 или 1000");
  if (want > 1 && w.weapon.kind !== "consumable") throw new GameError("bad_count", `${w.name} бьёт только по одному разу`);
  const clanId = await myClan(ctx.q, ctx.pid);
  if (!clanId) throw new GameError("no_clan", "Клановый босс — только для участников клана");
  const week = weekKey(ctx.now);
  // the week's copy appears with the first hit (HP by the clan's size then); one hit at a time per clan
  const size = await members(ctx.q, clanId);
  await ctx.q.query(
    "INSERT INTO clan_boss (clan_id, week, boss_id, hp_max) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [clanId, week, clanBossOfWeek(ctx.now), CLAN_BOSS_HP_PER_MEMBER * Math.max(CLAN_BOSS_MIN_MEMBERS, size)],
  );
  const [b] = await ctx.q.query<{ boss_id: string; hp_max: number; damage: number; killed_at: Date | null }>(
    "SELECT boss_id, hp_max, damage, killed_at FROM clan_boss WHERE clan_id=$1 AND week=$2 FOR UPDATE", [clanId, week]);
  if (b.killed_at) throw new GameError("clan_boss_down", "Босс этой недели уже повержен — новый придёт в понедельник");
  const hit = await strike(ctx, w, want, `clan-boss:${week}`);
  const total = Number(b.damage) + hit.damage;
  const killed = total >= Number(b.hp_max);
  await ctx.q.query("UPDATE clan_boss SET damage=$3, killed_at=$4, killer_id=$5 WHERE clan_id=$1 AND week=$2",
    [clanId, week, total, killed ? new Date(ctx.now) : null, killed ? ctx.pid : null]);
  await ctx.q.query(
    `INSERT INTO clan_boss_hits (clan_id, week, player_id, damage, hits) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (clan_id, week, player_id) DO UPDATE SET damage = clan_boss_hits.damage + EXCLUDED.damage, hits = clan_boss_hits.hits + EXCLUDED.hits`,
    [clanId, week, ctx.pid, hit.damage, hit.count]);
  // the damage counts for the talents like any boss damage
  const [st] = await ctx.q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [ctx.pid]);
  const before = Number(st?.total_damage ?? 0);
  const gained = talentsForDamage(before + hit.damage) - talentsForDamage(before);
  await ctx.q.query("UPDATE player_stats SET total_damage = total_damage + $2 WHERE player_id=$1", [ctx.pid, hit.damage]);
  if (gained > 0) {
    await ctx.q.query("UPDATE players SET talents = talents + $2 WHERE id=$1", [ctx.pid, gained]);
    await ledger(ctx, "talent", "talent", gained, `clan-boss:${week}`);
    await autoSpendTalents(ctx);
  }
  if (killed) {
    // everyone who hit it: a prize by the share of the damage (collected from the prize window, like the weekly ones)
    const hitters = await ctx.q.query<{ player_id: number; damage: number }>("SELECT player_id, damage FROM clan_boss_hits WHERE clan_id=$1 AND week=$2", [clanId, week]);
    const name = bossById(b.boss_id)?.name ?? "Босс";
    for (const h of hitters) {
      const share = Number(h.damage) / Math.max(1, total);
      await ctx.q.query("INSERT INTO prizes (player_id, title, reward, created_at) VALUES ($1,$2,$3,$4)", [
        h.player_id, `Клановый босс ${name} повержен · твой вклад ${Math.round(share * 1000) / 10}%`, JSON.stringify(clanBossPrize(share, size)), new Date(ctx.now),
      ]);
    }
  }
  return { damage: hit.damage, crit: hit.crit, count: hit.count, left: hit.left, readyAt: hit.readyAt, phrase: hit.phrases[hit.phraseIdx], killed, talentsGained: gained, boss: await clanBossView(ctx.q, ctx.pid, ctx.now) };
}
