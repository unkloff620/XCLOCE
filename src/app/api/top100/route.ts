export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { topAuthority } from "../../../server/systems/rating.ts";

/** «Топ 100»: the first hundred players by authority and my own place (the panel on the left above the bottom menu). */
export const GET = authedRoute("top100", async ({ db, playerId }) => topAuthority(db, playerId, Date.now()));
