export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { publicRoute, num } from "../../../../server/http.ts";
import { adminDevLogin, issueAdminSession, validateInitData, validateLoginWidget } from "../../../../server/auth.ts";
import { loadConfig } from "../../../../server/config.ts";
import { GameError } from "../../../../server/db.ts";
import { log } from "../../../../server/log.ts";

/** Admin sign-in: the Mini App's initData (Telegram Desktop / phone) or the Login Widget (browser); the id must be in the admin list. */
export const POST = publicRoute("admin.login", async ({ db, body }) => {
  let tg: number;
  if (typeof body.initData === "string" && body.initData.length > 0) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new GameError("auth_unconfigured", "Бот не настроен на сервере", 503);
    tg = validateInitData(body.initData, token).user.id;
  } else if (body.widget && typeof body.widget === "object") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new GameError("auth_unconfigured", "Бот не настроен на сервере", 503);
    tg = validateLoginWidget(body.widget as Record<string, unknown>, token).id;
  } else if (body.dev !== undefined && adminDevLogin()) {
    tg = num(body.dev, "dev");
  } else {
    throw new GameError("bad_request", "Нужен вход через Telegram", 400);
  }
  const cfg = await loadConfig(db);
  if (!cfg.admins.includes(tg)) {
    log.warn("admin.denied", { tg });
    // the id is shown so the owner can add it to ADMIN_TELEGRAM_IDS
    throw new GameError("not_admin", `Нет доступа. Ваш Telegram ID: ${tg}`, 403);
  }
  log.info("admin.login", { tg });
  return { token: issueAdminSession(tg), tg };
});

/** Which sign-in the page should offer. */
export const GET = publicRoute("admin.login", async () => ({ dev: adminDevLogin() }));
