export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { friendsStrip } from "../../../server/systems/friends.ts";

/** The strip above the bottom menu: me and my friends by authority, who is in the game (systems/friends.ts). */
export const GET = authedRoute("top", async ({ db, playerId }) => friendsStrip(db, playerId, Date.now()));
