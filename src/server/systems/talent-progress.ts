import type { Queryable } from "../db.ts";
import { ledger, type Ctx } from "../core.ts";
import { talentThreshold, talentsForDamage } from "../../content/talents.ts";
import { autoSpendTalents } from "./home.ts";

/*
 * The talent counter (player_stats.talent_damage): the damage that earns talents. It grows with every hit at a boss,
 * a clan boss or a raid building. Without «Общак» the part gathered toward the next talent is lost when a fight
 * ends (the counter goes back to the last talent's mark); with «Общак» it stays and the next fight goes on with it.
 * player_stats.total_damage stays the all-time damage (the profile, the tops, the clans).
 */

async function hasObshak(q: Queryable, pid: number, now: number): Promise<boolean> {
  const [r] = await q.query<{ until: Date }>("SELECT until FROM obshak WHERE player_id=$1", [pid]);
  return !!r && new Date(r.until).getTime() > now;
}

export async function talentDamageOf(q: Queryable, pid: number): Promise<number> {
  const [st] = await q.query<{ talent_damage: number }>("SELECT talent_damage FROM player_stats WHERE player_id=$1", [pid]);
  return Number(st?.talent_damage ?? 0);
}

/** add a hit's damage to the talent counter and hand out the talents it earned */
export async function addTalentDamage(ctx: Ctx, damage: number, ref: string): Promise<{ talentDamage: number; talentsGained: number }> {
  const before = await talentDamageOf(ctx.q, ctx.pid);
  const talentDamage = before + damage;
  const talentsGained = talentsForDamage(talentDamage) - talentsForDamage(before);
  await ctx.q.query("UPDATE player_stats SET talent_damage = talent_damage + $2 WHERE player_id=$1", [ctx.pid, damage]);
  if (talentsGained > 0) {
    await ctx.q.query("UPDATE players SET talents = talents + $2 WHERE id=$1", [ctx.pid, talentsGained]);
    await ledger(ctx, "talent", "talent", talentsGained, ref);
    await autoSpendTalents(ctx);
  }
  return { talentDamage, talentsGained };
}

/** a fight is over: without «Общак» the damage toward the next talent is lost */
export async function fightOverTalents(q: Queryable, pid: number, now: number): Promise<void> {
  if (await hasObshak(q, pid, now)) return;
  const dmg = await talentDamageOf(q, pid);
  const mark = talentThreshold(talentsForDamage(dmg));
  if (mark < dmg) await q.query("UPDATE player_stats SET talent_damage = $2 WHERE player_id=$1", [pid, mark]);
}
