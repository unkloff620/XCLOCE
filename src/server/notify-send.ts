import type { Db, Queryable } from "./db.ts";
import { loadConfig } from "./config.ts";
import { energyNow, moscowDay } from "./core.ts";
import { bossById } from "../content/bosses.ts";
import { itemById } from "../content/items.ts";
import { DUEL_ANSWER_MS } from "../content/games.ts";
import { log } from "./log.ts";
import { knownOrigin } from "./platform.ts";

/*
 * Telegram reminders, the sending half. Runs after API requests (throttled to once per 20 s across all instances)
 * and from /api/cron/notify. Each due row is claimed first (sent_at), then its reason is re-checked, then sent.
 * Quiet hours 00:00–09:00 MSK: due rows wait till morning. Players active in the last 3 minutes are not disturbed.
 * Live calls (URGENT: a duel call, a blackjack invite) skip both — they expire in minutes.
 * The bot token never leaves the server.
 */

const THROTTLE_MS = 20_000;
const BATCH = 40;
const ACTIVE_MS = 3 * 60_000;
/** calls that are worth nothing later: sent at once, at night too, and to players in the game */
const URGENT = ["duel_call", "bj_invite"];

interface Due { player_id: number; kind: string; due_at: Date; meta: Record<string, unknown>; telegram_id: number; last_seen_at: Date }

export function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return knownOrigin();
}

/** The text of a reminder, or null when its reason is gone. */
async function textFor(q: Queryable, n: Due, now: number): Promise<string | null> {
  const cfg = await loadConfig(q, now);
  switch (n.kind) {
    case "energy_full": {
      const [p] = await q.query<{ energy: number; energy_at: Date; energy_bonus: number; talent_energy: number }>("SELECT energy, energy_at, energy_bonus, talent_energy FROM players WHERE id=$1", [n.player_id]);
      const max = cfg.energy.max + Number(p?.energy_bonus ?? 0) + Number(p?.talent_energy ?? 0);
      if (!p || energyNow(p.energy, new Date(p.energy_at).getTime(), now, { ...cfg.energy, max }).energy < max) return null;
      return `⚡ Энергия полная — ${max}/${max}.\nЗагляни в локации, пока она не простаивает!`;
    }
    case "fist_ready": {
      const [f] = await q.query<{ boss_id: string }>(
        "SELECT boss_id FROM fights WHERE player_id=$1 AND status='active' AND ends_at > $2",
        [n.player_id, new Date(now)],
      );
      const weapon = typeof n.meta.weapon === "string" ? n.meta.weapon : "fist";
      const [cd] = await q.query<{ ready_at: Date }>("SELECT ready_at FROM cooldowns WHERE player_id=$1 AND item_id=$2", [n.player_id, weapon]);
      if (!f || (cd && new Date(cd.ready_at).getTime() > now)) return null;
      const icon = weapon === "mouse" ? "🖱" : weapon === "red-candle" ? "🕯" : "👊";
      return `${icon} ${itemById(weapon)?.name ?? "Оружие"} снова готово к бою!\n${bossById(f.boss_id)?.name ?? "Босс"} ждёт следующего удара.`;
    }
    case "boss_low": {
      const fightId = Number(n.meta.fightId);
      const [f] = await q.query<{ boss_id: string; hp_max: number; start_total: number; damage_total: number }>(
        `SELECT f.boss_id, f.hp_max, f.start_total, b.damage_total FROM fights f JOIN bosses b ON b.id='_all'
         WHERE f.id=$1 AND f.player_id=$2 AND f.status='active' AND NOT f.solo AND f.ends_at > $3`,
        [fightId, n.player_id, new Date(now)],
      );
      if (!f) return null;
      const hp = f.hp_max - (Number(f.damage_total) - Number(f.start_total));
      if (hp <= 0) return null;
      const pct = Math.max(1, Math.round((hp / f.hp_max) * 100));
      return `🔥 ${bossById(f.boss_id)?.name ?? "Босс"} почти повержен — осталось ${pct}% здоровья.\nДобей его и забери награду!`;
    }
    case "streak": {
      const [d] = await q.query<{ last_day: string; streak: number }>("SELECT last_day, streak FROM daily_login WHERE player_id=$1", [n.player_id]);
      const today = moscowDay(now);
      const yesterday = moscowDay(now - 24 * 3600_000);
      if (!d || d.last_day === today || d.last_day !== yesterday) return null;
      return `🎁 Награда за вход ждёт!\nСерия ${d.streak} дн. сгорит в полночь — зайди и забери день ${(d.streak % cfg.daily.length) + 1}.`;
    }
    case "stash_gift": {
      const [g] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM stash_gifts WHERE to_id=$1 AND accepted_at IS NULL", [n.player_id]);
      const k = Number(g?.n ?? 0);
      if (!k) return null;
      return `📦 Тебе прислали нычки: ${k} шт.\nЗагляни в «Сообщения» дома и забери подарки!`;
    }
    case "bj_invite": {
      const [i] = await q.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM bj_invites WHERE player_id=$1 AND created_at > now() - interval '15 minutes'", [n.player_id]);
      if (!Number(i?.n ?? 0)) return null;
      const from = typeof n.meta.from === "string" ? n.meta.from : "Соклановец";
      return `🃏 ${from} зовёт тебя за стол блэкджека во дворе!\nЗаходи — место держат 15 минут.`;
    }
    case "duel_call": {
      const [d] = await q.query<{ status: string }>("SELECT status FROM duels WHERE id=$1 AND to_id=$2", [Number(n.meta.duelId), n.player_id]);
      if (d?.status !== "open") return null;
      const from = typeof n.meta.from === "string" ? n.meta.from : "Игрок";
      return `🎲 ${from} вызывает тебя на дуэль в зонк!\nСтавка ${Number(n.meta.stake) || 1} $, по 5 попыток — у кого больше очков, тот забирает банк. Вызов ждёт ${Math.round(DUEL_ANSWER_MS / 60_000)} минут — ответь в зонке во дворе.`;
    }
    case "duel_done": {
      const [d] = await q.query<{ from_id: number; from_points: number | null; to_points: number | null; winner_id: number | null; stake: number; status: string; rival: string }>(
        `SELECT d.from_id, d.from_points, d.to_points, d.winner_id, d.stake, d.status, p.display_name AS rival FROM duels d
         JOIN players p ON p.id = CASE WHEN d.from_id=$2 THEN d.to_id ELSE d.from_id END WHERE d.id=$1`, [Number(n.meta.duelId), n.player_id]);
      if (!d || d.status !== "done") return null;
      const me = d.from_id === n.player_id;
      const mine = (me ? d.from_points : d.to_points) ?? 0, theirs = (me ? d.to_points : d.from_points) ?? 0;
      const head = d.winner_id === null ? "🤝 Ничья" : d.winner_id === n.player_id ? "🏆 Победа" : "💀 Поражение";
      return `${head} в дуэли с ${d.rival}: ${mine} : ${theirs}.\nЗагляни в зонк — там вся партия по попыткам.`;
    }
    default:
      return null;
  }
}

async function send(token: string, chatId: number, text: string): Promise<"ok" | "blocked" | "error"> {
  const url = appUrl();
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(url ? { reply_markup: { inline_keyboard: [[{ text: "Играть", web_app: { url } }]] } } : {}),
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (r.ok) return "ok";
    // 403: the user never started the bot or blocked it; 400 "chat not found" means the same
    if (r.status === 403 || r.status === 400) return "blocked";
    return "error";
  } catch {
    return "error";
  }
}

export async function dispatchNotifications(db: Db, now = Date.now()): Promise<{ sent: number; skipped: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { sent: 0, skipped: 0 };
  // quiet hours: only live calls (a duel, a blackjack seat) go out at night — they are gone by the morning
  const quiet = new Date(now + 3 * 3600_000).getUTCHours() < 9;
  const claimed = await db.query("UPDATE notify_runs SET at=$1 WHERE id=1 AND at < $2 RETURNING id", [new Date(now), new Date(now - THROTTLE_MS)]);
  if (!claimed.length) return { sent: 0, skipped: 0 };

  const due = await db.query<Due>(
    `SELECT n.player_id, n.kind, n.due_at, n.meta, p.telegram_id, p.last_seen_at FROM notifications n JOIN players p ON p.id = n.player_id
     WHERE n.sent_at IS NULL AND n.due_at <= $1 AND p.telegram_id IS NOT NULL AND p.notify_on AND NOT p.pm_blocked
       AND (NOT $2 OR n.kind = ANY($3::text[]))
     ORDER BY n.due_at LIMIT ${BATCH}`,
    [new Date(now), quiet, URGENT],
  );
  let sent = 0;
  let skipped = 0;
  for (const n of due) {
    // claim the row; a re-armed row (another due_at) or one taken by a parallel run is left alone
    const ok = await db.query("UPDATE notifications SET sent_at=$4 WHERE player_id=$1 AND kind=$2 AND due_at=$3 AND sent_at IS NULL RETURNING 1", [n.player_id, n.kind, n.due_at, new Date(now)]);
    if (!ok.length) continue;
    // a player in the game right now is not disturbed — except for a live call: he may be on another screen
    if (!URGENT.includes(n.kind) && now - new Date(n.last_seen_at).getTime() < ACTIVE_MS) {
      skipped++;
      continue;
    }
    const text = await textFor(db, n, now);
    if (!text) {
      skipped++;
      continue;
    }
    const r = await send(token, Number(n.telegram_id), text);
    if (r === "ok") sent++;
    else if (r === "blocked") await db.query("UPDATE players SET pm_blocked=true WHERE id=$1", [n.player_id]);
    else skipped++;
  }
  if (sent || skipped) log.info("notify.run", { sent, skipped });
  return { sent, skipped };
}
