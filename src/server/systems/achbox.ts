import { GameError, type Queryable } from "../db.ts";
import { grantReward, type Ctx } from "../core.ts";
import { CASE_THINGS, CASE_THING_CHANCE, CASE_THING_PITY, achBoxState, rollAchBox } from "../../content/ach-box.ts";
import { mergeRewards } from "../../content/rewards.ts";
import { BOX_TATTOO_CHANCE, BOX_TATTOO_SETS } from "../../content/tattoos.ts";
import { between, rollParts } from "../../content/craft-drops.ts";

/** «Ящик ништяков» (content/ach-box.ts): how many are waiting for the achievement points, the way to the next one */
export async function achBoxView(q: Queryable, pid: number) {
  const [p] = await q.query<{ ach_points: number; ach_boxes_opened: number; case_thing_miss: number }>("SELECT ach_points, ach_boxes_opened, case_thing_miss FROM players WHERE id=$1", [pid]);
  // the way to the sure thing (0 when the player has every case thing)
  const [h] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, [...CASE_THINGS]]);
  const allThings = Number(h?.n ?? 0) >= CASE_THINGS.length;
  return { ...achBoxState(Number(p?.ach_points ?? 0), Number(p?.ach_boxes_opened ?? 0)), thingMiss: allThings ? null : Number(p?.case_thing_miss ?? 0), thingPity: CASE_THING_PITY };
}

/** One box (or every box waiting, `all`): the points stay, the boxes are counted as opened; inside — roubles, dollars
 * and a weapon at random; all the boxes at once come as one reward — the sum of what was inside. */
export async function openAchBox(ctx: Ctx, all = false) {
  const [p] = await ctx.q.query<{ ach_points: number; ach_boxes_opened: number }>("SELECT ach_points, ach_boxes_opened FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  const st = achBoxState(Number(p?.ach_points ?? 0), Number(p?.ach_boxes_opened ?? 0));
  if (st.ready < 1) throw new GameError("ach_box_empty", `Ящик откроется, когда наберёшь ещё ${st.cost - st.progress} очк. достижений`);
  const n = all ? st.ready : 1;
  await ctx.q.query("UPDATE players SET ach_boxes_opened = ach_boxes_opened + $2 WHERE id=$1", [ctx.pid, n]);
  // a tattoo of the box sets (content/tattoos.ts BOX_TATTOO_SETS): BOX_TATTOO_CHANCE per box, a piece the player does not have
  const ids = BOX_TATTOO_SETS.flatMap((s) => s.pieces.map((x) => x.id));
  const have = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, ids])).map((r) => r.item_id));
  const ink: { id: string; qty: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (ctx.rng() >= BOX_TATTOO_CHANCE) continue;
    const left = ids.filter((id) => !have.has(id));
    if (!left.length) break;
    const id = left[Math.floor(ctx.rng() * left.length)];
    have.add(id); ink.push({ id, qty: 1 });
  }
  // the case-only things: at most one a box — the chances of the missing ones add up, one of them is picked by its chance;
  // CASE_THING_PITY boxes in a row without one — the next gives a random missing one for sure
  const mouthHave = new Set((await ctx.q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [ctx.pid, [...CASE_THINGS]])).map((r) => r.item_id));
  const [pm] = await ctx.q.query<{ case_thing_miss: number }>("SELECT case_thing_miss FROM players WHERE id=$1", [ctx.pid]);
  let miss = Number(pm?.case_thing_miss ?? 0);
  for (let i = 0; i < n; i++) {
    const left = CASE_THINGS.filter((id) => !mouthHave.has(id));
    if (!left.length) break;
    let got: string | null = null;
    if (miss + 1 >= CASE_THING_PITY) got = left[Math.floor(ctx.rng() * left.length)];
    else {
      let r = ctx.rng();
      for (const id of left) { if (r < CASE_THING_CHANCE[id]) { got = id; break; } r -= CASE_THING_CHANCE[id]; }
    }
    if (got) { mouthHave.add(got); ink.push({ id: got, qty: 1 }); miss = 0; } else miss += 1;
  }
  await ctx.q.query("UPDATE players SET case_thing_miss=$2 WHERE id=$1", [ctx.pid, miss]);
  // «Крафт»: every box opened — 2–4 parts, 15% on a very rare one
  const parts = Array.from({ length: n }, () => rollParts(ctx.rng, between(2, 4, ctx.rng), { rare: 0.3, epic: 0.15 / 3 })).flat();
  const reward = await grantReward(ctx, mergeRewards(...Array.from({ length: n }, () => rollAchBox(ctx.rng)), { items: [...ink, ...parts] }), "ach_box");
  return { reward, opened: n, box: await achBoxView(ctx.q, ctx.pid) };
}
