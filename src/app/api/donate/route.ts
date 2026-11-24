export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { donateInvoice } from "../../../server/systems/donate.ts";

/** «Донат»: the Telegram Stars invoice link of a pack (the client opens it with Telegram.WebApp.openInvoice) */
export const POST = authedRoute("donate", async ({ body, playerId }) => donateInvoice(playerId, String(body.pack ?? "")));
