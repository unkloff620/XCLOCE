export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { fortuneView } from "../../../server/systems/fortune.ts";

/** «Колесо удачи»: the jackpot, its last winner, the player's wheel level, tickets and keycaps */
export const GET = authedRoute("fortune", async ({ db, playerId }) => fortuneView(db, playerId));
