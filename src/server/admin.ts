/*
 * Admin panel (outside the game, /admin): overview, players, a player's card with everything about them, the action
 * log, and edits. Every edit goes through one transaction with the player row locked, is written to the ledger with
 * reason `admin:<telegram id>` and to admin_log (who, whom, what, before → after).
 */
import { GameError, type Db, type Queryable } from "./db.ts";
import { loadConfig } from "./config.ts";
import { energyNow, type Ctx, type PlayerRow } from "./core.ts";
import { giveStartKit } from "./players.ts";
import { leaveClan } from "./systems/clans.ts";
import { ENERGY } from "../content/levels.ts";
import { CURRENCIES, floorTo, isCurrency } from "../content/currencies.ts";
import { itemById } from "../content/items.ts";
import { levelFromXp } from "../content/levels.ts";
import { TALENT_BRANCHES, TALENT_WEAPONS } from "../content/talents.ts";

const n = (v: unknown) => Number(v ?? 0);

/** keep the action log bounded: older entries go away when an admin opens the overview */
const ACTION_LOG_DAYS = 60;

export async function dashboard(db: Db) {
  await db.query(`DELETE FROM action_log WHERE at < now() - interval '${ACTION_LOG_DAYS} days'`);
  const [c] = await db.query<Record<string, number>>(`
    SELECT
      (SELECT COUNT(*) FROM players)::int AS players,
      (SELECT COUNT(*) FROM players WHERE telegram_id IS NOT NULL)::int AS telegram,
      (SELECT COUNT(*) FROM players WHERE created_at > now() - interval '1 day')::int AS new24,
      (SELECT COUNT(*) FROM players WHERE last_seen_at > now() - interval '15 minutes')::int AS online,
      (SELECT COUNT(*) FROM players WHERE last_seen_at > now() - interval '1 day')::int AS active24,
      (SELECT COUNT(*) FROM players WHERE last_seen_at > now() - interval '7 days')::int AS active7,
      (SELECT COUNT(*) FROM players WHERE banned_at IS NOT NULL)::int AS banned,
      (SELECT COUNT(*) FROM fights WHERE status = 'active')::int AS fights,
      (SELECT COUNT(*) FROM boss_hits WHERE created_at > now() - interval '1 day')::int AS hits24,
      (SELECT COALESCE(SUM(damage), 0) FROM boss_hits WHERE created_at > now() - interval '1 day')::bigint AS damage24,
      (SELECT COUNT(*) FROM action_log WHERE at > now() - interval '1 day')::int AS actions24,
      (SELECT COUNT(*) FROM action_log WHERE at > now() - interval '1 day' AND NOT ok)::int AS failed24`);
  const byType = await db.query<{ type: string; total: number; failed: number }>(`
    SELECT type, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT ok)::int AS failed
    FROM action_log WHERE at > now() - interval '1 day' GROUP BY type ORDER BY total DESC`);
  const top = await db.query(`
    SELECT p.id, p.display_name, p.username, p.photo_url, s.total_damage FROM player_stats s JOIN players p ON p.id = s.player_id
    ORDER BY s.total_damage DESC LIMIT 10`);
  // the busiest players of the day: many refused actions are what a script or a cheat looks like
  const suspicious = await db.query(`
    SELECT a.player_id AS id, p.display_name, p.username, p.photo_url, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT a.ok)::int AS failed
    FROM action_log a JOIN players p ON p.id = a.player_id WHERE a.at > now() - interval '1 day'
    GROUP BY a.player_id, p.display_name, p.username, p.photo_url HAVING COUNT(*) FILTER (WHERE NOT a.ok) >= 20
    ORDER BY failed DESC LIMIT 10`);
  return { counts: c, byType, top, suspicious };
}

export async function actions(db: Db, f: { playerId?: number; type?: string; failed?: boolean; before?: number; limit?: number; sinceHours?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.playerId) where.push(`a.player_id = $${args.push(f.playerId)}`);
  if (f.type) where.push(`a.type = $${args.push(f.type)}`);
  if (f.failed) where.push("NOT a.ok");
  if (f.before) where.push(`a.id < $${args.push(f.before)}`);
  if (f.sinceHours) where.push(`a.at > now() - make_interval(hours => $${args.push(Math.min(24 * 60, Math.max(1, Math.floor(f.sinceHours)))) }::int)`);
  const limit = Math.min(500, Math.max(1, f.limit ?? 100));
  return db.query(
    `SELECT a.id, a.player_id, p.display_name, p.username, p.photo_url, p.telegram_id, a.type, a.ok, a.info, a.at
     FROM action_log a LEFT JOIN players p ON p.id = a.player_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY a.id DESC LIMIT ${limit}`,
    args,
  );
}

const SORTS = {
  seen: "p.last_seen_at DESC",
  new: "p.created_at DESC",
  xp: "p.xp DESC",
  damage: "COALESCE(s.total_damage, 0) DESC",
} as const;
export type PlayerSort = keyof typeof SORTS;
export const PLAYER_SORTS = Object.keys(SORTS) as PlayerSort[];

export async function players(db: Db, f: { q?: string; sort?: PlayerSort; offset?: number; banned?: boolean }) {
  const where: string[] = [];
  const args: unknown[] = [];
  const q = f.q?.trim();
  if (q) {
    const num = /^\d+$/.test(q) ? Number(q) : null;
    const like = `$${args.push("%" + q.replace(/^@/, "").replace(/[%_\\]/g, "\\$&") + "%")}`;
    where.push(num !== null
      ? `(p.id = $${args.push(num)} OR p.telegram_id = $${args.length} OR p.display_name ILIKE ${like} OR p.username ILIKE ${like})`
      : `(p.display_name ILIKE ${like} OR p.username ILIKE ${like})`);
  }
  if (f.banned) where.push("p.banned_at IS NOT NULL");
  const sql = (cols: string, tail: string) => `
    SELECT ${cols} FROM players p
    LEFT JOIN player_stats s ON s.player_id = p.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ${tail}`;
  const offset = Math.max(0, Math.floor(f.offset ?? 0));
  const rows = await db.query(
    sql(
      "p.id, p.telegram_id, p.username, p.display_name, p.photo_url, p.xp, p.created_at, p.last_seen_at, p.active_days, p.banned_at, COALESCE(s.total_damage, 0) AS damage",
      `ORDER BY ${SORTS[f.sort ?? "seen"] ?? SORTS.seen}, p.id DESC LIMIT 50 OFFSET ${offset}`,
    ),
    args,
  );
  const [{ total }] = await db.query<{ total: number }>(sql("COUNT(*)::int AS total", ""), args);
  const cfg = await loadConfig(db);
  return { total, rows: rows.map((r) => ({ ...r, level: levelFromXp(n(r.xp), cfg.levels).level })) };
}

export async function player(db: Db, id: number) {
  const cfg = await loadConfig(db);
  const [p] = await db.query<PlayerRow & { guest_id: string | null; banned_at: Date | null; ban_reason: string | null; talents: number }>("SELECT * FROM players WHERE id=$1", [id]);
  if (!p) throw new GameError("no_player", "Игрок не найден", 404);
  const e = energyNow(p.energy, new Date(p.energy_at).getTime(), Date.now(), cfg.energy);
  const [wallet, inventory, [stats], talents, [clan], fights, acts, ledger, admin] = await Promise.all([
    db.query<{ currency: string; amount: number }>("SELECT currency, amount FROM wallets WHERE player_id=$1", [id]),
    db.query<{ item_id: string; qty: number; source: string | null; updated_at: Date }>("SELECT item_id, qty, source, updated_at FROM inventory WHERE player_id=$1 AND qty > 0 ORDER BY item_id", [id]),
    db.query("SELECT * FROM player_stats WHERE player_id=$1", [id]),
    db.query("SELECT weapon_id, branch, level FROM player_talents WHERE player_id=$1 AND level > 0 ORDER BY weapon_id, branch", [id]),
    db.query("SELECT c.id, c.name, c.tag, m.role FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.player_id=$1", [id]),
    db.query("SELECT id, boss_id, status, solo, started_at, ended_at, my_damage, my_hits, reward FROM fights WHERE player_id=$1 ORDER BY id DESC LIMIT 30", [id]),
    actions(db, { playerId: id, limit: 200 }),
    db.query("SELECT id, kind, key, delta, reason, created_at FROM ledger WHERE player_id=$1 ORDER BY id DESC LIMIT 300", [id]),
    db.query(`SELECT a.id, a.admin_tg, ${ADMIN_COLS}, a.op, a.info, a.at FROM admin_log a LEFT JOIN players ap ON ap.telegram_id = a.admin_tg WHERE a.player_id=$1 ORDER BY a.id DESC LIMIT 100`, [id]),
  ]);
  const money = Object.fromEntries(CURRENCIES.map((c) => [c, n(wallet.find((w) => w.currency === c)?.amount)]));
  return {
    player: { ...p, level: levelFromXp(n(p.xp), cfg.levels).level, energyNow: e.energy },
    money,
    inventory: inventory.map((r) => ({ ...r, name: itemById(r.item_id)?.name ?? r.item_id, category: itemById(r.item_id)?.category ?? "?" })),
    stats: stats ?? null,
    talents,
    clan: clan ?? null,
    fights,
    actions: acts,
    ledger,
    admin,
  };
}

/** the admin as a player of the game (same Telegram id): name, avatar and username for the log */
const ADMIN_COLS = `ap.display_name AS admin_name, ap.username AS admin_username, ap.photo_url AS admin_photo`;

export async function adminLog(db: Db, before?: number) {
  return db.query(
    `SELECT a.id, a.admin_tg, ${ADMIN_COLS}, a.player_id, p.display_name, p.username, p.photo_url, p.telegram_id, a.op, a.info, a.at
     FROM admin_log a LEFT JOIN players p ON p.id = a.player_id LEFT JOIN players ap ON ap.telegram_id = a.admin_tg
     ${before ? "WHERE a.id < $1" : ""} ORDER BY a.id DESC LIMIT 200`,
    before ? [before] : [],
  );
}

// ---------------- edits ----------------
export type Edit =
  | { op: "set_money"; currency: string; amount: number }
  | { op: "set_item"; item: string; qty: number }
  | { op: "set_xp"; value: number }
  | { op: "set_energy"; value: number }
  | { op: "set_talents"; value: number }
  | { op: "set_talent"; weapon: string; branch: string; level: number }
  | { op: "set_name"; value: string }
  | { op: "ban"; reason: string }
  | { op: "unban" }
  | { op: "reset" };
export const EDIT_OPS = ["set_money", "set_item", "set_xp", "set_energy", "set_talents", "set_talent", "set_name", "ban", "unban", "reset"] as const;

/**
 * Everything a player has earned, keyed by player_id. The reset wipes these and gives the starting kit again.
 * Kept: the account itself (Telegram id, name, avatar, ban), the logs (ledger, action_log, admin_log) and the shared
 * boss history (boss_hits).
 */
const PROGRESS_TABLES = [
  "wallets", "inventory", "cooldowns", "appearance", "player_stats", "fights", "boss_damage", "task_progress",
  "location_claims", "yard", "yard_items", "daily_login", "slot_spins", "player_equipment", "daily_quests",
  "notifications", "weekly_stats", "week_results", "prizes", "achievements", "boss_pity", "player_unlocks",
  "player_talents", "idempotency",
] as const;

const bad = (m: string) => new GameError("bad_request", m, 400);
function wholeIn(v: number, min: number, max: number, what: string): number {
  if (!Number.isFinite(v) || Math.floor(v) !== v || v < min || v > max) throw bad(`${what}: целое от ${min} до ${max}`);
  return v;
}

async function note(q: Queryable, adminTg: number, pid: number, op: string, info: Record<string, unknown>) {
  await q.query("INSERT INTO admin_log (admin_tg, player_id, op, info) VALUES ($1,$2,$3,$4)", [adminTg, pid, op, JSON.stringify(info)]);
}
async function ledgerRow(q: Queryable, pid: number, kind: string, key: string, delta: number, adminTg: number) {
  if (delta !== 0) await q.query("INSERT INTO ledger (player_id, kind, key, delta, reason) VALUES ($1,$2,$3,$4,$5)", [pid, kind, key, delta, `admin:${adminTg}`]);
}

/** Applies one edit; returns before/after for the panel. */
export async function edit(db: Db, adminTg: number, pid: number, e: Edit) {
  return db.tx(async (q) => {
    const [p] = await q.query<PlayerRow & { talents: number; banned_at: Date | null }>("SELECT * FROM players WHERE id=$1 FOR UPDATE", [pid]);
    if (!p) throw new GameError("no_player", "Игрок не найден", 404);
    let info: Record<string, unknown>;
    switch (e.op) {
      case "set_money": {
        if (!isCurrency(e.currency)) throw bad("Неизвестная валюта");
        if (!Number.isFinite(e.amount) || e.amount < 0 || e.amount > 1e15) throw bad("Сумма: от 0 до 10^15");
        const to = floorTo(e.currency, e.amount);
        const [w] = await q.query<{ amount: number }>("SELECT amount FROM wallets WHERE player_id=$1 AND currency=$2", [pid, e.currency]);
        const from = n(w?.amount);
        await q.query(
          "INSERT INTO wallets (player_id, currency, amount) VALUES ($1,$2,$3) ON CONFLICT (player_id, currency) DO UPDATE SET amount = EXCLUDED.amount",
          [pid, e.currency, to],
        );
        await ledgerRow(q, pid, "currency", e.currency, Math.round((to - from) * 1e8) / 1e8, adminTg);
        info = { currency: e.currency, from, to };
        break;
      }
      case "set_item": {
        const def = itemById(e.item);
        if (!def) throw bad("Неизвестный предмет");
        const to = wholeIn(e.qty, 0, def.maxStack, `Количество «${def.name}»`);
        const [r] = await q.query<{ qty: number }>("SELECT qty FROM inventory WHERE player_id=$1 AND item_id=$2", [pid, e.item]);
        const from = r?.qty ?? 0;
        if (to === 0) {
          await q.query("DELETE FROM inventory WHERE player_id=$1 AND item_id=$2", [pid, e.item]);
          // a removed piece of clothing comes off the character too
          if (def.slot) await q.query("UPDATE appearance SET equipped = equipped - $2::text WHERE player_id=$1 AND equipped->>$2::text = $3", [pid, def.slot, def.id]);
        } else {
          await q.query(
            "INSERT INTO inventory (player_id, item_id, qty, source, updated_at) VALUES ($1,$2,$3,'admin',now()) ON CONFLICT (player_id, item_id) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now()",
            [pid, e.item, to],
          );
        }
        await ledgerRow(q, pid, "item", e.item, to - from, adminTg);
        info = { item: e.item, from, to };
        break;
      }
      case "set_xp": {
        const to = wholeIn(e.value, 0, 1e12, "Авторитет");
        await q.query("UPDATE players SET xp=$2 WHERE id=$1", [pid, to]);
        await ledgerRow(q, pid, "xp", "xp", to - n(p.xp), adminTg);
        info = { from: n(p.xp), to };
        break;
      }
      case "set_energy": {
        const to = wholeIn(e.value, 0, 1_000_000, "Энергия");
        const cfg = await loadConfig(q);
        const from = energyNow(p.energy, new Date(p.energy_at).getTime(), Date.now(), cfg.energy).energy;
        await q.query("UPDATE players SET energy=$2, energy_at=now() WHERE id=$1", [pid, to]);
        await ledgerRow(q, pid, "energy", "energy", to - from, adminTg);
        info = { from, to };
        break;
      }
      case "set_talents": {
        const to = wholeIn(e.value, 0, 100_000, "Свободные таланты");
        await q.query("UPDATE players SET talents=$2 WHERE id=$1", [pid, to]);
        await ledgerRow(q, pid, "talent", "talent", to - n(p.talents), adminTg);
        info = { from: n(p.talents), to };
        break;
      }
      case "set_talent": {
        const br = TALENT_BRANCHES.find((b) => b.id === e.branch);
        if (!br || !TALENT_WEAPONS.includes(e.weapon)) throw bad("Неизвестное оружие или ветка");
        const to = wholeIn(e.level, 0, br.maxLevel, `Уровень ветки «${br.name}»`);
        const [r] = await q.query<{ level: number }>("SELECT level FROM player_talents WHERE player_id=$1 AND weapon_id=$2 AND branch=$3", [pid, e.weapon, e.branch]);
        await q.query(
          "INSERT INTO player_talents (player_id, weapon_id, branch, level) VALUES ($1,$2,$3,$4) ON CONFLICT (player_id, weapon_id, branch) DO UPDATE SET level = EXCLUDED.level",
          [pid, e.weapon, e.branch, to],
        );
        info = { weapon: e.weapon, branch: e.branch, from: r?.level ?? 0, to };
        break;
      }
      case "set_name": {
        const to = String(e.value ?? "").trim();
        if (to.length < 1 || to.length > 32) throw bad("Имя: от 1 до 32 символов");
        await q.query("UPDATE players SET display_name=$2 WHERE id=$1", [pid, to]);
        info = { from: p.display_name, to };
        break;
      }
      case "ban": {
        const reason = String(e.reason ?? "").trim().slice(0, 200);
        await q.query("UPDATE players SET banned_at=now(), ban_reason=$2 WHERE id=$1", [pid, reason || null]);
        info = { reason };
        break;
      }
      case "reset": {
        // what was there, for the log
        const [st] = await q.query<{ total_damage: number }>("SELECT total_damage FROM player_stats WHERE player_id=$1", [pid]);
        const money = await q.query<{ currency: string; amount: number }>("SELECT currency, amount FROM wallets WHERE player_id=$1", [pid]);
        const before = { xp: n(p.xp), talents: n(p.talents), damage: n(st?.total_damage), money: Object.fromEntries(money.map((m) => [m.currency, n(m.amount)])) };
        // out of the clan first (a leader hands the clan to the oldest member; an empty clan is closed)
        if ((await q.query("SELECT 1 FROM clan_members WHERE player_id=$1", [pid])).length) await leaveClan({ q, pid } as Ctx);
        for (const t of PROGRESS_TABLES) await q.query(`DELETE FROM ${t} WHERE player_id=$1`, [pid]);
        await q.query("UPDATE players SET xp=0, talents=0, energy=$2, energy_at=now(), clan_id=NULL WHERE id=$1", [pid, ENERGY.start]);
        await giveStartKit(q, pid);
        info = { before };
        break;
      }
      case "unban": {
        await q.query("UPDATE players SET banned_at=NULL, ban_reason=NULL WHERE id=$1", [pid]);
        info = {};
        break;
      }
      default:
        throw bad("Неизвестная правка");
    }
    await note(q, adminTg, pid, e.op, info);
    return { op: e.op, ...info };
  });
}
