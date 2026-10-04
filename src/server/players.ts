import type { Queryable } from "./db.ts";
import type { TelegramUser } from "./auth.ts";
import { CURRENCIES } from "../content/currencies.ts";
import { STARTER_OUTFIT } from "../content/items.ts";
import { ENERGY } from "../content/levels.ts";

/** Starting kit: the fist, the starter outfit, some RUB and a few candles to try the boss right away. */
const START_RUB = 500;
const START_ITEMS: { id: string; qty: number }[] = [
  { id: "fist", qty: 1 },
  { id: "red-candle", qty: 3 },
  ...Object.values(STARTER_OUTFIT).map((id) => ({ id: id as string, qty: 1 })),
];

function cleanName(s: string | undefined | null, max = 32): string {
  return (s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max);
}

export function displayNameOf(u: TelegramUser): string {
  return cleanName([u.first_name, u.last_name].filter(Boolean).join(" ")) || cleanName(u.username) || `Игрок ${String(u.id).slice(-4)}`;
}

async function createPlayer(q: Queryable, fields: { telegramId?: number; guestId?: string; username?: string | null; name: string; photo?: string | null }): Promise<number> {
  const [p] = await q.query<{ id: number }>(
    "INSERT INTO players (telegram_id, guest_id, username, display_name, photo_url, energy) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [fields.telegramId ?? null, fields.guestId ?? null, fields.username ?? null, fields.name, fields.photo ?? null, ENERGY.start],
  );
  const id = p.id;
  for (const c of CURRENCIES) await q.query("INSERT INTO wallets (player_id, currency, amount) VALUES ($1,$2,$3)", [id, c, c === "RUB" ? START_RUB : 0]);
  for (const it of START_ITEMS) await q.query("INSERT INTO inventory (player_id, item_id, qty, source) VALUES ($1,$2,$3,'start')", [id, it.id, it.qty]);
  await q.query("INSERT INTO appearance (player_id, equipped) VALUES ($1,$2)", [id, JSON.stringify(STARTER_OUTFIT)]);
  await q.query("INSERT INTO player_stats (player_id) VALUES ($1)", [id]);
  await q.query("INSERT INTO yard (player_id, anchor_at) VALUES ($1, now())", [id]);
  return id;
}

export async function upsertTelegramPlayer(q: Queryable, u: TelegramUser): Promise<number> {
  const name = displayNameOf(u);
  const username = cleanName(u.username, 40) || null;
  const photo = typeof u.photo_url === "string" && /^https:\/\//.test(u.photo_url) ? u.photo_url.slice(0, 500) : null;
  const [ex] = await q.query<{ id: number }>("SELECT id FROM players WHERE telegram_id=$1", [u.id]);
  if (ex) {
    await q.query(
      "UPDATE players SET display_name=CASE WHEN name_custom THEN display_name ELSE $2 END, username=$3, photo_url=COALESCE($4, photo_url), pm_blocked = CASE WHEN $5 THEN false ELSE pm_blocked END WHERE id=$1",
      [ex.id, name, username, photo, u.allows_write_to_pm === true],
    );
    return ex.id;
  }
  return createPlayer(q, { telegramId: u.id, username, name, photo });
}

export async function upsertGuestPlayer(q: Queryable, guestId: string): Promise<number> {
  const [ex] = await q.query<{ id: number }>("SELECT id FROM players WHERE guest_id=$1", [guestId]);
  if (ex) return ex.id;
  return createPlayer(q, { guestId, name: `Гость ${guestId.slice(0, 4).toUpperCase()}` });
}

/** Activity days: counts each Moscow day the player opened the game. */
export async function touchActivity(q: Queryable, pid: number, day: string, now: number) {
  await q.query(
    "UPDATE players SET last_seen_at=$3, active_days = active_days + CASE WHEN last_day IS DISTINCT FROM $2::date THEN 1 ELSE 0 END, last_day=$2::date WHERE id=$1",
    [pid, day, new Date(now)],
  );
}
