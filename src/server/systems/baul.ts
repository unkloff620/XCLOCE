import { GameError, type Queryable } from "../db.ts";
import { grantReward, itemQty, takeMoney, type Ctx, type Granted } from "../core.ts";
import { bump, countersOf, setTo } from "./counters.ts";
import { BAUL_CUR, BAUL_GOLD_CHANCE, BAUL_GOLD_FROM, BAUL_GOLD_SET, BAUL_PRICE, BAUL_SETS, baulLevel, baulPoints, baulTattooChance, rollBaulPack } from "../../content/baul.ts";
import type { Reward } from "../../content/rewards.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";

/*
 * «Баул» (content/baul.ts): the points of boss wins (counter baul_pts), the free openings a new level gives (baul_free).
 * What lies in the bag is rolled ahead for its level and kept (table baul_packs): «Посмотреть» shows it, «Забрать» takes
 * it (free after a new level, otherwise for слитки) and the next one is rolled. A new level rolls the bag anew.
 */
const PTS = "baul_pts";
const FREE = "baul_free";

/** the sets of the bag that are in the game (drawn) */
const setsOf = (ids: string[]) => TATTOO_SETS.filter((s) => ids.includes(s.id));

export interface BaulView {
  points: number; level: number; from: number; to: number | null; free: number; price: number;
  /** what lies in the bag now (null below level 1) */
  pack: Reward | null;
  sets: { id: string; name: string; own: number; total: number; gold: boolean }[];
}

async function owned(q: Queryable, pid: number, ids: string[]) {
  if (!ids.length) return new Set<string>();
  return new Set((await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, ids])).map((r) => r.item_id));
}

async function pieceLeft(q: Queryable, pid: number, setIds: string[]) {
  const pieces = setsOf(setIds).flatMap((s) => s.pieces.map((p) => p.id));
  const own = await owned(q, pid, pieces);
  return pieces.filter((id) => !own.has(id));
}

/** a fresh bag for the level: the pack and maybe a tattoo of the sets not collected yet */
async function rollPack(q: Queryable, pid: number, level: number, rng: () => number): Promise<Reward> {
  const pack = rollBaulPack(level, rng);
  const tattoos: string[] = [];
  if (rng() < baulTattooChance(level)) {
    const left = await pieceLeft(q, pid, BAUL_SETS);
    if (left.length) tattoos.push(left[Math.floor(rng() * left.length) % left.length]);
  }
  if (level >= BAUL_GOLD_FROM && rng() < BAUL_GOLD_CHANCE) {
    const left = await pieceLeft(q, pid, [BAUL_GOLD_SET]);
    if (left.length) tattoos.push(left[Math.floor(rng() * left.length) % left.length]);
  }
  if (tattoos.length) pack.items = [...(pack.items ?? []), ...tattoos.map((id) => ({ id, qty: 1 }))];
  return pack;
}

/** the bag's pack for its level: the kept one, or a new one rolled (and kept) when there is none or the level changed */
async function packOf(q: Queryable, pid: number, level: number, rng: () => number): Promise<Reward | null> {
  if (level < 1) return null;
  const [row] = await q.query<{ level: number; pack: Reward }>("SELECT level, pack FROM baul_packs WHERE player_id=$1", [pid]);
  if (row && Number(row.level) === level) return row.pack;
  const pack = await rollPack(q, pid, level, rng);
  await q.query("INSERT INTO baul_packs (player_id, level, pack) VALUES ($1,$2,$3) ON CONFLICT (player_id) DO UPDATE SET level=EXCLUDED.level, pack=EXCLUDED.pack", [pid, level, JSON.stringify(pack)]);
  return pack;
}

export async function baulView(q: Queryable, pid: number, rng: () => number = Math.random): Promise<BaulView> {
  const c = await countersOf(q, pid);
  const lv = baulLevel(c[PTS] ?? 0);
  const all = setsOf([...BAUL_SETS, BAUL_GOLD_SET]);
  const own = await owned(q, pid, all.flatMap((s) => s.pieces.map((p) => p.id)));
  return {
    ...lv, free: c[FREE] ?? 0, price: BAUL_PRICE, pack: await packOf(q, pid, lv.level, rng),
    sets: all.map((s) => ({ id: s.id, name: s.name, own: s.pieces.filter((p) => own.has(p.id)).length, total: s.pieces.length, gold: s.id === BAUL_GOLD_SET })),
  };
}

/** a boss win: its points; every new level reached gives a free opening */
export async function baulTick(ctx: Ctx, hpMax: number): Promise<{ points: number; level: number; up: number } | null> {
  const add = baulPoints(hpMax);
  if (!(add > 0)) return null;
  const c = await countersOf(ctx.q, ctx.pid);
  const before = baulLevel(c[PTS] ?? 0).level;
  await bump(ctx.q, ctx.pid, PTS, add);
  const after = baulLevel((c[PTS] ?? 0) + add).level;
  if (after > before) await bump(ctx.q, ctx.pid, FREE, after - before);
  return { points: add, level: after, up: after - before };
}

/** «Забрать»: the bag's pack (a free opening first, otherwise for BAUL_PRICE слитков); the next one is rolled at once */
export async function baulOpen(ctx: Ctx): Promise<{ reward: Granted; tattoos: string[]; free: boolean; level: number; view: BaulView }> {
  const c = await countersOf(ctx.q, ctx.pid);
  const { level } = baulLevel(c[PTS] ?? 0);
  if (level < 1) throw new GameError("baul_locked", "Баул откроется с 1 уровня: побеждай боссов");
  const pack = (await packOf(ctx.q, ctx.pid, level, ctx.rng))!;
  const free = (c[FREE] ?? 0) > 0;
  if (free) await setTo(ctx.q, ctx.pid, FREE, (c[FREE] ?? 0) - 1);
  else await takeMoney(ctx, BAUL_CUR, BAUL_PRICE, "baul");
  // a tattoo collected meanwhile (from another bag) is not given twice
  const tatIds = new Set(TATTOO_SETS.filter((s) => s.boss === "baul").flatMap((s) => s.pieces.map((p) => p.id)));
  const items = [];
  for (const it of pack.items ?? []) if (!tatIds.has(it.id) || (await itemQty(ctx.q, ctx.pid, it.id)) === 0) items.push(it);
  const reward = await grantReward(ctx, { ...pack, items }, `baul:${level}`);
  await ctx.q.query("DELETE FROM baul_packs WHERE player_id=$1", [ctx.pid]);
  const tattoos = items.filter((it) => tatIds.has(it.id)).map((it) => it.id);
  return { reward, tattoos, free, level, view: await baulView(ctx.q, ctx.pid, ctx.rng) };
}
