export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { topAuthority } from "../../../server/systems/rating.ts";

/** The leaders strip above the bottom menu: the top players by authority and my own place. */
export const GET = authedRoute("top", async ({ db, playerId }) => topAuthority(db, playerId, Date.now()));
