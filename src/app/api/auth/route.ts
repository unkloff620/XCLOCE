export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute, str } from "../../../server/http.ts";
import { guestAllowed, issueSession, validateInitData, validateLoginWidget } from "../../../server/auth.ts";
import { upsertGuestPlayer, upsertTelegramPlayer } from "../../../server/players.ts";
import { GameError } from "../../../server/db.ts";
import { log } from "../../../server/log.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Telegram Mini App initData, Telegram Login Widget (desktop browser) or — outside production — a guest id. */
export const POST = publicRoute("auth", async ({ db, body }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (typeof body.initData === "string" && body.initData.length > 0) {
    if (!token) throw new GameError("auth_unconfigured", "Бот не настроен на сервере", 503);
    const { user } = validateInitData(body.initData, token);
    const playerId = await db.tx((q) => upsertTelegramPlayer(q, user));
    log.info("auth.telegram", { playerId });
    return { token: issueSession(playerId), mode: "telegram" };
  }
  if (body.widget && typeof body.widget === "object") {
    if (!token) throw new GameError("auth_unconfigured", "Бот не настроен на сервере", 503);
    const user = validateLoginWidget(body.widget as Record<string, unknown>, token);
    const playerId = await db.tx((q) => upsertTelegramPlayer(q, user));
    log.info("auth.widget", { playerId });
    return { token: issueSession(playerId), mode: "telegram" };
  }
  if (!guestAllowed()) throw new GameError("auth_required", "Открой игру через Telegram", 401);
  const guestId = str(body.guestId, "guestId", 64);
  if (!UUID.test(guestId)) throw new GameError("bad_request", "Некорректный гостевой id", 400);
  const playerId = await db.tx((q) => upsertGuestPlayer(q, guestId.toLowerCase()));
  log.info("auth.guest", { playerId });
  return { token: issueSession(playerId), mode: "guest" };
});
