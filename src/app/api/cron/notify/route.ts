export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDb } from "../../../../server/db.ts";
import { json } from "../../../../server/http.ts";
import { dispatchNotifications } from "../../../../server/notify-send.ts";

/**
 * Sends due Telegram reminders. Called by Vercel Cron and an external pinger; harmless to call often:
 * runs are throttled in the DB and only rows already due are sent. With CRON_SECRET set, the caller must present it.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  try {
    return json(await dispatchNotifications(await getDb()));
  } catch {
    return json({ error: "failed" }, 500);
  }
}
