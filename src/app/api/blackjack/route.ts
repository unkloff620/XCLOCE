export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { inPlayerTx } from "../../../server/game.ts";
import { bjView } from "../../../server/systems/blackjack.ts";

/** The blackjack window polls this: my table (time caught up), invitations, clan mates to call. */
export const GET = authedRoute("blackjack", async ({ db, playerId }) => (await inPlayerTx(db, playerId, (ctx) => bjView(ctx))).result);
