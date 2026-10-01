export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute, str } from "../../../server/http.ts";
import { withState } from "../../../server/routes.ts";
import { equipTool } from "../../../server/game.ts";

export const POST = authedRoute("equip", async ({ db, body, playerId }) => withState(db, playerId, (tx) => equipTool(tx, playerId, str(body.toolId, "toolId", 40))));
