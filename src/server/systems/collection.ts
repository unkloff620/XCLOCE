import type { Queryable } from "../db.ts";
import { tattooSetsOfBoss } from "../../content/tattoos.ts";
import { BOSSES, CASE_WINS, EVENT_FIGHTS, bossById, bossSetItems } from "../../content/bosses.ts";
import { TATTOO_IDS, TATTOO_SETS, bonusPieces, setBonusList, partBonus } from "../../content/tattoos.ts";
import { craftBonus } from "./craft.ts";

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
  // the chain's bosses and the event ones (the mentors' things: Химик's flask and coat, Псих's knife)
  for (const b of [...BOSSES, ...EVENT_FIGHTS]) {
    const items = bossSetItems(b);
    if (!b.set || !items.length) continue;
    // every thing owned adds its share at once (content/tattoos.ts partBonus)
    const n = items.filter((id) => have.has(id)).length;
    if (!n) continue;
    out[b.set.weapon] = (out[b.set.weapon] ?? 0) + partBonus(b.set.damage, n, items.length);
    if (b.set.also) out[b.set.also.weapon] = (out[b.set.also.weapon] ?? 0) + partBonus(b.set.also.damage, n, items.length);
  }
  // tattoo sets: every piece owned (inked or not) adds its share of the set's bonus
  const ink = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, TATTOO_IDS])).map((r) => r.item_id));
  for (const s of TATTOO_SETS) {
    const ps = bonusPieces(s), n = ps.filter((p) => ink.has(p.id)).length;
    if (n) for (const b of setBonusList(s)) out[b.weapon] = (out[b.weapon] ?? 0) + partBonus(b.damage, n, ps.length);
  }
  for (const [w, v] of Object.entries((await craftBonus(q, pid)).dmg)) out[w] = (out[w] ?? 0) + v;
  return out;
}

/** every boss's case for this player */
export async function casesView(q: Queryable, pid: number) {
  const have = await owned(q, pid);
  const opened = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM player_unlocks WHERE player_id=$1", [pid])).map((r) => r.item_id));
  const wins = new Map((await q.query<{ boss_id: string; wins: number; damage: number }>("SELECT boss_id, wins, damage FROM boss_damage WHERE player_id=$1", [pid]))
    .map((r) => [r.boss_id, { wins: Number(r.wins), damage: Number(r.damage) }]));
  const best = new Map((await q.query<{ boss_id: string; best: number }>("SELECT boss_id, MAX(damage)::int AS best FROM boss_hits WHERE player_id=$1 AND weapon <> 'needle' GROUP BY boss_id", [pid]))
    .map((r) => [r.boss_id, Number(r.best)]));
  const ink = new Set((await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id LIKE 'tat-%'", [pid])).map((r) => r.item_id));
  return [...BOSSES, ...EVENT_FIGHTS].map((b) => {
    const things = (b.wear?.items ?? []).map((id) => ({ id, owned: have.has(id), opened: have.has(id) || opened.has(id) }));
    const set = b.set && things.length ? { weapon: b.set.weapon, damage: b.set.damage, also: b.set.also ?? null, have: things.filter((t) => t.owned).length, total: things.length } : null;
    const w = wins.get(b.id) ?? { wins: 0, damage: 0 };
    return {
      id: b.id, wins: w.wins, damage: w.damage, bestHit: best.get(b.id) ?? 0, things, set,
      // his tattoo sets: how many pieces of each are already dropped
      tattoos: tattooSetsOfBoss(b.id).map((t) => ({ set: t.id, have: t.pieces.filter((x) => ink.has(x.id)).length, total: t.pieces.length })),
      closed: w.wins >= CASE_WINS && things.every((t) => t.owned),
    };
  });
}
