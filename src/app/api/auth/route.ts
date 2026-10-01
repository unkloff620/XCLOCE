export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute, str } from "../../../server/http.ts";
import { validateInitData, issueSession, guestAllowed } from "../../../server/auth.ts";
import { upsertTelegramPlayer, upsertGuestPlayer } from "../../../server/game.ts";
import { GameError } from "../../../server/db.ts";
import { log } from "../../../server/log.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = publicRoute("auth", async ({ db, body }) => {
  if (typeof body.initData === "string" && body.initData.length > 0) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new GameError("auth_unconfigured", "Бот не настроен на сервере", 503);
    const { user, startParam } = validateInitData(body.initData, token);
    const ref = startParam?.startsWith("ref_") ? startParam.slice(4) : undefined;
    const playerId = await db.tx((tx) => upsertTelegramPlayer(tx, user, ref));
    log.info("auth.telegram", { playerId });
    return { token: issueSession(playerId), mode: "telegram" };
  }
  if (!guestAllowed()) throw new GameError("auth_required", "Откройте игру через Telegram", 401);
  const guestId = str(body.guestId, "guestId", 64);
  if (!UUID.test(guestId)) throw new GameError("bad_request", "Некорректный гостевой id", 400);
  const playerId = await db.tx((tx) => upsertGuestPlayer(tx, guestId.toLowerCase()));
  log.info("auth.guest", { playerId });
  return { token: issueSession(playerId), mode: "guest" };
});
