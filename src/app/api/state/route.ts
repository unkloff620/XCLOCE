export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { inPlayerTx } from "../../../server/game.ts";

export const GET = authedRoute("state", async ({ db, playerId }) => (await inPlayerTx(db, playerId, async () => null)).state);
