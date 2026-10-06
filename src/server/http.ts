import { GameError, getDb, type Db } from "./db.ts";
import { verifyAdminSession, verifySession } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { log } from "./log.ts";
import { after } from "next/server";
import { dispatchNotifications } from "./notify-send.ts";

/** After the response: send due Telegram reminders (throttled in the DB, so most calls do nothing). */
function kickNotifications(db: Db) {
  try {
    after(() => dispatchNotifications(db).catch((e) => log.warn("notify.fail", { message: String(e?.message ?? e).slice(0, 200) })));
  } catch {
    /* outside a request (tests) */
  }
}

type Ctx = { db: Db; req: Request; body: Record<string, unknown>; playerId: number };
type PublicCtx = Omit<Ctx, "playerId">;

// Best-effort per-instance limiter (serverless instances do not share memory; DB-side
// per-player cooldowns in game.ts are the authoritative anti-spam layer).
const buckets = new Map<string, { tokens: number; at: number }>();
function allow(key: string, capacity = 40, refillPerSec = 8): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, at: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * refillPerSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function errorResponse(e: unknown, route: string): Response {
  if (e instanceof GameError) {
    if (e.status >= 500) log.error("api.error", { route, code: e.code });
    return json({ error: { code: e.code, message: e.message } }, e.status);
  }
  const err = e as { message?: string; code?: string };
  // Postgres serialization / lock timeouts are retryable.
  if (err?.code === "40001" || err?.code === "40P01" || err?.code === "55P03") {
    log.warn("api.retryable", { route, code: err.code });
    return json({ error: { code: "busy", message: "Сервер занят, попробуйте ещё раз" } }, 503);
  }
  log.error("api.unhandled", { route, message: err?.message?.slice(0, 300), code: err?.code });
  return json({ error: { code: "internal", message: "Что-то пошло не так. Попробуйте ещё раз" } }, 500);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET" || req.method === "HEAD") return {};
  const text = await req.text();
  if (!text) return {};
  if (text.length > 16_384) throw new GameError("too_large", "Слишком большой запрос", 413);
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : {};
  } catch {
    throw new GameError("bad_json", "Некорректный запрос", 400);
  }
}

export function publicRoute(name: string, fn: (ctx: PublicCtx) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      if (!allow("ip:" + clientKey(req), 60, 10)) throw new GameError("rate_limited", "Слишком много запросов", 429);
      const body = await readBody(req);
      const db = await getDb();
      return json(await fn({ db, req, body }));
    } catch (e) {
      return errorResponse(e, name);
    }
  };
}

export function authedRoute(name: string, fn: (ctx: Ctx) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      const auth = req.headers.get("authorization");
      const playerId = verifySession(auth?.startsWith("Bearer ") ? auth.slice(7) : null);
      if (!allow("p:" + playerId, 30, 6) || !allow("ip:" + clientKey(req), 80, 15)) {
        throw new GameError("rate_limited", "Слишком много запросов. Помедленнее", 429);
      }
      const body = await readBody(req);
      const db = await getDb();
      const out = json(await fn({ db, req, body, playerId }));
      kickNotifications(db);
      return out;
    } catch (e) {
      return errorResponse(e, name);
    }
  };
}

/** Admin panel: an admin session whose Telegram id is still in the admin list (env ADMIN_TELEGRAM_IDS / config "admins"). */
export function adminRoute(name: string, fn: (ctx: PublicCtx & { adminTg: number }) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      if (!allow("adm:" + clientKey(req), 60, 10)) throw new GameError("rate_limited", "Слишком много запросов", 429);
      const auth = req.headers.get("authorization");
      const adminTg = verifyAdminSession(auth?.startsWith("Bearer ") ? auth.slice(7) : null);
      const body = await readBody(req);
      const db = await getDb();
      const cfg = await loadConfig(db);
      if (!cfg.admins.includes(adminTg)) throw new GameError("not_admin", "Нет доступа к админке", 403);
      return json(await fn({ db, req, body, adminTg }));
    } catch (e) {
      return errorResponse(e, name);
    }
  };
}

// ---- tiny validators (keep bundle small; zod not needed for flat payloads) ----
export function str(v: unknown, name: string, max = 200): string {
  if (typeof v !== "string" || !v || v.length > max) throw new GameError("bad_request", `Некорректное поле ${name}`, 400);
  return v;
}
export function num(v: unknown, name: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new GameError("bad_request", `Некорректное число ${name}`, 400);
  return n;
}
export function oneOf<T extends string>(v: unknown, values: readonly T[], name: string): T {
  if (typeof v !== "string" || !values.includes(v as T)) throw new GameError("bad_request", `Некорректное поле ${name}`, 400);
  return v as T;
}
