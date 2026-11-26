export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { banditView } from "../../../server/systems/bandit.ts";

/** «Бандитский фарт»: the player's free spins, roubles, spins made and roubles won */
export const GET = authedRoute("bandit", async ({ db, playerId }) => banditView(db, playerId));
