export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { authedRoute } from "../../../server/http.ts";
import { bossList, weaponTray } from "../../../server/systems/combat.ts";
import { loadConfig } from "../../../server/config.ts";

export const GET = authedRoute("bosses", async ({ db, playerId }) => {
  const now = Date.now();
  return { ...(await bossList(db, playerId, await loadConfig(db, now), now)), weapons: await weaponTray(db, playerId, now), now };
});
