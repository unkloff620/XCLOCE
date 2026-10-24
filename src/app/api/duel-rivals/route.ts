export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { duelRivals } from "../../../server/systems/duels.ts";

/** Whom to call to a zonk duel: by name (?q=), or who is in the game now, my clan and my last rivals. */
export const GET = authedRoute("duel-rivals", async ({ db, req, playerId }) => duelRivals(db, playerId, new URL(req.url).searchParams.get("q") ?? "", Date.now()));
