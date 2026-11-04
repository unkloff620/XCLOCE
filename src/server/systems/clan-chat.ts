/*
 * The clan chat: the members of a clan write to each other. Messages live in clan_chat (the last CHAT_KEEP per clan);
 * a message with no player is the clan's own news (joined, left, kicked, new leader). clan_members.chat_seen is the
 * last message a member has seen: the rest (since he joined) are «unread» — the dot on the Clans tab.
 */
import { GameError, type Queryable } from "../db.ts";

export const CHAT_MAX_LEN = 300;
export const CHAT_KEEP = 300;
export const CHAT_PAGE = 80;

export type ChatMsg = { id: number; pid: number | null; name: string; photo: string | null; leader: boolean; text: string; at: number };

const cleanText = (s: string) =>
  s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function membership(q: Queryable, pid: number) {
  const [m] = await q.query<{ clan_id: number; role: string; banned: boolean }>(
    "SELECT m.clan_id, m.role, (p.banned_at IS NOT NULL) AS banned FROM clan_members m JOIN players p ON p.id=m.player_id WHERE m.player_id=$1",
    [pid],
  );
  if (!m) throw new GameError("no_clan", "Чат есть только у участников клана", 403);
  return m;
}

/** the clan's own news line (no author) */
export async function chatNews(q: Queryable, clanId: number, text: string) {
  await q.query("INSERT INTO clan_chat (clan_id, player_id, text) VALUES ($1, NULL, $2)", [clanId, text.slice(0, CHAT_MAX_LEN)]);
}

/** the last messages of my clan (marks them seen) */
export async function chatList(q: Queryable, pid: number) {
  const m = await membership(q, pid);
  const rows = await q.query<{ id: number; player_id: number | null; display_name: string | null; photo_url: string | null; leader_id: number; text: string; created_at: Date }>(
    `SELECT c.id, c.player_id, p.display_name, p.photo_url, k.leader_id, c.text, c.created_at
       FROM clan_chat c JOIN clans k ON k.id=c.clan_id LEFT JOIN players p ON p.id=c.player_id
      WHERE c.clan_id=$1 ORDER BY c.id DESC LIMIT ${CHAT_PAGE}`,
    [m.clan_id],
  );
  const msgs: ChatMsg[] = rows.reverse().map((r) => ({
    id: r.id, pid: r.player_id, name: r.player_id ? (r.display_name ?? "Игрок") : "", photo: r.photo_url, leader: r.player_id != null && r.player_id === r.leader_id,
    text: r.text, at: new Date(r.created_at).getTime(),
  }));
  const last = msgs.length ? msgs[msgs.length - 1].id : 0;
  if (last) await q.query("UPDATE clan_members SET chat_seen=GREATEST(chat_seen,$2) WHERE player_id=$1", [pid, last]);
  return { clanId: m.clan_id, me: pid, leader: m.role === "leader", msgs };
}

export async function chatSend(q: Queryable, pid: number, raw: string) {
  const m = await membership(q, pid);
  if (m.banned) throw new GameError("banned", "Аккаунт заблокирован", 403);
  const text = cleanText(raw);
  if (!text) throw new GameError("empty", "Напиши что-нибудь");
  if (text.length > CHAT_MAX_LEN) throw new GameError("too_long", `Не длиннее ${CHAT_MAX_LEN} символов`);
  // no flood: the same text twice in a row, or more than 5 messages in 10 s
  const recent = await q.query<{ text: string; created_at: Date }>(
    "SELECT text, created_at FROM clan_chat WHERE clan_id=$1 AND player_id=$2 ORDER BY id DESC LIMIT 5",
    [m.clan_id, pid],
  );
  if (recent[0]?.text === text && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) throw new GameError("same", "Ты это уже написал");
  if (recent.length === 5 && Date.now() - new Date(recent[4].created_at).getTime() < 10_000) throw new GameError("flood", "Не так быстро");
  await q.query("INSERT INTO clan_chat (clan_id, player_id, text) VALUES ($1,$2,$3)", [m.clan_id, pid, text]);
  await q.query(
    `DELETE FROM clan_chat WHERE clan_id=$1 AND id < (SELECT id FROM clan_chat WHERE clan_id=$1 ORDER BY id DESC OFFSET ${CHAT_KEEP - 1} LIMIT 1)`,
    [m.clan_id],
  );
  return chatList(q, pid);
}

/** my own message, or (the leader) anybody's */
export async function chatDelete(q: Queryable, pid: number, id: number) {
  const m = await membership(q, pid);
  const r = await q.query(
    `DELETE FROM clan_chat WHERE id=$1 AND clan_id=$2 AND player_id IS NOT NULL AND (player_id=$3 OR $4) RETURNING id`,
    [id, m.clan_id, pid, m.role === "leader"],
  );
  if (!r.length) throw new GameError("not_yours", "Это сообщение удалить нельзя");
  return chatList(q, pid);
}

/** the messages of others I have not seen yet (since I joined) */
export async function chatUnread(q: Queryable, pid: number, clanId: number | null) {
  if (!clanId) return 0;
  const [r] = await q.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM clan_chat c JOIN clan_members m ON m.player_id=$1 AND m.clan_id=c.clan_id
      WHERE c.clan_id=$2 AND c.id > m.chat_seen AND c.created_at > m.joined_at AND c.player_id IS DISTINCT FROM $1 AND c.player_id IS NOT NULL`,
    [pid, clanId],
  );
  return Math.min(99, r?.n ?? 0);
}
