export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "../../../server/http.ts";
import { guestAllowed } from "../../../server/auth.ts";

let botUsername: string | null | undefined;
/** the bot has a main Mini App, so t.me/<bot>?startapp=… opens the game right away */
let mainApp = false;
let triedAt = 0;

/** Public client config: whether guests may play, the bot username for the desktop Login Widget and the admin's «open in Telegram» link. */
export async function GET() {
  // a failed lookup is retried after a minute instead of being cached forever
  if (!botUsername && process.env.TELEGRAM_BOT_TOKEN && Date.now() - triedAt > 60_000) {
    triedAt = Date.now();
    try {
      const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; result?: { username?: string; has_main_web_app?: boolean } };
      botUsername = j.ok ? j.result?.username ?? null : null;
      mainApp = !!j.result?.has_main_web_app;
    } catch {
      botUsername = null;
    }
  }
  return json({ guest: guestAllowed(), bot: botUsername ?? null, mainApp });
}
