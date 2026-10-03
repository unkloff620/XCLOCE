export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { json } from "../../../server/http.ts";
import { guestAllowed } from "../../../server/auth.ts";

let botUsername: string | null | undefined;
let triedAt = 0;

/** Public client config: whether guests may play and the bot username for the desktop Login Widget. */
export async function GET() {
  // a failed lookup is retried after a minute instead of being cached forever
  if (!botUsername && process.env.TELEGRAM_BOT_TOKEN && Date.now() - triedAt > 60_000) {
    triedAt = Date.now();
    try {
      const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      const j = (await r.json()) as { ok: boolean; result?: { username?: string } };
      botUsername = j.ok ? j.result?.username ?? null : null;
    } catch {
      botUsername = null;
    }
  }
  return json({ guest: guestAllowed(), bot: botUsername ?? null });
}
