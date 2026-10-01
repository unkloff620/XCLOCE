export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { fightView } from "../../../server/game.ts";

/** GET /api/fight — my active fight: boss HP after global damage, weapon cooldowns, damage list. Polled while the fight screen is open. */
export const GET = authedRoute("fight", async ({ db, playerId }) => ({ fight: await fightView(db, playerId) }));
