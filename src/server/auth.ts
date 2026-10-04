import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { GameError } from "./db.ts";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
  /** the user let the bot write to them (Mini App write access) */
  allows_write_to_pm?: boolean;
}

export const INIT_DATA_MAX_AGE_S = 24 * 3600;

/**
 * Validates Telegram Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the user and start_param on success, throws GameError otherwise.
 */
export function validateInitData(initData: string, botToken: string, nowS = Math.floor(Date.now() / 1000)) {
  if (!initData || initData.length > 4096) throw new GameError("auth_invalid", "Некорректные данные Telegram", 401);
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new GameError("auth_invalid", "Нет подписи Telegram", 401);
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) if (k !== "hash") pairs.push(`${k}=${v}`);
  pairs.sort();
  const dataCheckString = pairs.join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new GameError("auth_invalid", "Подпись Telegram не прошла проверку", 401);
  }
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || nowS - authDate > INIT_DATA_MAX_AGE_S) {
    throw new GameError("auth_expired", "Сессия Telegram устарела. Перезапустите игру", 401);
  }
  const userRaw = params.get("user");
  if (!userRaw) throw new GameError("auth_invalid", "Нет данных пользователя", 401);
  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new GameError("auth_invalid", "Некорректные данные пользователя", 401);
  }
  if (!user || typeof user.id !== "number") throw new GameError("auth_invalid", "Некорректный пользователь", 401);
  return { user, startParam: params.get("start_param") ?? undefined };
}

/** Builds a valid initData string. Used by tests and local tooling only. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort();
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  const p = new URLSearchParams(fields);
  p.set("hash", hash);
  return p.toString();
}

// ---------------- Session tokens ----------------
const SESSION_TTL_S = 7 * 24 * 3600;

export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const base = process.env.TELEGRAM_BOT_TOKEN || process.env.DATABASE_URL || process.env.POSTGRES_URL || "xcloce-local-dev";
  return createHash("sha256").update("xcloce-session:" + base).digest("hex");
}

function b64url(s: string | Buffer): string {
  return Buffer.from(s).toString("base64url");
}

export function issueSession(playerId: number, nowS = Math.floor(Date.now() / 1000)): string {
  const payload = b64url(JSON.stringify({ pid: playerId, exp: nowS + SESSION_TTL_S }));
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token: string | null | undefined, nowS = Math.floor(Date.now() / 1000)): number {
  if (!token) throw new GameError("auth_required", "Нужно войти заново", 401);
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new GameError("auth_required", "Нужно войти заново", 401);
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new GameError("auth_required", "Нужно войти заново", 401);
  let data: { pid: number; exp: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    throw new GameError("auth_required", "Нужно войти заново", 401);
  }
  if (!data.pid || data.exp < nowS) throw new GameError("auth_required", "Сессия истекла, перезапустите игру", 401);
  return data.pid;
}

/**
 * Guest (browser, no Telegram) play exists for local development, tests and preview deployments.
 * In production the account is always a Telegram account unless ALLOW_GUEST=true is set explicitly.
 */
export function guestAllowed(): boolean {
  if (process.env.ALLOW_GUEST === "true") return true;
  if (process.env.ALLOW_GUEST === "false") return false;
  return process.env.VERCEL_ENV !== "production";
}

/**
 * Validates data from the Telegram Login Widget (desktop browser login, https://core.telegram.org/widgets/login#checking-authorization).
 * Requires the game's domain to be set for the bot in BotFather (/setdomain).
 */
export function validateLoginWidget(data: Record<string, unknown>, botToken: string, nowS = Math.floor(Date.now() / 1000)): TelegramUser {
  const hash = typeof data.hash === "string" ? data.hash : "";
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new GameError("auth_invalid", "Нет подписи Telegram", 401);
  const allowed = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"];
  const pairs = Object.entries(data)
    .filter(([k, v]) => allowed.includes(k) && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(pairs.join("\n")).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new GameError("auth_invalid", "Подпись Telegram не прошла проверку", 401);
  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate) || nowS - authDate > INIT_DATA_MAX_AGE_S) throw new GameError("auth_expired", "Вход устарел, войдите ещё раз", 401);
  const id = Number(data.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new GameError("auth_invalid", "Некорректный пользователь", 401);
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : undefined);
  return { id, first_name: s("first_name"), last_name: s("last_name"), username: s("username"), photo_url: s("photo_url") };
}

/** Test helper: signs Login Widget data. */
export function signLoginWidget(fields: Record<string, string | number>, botToken: string): Record<string, string | number> {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort();
  const secret = createHash("sha256").update(botToken).digest();
  return { ...fields, hash: createHmac("sha256", secret).update(pairs.join("\n")).digest("hex") };
}
export function newGuestId(): string {
  return randomUUID();
}
