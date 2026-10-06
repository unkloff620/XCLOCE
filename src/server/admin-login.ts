/*
 * Browser sign-in to the admin panel confirmed in the Telegram app:
 *   1. the browser asks for a code (start) and gets {code, secret};
 *   2. it opens t.me/<bot>?startapp=al_<code>: the Mini App shows where the request came from and the admin confirms
 *      it (approve, signed by initData);
 *   3. the browser polls with the secret and gets the admin session once.
 * The code alone is not enough to take the session: that needs the secret, which never leaves the browser.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { GameError, type Db } from "./db.ts";
import { loadConfig } from "./config.ts";
import { issueAdminSession } from "./auth.ts";

export const LOGIN_CODE_TTL_MIN = 5;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const CODE = /^[0-9a-f]{24}$/;
const expired = () => new GameError("code_expired", "Код входа устарел. Начните вход заново", 410);

export async function startLogin(db: Db, ip: string, ua: string) {
  await db.query("DELETE FROM admin_login_codes WHERE created_at < now() - interval '1 day'");
  const code = randomBytes(12).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  await db.query("INSERT INTO admin_login_codes (code, secret_hash, ip, ua) VALUES ($1,$2,$3,$4)", [code, hash(secret), ip.slice(0, 64), ua.slice(0, 300)]);
  return { code, secret, ttlMin: LOGIN_CODE_TTL_MIN };
}

type CodeRow = { code: string; secret_hash: string; ip: string | null; ua: string | null; tg: number | null; created_at: Date; approved_at: Date | null; used_at: Date | null };
async function fresh(db: Db, code: unknown): Promise<CodeRow> {
  if (typeof code !== "string" || !CODE.test(code)) throw new GameError("bad_request", "Некорректный код входа", 400);
  const [r] = await db.query<CodeRow>(`SELECT * FROM admin_login_codes WHERE code=$1 AND created_at > now() - interval '${LOGIN_CODE_TTL_MIN} minutes'`, [code]);
  if (!r || r.used_at) throw expired();
  return r;
}

/** In the Mini App: what is asking to sign in (shown before confirming); with confirm, approves it for this admin. */
export async function approveLogin(db: Db, code: unknown, tg: number, confirm: boolean) {
  const r = await fresh(db, code);
  const cfg = await loadConfig(db);
  if (!cfg.admins.includes(tg)) throw new GameError("not_admin", `Нет доступа. Ваш Telegram ID: ${tg}`, 403);
  if (r.approved_at && Number(r.tg) !== tg) throw expired();
  if (confirm && !r.approved_at) await db.query("UPDATE admin_login_codes SET tg=$2, approved_at=now() WHERE code=$1", [r.code, tg]);
  return { ip: r.ip, ua: r.ua, createdAt: r.created_at, approved: confirm || !!r.approved_at, short: shortCode(r.code) };
}

/** In the browser: pending until approved, then the session — once. */
export async function pollLogin(db: Db, code: unknown, secret: unknown) {
  const r = await fresh(db, code);
  const given = Buffer.from(hash(typeof secret === "string" ? secret : ""));
  if (!timingSafeEqual(given, Buffer.from(r.secret_hash))) throw new GameError("bad_request", "Некорректный код входа", 400);
  if (!r.approved_at || !r.tg) return { status: "pending" as const };
  const used = await db.query("UPDATE admin_login_codes SET used_at=now() WHERE code=$1 AND used_at IS NULL RETURNING code", [r.code]);
  if (!used.length) throw expired();
  const tg = Number(r.tg);
  return { status: "ok" as const, token: issueAdminSession(tg), tg };
}

/** 4 characters shown both in the browser and in Telegram, to check it is the same request */
export const shortCode = (code: string) => code.slice(0, 4).toUpperCase();
