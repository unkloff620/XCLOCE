import { GameError, type Queryable } from "../db.ts";
import type { Ctx } from "../core.ts";
import { levelFromXp } from "../../content/levels.ts";
import { clanLevelInfo } from "../../content/clans.ts";
import { CLAN_PRIZES } from "../../content/achievements.ts";
import { weekKey } from "../core.ts";

export const CLAN_EMBLEMS = ["rocket", "diamond", "bull", "bear", "moon", "skull", "crown", "flame"] as const;
export const CLAN_COLORS = ["#ff4d6d", "#3ddc84", "#4da3ff", "#ffb020", "#b06bff", "#38d6ff"] as const;
export const CLAN_MAX = 30;

/** Clan level grows with the total boss damage of its members (content/clans.ts). */
export const clanLevel = (damage: number) => clanLevelInfo(damage).level;

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();

export async function createClan(ctx: Ctx, nameRaw: string, tagRaw: string, emblem: string, color: string) {
  const name = clean(nameRaw);
  const tag = clean(tagRaw).toUpperCase();
  if (name.length < 3 || name.length > 24) throw new GameError("bad_name", "Название: от 3 до 24 символов");
  if (!/^[A-ZА-ЯЁ0-9]{2,5}$/.test(tag)) throw new GameError("bad_tag", "Тег: 2–5 букв или цифр");
  if (!(CLAN_EMBLEMS as readonly string[]).includes(emblem)) throw new GameError("bad_emblem", "Выбери герб");
  if (!(CLAN_COLORS as readonly string[]).includes(color)) throw new GameError("bad_color", "Выбери цвет");
  const [me] = await ctx.q.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [ctx.pid]);
  if (me.clan_id) throw new GameError("in_clan", "Ты уже в клане");
  const dup = await ctx.q.query("SELECT 1 FROM clans WHERE lower(name)=lower($1) OR tag=$2", [name, tag]);
  if (dup.length) throw new GameError("clan_exists", "Такое название или тег уже заняты");
  const [c] = await ctx.q.query<{ id: number }>("INSERT INTO clans (name, tag, emblem, color, leader_id) VALUES ($1,$2,$3,$4,$5) RETURNING id", [name, tag, emblem, color, ctx.pid]);
  // my own clan replaces a request to someone else's
  await ctx.q.query("DELETE FROM clan_requests WHERE player_id=$1", [ctx.pid]);
  await ctx.q.query("INSERT INTO clan_members (player_id, clan_id, role) VALUES ($1,$2,'leader')", [ctx.pid, c.id]);
  await ctx.q.query("UPDATE players SET clan_id=$2 WHERE id=$1", [ctx.pid, c.id]);
  return { clanId: c.id };
}

/** Joining is a request: the leader accepts or rejects it. One request at a time; it can be cancelled. */
export async function joinClan(ctx: Ctx, clanId: number) {
  const [me] = await ctx.q.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [ctx.pid]);
  if (me.clan_id) throw new GameError("in_clan", "Сначала выйди из своего клана");
  const [c] = await ctx.q.query<{ id: number; name: string }>("SELECT id, name FROM clans WHERE id=$1", [clanId]);
  if (!c) throw new GameError("no_clan", "Клан не найден", 404);
  const [req] = await ctx.q.query<{ clan_id: number }>("SELECT clan_id FROM clan_requests WHERE player_id=$1", [ctx.pid]);
  if (req) throw new GameError(req.clan_id === clanId ? "request_sent" : "request_elsewhere", req.clan_id === clanId ? "Заявка уже подана — ждём лидера" : "У тебя уже есть заявка в другой клан — сначала отмени её");
  const [n] = await ctx.q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clan_members WHERE clan_id=$1", [clanId]);
  if (n.n >= CLAN_MAX) throw new GameError("clan_full", `В клане уже ${CLAN_MAX} человек`);
  await ctx.q.query("INSERT INTO clan_requests (player_id, clan_id, created_at) VALUES ($1,$2,$3)", [ctx.pid, clanId, new Date(ctx.now)]);
  return { clanId, requested: true, name: c.name };
}

export async function cancelRequest(ctx: Ctx) {
  const r = await ctx.q.query<{ clan_id: number }>("DELETE FROM clan_requests WHERE player_id=$1 RETURNING clan_id", [ctx.pid]);
  if (!r.length) throw new GameError("no_request", "Заявки нет");
  return { clanId: r[0].clan_id };
}

/** Leader: accept (the player joins) or reject a request to my clan. */
export async function answerRequest(ctx: Ctx, playerId: number, accept: boolean) {
  const [m] = await ctx.q.query<{ clan_id: number; role: string }>("SELECT clan_id, role FROM clan_members WHERE player_id=$1", [ctx.pid]);
  if (!m || m.role !== "leader") throw new GameError("not_leader", "Заявки разбирает только лидер");
  await ctx.q.query("SELECT id FROM clans WHERE id=$1 FOR UPDATE", [m.clan_id]);
  const r = await ctx.q.query("DELETE FROM clan_requests WHERE player_id=$1 AND clan_id=$2 RETURNING player_id", [playerId, m.clan_id]);
  if (!r.length) throw new GameError("no_request", "Заявка уже отменена или разобрана");
  if (!accept) return { playerId, accepted: false };
  const [p] = await ctx.q.query<{ clan_id: number | null }>("SELECT clan_id FROM players WHERE id=$1", [playerId]);
  if (!p || p.clan_id) throw new GameError("in_clan", "Игрок уже в клане");
  const [n] = await ctx.q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clan_members WHERE clan_id=$1", [m.clan_id]);
  if (n.n >= CLAN_MAX) throw new GameError("clan_full", `В клане уже ${CLAN_MAX} человек`);
  await ctx.q.query("INSERT INTO clan_members (player_id, clan_id) VALUES ($1,$2)", [playerId, m.clan_id]);
  await ctx.q.query("UPDATE players SET clan_id=$2 WHERE id=$1", [playerId, m.clan_id]);
  return { playerId, accepted: true };
}

/** For the state: my pending request, and (for a leader) how many requests wait. */
export async function requestsView(q: Queryable, pid: number, clanId: number | null) {
  const [mine] = await q.query<{ clan_id: number; name: string; tag: string }>(
    "SELECT r.clan_id, c.name, c.tag FROM clan_requests r JOIN clans c ON c.id=r.clan_id WHERE r.player_id=$1",
    [pid],
  );
  let waiting = 0;
  if (clanId) {
    const [l] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM clan_requests r JOIN clans c ON c.id=r.clan_id WHERE c.id=$1 AND c.leader_id=$2", [clanId, pid]);
    waiting = l?.n ?? 0;
  }
  return { mine: mine ? { clanId: mine.clan_id, name: mine.name, tag: mine.tag } : null, waiting };
}

/** The requests to a clan, shown to its leader only. */
export async function clanRequests(q: Queryable, clanId: number, viewer: number) {
  const [c] = await q.query<{ leader_id: number }>("SELECT leader_id FROM clans WHERE id=$1", [clanId]);
  if (!c || c.leader_id !== viewer) return null;
  const rows = await q.query<{ id: number; display_name: string; photo_url: string | null; xp: number; damage: number; created_at: Date }>(
    `SELECT p.id, p.display_name, p.photo_url, p.xp, COALESCE(s.total_damage,0)::bigint AS damage, r.created_at FROM clan_requests r JOIN players p ON p.id=r.player_id
     LEFT JOIN player_stats s ON s.player_id=p.id WHERE r.clan_id=$1 ORDER BY r.created_at`,
    [clanId],
  );
  return rows.map((r) => ({ id: r.id, name: r.display_name, photo: r.photo_url, xp: Number(r.xp), damage: Number(r.damage), at: new Date(r.created_at).getTime() }));
}

export async function leaveClan(ctx: Ctx) {
  const [m] = await ctx.q.query<{ clan_id: number; role: string }>("SELECT clan_id, role FROM clan_members WHERE player_id=$1", [ctx.pid]);
  if (!m) throw new GameError("no_clan", "Ты не в клане");
  await ctx.q.query("SELECT id FROM clans WHERE id=$1 FOR UPDATE", [m.clan_id]);
  await ctx.q.query("DELETE FROM clan_members WHERE player_id=$1", [ctx.pid]);
  await ctx.q.query("UPDATE players SET clan_id=NULL WHERE id=$1", [ctx.pid]);
  if (m.role === "leader") {
    const [heir] = await ctx.q.query<{ player_id: number }>("SELECT player_id FROM clan_members WHERE clan_id=$1 ORDER BY joined_at, player_id LIMIT 1", [m.clan_id]);
    if (heir) {
      await ctx.q.query("UPDATE clan_members SET role='leader' WHERE player_id=$1", [heir.player_id]);
      await ctx.q.query("UPDATE clans SET leader_id=$2 WHERE id=$1", [m.clan_id, heir.player_id]);
    } else {
      await ctx.q.query("DELETE FROM clans WHERE id=$1", [m.clan_id]);
    }
  }
  return { left: m.clan_id };
}

export async function kickMember(ctx: Ctx, playerId: number) {
  const [m] = await ctx.q.query<{ clan_id: number; role: string }>("SELECT clan_id, role FROM clan_members WHERE player_id=$1", [ctx.pid]);
  if (!m || m.role !== "leader") throw new GameError("not_leader", "Исключать может только лидер");
  if (playerId === ctx.pid) throw new GameError("bad_request", "Себя исключить нельзя — выйди из клана");
  const r = await ctx.q.query("DELETE FROM clan_members WHERE player_id=$1 AND clan_id=$2 RETURNING player_id", [playerId, m.clan_id]);
  if (!r.length) throw new GameError("not_member", "Этого игрока нет в клане");
  await ctx.q.query("UPDATE players SET clan_id=NULL WHERE id=$1", [playerId]);
  return { kicked: playerId };
}

/** Leader only: name, emblem, colour and description. */
export async function editClan(ctx: Ctx, nameRaw: string, emblem: string, color: string, descRaw: string) {
  const [m] = await ctx.q.query<{ clan_id: number; role: string }>("SELECT clan_id, role FROM clan_members WHERE player_id=$1", [ctx.pid]);
  if (!m || m.role !== "leader") throw new GameError("not_leader", "Настраивать клан может только лидер");
  const name = clean(nameRaw);
  const description = descRaw.replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (name.length < 3 || name.length > 24) throw new GameError("bad_name", "Название: от 3 до 24 символов");
  if (description.length > 300) throw new GameError("bad_description", "Описание: до 300 символов");
  if (!(CLAN_EMBLEMS as readonly string[]).includes(emblem)) throw new GameError("bad_emblem", "Выбери герб");
  if (!(CLAN_COLORS as readonly string[]).includes(color)) throw new GameError("bad_color", "Выбери цвет");
  const dup = await ctx.q.query("SELECT 1 FROM clans WHERE lower(name)=lower($1) AND id <> $2", [name, m.clan_id]);
  if (dup.length) throw new GameError("clan_exists", "Такое название уже занято");
  await ctx.q.query("UPDATE clans SET name=$2, emblem=$3, color=$4, description=$5 WHERE id=$1", [m.clan_id, name, emblem, color, description]);
  return { clanId: m.clan_id };
}

export async function clanList(q: Queryable) {
  const rows = await q.query<{ id: number; name: string; tag: string; emblem: string; color: string; description: string; members: number; damage: number; leader: string }>(
    `SELECT c.id, c.name, c.tag, c.emblem, c.color, c.description, COUNT(m.player_id)::int AS members, COALESCE(SUM(s.total_damage), 0)::bigint AS damage, lp.display_name AS leader
     FROM clans c LEFT JOIN clan_members m ON m.clan_id=c.id LEFT JOIN player_stats s ON s.player_id=m.player_id JOIN players lp ON lp.id=c.leader_id
     GROUP BY c.id, lp.display_name ORDER BY damage DESC, c.id`,
  );
  return rows.map((r, i) => {
    const lv = clanLevelInfo(Number(r.damage));
    return { ...r, damage: Number(r.damage), level: lv.level, levelFrom: lv.from, levelTo: lv.to, rank: i + 1 };
  });
}

export async function clanView(q: Queryable, clanId: number, levelsCfg?: Parameters<typeof levelFromXp>[1], now = Date.now()) {
  const list = await clanList(q);
  const c = list.find((x) => x.id === clanId);
  if (!c) throw new GameError("no_clan", "Клан не найден", 404);
  const members = await q.query<{ id: number; display_name: string; photo_url: string | null; xp: number; role: string; damage: number; joined_at: Date }>(
    `SELECT p.id, p.display_name, p.photo_url, p.xp, m.role, COALESCE(s.total_damage,0)::bigint AS damage, m.joined_at FROM clan_members m JOIN players p ON p.id=m.player_id
     LEFT JOIN player_stats s ON s.player_id=p.id WHERE m.clan_id=$1 ORDER BY m.role='leader' DESC, p.xp DESC`,
    [clanId],
  );
  const [wins] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM fights f JOIN clan_members m ON m.player_id=f.player_id WHERE m.clan_id=$1 AND f.status='won'", [clanId]);
  // this week: the clan's damage and its place among the clans (the top 10 get prizes on Monday)
  const week = weekKey(now);
  const weekly = await q.query<{ clan_id: number; value: number }>(
    `SELECT p.clan_id, SUM(w.damage)::bigint AS value FROM weekly_stats w JOIN players p ON p.id = w.player_id
     WHERE w.week=$1 AND p.clan_id IS NOT NULL GROUP BY p.clan_id HAVING SUM(w.damage) > 0 ORDER BY value DESC, p.clan_id`,
    [week],
  );
  const wi = weekly.findIndex((w) => w.clan_id === clanId);
  return {
    ...c, wins: wins.n, max: CLAN_MAX,
    week: { damage: wi >= 0 ? Number(weekly[wi].value) : 0, place: wi >= 0 ? wi + 1 : null, prizes: CLAN_PRIZES },
    members: members.map((m) => ({ id: m.id, name: m.display_name, photo: m.photo_url, level: levelFromXp(Number(m.xp), levelsCfg).level, xp: Number(m.xp), role: m.role, damage: Number(m.damage) })),
  };
}
