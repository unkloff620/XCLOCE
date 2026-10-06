import { GameError, type Queryable } from "../db.ts";
import { takeMoney, type Ctx } from "../core.ts";
import { EQUIPMENT, HELP_TOPICS, TROPHIES, equipmentById, normalizeLook, roomById, totalBonus, type HelpTopic, type Look } from "../../content/home.ts";
import { TALENT_WEAPONS, branchById, talentCost, type WeaponTalents } from "../../content/talents.ts";

/*
 * Дом: оборудование (уровни), комнаты (купить / выбрать), внешность персонажа, просмотренные подсказки.
 */

export interface HomeRow { levels: Record<string, number>; rooms: string[]; room: string; body: Look; decor: Record<string, number>; trophies: string[] }

export async function homeData(q: Queryable, pid: number): Promise<HomeRow> {
  const eq = await q.query<{ equipment_id: string; level: number }>("SELECT equipment_id, level FROM player_equipment WHERE player_id=$1", [pid]);
  const [a] = await q.query<{ room: string; rooms: string[] | null; body: unknown; decor: Record<string, number> | null }>("SELECT room, rooms, body, decor FROM appearance WHERE player_id=$1", [pid]);
  const rooms = Array.isArray(a?.rooms) && a.rooms.length ? a.rooms : ["basic"];
  const tr = await q.query<{ item_id: string }>("SELECT item_id FROM inventory WHERE player_id=$1 AND qty > 0 AND item_id = ANY($2)", [pid, TROPHIES.map((t) => t.id)]);
  return {
    levels: Object.fromEntries(eq.map((e) => [e.equipment_id, e.level])),
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
  return totalBonus(h.levels, h.rooms, h.trophies);
}

export async function homeView(q: Queryable, pid: number) {
  const h = await homeData(q, pid);
  return { ...h, bonus: totalBonus(h.levels, h.rooms, h.trophies) };
}

export async function upgradeEquipment(ctx: Ctx, id: string) {
  const def = equipmentById(id);
  if (!def) throw new GameError("bad_equipment", "Такого оборудования нет");
  const h = await homeData(ctx.q, ctx.pid);
  const lv = h.levels[def.id] ?? 0;
  if (lv >= def.levels.length) throw new GameError("max_level", `${def.name}: уже максимальный уровень`);
  const next = def.levels[lv];
  await takeMoney(ctx, next.price.currency, next.price.amount, `equip:${def.id}:${lv + 1}`);
  await ctx.q.query("UPDATE appearance SET decor = decor - $2::text WHERE player_id=$1", [ctx.pid, def.id]); // the new thing goes into the room
  await ctx.q.query(
    "INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1,$2,$3) ON CONFLICT (player_id, equipment_id) DO UPDATE SET level = EXCLUDED.level",
    [ctx.pid, def.id, lv + 1],
  );
  return { id: def.id, level: lv + 1, max: def.levels.length };
}

/** The player's weapon talents: weapon → branch → level. */
export async function weaponTalents(q: Queryable, pid: number): Promise<WeaponTalents> {
  const rows = await q.query<{ weapon_id: string; branch: string; level: number }>("SELECT weapon_id, branch, level FROM player_talents WHERE player_id=$1 AND level > 0", [pid]);
  const out: WeaponTalents = {};
  for (const r of rows) (out[r.weapon_id] ??= {})[r.branch as "dmg" | "crit"] = r.level;
  return out;
}

/** One more level of a weapon's branch (damage or crit power), paid with talents. */
export async function upgradeTalent(ctx: Ctx, weaponId: string, branchId: string) {
  const br = branchById(branchId);
  if (!br || !TALENT_WEAPONS.includes(weaponId)) throw new GameError("bad_talent", "Такой ветки нет");
  const [cur] = await ctx.q.query<{ level: number }>("SELECT level FROM player_talents WHERE player_id=$1 AND weapon_id=$2 AND branch=$3", [ctx.pid, weaponId, br.id]);
  const lv = cur?.level ?? 0;
  if (lv >= br.maxLevel) throw new GameError("max_level", `${br.name}: уже максимальный уровень`);
  const cost = talentCost(lv + 1);
  const [p] = await ctx.q.query<{ talents: number }>(
    "UPDATE players SET talents = talents - $2 WHERE id=$1 AND talents >= $2 RETURNING talents",
    [ctx.pid, cost],
  );
  if (!p) throw new GameError("no_talents", `Не хватает талантов: нужно ${cost}`);
  const [row] = await ctx.q.query<{ level: number }>(
    `INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,$2,$3,$4)
     ON CONFLICT (player_id, weapon_id, branch) DO UPDATE SET level = EXCLUDED.level WHERE player_talents.level = $5
     RETURNING level`,
    [ctx.pid, weaponId, br.id, lv + 1, lv],
  );
  if (!row) throw new GameError("conflict", "Талант уже улучшен, обнови экран");
  return { weapon: weaponId, branch: br.id, level: lv + 1, max: br.maxLevel, talents: p.talents };
}

export async function buyRoom(ctx: Ctx, id: string) {
  const def = roomById(id);
  if (!def) throw new GameError("bad_room", "Такой комнаты нет");
  const h = await homeData(ctx.q, ctx.pid);
  if (h.rooms.includes(def.id)) throw new GameError("room_owned", "Эта комната уже твоя");
  if (def.price) await takeMoney(ctx, def.price.currency, def.price.amount, `room:${def.id}`);
  await ctx.q.query("UPDATE appearance SET rooms=$2, room=$3 WHERE player_id=$1", [ctx.pid, JSON.stringify([...h.rooms, def.id]), def.id]);
  return { room: def.id };
}

export async function setRoom(ctx: Ctx, id: string) {
  const h = await homeData(ctx.q, ctx.pid);
  if (!h.rooms.includes(id)) throw new GameError("room_locked", "Сначала купи эту комнату");
  await ctx.q.query("UPDATE appearance SET room=$2 WHERE player_id=$1", [ctx.pid, id]);
  return { room: id };
}

/** Which of the owned stages of a room thing stands in the room (e.g. the old chair you like more); the bonus stays the bought level's. */
export async function setDecor(ctx: Ctx, id: string, stage: number) {
  const def = equipmentById(id);
  if (!def?.stages) throw new GameError("bad_equipment", "Это нельзя поставить");
  const h = await homeData(ctx.q, ctx.pid);
  const lv = Math.min(h.levels[def.id] ?? 0, def.levels.length);
  if (!Number.isInteger(stage) || stage < 0 || stage > lv) throw new GameError("locked", "Сначала улучши до этого уровня");
  await ctx.q.query("UPDATE appearance SET decor = jsonb_set(decor, ARRAY[$2::text], to_jsonb($3::int)) WHERE player_id=$1", [ctx.pid, def.id, stage]);
  return { id: def.id, stage };
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
