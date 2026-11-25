import { GameError, type Queryable } from "../db.ts";
import type { Ctx } from "../core.ts";
import { talentsSpent } from "../../content/talents.ts";
import { weaponTalents } from "./home.ts";
import { framesFor, ONLINE_MS } from "./rating.ts";

/*
 * Friends (the user 2026-11-25): in another player's room the [+] sends him a request; it waits in his «Сообщения»
 * (his avatar, his nickname, how many talents and achievements he has) until he takes or turns it down. Friends see each
 * other in the strip over the bottom menu (it was the top of all the players: «Игроки» → «Друзья»).
 * Tables: friend_requests (from → to, waiting), friends (both ways, one row each).
 */
export const FRIENDS_MAX = 200;

export type FriendState = "none" | "sent" | "incoming" | "friends";

export async function friendState(q: Queryable, me: number, him: number): Promise<FriendState> {
  if (me === him) return "none";
  const [r] = await q.query<{ f: boolean; s: boolean; i: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM friends WHERE player_id=$1 AND friend_id=$2) AS f,
            EXISTS (SELECT 1 FROM friend_requests WHERE from_id=$1 AND to_id=$2) AS s,
            EXISTS (SELECT 1 FROM friend_requests WHERE from_id=$2 AND to_id=$1) AS i`, [me, him]);
  return r?.f ? "friends" : r?.i ? "incoming" : r?.s ? "sent" : "none";
}

async function count(q: Queryable, pid: number) {
  const [r] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM friends WHERE player_id=$1", [pid]);
  return Number(r?.n ?? 0);
}

async function link(ctx: Ctx, a: number, b: number) {
  for (const [x, y] of [[a, b], [b, a]]) {
    if ((await count(ctx.q, x)) >= FRIENDS_MAX) throw new GameError("friends_full", x === ctx.pid ? `Друзей больше ${FRIENDS_MAX} не бывает` : "У него уже полно друзей");
  }
  await ctx.q.query("DELETE FROM friend_requests WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1)", [a, b]);
  await ctx.q.query("INSERT INTO friends (player_id, friend_id, since) VALUES ($1,$2,$3),($2,$1,$3) ON CONFLICT DO NOTHING", [a, b, new Date(ctx.now)]);
}

/** [+] in his room: a request to him (or, when he has asked me already, we are friends at once) */
export async function friendAdd(ctx: Ctx, to: number) {
  if (to === ctx.pid) throw new GameError("friend_self", "Сам себе друг — это нормально, но не тут");
  const [p] = await ctx.q.query<{ id: number }>("SELECT id FROM players WHERE id=$1 AND banned_at IS NULL", [to]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  const st = await friendState(ctx.q, ctx.pid, to);
  if (st === "friends") throw new GameError("friend_already", "Вы уже друзья");
  if (st === "sent") throw new GameError("friend_sent", "Заявка уже отправлена");
  if (st === "incoming") { await link(ctx, ctx.pid, to); return { state: "friends" as FriendState }; }
  if ((await count(ctx.q, ctx.pid)) >= FRIENDS_MAX) throw new GameError("friends_full", `Друзей больше ${FRIENDS_MAX} не бывает`);
  await ctx.q.query("INSERT INTO friend_requests (from_id, to_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [ctx.pid, to, new Date(ctx.now)]);
  return { state: "sent" as FriendState };
}

/** his request in my «Сообщения»: take it (friends) or turn it down */
export async function friendAnswer(ctx: Ctx, from: number, yes: boolean) {
  const del = await ctx.q.query("SELECT 1 FROM friend_requests WHERE from_id=$1 AND to_id=$2", [from, ctx.pid]);
  if (!del.length) throw new GameError("friend_no_request", "Заявки уже нет");
  if (yes) await link(ctx, ctx.pid, from);
  else await ctx.q.query("DELETE FROM friend_requests WHERE from_id=$1 AND to_id=$2", [from, ctx.pid]);
  return { state: (yes ? "friends" : "none") as FriendState };
}

/** out of friends (both ways), or my own request taken back */
export async function friendRemove(ctx: Ctx, id: number) {
  await ctx.q.query("DELETE FROM friends WHERE (player_id=$1 AND friend_id=$2) OR (player_id=$2 AND friend_id=$1)", [ctx.pid, id]);
  await ctx.q.query("DELETE FROM friend_requests WHERE from_id=$1 AND to_id=$2", [ctx.pid, id]);
  return { state: "none" as FriendState };
}

/** the requests waiting for me (the state: «Сообщения»): who, his avatar, his talents and achievements (points, as in his dossier) */
export async function friendRequestsIn(q: Queryable, pid: number, now: number) {
  const rows = await q.query<{ from_id: number; display_name: string; photo_url: string | null; created_at: Date; ach: number; free: number }>(
    `SELECT r.from_id, p.display_name, p.photo_url, r.created_at, p.ach_points AS ach, p.talents AS free
     FROM friend_requests r JOIN players p ON p.id = r.from_id
     WHERE r.to_id=$1 AND p.banned_at IS NULL ORDER BY r.created_at DESC LIMIT 50`, [pid]);
  if (!rows.length) return [];
  const frames = await framesFor(q, rows.map((r) => r.from_id), now);
  return Promise.all(rows.map(async (r) => ({
    id: r.from_id, name: r.display_name, photo: r.photo_url, frame: frames.get(r.from_id) ?? null, at: new Date(r.created_at).getTime(),
    // all his talents: put in and still lying unspent
    talents: talentsSpent(await weaponTalents(q, r.from_id)) + Number(r.free ?? 0), achievements: Number(r.ach),
  })));
}

/** the strip over the bottom menu: me and my friends by authority, who is in the game now */
export async function friendsStrip(q: Queryable, pid: number, now: number) {
  await q.query("UPDATE players SET last_seen_at=$2 WHERE id=$1", [pid, new Date(now)]);
  const rows = await q.query<{ id: number; display_name: string; photo_url: string | null; xp: number; last_seen_at: Date }>(
    `SELECT p.id, p.display_name, p.photo_url, p.xp, p.last_seen_at FROM players p
     WHERE p.banned_at IS NULL AND (p.id=$1 OR p.id IN (SELECT friend_id FROM friends WHERE player_id=$1))
     ORDER BY p.xp DESC, p.id`, [pid]);
  const frames = await framesFor(q, rows.map((r) => r.id), now);
  const list = rows.map((r, i) => ({
    id: r.id, name: r.display_name, photo: r.photo_url, xp: Number(r.xp), place: i + 1, frame: frames.get(r.id) ?? null,
    online: r.id === pid || new Date(r.last_seen_at).getTime() > now - ONLINE_MS,
  }));
  return { friends: list, online: list.filter((r) => r.online && r.id !== pid).length };
}
