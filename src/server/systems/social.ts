import { GameError, type Queryable } from "../db.ts";
import { grantReward, moscowDay, type Ctx } from "../core.ts";
import { FIGHT_PER_DAY, FIGHT_WIN, NOTE_KEEP_MS, PUMP_PER_DAY, SPIT_EVERY_MS, SPIT_PER_DAY } from "../../content/social.ts";

/* Players to players from a profile (content/social.ts): biceps, a fist fight, a spit, and the messages they leave. */

type Kind = "pump" | "fight" | "spit";

async function target(ctx: Ctx, to: number) {
  if (to === ctx.pid) throw new GameError("social_self", "С самим собой так нельзя");
  // no lock on his players row (that row is locked by his own actions): biceps live in their own table
  const [p] = await ctx.q.query<{ id: number; display_name: string }>("SELECT id, display_name FROM players WHERE id=$1 AND banned_at IS NULL", [to]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  return { ...p, biceps: await bicepsOf(ctx.q, to) };
}

export async function bicepsOf(q: Queryable, pid: number): Promise<number> {
  // pumped by other players + the «Бицуха» talents (a plain read of the players row, no lock)
  const [r] = await q.query<{ n: number }>(
    "SELECT COALESCE((SELECT n FROM player_biceps WHERE player_id=$1), 0) + COALESCE((SELECT talent_biceps FROM players WHERE id=$1), 0) AS n", [pid]);
  return Number(r?.n ?? 0);
}

async function counts(q: Queryable, from: number, kind: Kind, to: number, now: number) {
  const [r] = await q.query<{ day: number; same: number; last: Date | null }>(
    `SELECT COUNT(*) FILTER (WHERE day=$3)::int AS day, COUNT(*) FILTER (WHERE day=$3 AND to_id=$4)::int AS same,
            MAX(at) FILTER (WHERE to_id=$4) AS last
     FROM social_log WHERE from_id=$1 AND kind=$2 AND at > $5`,
    [from, kind, moscowDay(now), to, new Date(now - 2 * 24 * 3600_000)],
  );
  return { day: Number(r?.day ?? 0), same: Number(r?.same ?? 0), last: r?.last ? new Date(r.last).getTime() : 0 };
}

async function log(ctx: Ctx, kind: Kind, to: number, won: boolean | null = null) {
  await ctx.q.query("INSERT INTO social_log (from_id, to_id, kind, day, at, won) VALUES ($1,$2,$3,$4,$5,$6)", [ctx.pid, to, kind, moscowDay(ctx.now), new Date(ctx.now), won]);
}

async function note(ctx: Ctx, to: number, kind: string, meta: Record<string, unknown> = {}) {
  await ctx.q.query("INSERT INTO notes (player_id, kind, from_id, meta, created_at) VALUES ($1,$2,$3,$4,$5)", [to, kind, ctx.pid, JSON.stringify(meta), new Date(ctx.now)]);
}

/** «Бицуха»: +1 to the other player's biceps; each visitor once a day per player. */
export async function pump(ctx: Ctx, to: number) {
  const p = await target(ctx, to);
  const c = await counts(ctx.q, ctx.pid, "pump", to, ctx.now);
  if (c.same > 0) throw new GameError("pump_done", "Сегодня ты уже качал ему бицуху — приходи завтра");
  if (c.day >= PUMP_PER_DAY) throw new GameError("pump_limit", "На сегодня хватит — руки отваливаются");
  const [u] = await ctx.q.query<{ n: number }>(
    "INSERT INTO player_biceps (player_id, n) VALUES ($1,1) ON CONFLICT (player_id) DO UPDATE SET n = player_biceps.n + 1 RETURNING n", [p.id]);
  await log(ctx, "pump", to);
  return { biceps: Number(u.n) };
}

/** «Наехать»: biceps against biceps; the attacker needs more to win (and gets FIGHT_WIN). The other one is told. */
export async function fight(ctx: Ctx, to: number) {
  const p = await target(ctx, to);
  const c = await counts(ctx.q, ctx.pid, "fight", to, ctx.now);
  if (c.same > 0) throw new GameError("fight_done", "С ним ты сегодня уже махался — завтра");
  if (c.day >= FIGHT_PER_DAY) throw new GameError("fight_limit", `Не больше ${FIGHT_PER_DAY} наездов в день`);
  const mine = await bicepsOf(ctx.q, ctx.pid), theirs = p.biceps;
  const won = mine > theirs;
  const reward = won ? await grantReward(ctx, FIGHT_WIN, `fight:${to}`) : null;
  await log(ctx, "fight", to, won);
  await note(ctx, to, "fight", { won, mine, theirs });
  return { won, mine, theirs, reward };
}

/** «Харкнуть»: «В тебя харкнул …» in his messages; the same player once an hour. */
export async function spit(ctx: Ctx, to: number) {
  await target(ctx, to);
  const c = await counts(ctx.q, ctx.pid, "spit", to, ctx.now);
  if (c.last && ctx.now - c.last < SPIT_EVERY_MS) throw new GameError("spit_wait", "Слюна кончилась — подожди немного");
  if (c.day >= SPIT_PER_DAY) throw new GameError("spit_limit", "На сегодня хватит харкать");
  await log(ctx, "spit", to);
  await note(ctx, to, "spit");
  return { ok: true };
}

/** what the viewer may do to this player now (null — the own profile) */
export async function socialView(q: Queryable, viewer: number, pid: number, now: number) {
  const biceps = await bicepsOf(q, pid);
  if (viewer === pid) return { biceps, mine: biceps, pump: null, fight: null, spit: null };
  const [pc, fc, sc] = await Promise.all((["pump", "fight", "spit"] as const).map((k) => counts(q, viewer, k, pid, now)));
  return {
    biceps, mine: await bicepsOf(q, viewer),
    pump: pc.same === 0 && pc.day < PUMP_PER_DAY,
    fight: fc.same === 0 && fc.day < FIGHT_PER_DAY,
    spit: sc.day < SPIT_PER_DAY ? Math.max(0, (sc.last ? sc.last + SPIT_EVERY_MS : 0)) : -1,
  };
}

/** «Новости» of the own dossier: who pumped my biceps, spat at me, ran into me (and who won), the newest first */
export async function newsView(q: Queryable, pid: number, now: number) {
  const rows = await q.query<{ kind: string; from_id: number; name: string | null; photo: string | null; won: boolean | null; at: Date }>(
    `SELECT l.kind, l.from_id, p.display_name AS name, p.photo_url AS photo, l.won, l.at FROM social_log l LEFT JOIN players p ON p.id = l.from_id
     WHERE l.to_id=$1 AND l.at > $2 ORDER BY l.at DESC LIMIT 50`,
    [pid, new Date(now - 14 * 24 * 3600_000)],
  );
  return rows.map((r) => ({ kind: r.kind, fromId: Number(r.from_id), from: r.name ?? "Кто-то", photo: r.photo, won: r.won, at: new Date(r.at).getTime() }));
}

/** my messages from other players (a spit, a fight), the newest first, and how many are unread */
export async function notesView(q: Queryable, pid: number, now: number) {
  const rows = await q.query<{ id: number; kind: string; from_id: number | null; name: string | null; meta: Record<string, unknown>; created_at: Date; read_at: Date | null }>(
    `SELECT n.id, n.kind, n.from_id, p.display_name AS name, n.meta, n.created_at, n.read_at FROM notes n LEFT JOIN players p ON p.id = n.from_id
     WHERE n.player_id=$1 AND n.created_at > $2 ORDER BY n.id DESC LIMIT 30`,
    [pid, new Date(now - NOTE_KEEP_MS)],
  );
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, fromId: r.from_id, from: r.name ?? "Кто-то", meta: r.meta ?? {}, at: new Date(r.created_at).getTime(), unread: !r.read_at }));
}

export async function readNotes(ctx: Ctx) {
  await ctx.q.query("UPDATE notes SET read_at=$2 WHERE player_id=$1 AND read_at IS NULL", [ctx.pid, new Date(ctx.now)]);
  return { ok: true };
}
