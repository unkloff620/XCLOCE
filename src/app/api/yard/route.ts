export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { yardView } from "../../../server/game.ts";

/** GET /api/yard — items lying in the yard right now (polled every few seconds while the yard is open). */
export const GET = authedRoute("yard", async ({ db, playerId }) => yardView(db, playerId));
