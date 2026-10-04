import { GameError, type Queryable } from "../db.ts";
import { takeMoney, type Ctx } from "../core.ts";
import { EQUIPMENT, HELP_TOPICS, equipmentById, pcPartById, pcPartCost, normalizeLook, roomById, totalBonus, type HelpTopic, type Look } from "../../content/home.ts";

/*
 * Дом: оборудование (уровни), комнаты (купить / выбрать), внешность персонажа, просмотренные подсказки.
 */

export interface HomeRow { levels: Record<string, number>; rooms: string[]; room: string; body: Look }

export async function homeData(q: Queryable, pid: number): Promise<HomeRow> {
  const eq = await q.query<{ equipment_id: string; level: number }>("SELECT equipment_id, level FROM player_equipment WHERE player_id=$1", [pid]);
  const [a] = await q.query<{ room: string; rooms: string[] | null; body: unknown }>("SELECT room, rooms, body FROM appearance WHERE player_id=$1", [pid]);
  const rooms = Array.isArray(a?.rooms) && a.rooms.length ? a.rooms : ["basic"];
  return {
    levels: Object.fromEntries(eq.map((e) => [e.equipment_id, e.level])),
    rooms,
    room: a && rooms.includes(a.room) ? a.room : "basic",
    body: normalizeLook(a?.body),
  };
}

/** Combat bonus of a player (equipment + every owned room). */
export async function playerBonus(q: Queryable, pid: number) {
  const h = await homeData(q, pid);
  return totalBonus(h.levels, h.rooms);
}

export async function homeView(q: Queryable, pid: number) {
  const h = await homeData(q, pid);
  return { ...h, bonus: totalBonus(h.levels, h.rooms) };
}

export async function upgradeEquipment(ctx: Ctx, id: string) {
  const def = equipmentById(id);
  if (!def) throw new GameError("bad_equipment", "Такого оборудования нет");
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

/** Upgrade a computer part for talents (level n costs n talents). */
export async function upgradePcPart(ctx: Ctx, id: string) {
  const def = pcPartById(id);
  if (!def) throw new GameError("bad_part", "Такой детали нет");
  const h = await homeData(ctx.q, ctx.pid);
  const lv = h.levels[def.id] ?? 0;
  if (lv >= def.maxLevel) throw new GameError("max_level", `${def.name}: уже максимальный уровень`);
  const cost = pcPartCost(lv + 1);
  const [p] = await ctx.q.query<{ talents: number }>(
    "UPDATE players SET talents = talents - $2 WHERE id=$1 AND talents >= $2 RETURNING talents",
    [ctx.pid, cost],
  );
  if (!p) throw new GameError("no_talents", `Не хватает талантов: нужно ${cost}`);
  const [row] = await ctx.q.query<{ level: number }>(
    `INSERT INTO player_equipment (player_id, equipment_id, level) VALUES ($1,$2,$3)
     ON CONFLICT (player_id, equipment_id) DO UPDATE SET level = EXCLUDED.level WHERE player_equipment.level = $4
     RETURNING level`,
    [ctx.pid, def.id, lv + 1, lv],
  );
  if (!row) throw new GameError("conflict", "Деталь уже улучшена, обнови экран");
  return { id: def.id, level: lv + 1, max: def.maxLevel, talents: p.talents };
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
