export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, oneOf } from "../../../server/http.ts";
import { ACTIONS, runAction } from "../../../server/game.ts";

/** Single action endpoint: every action is validated and executed on the server; the client only names it. */
export const POST = authedRoute("action", async ({ db, body, playerId }) => runAction(db, playerId, oneOf(body.type, ACTIONS, "type"), body));
