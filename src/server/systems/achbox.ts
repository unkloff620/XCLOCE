import { GameError, type Queryable } from "../db.ts";
import { grantReward, type Ctx } from "../core.ts";
import { achBoxState, rollAchBox } from "../../content/ach-box.ts";

/** «Ящик ништяков» (content/ach-box.ts): how many are waiting for the achievement points, the way to the next one */
export async function achBoxView(q: Queryable, pid: number) {
  const [p] = await q.query<{ ach_points: number; ach_boxes_opened: number }>("SELECT ach_points, ach_boxes_opened FROM players WHERE id=$1", [pid]);
  return achBoxState(Number(p?.ach_points ?? 0), Number(p?.ach_boxes_opened ?? 0));
}

/** One box: the points stay, the box is counted as opened; inside — roubles, dollars and a weapon at random. */
export async function openAchBox(ctx: Ctx) {
  const [p] = await ctx.q.query<{ ach_points: number; ach_boxes_opened: number }>("SELECT ach_points, ach_boxes_opened FROM players WHERE id=$1 FOR UPDATE", [ctx.pid]);
  const st = achBoxState(Number(p?.ach_points ?? 0), Number(p?.ach_boxes_opened ?? 0));
  if (st.ready < 1) throw new GameError("ach_box_empty", `Ящик откроется, когда наберёшь ещё ${st.cost - st.progress} очк. достижений`);
  await ctx.q.query("UPDATE players SET ach_boxes_opened = ach_boxes_opened + 1 WHERE id=$1", [ctx.pid]);
  const reward = await grantReward(ctx, rollAchBox(ctx.rng), "ach_box");
  return { reward, box: await achBoxView(ctx.q, ctx.pid) };
}
