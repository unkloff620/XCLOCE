import { GameError, type Queryable } from "../db.ts";
import { ledger, takeMoney, type Ctx } from "../core.ts";
import { EQUIPMENT, HELP_TOPICS, TROPHIES, equipmentById, hasPiece, piecesCount, normalizeLook, roomById, roomUnlockId, roomsEnergyBonus, totalBonus, type HelpTopic, type Look } from "../../content/home.ts";
import { TALENT_RESET_PRICE, TALENT_WEAPONS, nodeOpen, talentTree, talentsSpent, type TalentBranch, type WeaponTalents } from "../../content/talents.ts";

/*
 * Дом: оборудование (уровни), комнаты (купить / выбрать), внешность персонажа, просмотренные подсказки.
 */

export interface HomeRow { levels: Record<string, number>; pieces: Record<string, number>; rooms: string[]; room: string; body: Look; decor: Record<string, number>; trophies: string[] }

export async function homeData(q: Queryable, pid: number): Promise<HomeRow> {
  const eq = await q.query<{ equipment_id: string; level: number; pieces: number }>("SELECT equipment_id, level, pieces FROM player_equipment WHERE player_id=$1", [pid]);
  const [a] = await q.query<{ room: string; rooms: string[] | null; body: unknown; decor: Record<string, number> | null }>("SELECT room, rooms, body, decor FROM appearance WHERE player_id=$1", [pid]);
  const rooms = Array.isArray(a?.rooms) && a.rooms.length ? a.rooms : ["basic"];
  const tr = await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, TROPHIES.map((t) => t.id)]);
  return {
    levels: Object.fromEntries(eq.map((e) => [e.equipment_id, e.level])),
    pieces: Object.fromEntries(eq.filter((e) => e.pieces > 0).map((e) => [e.equipment_id, Number(e.pieces)])),
    rooms,
    room: a && rooms.includes(a.room) ? a.room : "basic",
    body: normalizeLook(a?.body),
    decor: a?.decor && typeof a.decor === "object" ? a.decor : {},
    trophies: tr.map((t) => t.item_id),
  };
}

/** Combat bonus of a player (equipment + every owned room). */
export async function playerBonus(q: Queryable, pid: number) {
  const h = await homeData(q, pid);
  return totalBonus(h.levels, h.rooms, h.trophies, h.pieces);
}

export async function homeView(q: Queryable, pid: number) {
  const h = await homeData(q, pid);
  return { ...h, bonus: totalBonus(h.levels, h.rooms, h.trophies, h.pieces) };
}

export async function upgradeEquipment(ctx: Ctx, id: string) {
  const def = equipmentById(id);
  if (!def) throw new GameError("bad_equipment", "Такого оборудования нет");
  if (def.pieces?.length) {
    // room things are bought piece by piece; the old «upgrade» buys the first one not owned yet
    const h = await homeData(ctx.q, ctx.pid);
    const k = def.pieces.findIndex((_, i) => !hasPiece(h.pieces[def.id] ?? 0, i + 1)) + 1;
    if (k < 1) throw new GameError("max_level", `${def.name}: уже всё куплено`);
    const r = await buyPiece(ctx, def.id, k);
    return { id: def.id, level: r.count, max: def.pieces.length };
  }
  const h = await homeData(ctx.q, ctx.pid);
  const lv = h.levels[def.id] ?? 0;
  if (lv >= def.levels.length) throw new GameError("max_level", `${def.name}: уже максимальный уровень`);
  const next = def.levels[lv];
  await takeMoney(ctx, next.price.currency, next.price.amount, `equip:${def.id}:${lv + 1}`);
  await ctx.q.query(
    "INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1,$2,$3) ON CONFLICT (player_id, equipment_id) DO UPDATE SET level = EXCLUDED.level",
    [ctx.pid, def.id, lv + 1],
  );
  return { id: def.id, level: lv + 1, max: def.levels.length };
}

/** One room thing (desk / monitor / chair) bought on its own, in any order; it goes straight into the room. */
export async function buyPiece(ctx: Ctx, id: string, k: number) {
  const def = equipmentById(id);
  const piece = def?.pieces?.[k - 1];
  if (!def || !piece || !Number.isInteger(k)) throw new GameError("bad_equipment", "Такой вещи нет");
  const h = await homeData(ctx.q, ctx.pid);
  const owned = h.pieces[def.id] ?? 0;
  if (hasPiece(owned, k)) throw new GameError("owned", `${piece.name}: уже куплено`);
  await takeMoney(ctx, piece.price.currency, piece.price.amount, `piece:${def.id}:${k}`);
  const mask = owned | (1 << (k - 1));
  const [row] = await ctx.q.query<{ pieces: number }>(
    `INSERT INTO player_equipment (player_id, equipment_id, level, pieces) VALUES ($1,$2,$3,$4)
     ON CONFLICT (player_id, equipment_id) DO UPDATE SET pieces = player_equipment.pieces | EXCLUDED.pieces, level = $3
     RETURNING pieces`,
    [ctx.pid, def.id, piecesCount(mask), mask],
  );
  // the new thing goes into the room: a monitor joins the shown ones, a desk / chair takes the place
  const shown = def.multi ? (typeof h.decor[def.id] === "number" ? h.decor[def.id] | (1 << (k - 1)) : null) : k;
  if (shown === null) await ctx.q.query("UPDATE appearance SET decor = decor - $2::text WHERE player_id=$1", [ctx.pid, def.id]);
  else await ctx.q.query("UPDATE appearance SET decor = jsonb_set(decor, ARRAY[$2::text], to_jsonb($3::int)) WHERE player_id=$1", [ctx.pid, def.id, shown]);
  return { id: def.id, piece: k, name: piece.name, pieces: Number(row.pieces), count: piecesCount(Number(row.pieces)) };
}

/** The player's weapon talents: weapon → branch → level. */
export async function weaponTalents(q: Queryable, pid: number): Promise<WeaponTalents> {
  const rows = await q.query<{ weapon_id: string; branch: string; level: number }>("SELECT weapon_id, branch, level FROM player_talents WHERE player_id=$1 AND level > 0", [pid]);
  const out: WeaponTalents = {};
  for (const r of rows) (out[r.weapon_id] ??= {})[r.branch as TalentBranch] = r.level;
  return out;
}

/** One more level of an upgrade in a weapon's tree, paid with talents; an upgrade opens when the one above is full. */
export async function upgradeTalent(ctx: Ctx, weaponId: string, nodeId: string) {
  const node = TALENT_WEAPONS.includes(weaponId) ? talentTree(weaponId).find((n) => n.id === nodeId) : undefined;
  if (!node) throw new GameError("bad_talent", "Такого улучшения нет");
  const all = await weaponTalents(ctx.q, ctx.pid);
  const mine = all[weaponId] ?? {};
  if (!nodeOpen(mine, weaponId, node.id)) throw new GameError("talent_locked", "Сначала прокачай до конца улучшение выше");
  const lv = mine[node.id] ?? 0;
  if (lv >= node.max) throw new GameError("max_level", `${node.name}: уже максимальный уровень`);
  const [p] = await ctx.q.query<{ talents: number }>(
    "UPDATE players SET talents = talents - $2 WHERE id=$1 AND talents >= $2 RETURNING talents",
    [ctx.pid, node.cost],
  );
  if (!p) throw new GameError("no_talents", `Не хватает талантов: нужно ${node.cost}`);
  const [row] = await ctx.q.query<{ level: number }>(
    `INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,$2,$3,$4)
     ON CONFLICT (player_id, weapon_id, branch) DO UPDATE SET level = EXCLUDED.level WHERE player_talents.level = $5
     RETURNING level`,
    [ctx.pid, weaponId, node.id, lv + 1, lv],
  );
  if (!row) throw new GameError("conflict", "Талант уже улучшен, обнови экран");
  await ledger(ctx, "talent", "talent", -node.cost, `talent:${weaponId}:${node.id}`);
  return { weapon: weaponId, branch: node.id, level: lv + 1, max: node.max, talents: p.talents };
}

/** All talents back for 5 USD: every upgrade goes to 0, the spent talents return to the counter. */
export async function resetTalents(ctx: Ctx) {
  const all = await weaponTalents(ctx.q, ctx.pid);
  const back = talentsSpent(all);
  if (back <= 0) throw new GameError("nothing_to_reset", "Таланты ещё не вложены — сбрасывать нечего");
  await takeMoney(ctx, TALENT_RESET_PRICE.currency, TALENT_RESET_PRICE.amount, "talent-reset");
  await ctx.q.query("DELETE FROM player_talents WHERE player_id=$1", [ctx.pid]);
  const [p] = await ctx.q.query<{ talents: number }>("UPDATE players SET talents = talents + $2 WHERE id=$1 RETURNING talents", [ctx.pid, back]);
  await ledger(ctx, "talent", "talent", back, "talent-reset");
  return { returned: back, talents: p.talents, price: TALENT_RESET_PRICE };
}

export async function buyRoom(ctx: Ctx, id: string) {
  const def = roomById(id);
  if (!def) throw new GameError("bad_room", "Такой комнаты нет");
  const h = await homeData(ctx.q, ctx.pid);
  if (h.rooms.includes(def.id)) throw new GameError("room_owned", "Эта комната уже твоя");
  if (def.drop) {
    const [u] = await ctx.q.query("SELECT 1 FROM player_unlocks WHERE player_id=$1 AND item_id=$2", [ctx.pid, roomUnlockId(def.id)]);
    if (!u) throw new GameError("room_locked", `Комната ещё не выпала — она падает с босса`);
  }
  if (def.price) await takeMoney(ctx, def.price.currency, def.price.amount, `room:${def.id}`);
  const rooms = [...h.rooms, def.id];
  await ctx.q.query("UPDATE appearance SET rooms=$2, room=$3 WHERE player_id=$1", [ctx.pid, JSON.stringify(rooms), def.id]);
  // a room may raise the energy limit
  await ctx.q.query("UPDATE players SET energy_bonus=$2 WHERE id=$1", [ctx.pid, roomsEnergyBonus(rooms)]);
  return { room: def.id };
}

export async function setRoom(ctx: Ctx, id: string) {
  const h = await homeData(ctx.q, ctx.pid);
  if (!h.rooms.includes(id)) throw new GameError("room_locked", "Сначала купи эту комнату");
  await ctx.q.query("UPDATE appearance SET room=$2 WHERE player_id=$1", [ctx.pid, id]);
  return { room: id };
}

/** Check one decor value: desk / chair — 0 (the free one) or an owned piece; monitors — a mask of owned ones. */
function decorValue(id: string, v: unknown, pieces: Record<string, number>): number {
  const def = equipmentById(id);
  if (!def?.pieces?.length) throw new GameError("bad_equipment", "Это нельзя поставить");
  const owned = pieces[def.id] ?? 0;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new GameError("bad_value", "Неверное значение");
  if (def.multi ? (v & ~owned) !== 0 : v !== 0 && !hasPiece(owned, v)) throw new GameError("locked", "Сначала купи эту вещь");
  return v;
}

/** What stands in the room (e.g. the old chair you like more); the bonus of every owned piece stays. */
export async function setDecor(ctx: Ctx, id: string, stage: number) {
  return saveDecor(ctx, { [id]: stage });
}

/** The room editor saves everything at once: { desk, chair, monitor2 }. */
export async function saveDecor(ctx: Ctx, raw: Record<string, unknown>) {
  const h = await homeData(ctx.q, ctx.pid);
  const entries = Object.entries(raw ?? {});
  if (!entries.length || entries.length > EQUIPMENT.length) throw new GameError("bad_value", "Нечего сохранять");
  const decor = { ...h.decor };
  for (const [id, v] of entries) decor[id] = decorValue(id, v, h.pieces);
  await ctx.q.query("UPDATE appearance SET decor=$2 WHERE player_id=$1", [ctx.pid, JSON.stringify(decor)]);
  return { decor };
}

export async function setLook(ctx: Ctx, raw: Record<string, unknown>) {
  const look = normalizeLook(raw);
  await ctx.q.query("UPDATE appearance SET body=$2 WHERE player_id=$1", [ctx.pid, JSON.stringify(look)]);
  return { look };
}

export async function helpSeen(ctx: Ctx, topic: string) {
  if (!HELP_TOPICS.includes(topic as HelpTopic)) throw new GameError("bad_topic", "Неизвестная подсказка");
  await ctx.q.query(
    "UPDATE players SET help_seen = CASE WHEN help_seen ? $2 THEN help_seen ELSE help_seen || to_jsonb($2::text) END WHERE id=$1",
    [ctx.pid, topic],
  );
  return { topic };
}

export const EQUIPMENT_IDS = EQUIPMENT.map((e) => e.id);
