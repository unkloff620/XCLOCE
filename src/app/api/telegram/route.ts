export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "../../../server/db.ts";
import { donateUpdate, webhookSecret } from "../../../server/systems/donate.ts";
import { log } from "../../../server/log.ts";

/** The bot's webhook (set by systems/donate.ts): the Telegram Stars payments. Anything else is just acknowledged. */
export async function POST(req: Request): Promise<Response> {
  const got = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const want = Buffer.from(webhookSecret());
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("forbidden", { status: 403 });
  try {
    await donateUpdate(await getDb(), await req.json());
  } catch (e) {
    log.error("telegram.update_fail", { message: String((e as Error)?.message ?? e).slice(0, 300) });
    // a failed credit: Telegram sends the update again later (non-200)
    return new Response("retry", { status: 500 });
  }
  return new Response("ok");
}
