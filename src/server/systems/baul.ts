import { GameError, type Queryable } from "../db.ts";
import { grantReward, takeMoney, type Ctx, type Granted } from "../core.ts";
import { bump, countersOf, setTo } from "./counters.ts";
import { BAUL_CUR, BAUL_GOLD_CHANCE, BAUL_GOLD_FROM, BAUL_GOLD_SET, BAUL_PRICE, BAUL_SETS, baulLevel, baulPoints, baulTattooChance, rollBaulPack } from "../../content/baul.ts";
import { TATTOO_SETS } from "../../content/tattoos.ts";

/*
 * «Баул» (content/baul.ts): the points of boss wins (counter baul_pts), the free openings a new level gives (baul_free),
 * an opening for слитки (or a free one): a pack by the level and maybe a piece of the bag's tattoo sets not owned yet.
 */
const PTS = "baul_pts";
const FREE = "baul_free";

/** the sets of the bag that are in the game (drawn) */
const setsOf = (ids: string[]) => TATTOO_SETS.filter((s) => ids.includes(s.id));

export interface BaulView {
  points: number; level: number; from: number; to: number | null; free: number; price: number;
  sets: { id: string; name: string; own: number; total: number; gold: boolean }[];
}

export async function baulView(q: Queryable, pid: number): Promise<BaulView> {
  const c = await countersOf(q, pid);
  const lv = baulLevel(c[PTS] ?? 0);
  const all = setsOf([...BAUL_SETS, BAUL_GOLD_SET]);
  const ids = all.flatMap((s) => s.pieces.map((p) => p.id));
  const own = new Set(ids.length ? (await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, ids])).map((r) => r.item_id) : []);
  return {
    ...lv, free: c[FREE] ?? 0, price: BAUL_PRICE,
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

async function pieceLeft(ctx: Ctx, setIds: string[]) {
  const pieces = setsOf(setIds).flatMap((s) => s.pieces.map((p) => p.id));
  if (!pieces.length) return [];
  const own = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, pieces])).map((r) => r.item_id));
  return pieces.filter((id) => !own.has(id));
}

/** opens the bag: a free opening first, otherwise for BAUL_PRICE слитков */
export async function baulOpen(ctx: Ctx): Promise<{ reward: Granted; tattoos: string[]; free: boolean; level: number; view: BaulView }> {
  const c = await countersOf(ctx.q, ctx.pid);
  const { level } = baulLevel(c[PTS] ?? 0);
  if (level < 1) throw new GameError("baul_locked", "Баул откроется с 1 уровня: побеждай боссов");
  const free = (c[FREE] ?? 0) > 0;
  if (free) await setTo(ctx.q, ctx.pid, FREE, (c[FREE] ?? 0) - 1);
  else await takeMoney(ctx, BAUL_CUR, BAUL_PRICE, "baul");
  const pack = rollBaulPack(level, ctx.rng);
  const tattoos: string[] = [];
  if (ctx.rng() < baulTattooChance(level)) {
    const left = await pieceLeft(ctx, BAUL_SETS);
    if (left.length) tattoos.push(left[Math.floor(ctx.rng() * left.length) % left.length]);
  }
  if (level >= BAUL_GOLD_FROM && ctx.rng() < BAUL_GOLD_CHANCE) {
    const left = await pieceLeft(ctx, [BAUL_GOLD_SET]);
    if (left.length) tattoos.push(left[Math.floor(ctx.rng() * left.length) % left.length]);
  }
  if (tattoos.length) pack.items = [...(pack.items ?? []), ...tattoos.map((id) => ({ id, qty: 1 }))];
  const reward = await grantReward(ctx, pack, `baul:${level}`);
  return { reward, tattoos, free, level, view: await baulView(ctx.q, ctx.pid) };
}
