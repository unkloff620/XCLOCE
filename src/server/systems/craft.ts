/*
 * «Крафт» (content/craft.ts): the stash of CRAFT_BOXES cells (player_craft_box), putting a thing in / taking it out,
 * making a thing from its recipe. What lies in the stash gives its bonus: the energy limit and the biceps go onto the
 * players row with the talents' (home.ts syncTalentExtras), the weapon damage with the sets' (collection.ts
 * setBonuses), the minutes to a boss fight in combat.ts startFight.
 */
import { GameError, type Queryable } from "../db.ts";
import { addItem, ledger, takeItem, type Ctx } from "../core.ts";
import { CRAFT_BOXES, craftBonusOf, craftById, craftBoxesOpen } from "../../content/craft.ts";
import { talentsForDamage } from "../../content/talents.ts";
import { syncTalentExtras } from "./home.ts";

/** the stash: CRAFT_BOXES cells, an item id or null */
export async function craftBoxes(q: Queryable, pid: number): Promise<(string | null)[]> {
  const rows = await q.query<{ slot: number; item_id: string }>("SELECT slot, item_id FROM player_craft_box WHERE player_id=$1", [pid]);
  const out: (string | null)[] = Array.from({ length: CRAFT_BOXES }, () => null);
  for (const r of rows) if (r.slot >= 0 && r.slot < CRAFT_BOXES) out[r.slot] = r.item_id;
  return out;
}
export async function craftBonus(q: Queryable, pid: number) {
  return craftBonusOf(await craftBoxes(q, pid));
}

/** one of the thing goes from the store into a cell (the given one when empty, else the first empty) */
export async function craftPut(ctx: Ctx, itemId: string, slot?: number) {
  const def = craftById(itemId);
  if (!def) throw new GameError("bad_item", "Это нельзя заныкать");
  const boxes = await craftBoxes(ctx.q, ctx.pid);
  // the cells open one by one with the talents earned (content/craft.ts CRAFT_BOX_TALENTS)
  const [st] = await ctx.q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [ctx.pid]);
  const open = craftBoxesOpen(talentsForDamage(Number(st?.total_damage ?? 0)));
  if (slot !== undefined && slot >= open) throw new GameError("box_locked", "Эта ячейка ещё закрыта — она откроется с талантами");
  const at = slot !== undefined && slot >= 0 && slot < CRAFT_BOXES && !boxes[slot] ? slot : boxes.findIndex((b, i) => !b && i < open);
  if (at < 0) throw new GameError("boxes_full", open ? "Все открытые ячейки заняты — вытащи что-нибудь" : "Ячейки откроются с первым талантом");
  await takeItem(ctx, def.id, 1, "craft-put");
  await ctx.q.query("INSERT INTO player_craft_box (player_id, slot, item_id) VALUES ($1,$2,$3)", [ctx.pid, at, def.id]);
  await syncTalentExtras(ctx.q, ctx.pid);
  return { slot: at, itemId: def.id };
}

/** the thing in a cell goes back to the store */
export async function craftTake(ctx: Ctx, slot: number) {
  const [r] = await ctx.q.query<{ item_id: string }>("DELETE FROM player_craft_box WHERE player_id=$1 AND slot=$2 RETURNING item_id", [ctx.pid, slot]);
  if (!r) throw new GameError("empty_box", "Ячейка пустая");
  await addItem(ctx, r.item_id, 1, "craft-take");
  await syncTalentExtras(ctx.q, ctx.pid);
  return { slot, itemId: r.item_id };
}

/** makes one thing: every part of its recipe is taken, the thing goes to the store */
export async function craftMake(ctx: Ctx, itemId: string) {
  const def = craftById(itemId);
  if (!def?.recipe) throw new GameError("bad_recipe", "Это не собирается");
  for (const r of def.recipe) await takeItem(ctx, r.id, r.qty, `craft:${def.id}`);
  const got = await addItem(ctx, def.id, 1, "craft");
  if (!got) throw new GameError("full", "Больше не влезет");
  await ledger(ctx, "craft", def.id, 1, "craft");
  return { itemId: def.id };
}
