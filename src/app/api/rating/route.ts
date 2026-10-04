export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { ratingView } from "../../../server/systems/rating.ts";
import { loadConfig } from "../../../server/config.ts";

/** Weekly damage, authority and clan ratings (settles a finished week on the way). */
export const GET = authedRoute("rating", async ({ db, playerId }) => db.tx(async (q) => ratingView(q, playerId, await loadConfig(q), Date.now())));
