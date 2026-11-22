export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { mastersView } from "../../../server/systems/masters.ts";

/** «Мастера»: every master — open, the parts bought, the path, «Мастерство», the best student */
export const GET = authedRoute("masters", async ({ db, playerId }) => ({ masters: await mastersView(db, playerId) }));
