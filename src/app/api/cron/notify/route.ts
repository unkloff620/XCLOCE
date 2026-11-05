export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDb } from "../../../../server/db.ts";
import { json } from "../../../../server/http.ts";
import { dispatchNotifications } from "../../../../server/notify-send.ts";

/**
 * Sends due Telegram reminders. Called by Vercel Cron (every 15 min, 09:00–23:59 MSK) and maybe an external pinger.
 * To let the database sleep while nobody plays, this route touches it only at :00/:15/:30/:45 and never at night
 * (00–09 MSK only live calls go out, and those come from players' own requests, http.ts → kickNotifications).
 * With CRON_SECRET set, the caller must present it.
 */
function wakeDbNow(now = Date.now()): boolean {
  const d = new Date(now + 3 * 3600_000);
  return d.getUTCHours() >= 9 && d.getUTCMinutes() % 15 < 2;
}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  if (!wakeDbNow()) return json({ sent: 0, skipped: 0, idle: true });
  try {
    return json(await dispatchNotifications(await getDb()));
  } catch {
    return json({ error: "failed" }, 500);
  }
}
