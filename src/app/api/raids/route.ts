export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { raidsView } from "../../../server/systems/raids.ts";
import { weaponTray } from "../../../server/systems/combat.ts";

/** «Ходки»: the clan's progress over the yards, my fight for a building, my weapons */
export const GET = authedRoute("raids", async ({ db, playerId }) => ({ ...(await raidsView(db, playerId)), weapons: await weaponTray(db, playerId) }));
