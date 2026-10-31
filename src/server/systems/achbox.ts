import { GameError, type Queryable } from "../db.ts";
import { grantReward, type Ctx } from "../core.ts";
import { achBoxState, rollAchBox } from "../../content/ach-box.ts";
import { mergeRewards } from "../../content/rewards.ts";
import { BOX_TATTOO_CHANCE, BOX_TATTOO_SETS } from "../../content/tattoos.ts";

/** «Ящик ништяков» (content/ach-box.ts): how many are waiting for the achievement points, the way to the next one */
export async function achBoxView(q: Queryable, pid: number) {
  const [p] = await q.query<{ ach_points: number; ach_boxes_opened: number }>("SELECT ach_points, ach_boxes_opened FROM players WHERE id=$1", [pid]);
  return achBoxState(Number(p?.ach_points ?? 0), Number(p?.ach_boxes_opened ?? 0));
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
  const reward = await grantReward(ctx, mergeRewards(...Array.from({ length: n }, () => rollAchBox(ctx.rng)), { items: ink }), "ach_box");
  return { reward, opened: n, box: await achBoxView(ctx.q, ctx.pid) };
}
