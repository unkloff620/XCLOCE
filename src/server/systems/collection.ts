import type { Queryable } from "../db.ts";
import { BOSSES, CASE_WINS, bossById, bossSetItems } from "../../content/bosses.ts";
import { MEDAL_SET, medalBonus, medalWeapon, type MedalTier } from "../../content/medals.ts";

/*
 * Boss sets and «Дела»:
 *  - a set: every thing of a boss's wear list owned (worn or just lying in the inventory) adds his set's flat damage to
 *    one weapon (BossDef.set) — summed over all bosses whose set is complete;
 *  - «Дело №N»: a page per boss — wins over him, the best single hit, his things (owned / opened in the shop / not yet),
 *    the set bonus; the case is closed with CASE_WINS wins and the whole set owned.
 */

async function owned(q: Queryable, pid: number): Promise<Set<string>> {
  const ids = BOSSES.flatMap((b) => b.wear?.items ?? []);
  if (!ids.length) return new Set();
  const rows = await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, ids]);
  return new Set(rows.map((r) => r.item_id));
}

/** flat damage per weapon from the complete boss sets */
export async function setBonuses(q: Queryable, pid: number): Promise<Record<string, number>> {
  const have = await owned(q, pid);
  const out: Record<string, number> = {};
  for (const b of BOSSES) {
    const items = bossSetItems(b);
    if (!b.set || !items.length || !items.every((id) => have.has(id))) continue;
    out[b.set.weapon] = (out[b.set.weapon] ?? 0) + b.set.damage;
  }
  // full sets of boss medals: MEDAL_SET of one kind add that kind's bonus to the boss's weapon
  const full = await q.query<{ boss_id: string; tier: MedalTier }>("SELECT boss_id, tier FROM boss_medals WHERE player_id=$1 AND n >= $2", [pid, MEDAL_SET]);
  for (const m of full) {
    const b = bossById(m.boss_id);
    if (!b) continue;
    const w = medalWeapon(b);
    out[w] = (out[w] ?? 0) + medalBonus(b, m.tier);
  }
  return out;
}

/** every boss's case for this player */
export async function casesView(q: Queryable, pid: number) {
  const have = await owned(q, pid);
  const opened = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM player_unlocks WHERE player_id=$1", [pid])).map((r) => r.item_id));
  const wins = new Map((await q.query<{ boss_id: string; wins: number; damage: number }>("SELECT boss_id, wins, damage FROM boss_damage WHERE player_id=$1", [pid]))
    .map((r) => [r.boss_id, { wins: Number(r.wins), damage: Number(r.damage) }]));
  const best = new Map((await q.query<{ boss_id: string; best: number }>("SELECT boss_id, MAX(damage)::int AS best FROM boss_hits WHERE player_id=$1 GROUP BY boss_id", [pid]))
    .map((r) => [r.boss_id, Number(r.best)]));
  return BOSSES.map((b) => {
    const things = (b.wear?.items ?? []).map((id) => ({ id, owned: have.has(id), opened: have.has(id) || opened.has(id) }));
    const set = b.set && things.length ? { weapon: b.set.weapon, damage: b.set.damage, have: things.filter((t) => t.owned).length, total: things.length } : null;
    const w = wins.get(b.id) ?? { wins: 0, damage: 0 };
    return {
      id: b.id, wins: w.wins, damage: w.damage, bestHit: best.get(b.id) ?? 0, things, set,
      closed: w.wins >= CASE_WINS && things.every((t) => t.owned),
    };
  });
}
